import type { Queryable } from "../db/types";
import { withTransaction } from "../db/withTransaction";
import {
  insertarPago,
  existePagoSimilarReciente,
  obtenerPago,
  anularPagoDb,
  actualizarPagoDb,
  type DatosNuevoPago,
  type DatosEditarPago
} from "../db/repositories/pagosRepo";
import { registrarMovimientoHaber, anularMovimientoDePago, actualizarMovimientoDePago } from "../db/repositories/movimientosRepo";
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
  validarPeriodo(data.periodoAnio, data.periodoMes);
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
      descripcion: "Pago recibido",
      periodoAnio: data.periodoAnio,
      periodoMes: data.periodoMes
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

function validarPeriodo(periodoAnio: number | null | undefined, periodoMes: number | null | undefined): void {
  if ((periodoAnio == null) !== (periodoMes == null)) {
    throw new DenszError("El mes del pago quedó incompleto — indicá año y mes, o ninguno de los dos.");
  }
  if (periodoMes != null && (periodoMes < 1 || periodoMes > 12)) {
    throw new DenszError("El mes del pago tiene que ser un número entre 1 y 12.");
  }
}

/**
 * Edita un pago ya registrado — EN EL LUGAR (nunca anula uno y crea otro,
 * mismo criterio que editar una OT facturada: evita una fila fantasma en
 * Cuentas). Pensado sobre todo para corregir a mano el mes de un pago
 * viejo que quedó mal clasificado — no toca el titular (odontólogo/
 * clínica), que no es editable desde este formulario.
 */
export async function editarPago(pool: Queryable, id: number, data: DatosEditarPago, usuarioId: number): Promise<Pago> {
  const anterior = await obtenerPago(pool, id);
  if (!anterior) throw new DenszError("El pago no existe.");
  if (anterior.anulado) throw new DenszError("Este pago está anulado — no se puede editar.");
  validarPeriodo(data.periodoAnio, data.periodoMes);

  await withTransaction(pool, async (db) => {
    await actualizarPagoDb(db, id, data);
    await actualizarMovimientoDePago(db, id, {
      importeCentavos: data.importeCentavos,
      moneda: data.moneda,
      fecha: data.fecha,
      periodoAnio: data.periodoAnio ?? null,
      periodoMes: data.periodoMes ?? null
    });
    await registrarAuditoria(db, {
      usuarioId,
      accion: "editar",
      entidad: "pagos",
      entidadId: id,
      detalle: {
        antes: {
          fecha: anterior.fecha,
          importeCentavos: anterior.importeCentavos,
          moneda: anterior.moneda,
          medioPagoId: anterior.medioPagoId,
          periodoAnio: anterior.periodoAnio,
          periodoMes: anterior.periodoMes
        },
        despues: {
          fecha: data.fecha,
          importeCentavos: data.importeCentavos,
          moneda: data.moneda,
          medioPagoId: data.medioPagoId,
          periodoAnio: data.periodoAnio ?? null,
          periodoMes: data.periodoMes ?? null
        }
      }
    });
  });

  return (await obtenerPago(pool, id))!;
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
