import type { Queryable } from "../db/types";
import { listarOdontologos, obtenerOdontologo } from "../db/repositories/odontologosRepo";
import { listarClinicas, obtenerClinica } from "../db/repositories/clinicasRepo";
import { listarPacientes } from "../db/repositories/pacientesRepo";
import { listarOrdenes, type FiltroOrdenes } from "../db/repositories/ordenesRepo";
import { listarMovimientos, listarMovimientosClinica } from "../db/repositories/movimientosRepo";
import { listarPagos, listarPagosClinica } from "../db/repositories/pagosRepo";
import { ingresosPorOdontologo, obtenerKpisPeriodo } from "../db/repositories/estadisticasRepo";
import { listarAuditoriaFiltradaCompleta } from "../db/repositories/auditoriaRepo";
import { escribirCsv, escribirXlsx, escribirPdfTabla, type ColumnaExport } from "./exportWriters";
import { formatearMoneda, formatearFecha, formatearFechaHora } from "../utils/formatShared";
import { etiquetaAccion } from "../../shared/constants/auditoriaAcciones";
import { DenszError } from "../utils/errors";
import type { RangoFechas, FiltroAuditoriaDto } from "../../shared/types/entities";

export type FormatoExport = "csv" | "xlsx" | "pdf";
export type TipoExport = "odontologos" | "clinicas" | "pacientes" | "trabajos" | "cuenta" | "pagos" | "estadisticas" | "auditoria";

interface OpcionesExport {
  odontologoId?: number;
  clinicaId?: number;
  rango?: RangoFechas;
  /** Solo para tipo "auditoria" — exporta exactamente lo que el usuario
   * tiene filtrado en pantalla, nunca la tabla completa. */
  filtroAuditoria?: FiltroAuditoriaDto;
}

interface DatosExport {
  titulo: string;
  subtitulo: string;
  columnas: ColumnaExport[];
  filas: Record<string, unknown>[];
}

async function prepararDatos(db: Queryable, tipo: TipoExport, opciones: OpcionesExport): Promise<DatosExport> {
  switch (tipo) {
    case "odontologos": {
      const odontologos = await listarOdontologos(db);
      const filas = odontologos.map((o) => ({
        nombre: o.nombre,
        telefono: o.telefono ?? "",
        direccion: o.direccion ?? "",
        listaPrecio: o.listaPrecioNombre ?? "",
        fechaAlta: formatearFecha(o.fechaAlta),
        activo: o.activo
      }));
      return {
        titulo: "Odontólogos",
        subtitulo: `${filas.length} registros`,
        columnas: [
          { clave: "nombre", titulo: "Nombre" },
          { clave: "telefono", titulo: "Teléfono" },
          { clave: "direccion", titulo: "Dirección" },
          { clave: "listaPrecio", titulo: "Lista de precios" },
          { clave: "fechaAlta", titulo: "Fecha de alta" },
          { clave: "activo", titulo: "Activo" }
        ],
        filas
      };
    }
    case "clinicas": {
      const clinicas = await listarClinicas(db);
      const filas = clinicas.map((c) => ({
        nombre: c.nombre,
        telefono: c.telefono ?? "",
        direccion: c.direccion ?? "",
        fechaAlta: formatearFecha(c.fechaAlta),
        activo: c.activo
      }));
      return {
        titulo: "Clínicas",
        subtitulo: `${filas.length} registros`,
        columnas: [
          { clave: "nombre", titulo: "Nombre" },
          { clave: "telefono", titulo: "Teléfono" },
          { clave: "direccion", titulo: "Dirección" },
          { clave: "fechaAlta", titulo: "Fecha de alta" },
          { clave: "activo", titulo: "Activo" }
        ],
        filas
      };
    }
    case "pacientes": {
      const pacientes = await listarPacientes(db);
      const filas = pacientes.map((p) => ({
        nombre: p.nombreCompleto,
        odontologo: p.odontologoNombre ?? "",
        fechaAlta: formatearFecha(p.fechaAlta),
        activo: p.activo
      }));
      return {
        titulo: "Pacientes",
        subtitulo: `${filas.length} registros`,
        columnas: [
          { clave: "nombre", titulo: "Paciente" },
          { clave: "odontologo", titulo: "Odontólogo" },
          { clave: "fechaAlta", titulo: "Fecha de alta" },
          { clave: "activo", titulo: "Activo" }
        ],
        filas
      };
    }
    case "trabajos": {
      const filtro: FiltroOrdenes = {
        ...(opciones.odontologoId ? { odontologoId: opciones.odontologoId } : {}),
        ...(opciones.clinicaId ? { clinicaId: opciones.clinicaId } : {})
      };
      const ordenes = await listarOrdenes(db, filtro);
      const filas = ordenes.map((o) => ({
        numero: o.numero,
        fecha: formatearFecha(o.fechaTrabajo),
        paciente: o.pacienteNombreCompleto,
        odontologo: o.odontologoNombre,
        prestaciones: o.cantidadPrestaciones,
        piezas: o.cantidadPiezas,
        total: formatearMoneda(o.totalCentavos, o.moneda),
        estado: o.estado
      }));
      return {
        titulo: "Trabajos",
        subtitulo: `${filas.length} órdenes`,
        columnas: [
          { clave: "numero", titulo: "N° OT" },
          { clave: "fecha", titulo: "Fecha" },
          { clave: "paciente", titulo: "Paciente" },
          { clave: "odontologo", titulo: "Odontólogo" },
          { clave: "prestaciones", titulo: "Prestaciones" },
          { clave: "piezas", titulo: "Piezas" },
          { clave: "total", titulo: "Total" },
          { clave: "estado", titulo: "Estado" }
        ],
        filas
      };
    }
    case "cuenta": {
      if (!opciones.odontologoId && !opciones.clinicaId) {
        throw new DenszError("Falta indicar el odontólogo o la clínica para exportar la cuenta.");
      }
      const titular = opciones.clinicaId ? await obtenerClinica(db, opciones.clinicaId) : await obtenerOdontologo(db, opciones.odontologoId!);
      if (!titular) throw new DenszError("El titular de la cuenta no existe.");
      const movimientos = opciones.clinicaId
        ? await listarMovimientosClinica(db, opciones.clinicaId)
        : await listarMovimientos(db, opciones.odontologoId!);
      const filas = movimientos.map((m) => ({
        fecha: formatearFecha(m.fecha),
        descripcion: m.descripcion,
        moneda: m.moneda,
        debe: m.tipo === "debe" ? formatearMoneda(m.importeCentavos, m.moneda) : "",
        haber: m.tipo === "haber" ? formatearMoneda(m.importeCentavos, m.moneda) : "",
        anulado: m.anulado
      }));
      return {
        titulo: `Cuenta corriente — ${titular.nombre}`,
        subtitulo: `${filas.length} movimientos`,
        columnas: [
          { clave: "fecha", titulo: "Fecha" },
          { clave: "descripcion", titulo: "Descripción" },
          { clave: "moneda", titulo: "Moneda" },
          { clave: "debe", titulo: "Debe" },
          { clave: "haber", titulo: "Haber" },
          { clave: "anulado", titulo: "Anulado" }
        ],
        filas
      };
    }
    case "pagos": {
      if (!opciones.odontologoId && !opciones.clinicaId) {
        throw new DenszError("Falta indicar el odontólogo o la clínica para exportar los pagos.");
      }
      const titular = opciones.clinicaId ? await obtenerClinica(db, opciones.clinicaId) : await obtenerOdontologo(db, opciones.odontologoId!);
      const pagos = opciones.clinicaId ? await listarPagosClinica(db, opciones.clinicaId) : await listarPagos(db, opciones.odontologoId!);
      const filas = pagos.map((p) => ({
        fecha: formatearFecha(p.fecha),
        importe: formatearMoneda(p.importeCentavos, p.moneda),
        medio: p.medioPagoNombre,
        referencia: p.referencia ?? "",
        anulado: p.anulado
      }));
      return {
        titulo: `Pagos — ${titular?.nombre ?? ""}`,
        subtitulo: `${filas.length} pagos`,
        columnas: [
          { clave: "fecha", titulo: "Fecha" },
          { clave: "importe", titulo: "Importe" },
          { clave: "medio", titulo: "Medio de pago" },
          { clave: "referencia", titulo: "Referencia" },
          { clave: "anulado", titulo: "Anulado" }
        ],
        filas
      };
    }
    case "estadisticas": {
      const rango = opciones.rango ?? { desde: formatearFecha(new Date().toISOString()), hasta: formatearFecha(new Date().toISOString()) };
      const [kpis, porOdontologo] = await Promise.all([obtenerKpisPeriodo(db, rango), ingresosPorOdontologo(db, rango)]);
      const filas = porOdontologo.map((o) => ({
        odontologo: o.odontologoNombre,
        moneda: o.moneda,
        cantidad: o.cantidad,
        total: formatearMoneda(o.totalCentavos, o.moneda)
      }));
      const resumenMonedas = kpis.porMoneda.map((k) => `${formatearMoneda(k.totalRegistradoCentavos, k.moneda)}`).join(" · ");
      return {
        titulo: "Estadísticas",
        subtitulo: `Del ${rango.desde} al ${rango.hasta} — ${kpis.cantidadTrabajos} trabajos, ${resumenMonedas} registrados`,
        columnas: [
          { clave: "odontologo", titulo: "Odontólogo" },
          { clave: "moneda", titulo: "Moneda" },
          { clave: "cantidad", titulo: "Trabajos" },
          { clave: "total", titulo: "Total" }
        ],
        filas
      };
    }
    case "auditoria": {
      const eventos = await listarAuditoriaFiltradaCompleta(db, opciones.filtroAuditoria ?? {});
      const filas = eventos.map((e) => ({
        fecha: formatearFechaHora(e.fecha),
        usuario: e.usuarioNombre ?? "—",
        usuarioAcceso: e.usuarioLogin ?? "—",
        accion: etiquetaAccion(e.accion),
        entidad: e.entidad,
        id: e.entidadId ?? "",
        detalle: e.detalle ? JSON.stringify(e.detalle) : ""
      }));
      return {
        titulo: "Auditoría",
        subtitulo: `${filas.length} eventos`,
        columnas: [
          { clave: "fecha", titulo: "Fecha" },
          { clave: "usuario", titulo: "Usuario" },
          { clave: "usuarioAcceso", titulo: "Usuario de acceso" },
          { clave: "accion", titulo: "Acción" },
          { clave: "entidad", titulo: "Entidad" },
          { clave: "id", titulo: "ID" },
          { clave: "detalle", titulo: "Detalle" }
        ],
        filas
      };
    }
  }
}

type GenerarPdf = (html: string, outputPath: string) => Promise<void>;

export async function exportarDatos(
  db: Queryable,
  tipo: TipoExport,
  formato: FormatoExport,
  destino: string,
  opciones: OpcionesExport = {},
  // Inyectable para el servidor web — mismo criterio que
  // comprobanteService.ts/cuentaService.ts, sin tocar el comportamiento de
  // Desktop (sigue usando generarPdfDesdeHtml por defecto vía escribirPdfTabla).
  generarPdf?: GenerarPdf
): Promise<void> {
  const datos = await prepararDatos(db, tipo, opciones);

  if (formato === "csv") {
    escribirCsv(datos.filas, datos.columnas, destino);
  } else if (formato === "xlsx") {
    await escribirXlsx(datos.filas, datos.columnas, destino, datos.titulo.slice(0, 30));
  } else if (generarPdf) {
    await escribirPdfTabla(datos.titulo, datos.subtitulo, datos.filas, datos.columnas, destino, generarPdf);
  } else {
    await escribirPdfTabla(datos.titulo, datos.subtitulo, datos.filas, datos.columnas, destino);
  }
}
