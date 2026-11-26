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
import { calcularPendientePuroDeMes } from "./cuentaService";
import { DenszError } from "../utils/errors";
import type { Pago } from "../../shared/types/entities";

export type ResultadoRegistrarPago =
  | { creado: true; pago: Pago; pagosAdicionales: Pago[] }
  | { creado: false; posibleDuplicado: true };

const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

/** Tope defensivo de meses a mirar hacia adelante buscando dónde meter el
 * sobrante — nunca debería hacer falta ni cerca de esto en el uso real;
 * está para no quedar buscando para siempre si algo raro pasara. */
const MAX_MESES_SOBRANTE = 36;

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

  const idsCreados = await withTransaction(pool, async (db) => {
    const ids: number[] = [];

    // Si eligió un mes y el pago es MAYOR a lo que ese mes tiene
    // pendiente, el sobrante se manda solo al próximo mes con algo
    // pendiente (y al siguiente, si hiciera falta) — pedido explícito:
    // "si pago de más redondeando, que el sobrante pase solo al próximo
    // mes". Sin mes elegido, no hay con qué comparar — se guarda tal
    // cual, como siempre.
    const tramos: Array<{ anio: number | null; mes: number | null; importeCentavos: number; esSobrante: boolean }> =
      data.periodoAnio != null && data.periodoMes != null
        ? await repartirConSobrante(db, { odontologoId: data.odontologoId, clinicaId: data.clinicaId }, data.moneda, data.importeCentavos, data.periodoAnio, data.periodoMes)
        : [{ anio: null, mes: null, importeCentavos: data.importeCentavos, esSobrante: false }];

    for (const tramo of tramos) {
      const id = await insertarPago(db, {
        ...data,
        importeCentavos: tramo.importeCentavos,
        periodoAnio: tramo.anio,
        periodoMes: tramo.mes,
        referencia: tramo.esSobrante
          ? `Sobrante de ${NOMBRES_MES[data.periodoMes! - 1]} ${data.periodoAnio}`
          : data.referencia,
        creadoPor: usuarioId
      });
      await registrarMovimientoHaber(db, {
        odontologoId: data.odontologoId,
        clinicaId: data.clinicaId,
        pagoId: id,
        importeCentavos: tramo.importeCentavos,
        moneda: data.moneda,
        fecha: data.fecha,
        descripcion: "Pago recibido",
        periodoAnio: tramo.anio,
        periodoMes: tramo.mes
      });
      ids.push(id);
    }

    await registrarAuditoria(db, {
      usuarioId,
      accion: "crear",
      entidad: "pagos",
      entidadId: ids[0],
      detalle: {
        odontologoId: data.odontologoId,
        clinicaId: data.clinicaId,
        importeCentavos: data.importeCentavos,
        moneda: data.moneda,
        medioPagoId: data.medioPagoId,
        fecha: data.fecha,
        // Cuando hubo sobrante, dejar anotado en qué meses quedó repartido
        // — sin esto, Auditoría solo mostraría el primer tramo.
        tramos: tramos.length > 1 ? tramos : undefined
      }
    });

    return ids;
  });

  const pagosCreados = await Promise.all(idsCreados.map((id) => obtenerPago(pool, id)));
  const [pago, ...pagosAdicionales] = pagosCreados as Pago[];
  return { creado: true, pago, pagosAdicionales };
}

/**
 * Reparte un importe entre el mes elegido y, si sobra, los siguientes
 * meses con algo pendiente — nunca crea una fila de $0 (un mes ya al día
 * se salta sin fila propia). Si el sobrante no encuentra ningún mes con
 * pendiente dentro de `MAX_MESES_SOBRANTE`, el resto vuelve al mes
 * elegido (queda como adelanto ahí, igual que si nunca hubiera reparto).
 */
async function repartirConSobrante(
  db: Queryable,
  titular: { odontologoId: number | null; clinicaId: number | null },
  moneda: Pago["moneda"],
  importeCentavos: number,
  anioElegido: number,
  mesElegido: number
): Promise<Array<{ anio: number; mes: number; importeCentavos: number; esSobrante: boolean }>> {
  const tramos: Array<{ anio: number; mes: number; importeCentavos: number; esSobrante: boolean }> = [];
  let restante = importeCentavos;
  let anio = anioElegido;
  let mes = mesElegido;

  for (let i = 0; i < MAX_MESES_SOBRANTE && restante > 0; i++) {
    const pendiente = await calcularPendientePuroDeMes(db, titular, moneda, anio, mes);
    if (pendiente > 0) {
      const aplicado = Math.min(restante, pendiente);
      // "Sobrante" es cualquier tramo que NO sea el mes que la persona
      // eligió — nunca depende de si es el primero en crearse (si el mes
      // elegido ya estaba al día, el primer tramo real que se crea puede
      // ser el siguiente, y ese sí es sobrante igual).
      const esSobrante = !(anio === anioElegido && mes === mesElegido);
      tramos.push({ anio, mes, importeCentavos: aplicado, esSobrante });
      restante -= aplicado;
    }
    // Siguiente mes (sin Date, para no depender de huso horario).
    mes += 1;
    if (mes > 12) {
      mes = 1;
      anio += 1;
    }
  }

  if (restante > 0) {
    // No quedó ningún mes con pendiente real en todo el rango buscado —
    // el resto se queda en el mes que eligió la persona, como adelanto
    // (mismo comportamiento que si no existiera el reparto automático).
    const yaTieneTramoDelMesElegido = tramos.some((t) => t.anio === anioElegido && t.mes === mesElegido);
    if (yaTieneTramoDelMesElegido) {
      tramos[0].importeCentavos += restante;
    } else {
      tramos.unshift({ anio: anioElegido, mes: mesElegido, importeCentavos: restante, esSobrante: false });
    }
  }

  return tramos;
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
