import type { Queryable } from "../db/types";
import { withTransaction } from "../db/withTransaction";
import {
  insertarPago,
  existePagoSimilarReciente,
  obtenerPago,
  anularPagoDb,
  type DatosNuevoPago
} from "../db/repositories/pagosRepo";
import { registrarMovimientoHaber, anularMovimientoDePago } from "../db/repositories/movimientosRepo";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { DenszError } from "../utils/errors";
import type { Pago } from "../../shared/types/entities";

export type ResultadoRegistrarPago = { creado: true; pago: Pago } | { creado: false; posibleDuplicado: true };

/**
 * Registra un pago + su movimiento "haber" en una única transacción. Si ya
 * existe un pago idéntico (mismo odontólogo, importe, moneda, fecha y
 * medio) sin anular, no lo bloquea silenciosamente ni lo inserta a ciegas:
 * devuelve una advertencia clara para que el usuario confirme explícitamente.
 *
 * Corrección post-auditoría (§26/§30-D de docs/AUDITORIA_MAESTRA_DENSZ.md):
 * este servicio no auditaba nada — tanto `pagos.ipc.ts` (Desktop) como
 * `pagos.route.ts` (Web) ya llamaban a `registrarAuditoria` por su cuenta,
 * DESPUÉS de que esta función terminaba (fuera de la transacción: un fallo
 * entre el commit y esa llamada externa dejaba un pago real sin rastro en
 * Auditoría). Se centraliza acá, dentro de la MISMA transacción — igual
 * que ordenService/authService/proteccionService — y se sacan las llamadas
 * ahora redundantes de ambas capas para no auditar dos veces el mismo pago.
 */
export async function registrarPago(
  pool: Queryable,
  data: Omit<DatosNuevoPago, "creadoPor">,
  usuarioId: number,
  confirmarDuplicado = false
): Promise<ResultadoRegistrarPago> {
  if (!data.odontologoId && !data.clinicaId) {
    throw new DenszError("Seleccioná a quién corresponde el pago (odontólogo o clínica).");
  }
  if (data.odontologoId && data.clinicaId) {
    throw new DenszError("Un pago es de un odontólogo o de una clínica, no de ambos.");
  }
  if (!confirmarDuplicado && (await existePagoSimilarReciente(pool, data))) {
    return { creado: false, posibleDuplicado: true };
  }

  const pagoId = await withTransaction(pool, async (db) => {
    const id = await insertarPago(db, { ...data, creadoPor: usuarioId });
    await registrarMovimientoHaber(db, {
      odontologoId: data.odontologoId,
      clinicaId: data.clinicaId,
      pagoId: id,
      importeCentavos: data.importeCentavos,
      moneda: data.moneda,
      fecha: data.fecha,
      descripcion: "Pago recibido"
    });
    await registrarAuditoria(db, {
      usuarioId,
      accion: "crear",
      entidad: "pagos",
      entidadId: id,
      detalle: {
        odontologoId: data.odontologoId,
        clinicaId: data.clinicaId,
        importeCentavos: data.importeCentavos,
        moneda: data.moneda,
        medioPagoId: data.medioPagoId,
        fecha: data.fecha
      }
    });
    return id;
  });

  return { creado: true, pago: (await obtenerPago(pool, pagoId))! };
}

export async function anularPago(pool: Queryable, id: number, motivo: string, usuarioId: number): Promise<void> {
  const pago = await obtenerPago(pool, id);
  if (!pago) throw new DenszError("El pago no existe.");
  if (pago.anulado) throw new DenszError("El pago ya estaba anulado.");

  await withTransaction(pool, async (db) => {
    await anularPagoDb(db, id, motivo, usuarioId);
    await anularMovimientoDePago(db, id);
    await registrarAuditoria(db, {
      usuarioId,
      accion: "anular",
      entidad: "pagos",
      entidadId: id,
      detalle: {
        motivo,
        odontologoId: pago.odontologoId,
        clinicaId: pago.clinicaId,
        importeCentavos: pago.importeCentavos,
        moneda: pago.moneda,
        medioPagoId: pago.medioPagoId
      }
    });
  });
}
