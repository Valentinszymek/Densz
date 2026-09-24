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
import { DenszError } from "../utils/errors";
import type { Pago } from "../../shared/types/entities";

export type ResultadoRegistrarPago = { creado: true; pago: Pago } | { creado: false; posibleDuplicado: true };

/**
 * Registra un pago + su movimiento "haber" en una única transacción. Si ya
 * existe un pago idéntico (mismo odontólogo, importe, moneda, fecha y
 * medio) sin anular, no lo bloquea silenciosamente ni lo inserta a ciegas:
 * devuelve una advertencia clara para que el usuario confirme explícitamente.
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
  });
}
