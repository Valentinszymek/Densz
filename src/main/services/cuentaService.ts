import type { Queryable } from "../db/types";
import path from "node:path";
import { withTransaction } from "../db/withTransaction";
import {
  listarTrabajosFacturadosPorMesOdontologo,
  listarTrabajosFacturadosPorMesClinica,
  calcularSaldoAnteriorAlPeriodo,
  type TitularCuenta
} from "../db/repositories/movimientosRepo";
import { listarPagos, listarPagosClinica } from "../db/repositories/pagosRepo";
import { crearResumenMensual, listarResumenesMensuales } from "../db/repositories/resumenesMensualesRepo";
import { obtenerOdontologo } from "../db/repositories/odontologosRepo";
import { obtenerClinica } from "../db/repositories/clinicasRepo";
import { getConfigMultiple } from "../db/repositories/configRepo";
import { generarHtmlEstadoCuenta } from "./estadoCuentaHtmlTemplate";
import { generarPdfDesdeHtml } from "./pdfService";
import { getUserDataDir } from "../utils/appPaths";
import { DenszError } from "../utils/errors";
import type { Pago, TrabajoFacturadoMes, Moneda, BloqueCuentaMoneda, ResumenMensual } from "../../shared/types/entities";

type GenerarPdf = (html: string, outputPath: string) => Promise<void>;

function validarMes(mes: number): void {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) throw new DenszError("El mes debe ser un número entre 1 y 12.");
}

function esDelPeriodo(fechaIso: string, anio: number, mes: number): boolean {
  const prefijo = `${anio}-${String(mes).padStart(2, "0")}`;
  return fechaIso.slice(0, 7) === prefijo;
}

/**
 * El cálculo completo de un período para un titular: por cada moneda con
 * actividad (o con saldo previo), saldo anterior + trabajos del mes (sin
 * contar los anulados en el total, aunque se listan) + pagos del mes +
 * saldo pendiente resultante. Es la MISMA función que usa tanto la vista
 * previa en pantalla como la generación del PDF — un solo lugar donde se
 * calcula, nunca dos cuentas distintas para lo mismo.
 */
export async function calcularBloquesMes(db: Queryable, titular: TitularCuenta, anio: number, mes: number): Promise<BloqueCuentaMoneda[]> {
  validarMes(mes);

  const [trabajos, todosLosPagos, saldoAnteriorPorMoneda]: [TrabajoFacturadoMes[], Pago[], Map<Moneda, number>] = await Promise.all([
    titular.clinicaId
      ? listarTrabajosFacturadosPorMesClinica(db, titular.clinicaId, anio, mes)
      : listarTrabajosFacturadosPorMesOdontologo(db, titular.odontologoId!, anio, mes),
    titular.clinicaId ? listarPagosClinica(db, titular.clinicaId) : listarPagos(db, titular.odontologoId!),
    calcularSaldoAnteriorAlPeriodo(db, titular, anio, mes)
  ]);

  const pagosDelMes = todosLosPagos.filter((p) => esDelPeriodo(p.fecha, anio, mes));

  const monedas = new Set<Moneda>([
    ...saldoAnteriorPorMoneda.keys(),
    ...trabajos.map((t) => t.moneda),
    ...pagosDelMes.map((p) => p.moneda)
  ]);
  if (monedas.size === 0) monedas.add("ARS");

  return Array.from(monedas).map((moneda) => {
    const trabajosMoneda = trabajos.filter((t) => t.moneda === moneda);
    const pagosMoneda = pagosDelMes.filter((p) => p.moneda === moneda);
    const totalTrabajos = trabajosMoneda.filter((t) => !t.anulado).reduce((acc, t) => acc + t.importeCentavos, 0);
    const totalPagos = pagosMoneda.filter((p) => !p.anulado).reduce((acc, p) => acc + p.importeCentavos, 0);
    const saldoAnterior = saldoAnteriorPorMoneda.get(moneda) ?? 0;
    return {
      moneda,
      trabajos: trabajosMoneda,
      pagosDelMes: pagosMoneda,
      saldoAnteriorCentavos: saldoAnterior,
      totalTrabajosCentavos: totalTrabajos,
      totalPagosCentavos: totalPagos,
      saldoPendienteCentavos: saldoAnterior + totalTrabajos - totalPagos
    };
  });
}

async function generarResumen(
  pool: Queryable,
  titular: TitularCuenta,
  titularNombre: string,
  mostrarProfesional: boolean,
  anio: number,
  mes: number,
  usuarioId: number,
  generarPdf: GenerarPdf,
  nombreArchivo: string
): Promise<{ pdfPath: string; resumenes: ResumenMensual[] }> {
  const bloques = await calcularBloquesMes(pool, titular, anio, mes);

  const config = await getConfigMultiple(pool, ["laboratorio.nombre", "laboratorio.direccion", "laboratorio.telefono"]);
  const generadoEn = new Date().toISOString();

  const html = generarHtmlEstadoCuenta({
    laboratorio: {
      nombre: config["laboratorio.nombre"] || "Densz",
      direccion: config["laboratorio.direccion"] || "",
      telefono: config["laboratorio.telefono"] || ""
    },
    titularNombre,
    mostrarProfesional,
    generadoEn,
    anio,
    mes,
    bloques
  });

  const pdfPath = path.join(getUserDataDir(), "estados-cuenta", `${nombreArchivo}-${Date.now()}.pdf`);
  await generarPdf(html, pdfPath);

  // El registro de cada moneda se guarda en la MISMA transacción: o quedan
  // todas las filas de esta generación, o no queda ninguna.
  const resumenIds = await withTransaction(pool, async (db) => {
    const ids: number[] = [];
    for (const b of bloques) {
      const id = await crearResumenMensual(db, titular, {
        anio,
        mes,
        moneda: b.moneda,
        saldoAnteriorCentavos: b.saldoAnteriorCentavos,
        totalTrabajosCentavos: b.totalTrabajosCentavos,
        totalPagosCentavos: b.totalPagosCentavos,
        saldoPendienteCentavos: b.saldoPendienteCentavos,
        cantidadTrabajos: b.trabajos.filter((t) => !t.anulado).length,
        pdfPath,
        generadoPor: usuarioId
      });
      ids.push(id);
    }
    return ids;
  });

  const todosLosResumenes = await listarResumenesMensuales(pool, titular, 1000);
  const resumenes = todosLosResumenes.filter((r) => resumenIds.includes(r.id));
  return { pdfPath, resumenes };
}

export async function generarPdfEstadoCuenta(
  pool: Queryable,
  odontologoId: number,
  anio: number,
  mes: number,
  usuarioId: number,
  generarPdf: GenerarPdf = generarPdfDesdeHtml
): Promise<{ pdfPath: string; resumenes: ResumenMensual[] }> {
  const odontologo = await obtenerOdontologo(pool, odontologoId);
  if (!odontologo) throw new DenszError("El odontólogo no existe.");
  return generarResumen(
    pool,
    { odontologoId, clinicaId: null },
    odontologo.nombre,
    false,
    anio,
    mes,
    usuarioId,
    generarPdf,
    `estado-cuenta-odontologo-${odontologoId}-${anio}-${String(mes).padStart(2, "0")}`
  );
}

export async function generarPdfEstadoCuentaClinica(
  pool: Queryable,
  clinicaId: number,
  anio: number,
  mes: number,
  usuarioId: number,
  generarPdf: GenerarPdf = generarPdfDesdeHtml
): Promise<{ pdfPath: string; resumenes: ResumenMensual[] }> {
  const clinica = await obtenerClinica(pool, clinicaId);
  if (!clinica) throw new DenszError("La clínica no existe.");
  return generarResumen(
    pool,
    { odontologoId: null, clinicaId },
    clinica.nombre,
    true,
    anio,
    mes,
    usuarioId,
    generarPdf,
    `estado-cuenta-clinica-${clinicaId}-${anio}-${String(mes).padStart(2, "0")}`
  );
}
