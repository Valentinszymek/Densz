import type { Queryable } from "../db/types";
import { withTransaction } from "../db/withTransaction";
import { siguienteNumero } from "../utils/numbering";
import { precioVigenteEnLista, obtenerLista } from "../db/repositories/listasPrecioRepo";
import { obtenerPrestacion } from "../db/repositories/preciosRepo";
import { crearPaciente, obtenerPaciente, buscarPacienteActivoPorNombre } from "../db/repositories/pacientesRepo";
import { obtenerOdontologo } from "../db/repositories/odontologosRepo";
import {
  insertarOrden,
  obtenerOrden,
  anularOrdenDb,
  eliminarOrdenDb,
  actualizarOrdenConLineas,
  type DatosLineaOrden
} from "../db/repositories/ordenesRepo";
import {
  eliminarMovimientosDeOrden,
  anularMovimientoDeOrden,
  registrarMovimientoDebe,
  obtenerMovimientoDebeActivoDeOrden,
  type TitularCuenta
} from "../db/repositories/movimientosRepo";
import { eliminarComprobantePorOrden, obtenerComprobantePorOrden } from "../db/repositories/comprobantesRepo";
import { anularComprobantePorOrden } from "./comprobanteService";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { DenszError } from "../utils/errors";
import type { Orden, Moneda } from "../../shared/types/entities";

export interface DatosLineaPrestacionInput {
  prestacionId: number;
  cantidad: number;
  piezasFdi: number[];
  precioManualCentavos?: number | null;
}

export interface DatosCrearOrden {
  odontologoId: number;
  /** Paciente ya existente del odontólogo — se usa tal cual, nunca se duplica (§3). */
  pacienteId?: number | null;
  /** Solo si NO se pasa `pacienteId`: crea (o reutiliza uno activo con el
   * mismo nombre, si ya existía) un paciente nuevo con este nombre. */
  pacienteNombreCompleto?: string;
  fechaTrabajo: string;
  prestaciones: DatosLineaPrestacionInput[];
  creadoPor: number;
}

type ListaVigente = NonNullable<Awaited<ReturnType<typeof obtenerLista>>>;

/**
 * Resuelve el precio y congela el resto de los datos de cada línea contra
 * la lista de precios del odontólogo — usado tanto al crear una OT como
 * al editarla, para que ambos caminos apliquen EXACTAMENTE la misma
 * regla de precios (lista vigente, o el manual si se especifica uno).
 */
async function resolverLineasOrden(
  db: Queryable,
  lista: ListaVigente,
  prestaciones: DatosLineaPrestacionInput[]
): Promise<DatosLineaOrden[]> {
  const resultado: DatosLineaOrden[] = [];
  for (const p of prestaciones) {
    const prestacion = await obtenerPrestacion(db, p.prestacionId);
    if (!prestacion) throw new DenszError("Una de las prestaciones seleccionadas ya no existe.");

    let precioUnitarioCentavos: number;
    let origenPrecio: "lista" | "manual";
    if (p.precioManualCentavos !== undefined && p.precioManualCentavos !== null) {
      precioUnitarioCentavos = p.precioManualCentavos;
      origenPrecio = "manual";
    } else {
      const vigente = await precioVigenteEnLista(db, lista.id, p.prestacionId);
      if (!vigente) {
        throw new DenszError(
          `"${prestacion.nombre}" no tiene un precio configurado en la lista "${lista.nombre}". Definilo en Precios o ingresá uno manual.`
        );
      }
      precioUnitarioCentavos = vigente.precioCentavos;
      origenPrecio = "lista";
    }

    resultado.push({
      prestacionId: p.prestacionId,
      prestacionNombre: prestacion.nombre,
      categoriaNombre: prestacion.categoriaNombre ?? "",
      cantidad: p.cantidad,
      precioUnitarioCentavos,
      origenPrecio,
      piezasFdi: p.piezasFdi
    });
  }
  return resultado;
}

/**
 * Resuelve el paciente de una OT (nueva o editada): reutiliza el
 * existente si se pasa `pacienteId`, o crea uno nuevo — reutilizando uno
 * activo con el mismo nombre si ya existía, para nunca duplicar (§3) —
 * cuando se pasa `pacienteNombreCompleto`. La creación queda auditada
 * igual que una creación "normal" desde Pacientes, solo que con el
 * origen indicado (para poder distinguir de dónde vino en Auditoría).
 */
async function resolverPacienteParaOrden(
  db: Queryable,
  data: {
    pacienteId?: number | null;
    pacienteNombreCompleto?: string;
    odontologoId: number;
    usuarioId: number;
    origenAuditoria: string;
  }
): Promise<{ id: number; nombreCompleto: string }> {
  if (data.pacienteId != null) {
    const paciente = await obtenerPaciente(db, data.pacienteId);
    if (!paciente) throw new DenszError("El paciente seleccionado ya no existe.");
    if (paciente.odontologoId !== data.odontologoId) {
      throw new DenszError("El paciente seleccionado no pertenece a este odontólogo.");
    }
    return { id: paciente.id, nombreCompleto: paciente.nombreCompleto };
  }

  if (!data.pacienteNombreCompleto || data.pacienteNombreCompleto.trim().length < 2) {
    throw new DenszError("Seleccioná un paciente existente o ingresá el nombre de uno nuevo.");
  }

  const existente = await buscarPacienteActivoPorNombre(db, data.odontologoId, data.pacienteNombreCompleto);
  if (existente) return { id: existente.id, nombreCompleto: existente.nombreCompleto };

  const nombreCompleto = data.pacienteNombreCompleto.trim();
  const nuevoId = await crearPaciente(db, { nombreCompleto, odontologoId: data.odontologoId });
  await registrarAuditoria(db, {
    usuarioId: data.usuarioId,
    accion: "crear",
    entidad: "pacientes",
    entidadId: nuevoId,
    detalle: { nombreCompleto, origen: data.origenAuditoria }
  });
  return { id: nuevoId, nombreCompleto };
}

/**
 * Crea una orden de trabajo con TODAS sus prestaciones dentro de una única
 * transacción: reutiliza el paciente existente (o crea uno nuevo si no se
 * eligió ninguno), resuelve y congela el precio de cada línea (según la
 * lista del odontólogo, en su moneda), asigna el número atómicamente y
 * guarda las piezas propias de cada línea. Nunca deja la base en un estado
 * a medias.
 */
export async function crearOrdenConPrestaciones(pool: Queryable, data: DatosCrearOrden): Promise<Orden> {
  if (data.prestaciones.length === 0) {
    throw new DenszError("Agregá al menos una prestación.");
  }

  return withTransaction(pool, async (db) => {
    const odontologo = await obtenerOdontologo(db, data.odontologoId);
    if (!odontologo) throw new DenszError("El odontólogo no existe.");
    if (!odontologo.activo) throw new DenszError("El odontólogo está inactivo.");

    const lista = await obtenerLista(db, odontologo.listaPrecioId);
    if (!lista) {
      throw new DenszError("El odontólogo no tiene una lista de precios asignada. Asignale una desde su ficha.");
    }

    const lineas = await resolverLineasOrden(db, lista, data.prestaciones);
    const totalCentavos = lineas.reduce((acc, l) => acc + l.precioUnitarioCentavos * l.cantidad, 0);

    const paciente = await resolverPacienteParaOrden(db, {
      pacienteId: data.pacienteId,
      pacienteNombreCompleto: data.pacienteNombreCompleto,
      odontologoId: data.odontologoId,
      usuarioId: data.creadoPor,
      origenAuditoria: "nuevo_trabajo"
    });

    const numero = await siguienteNumero(db, "orden");

    // La clínica se congela desde el profesional AL MOMENTO de crear la OT
    // (§6, §24): si el profesional cambia de clínica después, esta OT no
    // se entera. Si el profesional es independiente, clinicaId queda null
    // y la deuda es del propio odontólogo — comportamiento sin cambios.
    const ordenId = await insertarOrden(db, {
      numero,
      odontologoId: data.odontologoId,
      pacienteId: paciente.id,
      fechaTrabajo: data.fechaTrabajo,
      moneda: lista.moneda,
      listaPrecioId: lista.id,
      listaPrecioNombre: lista.nombre,
      clinicaId: odontologo.clinicaId,
      clinicaNombre: odontologo.clinicaNombre ?? null,
      totalCentavos,
      lineas,
      creadoPor: data.creadoPor
    });

    return (await obtenerOrden(db, ordenId))!;
  });
}

export interface DatosEditarOrden {
  odontologoId: number;
  pacienteId?: number | null;
  pacienteNombreCompleto?: string;
  fechaTrabajo: string;
  prestaciones: DatosLineaPrestacionInput[];
  editadoPor: number;
}

interface CambioAuditado {
  campo: string;
  anterior: string;
  nuevo: string;
}

/** Formatea centavos a un texto legible para el detalle de Auditoría — a
 * propósito NO usa `formatearMoneda` de `lib/format` (es del renderer). */
function formatearCentavosParaAuditoria(centavos: number, moneda: Moneda): string {
  const signo = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const enteros = Math.floor(abs / 100).toLocaleString("es-AR");
  const decimales = String(abs % 100).padStart(2, "0");
  return `${signo}${moneda === "USD" ? "US$" : "$"} ${enteros},${decimales}`;
}

function resumenLineasParaAuditoria(
  lineas: Array<{ prestacionNombre: string; cantidad: number; piezasFdi: number[]; precioUnitarioCentavos: number }>,
  moneda: Moneda
): string {
  if (lineas.length === 0) return "—";
  return lineas
    .map((l) => {
      const piezas = l.piezasFdi.length > 0 ? ` (piezas ${l.piezasFdi.join(", ")})` : "";
      const subtotal = formatearCentavosParaAuditoria(l.precioUnitarioCentavos * l.cantidad, moneda);
      return `${l.prestacionNombre} ×${l.cantidad}${piezas} — ${subtotal}`;
    })
    .join("; ");
}

/** Compara la OT antes/después de una edición y arma la lista de cambios
 * legibles que va al detalle de Auditoría (§13: usuario, OT, qué cambió,
 * valor anterior, valor nuevo — el usuario y la OT ya van en la cabecera
 * del registro de auditoría, esto cubre el resto). */
function detectarCambiosOrden(
  anterior: Orden,
  nuevo: {
    odontologoNombre: string;
    pacienteNombreCompleto: string;
    fechaTrabajo: string;
    moneda: Moneda;
    totalCentavos: number;
    lineas: DatosLineaOrden[];
  }
): CambioAuditado[] {
  const cambios: CambioAuditado[] = [];

  if (anterior.odontologoNombre !== nuevo.odontologoNombre) {
    cambios.push({ campo: "Odontólogo", anterior: anterior.odontologoNombre ?? "—", nuevo: nuevo.odontologoNombre });
  }
  if ((anterior.pacienteNombreCompleto ?? "—") !== nuevo.pacienteNombreCompleto) {
    cambios.push({
      campo: "Paciente",
      anterior: anterior.pacienteNombreCompleto ?? "—",
      nuevo: nuevo.pacienteNombreCompleto
    });
  }
  if (anterior.fechaTrabajo !== nuevo.fechaTrabajo) {
    cambios.push({ campo: "Fecha del trabajo", anterior: anterior.fechaTrabajo, nuevo: nuevo.fechaTrabajo });
  }
  if (anterior.moneda !== nuevo.moneda) {
    cambios.push({ campo: "Moneda", anterior: anterior.moneda, nuevo: nuevo.moneda });
  }

  const resumenAnterior = resumenLineasParaAuditoria(anterior.prestaciones, anterior.moneda);
  const resumenNuevo = resumenLineasParaAuditoria(nuevo.lineas, nuevo.moneda);
  if (resumenAnterior !== resumenNuevo) {
    cambios.push({ campo: "Registros/prestaciones", anterior: resumenAnterior, nuevo: resumenNuevo });
  }

  if (anterior.totalCentavos !== nuevo.totalCentavos) {
    cambios.push({
      campo: "Importe total",
      anterior: formatearCentavosParaAuditoria(anterior.totalCentavos, anterior.moneda),
      nuevo: formatearCentavosParaAuditoria(nuevo.totalCentavos, nuevo.moneda)
    });
  }

  return cambios;
}

/**
 * Edita una OT YA EXISTENTE (facturada o no) sin borrarla ni perder su
 * número, historial, comprobante ni pagos — pensada para corregir errores
 * humanos de carga (odontólogo/paciente/prestación/piezas/cantidad/precio
 * equivocados) sin tener que anular y volver a cargar todo desde cero.
 *
 * Reglas que respeta, todas dentro de una única transacción:
 * - Una OT `anulada` NUNCA se edita — sigue anulada, con su historial intacto.
 * - El precio de cada línea se recongela con la MISMA lógica que al crear
 *   (lista vigente del odontólogo, o manual) — nunca queda "flotando"
 *   contra el catálogo actual.
 * - Si la OT ya estaba facturada, la cuenta corriente refleja SIEMPRE el
 *   estado final de la OT con un único movimiento "debe": el anterior se
 *   anula (nunca se borra, para no perder el historial contable) y se
 *   emite uno nuevo ÚNICAMENTE si el importe, la moneda o el titular
 *   (odontólogo/clínica) realmente cambiaron — nunca se duplica el DEBE.
 * - Los pagos (`pagos`/movimientos "haber") nunca se tocan: si el nuevo
 *   total queda por debajo de lo ya pagado, el saldo pasa a favor del
 *   odontólogo/clínica solo, naturalmente, por aritmética del ledger.
 * - Queda registrado en Auditoría qué cambió, con el valor anterior y el
 *   nuevo de cada campo.
 * - El estado de la OT (`pendiente_facturar` / `facturado`) nunca cambia
 *   por editar — solo `anular`/`generar comprobante` lo cambian.
 */
export async function editarOrdenConPrestaciones(pool: Queryable, ordenId: number, data: DatosEditarOrden): Promise<Orden> {
  if (data.prestaciones.length === 0) {
    throw new DenszError("Agregá al menos una prestación.");
  }

  return withTransaction(pool, async (db) => {
    const anterior = await obtenerOrden(db, ordenId);
    if (!anterior) throw new DenszError("La orden no existe.");
    if (anterior.estado === "anulado") {
      throw new DenszError("Una orden anulada no se puede editar: conservá su historial y cargá una OT nueva si corresponde.");
    }

    const odontologo = await obtenerOdontologo(db, data.odontologoId);
    if (!odontologo) throw new DenszError("El odontólogo no existe.");
    if (!odontologo.activo) throw new DenszError("El odontólogo está inactivo.");

    const lista = await obtenerLista(db, odontologo.listaPrecioId);
    if (!lista) {
      throw new DenszError("El odontólogo no tiene una lista de precios asignada. Asignale una desde su ficha.");
    }

    const lineas = await resolverLineasOrden(db, lista, data.prestaciones);
    const totalCentavos = lineas.reduce((acc, l) => acc + l.precioUnitarioCentavos * l.cantidad, 0);

    const paciente = await resolverPacienteParaOrden(db, {
      pacienteId: data.pacienteId,
      pacienteNombreCompleto: data.pacienteNombreCompleto,
      odontologoId: data.odontologoId,
      usuarioId: data.editadoPor,
      origenAuditoria: "editar_ot"
    });

    await actualizarOrdenConLineas(db, ordenId, {
      odontologoId: data.odontologoId,
      pacienteId: paciente.id,
      fechaTrabajo: data.fechaTrabajo,
      moneda: lista.moneda,
      listaPrecioId: lista.id,
      listaPrecioNombre: lista.nombre,
      clinicaId: odontologo.clinicaId,
      clinicaNombre: odontologo.clinicaNombre ?? null,
      totalCentavos,
      lineas
    });

    // --- Cuenta corriente: un único impacto contable, con el estado final ---
    if (anterior.estado === "facturado") {
      const nuevoTitular: TitularCuenta = odontologo.clinicaId
        ? { odontologoId: null, clinicaId: odontologo.clinicaId }
        : { odontologoId: data.odontologoId, clinicaId: null };
      const movimientoActual = await obtenerMovimientoDebeActivoDeOrden(db, ordenId);
      const cambioImporte = !movimientoActual || movimientoActual.importeCentavos !== totalCentavos;
      const cambioMoneda = !movimientoActual || movimientoActual.moneda !== lista.moneda;
      const cambioTitular =
        !movimientoActual ||
        movimientoActual.odontologoId !== nuevoTitular.odontologoId ||
        movimientoActual.clinicaId !== nuevoTitular.clinicaId;

      if (cambioImporte || cambioMoneda || cambioTitular) {
        // Se conserva la fecha del movimiento original para que el
        // resumen mensual no "salte" de mes solo por haber sido editada
        // hoy (el mes se define por la fecha del comprobante, que esta
        // edición no toca — pero el orden dentro del ledger crudo de
        // Cuentas sí depende de esta fecha).
        const fechaMovimiento = movimientoActual?.fecha ?? anterior.fechaTrabajo;
        await anularMovimientoDeOrden(db, ordenId);
        await registrarMovimientoDebe(db, {
          ...nuevoTitular,
          ordenId,
          importeCentavos: totalCentavos,
          moneda: lista.moneda,
          fecha: fechaMovimiento,
          descripcion: `Orden ${anterior.numero}${odontologo.clinicaId ? ` — ${odontologo.nombre}` : ""} (editada)`
        });
      }
    }

    // --- Auditoría: qué cambió, con el valor anterior y el nuevo ---
    const cambios = detectarCambiosOrden(anterior, {
      odontologoNombre: odontologo.nombre,
      pacienteNombreCompleto: paciente.nombreCompleto,
      fechaTrabajo: data.fechaTrabajo,
      moneda: lista.moneda,
      totalCentavos,
      lineas
    });
    if (cambios.length > 0) {
      await registrarAuditoria(db, {
        usuarioId: data.editadoPor,
        accion: "editar",
        entidad: "ordenes",
        entidadId: ordenId,
        detalle: { numero: anterior.numero, cambios }
      });
    }

    return (await obtenerOrden(db, ordenId))!;
  });
}

export async function anularOrden(pool: Queryable, id: number, motivo: string, usuarioId: number): Promise<void> {
  const orden = await obtenerOrden(pool, id);
  if (!orden) throw new DenszError("La orden no existe.");
  if (orden.estado === "anulado") throw new DenszError("La orden ya estaba anulada.");

  await withTransaction(pool, async (db) => {
    await anularOrdenDb(db, id, motivo, usuarioId);
    // Si ya estaba facturada, el movimiento de cuenta y su comprobante
    // también quedan anulados — nunca se recalcula el saldo "a mano".
    await anularComprobantePorOrden(db, id, usuarioId);
  });
}

/**
 * Elimina definitivamente una OT (y su comprobante y movimientos de
 * cuenta asociados). A diferencia de anular, esto borra físicamente los
 * registros — por eso queda restringido a ADMIN (verificado en el
 * handler IPC) y exige confirmación explícita desde la UI (§20).
 */
export async function eliminarOrdenDefinitivo(pool: Queryable, id: number, usuarioId: number, motivo: string): Promise<void> {
  const orden = await obtenerOrden(pool, id);
  if (!orden) throw new DenszError("La orden no existe.");

  const comprobanteExistente = await obtenerComprobantePorOrden(pool, id);
  const snapshot = {
    numero: orden.numero,
    odontologoId: orden.odontologoId,
    pacienteId: orden.pacienteId,
    pacienteNombreCompleto: orden.pacienteNombreCompleto,
    clinicaId: orden.clinicaId,
    clinicaNombre: orden.clinicaNombre,
    moneda: orden.moneda,
    totalCentavos: orden.totalCentavos,
    estado: orden.estado,
    prestaciones: orden.prestaciones.map((p) => ({
      prestacionNombre: p.prestacionNombre,
      cantidad: p.cantidad,
      piezasFdi: p.piezasFdi,
      subtotalCentavos: p.subtotalCentavos
    })),
    comprobante: comprobanteExistente?.numero ?? null,
    motivo
  };

  // Todo dentro de una única transacción: si algo falla a mitad de camino
  // (por ejemplo un FK inesperado), Postgres revierte todo — nunca queda
  // la base a medio borrar (§18).
  await withTransaction(pool, async (db) => {
    await eliminarMovimientosDeOrden(db, id);
    await eliminarComprobantePorOrden(db, id);
    await eliminarOrdenDb(db, id); // cascada: orden_prestaciones + orden_prestacion_piezas
    await registrarAuditoria(db, {
      usuarioId,
      accion: "eliminar_definitivo",
      entidad: "ordenes",
      entidadId: id,
      detalle: snapshot
    });
  });
}
