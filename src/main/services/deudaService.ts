import type { Queryable } from "../db/types";
import { withTransaction } from "../db/withTransaction";
import { registrarMovimientoDebe, anularMovimientoManual, obtenerMovimiento } from "../db/repositories/movimientosRepo";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { DenszError } from "../utils/errors";
import type { Moneda, MovimientoCuenta } from "../../shared/types/entities";

export interface DatosNuevaDeuda {
  /** Exactamente uno de los dos. */
  odontologoId: number | null;
  clinicaId: number | null;
  importeCentavos: number;
  moneda: Moneda;
  fecha: string;
  descripcion: string;
}

/**
 * Agrega una deuda a mano, sin ninguna orden detrás — pensado para cargar
 * el saldo que un odontólogo/clínica ya arrastraba de ANTES de empezar a
 * usar Densz (ej. de otra app que usaba el laboratorio). Es un movimiento
 * "debe" suelto (orden_id y pago_id en null): suma al saldo igual que
 * cualquier OT facturada, pero no aparece en "Trabajos facturados" (esa
 * tabla sale de un INNER JOIN a `ordenes`) — se muestra aparte, en
 * "Deudas agregadas", en la pantalla de Cuentas.
 */
export async function registrarDeuda(pool: Queryable, data: DatosNuevaDeuda, usuarioId: number): Promise<MovimientoCuenta> {
  if (!data.odontologoId && !data.clinicaId) {
    throw new DenszError("Seleccioná a quién corresponde la deuda (odontólogo o clínica).");
  }
  if (data.odontologoId && data.clinicaId) {
    throw new DenszError("Una deuda es de un odontólogo o de una clínica, no de ambos.");
  }

  const movimientoId = await withTransaction(pool, async (db) => {
    const id = await registrarMovimientoDebe(db, {
      odontologoId: data.odontologoId,
      clinicaId: data.clinicaId,
      ordenId: null,
      importeCentavos: data.importeCentavos,
      moneda: data.moneda,
      fecha: data.fecha,
      descripcion: data.descripcion
    });
    await registrarAuditoria(db, {
      usuarioId,
      accion: "crear",
      entidad: "deudas",
      entidadId: id,
      detalle: {
        odontologoId: data.odontologoId,
        clinicaId: data.clinicaId,
        importeCentavos: data.importeCentavos,
        moneda: data.moneda,
        fecha: data.fecha,
        descripcion: data.descripcion
      }
    });
    return id;
  });

  return (await obtenerMovimiento(pool, movimientoId))!;
}

export async function anularDeuda(pool: Queryable, id: number, motivo: string, usuarioId: number): Promise<void> {
  const movimiento = await obtenerMovimiento(pool, id);
  if (!movimiento) throw new DenszError("La deuda no existe.");
  if (movimiento.tipo !== "debe" || movimiento.ordenId !== null || movimiento.pagoId !== null) {
    throw new DenszError("Este movimiento no es una deuda agregada a mano.");
  }
  if (movimiento.anulado) throw new DenszError("La deuda ya estaba anulada.");

  await withTransaction(pool, async (db) => {
    await anularMovimientoManual(db, id);
    await registrarAuditoria(db, {
      usuarioId,
      accion: "anular",
      entidad: "deudas",
      entidadId: id,
      detalle: {
        motivo,
        odontologoId: movimiento.odontologoId,
        clinicaId: movimiento.clinicaId,
        importeCentavos: movimiento.importeCentavos,
        moneda: movimiento.moneda
      }
    });
  });
}
