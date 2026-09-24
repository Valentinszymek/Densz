import type { Queryable } from "../types";
import type {
  RangoFechas,
  KpisPeriodo,
  ResumenOperativo,
  KpiPorMoneda,
  PuntoTrabajosPorDia,
  IngresoPorOdontologo,
  TrabajoPorCategoria,
  Evolucion,
  PuntoEvolucion,
  RankingOdontologo,
  RankingClinica,
  PrestacionRanking,
  SaldoPendienteEntidad,
  Moneda
} from "../../../shared/types/entities";

export async function obtenerKpisPeriodo(db: Queryable, rango: RangoFechas): Promise<KpisPeriodo> {
  const [
    { rows: cantidadRows },
    { rows: odontologosRows },
    { rows: clinicasRows },
    { rows: piezasRows },
    { rows: cantidadPorEstado },
    { rows: registradoPorMoneda },
    { rows: pendientePorMoneda },
    { rows: pagosPorMoneda }
  ] = await Promise.all([
    db.query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM ordenes WHERE fecha_trabajo BETWEEN $1 AND $2 AND estado != 'anulado'`,
      [rango.desde, rango.hasta]
    ),
    db.query<{ c: number }>(
      `SELECT COUNT(DISTINCT odontologo_id) AS c FROM ordenes WHERE fecha_trabajo BETWEEN $1 AND $2 AND estado != 'anulado'`,
      [rango.desde, rango.hasta]
    ),
    db.query<{ c: number }>(
      `SELECT COUNT(DISTINCT clinica_id) AS c FROM ordenes
       WHERE fecha_trabajo BETWEEN $1 AND $2 AND estado != 'anulado' AND clinica_id IS NOT NULL`,
      [rango.desde, rango.hasta]
    ),
    db.query<{ c: number }>(
      `SELECT COUNT(*) AS c
       FROM orden_prestacion_piezas opp
       JOIN orden_prestaciones op ON op.id = opp.orden_prestacion_id
       JOIN ordenes o ON o.id = op.orden_id
       WHERE o.fecha_trabajo BETWEEN $1 AND $2 AND o.estado != 'anulado'`,
      [rango.desde, rango.hasta]
    ),
    db.query<{ estado: string; c: number }>(
      `SELECT estado, COUNT(*) AS c FROM ordenes WHERE fecha_trabajo BETWEEN $1 AND $2 GROUP BY estado`,
      [rango.desde, rango.hasta]
    ),
    db.query<{ moneda: Moneda; cantidad: number; total: number }>(
      `SELECT moneda, COUNT(*) AS cantidad, COALESCE(SUM(total_centavos), 0) AS total
       FROM ordenes WHERE fecha_trabajo BETWEEN $1 AND $2 AND estado != 'anulado'
       GROUP BY moneda`,
      [rango.desde, rango.hasta]
    ),
    db.query<{ moneda: Moneda; s: number }>(
      `SELECT moneda, COALESCE(SUM(saldo_centavos), 0) AS s FROM v_saldo_odontologo_moneda WHERE saldo_centavos > 0 GROUP BY moneda`
    ),
    db.query<{ moneda: Moneda; s: number }>(
      `SELECT moneda, COALESCE(SUM(importe_centavos), 0) AS s FROM pagos WHERE fecha BETWEEN $1 AND $2 AND anulado = 0 GROUP BY moneda`,
      [rango.desde, rango.hasta]
    )
  ]);

  const cantidadPendientesFacturar = cantidadPorEstado.find((f) => f.estado === "pendiente_facturar")?.c ?? 0;
  const cantidadFacturados = cantidadPorEstado.find((f) => f.estado === "facturado")?.c ?? 0;
  const cantidadAnulados = cantidadPorEstado.find((f) => f.estado === "anulado")?.c ?? 0;

  const monedas = new Set<Moneda>(["ARS", "USD"]);
  registradoPorMoneda.forEach((f) => monedas.add(f.moneda));
  pendientePorMoneda.forEach((f) => monedas.add(f.moneda));
  pagosPorMoneda.forEach((f) => monedas.add(f.moneda));

  const porMoneda: KpiPorMoneda[] = Array.from(monedas)
    .map((moneda) => {
      const totalRegistradoCentavos = registradoPorMoneda.find((f) => f.moneda === moneda)?.total ?? 0;
      const cantidadTrabajosMoneda = registradoPorMoneda.find((f) => f.moneda === moneda)?.cantidad ?? 0;
      return {
        moneda,
        totalRegistradoCentavos,
        pendienteCobroCentavos: pendientePorMoneda.find((f) => f.moneda === moneda)?.s ?? 0,
        pagosRecibidosCentavos: pagosPorMoneda.find((f) => f.moneda === moneda)?.s ?? 0,
        cantidadTrabajos: cantidadTrabajosMoneda,
        // Nunca se divide por cero: sin trabajos en esta moneda, ticket promedio es 0.
        ticketPromedioCentavos: cantidadTrabajosMoneda > 0 ? Math.round(totalRegistradoCentavos / cantidadTrabajosMoneda) : 0
      };
    })
    .filter((k) => k.totalRegistradoCentavos > 0 || k.pendienteCobroCentavos > 0 || k.pagosRecibidosCentavos > 0 || k.moneda === "ARS");

  return {
    cantidadTrabajos: cantidadRows[0].c,
    cantidadOdontologosConTrabajos: odontologosRows[0].c,
    cantidadClinicasConTrabajos: clinicasRows[0].c,
    cantidadPiezasTotal: piezasRows[0].c,
    cantidadPendientesFacturar,
    cantidadFacturados,
    cantidadAnulados,
    porMoneda
  };
}

/**
 * El equivalente 100% operativo de `obtenerKpisPeriodo`, sin ningún
 * importe (ni siquiera `porMoneda`) — es el que usa Inicio, que a
 * propósito nunca queda detrás de la protección opcional por contraseña.
 * El resto de las consultas de este archivo sí puede protegerse porque
 * solo las usa la pantalla de Estadísticas.
 */
export async function obtenerResumenOperativo(db: Queryable, rango: RangoFechas): Promise<ResumenOperativo> {
  const { rows: cantidadPorEstado } = await db.query<{ estado: string; c: number }>(
    `SELECT estado, COUNT(*) AS c FROM ordenes WHERE fecha_trabajo BETWEEN $1 AND $2 GROUP BY estado`,
    [rango.desde, rango.hasta]
  );

  const pendientes = cantidadPorEstado.find((f) => f.estado === "pendiente_facturar")?.c ?? 0;
  const facturados = cantidadPorEstado.find((f) => f.estado === "facturado")?.c ?? 0;
  const anulados = cantidadPorEstado.find((f) => f.estado === "anulado")?.c ?? 0;

  return {
    cantidadTrabajos: pendientes + facturados, // total "vivo" del período, igual criterio que obtenerKpisPeriodo (excluye anulados)
    cantidadPendientesFacturar: pendientes,
    cantidadFacturados: facturados,
    cantidadAnulados: anulados
  };
}

export async function trabajosPorDia(db: Queryable, rango: RangoFechas): Promise<PuntoTrabajosPorDia[]> {
  // El gráfico de evolución no separa por moneda (es sobre todo un
  // indicador de volumen de trabajo); el detalle por moneda vive en los KPIs.
  const { rows } = await db.query<{ fecha: string; cantidad: number; total: number }>(
    `SELECT fecha_trabajo AS fecha, COUNT(*) AS cantidad, SUM(total_centavos) AS total
     FROM ordenes WHERE fecha_trabajo BETWEEN $1 AND $2 AND estado != 'anulado'
     GROUP BY fecha_trabajo ORDER BY fecha_trabajo`,
    [rango.desde, rango.hasta]
  );
  return rows.map((f) => ({ fecha: f.fecha, cantidad: f.cantidad, totalCentavos: f.total }));
}

export async function ingresosPorOdontologo(db: Queryable, rango: RangoFechas): Promise<IngresoPorOdontologo[]> {
  const { rows } = await db.query<{
    odontologo_id: number;
    odontologo_nombre: string;
    moneda: Moneda;
    cantidad: number;
    total: number;
  }>(
    `SELECT o.odontologo_id AS odontologo_id, od.nombre AS odontologo_nombre, o.moneda,
            COUNT(*) AS cantidad, SUM(o.total_centavos) AS total
     FROM ordenes o
     JOIN odontologos od ON od.id = o.odontologo_id
     WHERE o.fecha_trabajo BETWEEN $1 AND $2 AND o.estado != 'anulado'
     GROUP BY o.odontologo_id, od.nombre, o.moneda
     ORDER BY total DESC
     LIMIT 15`,
    [rango.desde, rango.hasta]
  );
  return rows.map((f) => ({
    odontologoId: f.odontologo_id,
    odontologoNombre: f.odontologo_nombre,
    moneda: f.moneda,
    cantidad: f.cantidad,
    totalCentavos: f.total
  }));
}

export async function trabajosPorCategoria(db: Queryable, rango: RangoFechas): Promise<TrabajoPorCategoria[]> {
  const { rows } = await db.query<{ categoria_nombre: string; moneda: Moneda; cantidad: number; total: number }>(
    `SELECT op.categoria_nombre AS categoria_nombre, o.moneda, COUNT(*) AS cantidad, SUM(op.subtotal_centavos) AS total
     FROM orden_prestaciones op
     JOIN ordenes o ON o.id = op.orden_id
     WHERE o.fecha_trabajo BETWEEN $1 AND $2 AND o.estado != 'anulado'
     GROUP BY op.categoria_nombre, o.moneda
     ORDER BY total DESC`,
    [rango.desde, rango.hasta]
  );
  return rows.map((f) => ({ categoriaNombre: f.categoria_nombre, moneda: f.moneda, cantidad: f.cantidad, totalCentavos: f.total }));
}

/**
 * Evolución del período: factura + cobros + cantidad de trabajos agrupados
 * por bucket (día si el rango es corto, mes si es largo — §7) y SIEMPRE
 * separados por moneda (nunca se suma ARS con USD).
 */
export async function obtenerEvolucion(db: Queryable, rango: RangoFechas): Promise<Evolucion> {
  const dias = Math.round((new Date(rango.hasta).getTime() - new Date(rango.desde).getTime()) / 86400000) + 1;
  const granularidad: "dia" | "mes" = dias > 62 ? "mes" : "dia";
  const exprOrden = granularidad === "dia" ? "fecha_trabajo" : "substr(fecha_trabajo, 1, 7)";
  const exprPago = granularidad === "dia" ? "fecha" : "substr(fecha, 1, 7)";

  const [{ rows: trabajos }, { rows: pagos }] = await Promise.all([
    db.query<{ bucket: string; moneda: Moneda; cantidad: number; total: number }>(
      `SELECT ${exprOrden} AS bucket, moneda, COUNT(*) AS cantidad, COALESCE(SUM(total_centavos), 0) AS total
       FROM ordenes WHERE fecha_trabajo BETWEEN $1 AND $2 AND estado != 'anulado'
       GROUP BY bucket, moneda`,
      [rango.desde, rango.hasta]
    ),
    db.query<{ bucket: string; moneda: Moneda; total: number }>(
      `SELECT ${exprPago} AS bucket, moneda, COALESCE(SUM(importe_centavos), 0) AS total
       FROM pagos WHERE fecha BETWEEN $1 AND $2 AND anulado = 0
       GROUP BY bucket, moneda`,
      [rango.desde, rango.hasta]
    )
  ]);

  const puntos = new Map<string, PuntoEvolucion>();
  for (const t of trabajos) {
    puntos.set(`${t.bucket}|${t.moneda}`, {
      bucket: t.bucket,
      moneda: t.moneda,
      cantidadTrabajos: t.cantidad,
      facturadoCentavos: t.total,
      cobradoCentavos: 0
    });
  }
  for (const p of pagos) {
    const clave = `${p.bucket}|${p.moneda}`;
    const existente = puntos.get(clave);
    if (existente) existente.cobradoCentavos = p.total;
    else puntos.set(clave, { bucket: p.bucket, moneda: p.moneda, cantidadTrabajos: 0, facturadoCentavos: 0, cobradoCentavos: p.total });
  }

  const lista = Array.from(puntos.values()).sort((a, b) =>
    a.bucket === b.bucket ? a.moneda.localeCompare(b.moneda) : a.bucket.localeCompare(b.bucket)
  );
  return { granularidad, puntos: lista };
}

/** Ranking de odontólogos con actividad en el período: trabajos, facturado
 * y cobrado del período + saldo pendiente ACTUAL (no acotado al período,
 * porque es "cuánto me debe hoy"). Una fila por moneda (§8). */
export async function rankingOdontologos(db: Queryable, rango: RangoFechas): Promise<RankingOdontologo[]> {
  const [{ rows: base }, { rows: cobrado }, { rows: saldos }] = await Promise.all([
    db.query<{ odontologo_id: number; odontologo_nombre: string; moneda: Moneda; cantidad: number; facturado: number }>(
      `SELECT o.odontologo_id AS odontologo_id, od.nombre AS odontologo_nombre, o.moneda,
              COUNT(*) AS cantidad, COALESCE(SUM(o.total_centavos), 0) AS facturado
       FROM ordenes o
       JOIN odontologos od ON od.id = o.odontologo_id
       WHERE o.fecha_trabajo BETWEEN $1 AND $2 AND o.estado != 'anulado'
       GROUP BY o.odontologo_id, od.nombre, o.moneda`,
      [rango.desde, rango.hasta]
    ),
    db.query<{ odontologo_id: number; moneda: Moneda; total: number }>(
      `SELECT odontologo_id, moneda, COALESCE(SUM(importe_centavos), 0) AS total
       FROM pagos WHERE odontologo_id IS NOT NULL AND fecha BETWEEN $1 AND $2 AND anulado = 0
       GROUP BY odontologo_id, moneda`,
      [rango.desde, rango.hasta]
    ),
    db.query<{ odontologo_id: number; moneda: Moneda; saldo_centavos: number }>(
      `SELECT odontologo_id, moneda, saldo_centavos FROM v_saldo_odontologo_moneda`
    )
  ]);

  return base.map((f): RankingOdontologo => {
    const c = cobrado.find((x) => x.odontologo_id === f.odontologo_id && x.moneda === f.moneda);
    const s = saldos.find((x) => x.odontologo_id === f.odontologo_id && x.moneda === f.moneda);
    return {
      odontologoId: f.odontologo_id,
      odontologoNombre: f.odontologo_nombre,
      moneda: f.moneda,
      cantidadTrabajos: f.cantidad,
      facturadoCentavos: f.facturado,
      cobradoCentavos: c?.total ?? 0,
      saldoPendienteCentavos: s?.saldo_centavos ?? 0
    };
  });
}

/** Igual que `rankingOdontologos`, pero para clínicas (§9). */
export async function rankingClinicas(db: Queryable, rango: RangoFechas): Promise<RankingClinica[]> {
  const [{ rows: base }, { rows: cobrado }, { rows: saldos }] = await Promise.all([
    db.query<{ clinica_id: number; clinica_nombre: string; moneda: Moneda; cantidad: number; facturado: number }>(
      `SELECT o.clinica_id AS clinica_id, c.nombre AS clinica_nombre, o.moneda,
              COUNT(*) AS cantidad, COALESCE(SUM(o.total_centavos), 0) AS facturado
       FROM ordenes o
       JOIN clinicas c ON c.id = o.clinica_id
       WHERE o.fecha_trabajo BETWEEN $1 AND $2 AND o.estado != 'anulado' AND o.clinica_id IS NOT NULL
       GROUP BY o.clinica_id, c.nombre, o.moneda`,
      [rango.desde, rango.hasta]
    ),
    db.query<{ clinica_id: number; moneda: Moneda; total: number }>(
      `SELECT clinica_id, moneda, COALESCE(SUM(importe_centavos), 0) AS total
       FROM pagos WHERE clinica_id IS NOT NULL AND fecha BETWEEN $1 AND $2 AND anulado = 0
       GROUP BY clinica_id, moneda`,
      [rango.desde, rango.hasta]
    ),
    db.query<{ clinica_id: number; moneda: Moneda; saldo_centavos: number }>(
      `SELECT clinica_id, moneda, saldo_centavos FROM v_saldo_clinica_moneda`
    )
  ]);

  return base.map((f): RankingClinica => {
    const c = cobrado.find((x) => x.clinica_id === f.clinica_id && x.moneda === f.moneda);
    const s = saldos.find((x) => x.clinica_id === f.clinica_id && x.moneda === f.moneda);
    return {
      clinicaId: f.clinica_id,
      clinicaNombre: f.clinica_nombre,
      moneda: f.moneda,
      cantidadTrabajos: f.cantidad,
      facturadoCentavos: f.facturado,
      cobradoCentavos: c?.total ?? 0,
      saldoPendienteCentavos: s?.saldo_centavos ?? 0
    };
  });
}

/** Volumen y facturación por prestación en el período (§10, §11) — usa el
 * nombre congelado en cada trabajo (`orden_prestaciones.prestacion_nombre`),
 * nunca el catálogo actual: una prestación renombrada o eliminada después
 * no altera cómo se ve el historial. */
export async function prestacionesRanking(db: Queryable, rango: RangoFechas): Promise<PrestacionRanking[]> {
  const { rows } = await db.query<{ nombre: string; moneda: Moneda; cantidad: number; total: number }>(
    `SELECT op.prestacion_nombre AS nombre, o.moneda AS moneda,
            COALESCE(SUM(op.cantidad), 0) AS cantidad, COALESCE(SUM(op.subtotal_centavos), 0) AS total
     FROM orden_prestaciones op
     JOIN ordenes o ON o.id = op.orden_id
     WHERE o.fecha_trabajo BETWEEN $1 AND $2 AND o.estado != 'anulado'
     GROUP BY op.prestacion_nombre, o.moneda
     ORDER BY cantidad DESC`,
    [rango.desde, rango.hasta]
  );
  return rows.map((f) => ({ prestacionNombre: f.nombre, moneda: f.moneda, cantidad: f.cantidad, totalCentavos: f.total }));
}

/** Mayores deudores (odontólogos y clínicas juntos, cada uno con su tipo) —
 * es un saldo ACTUAL, no acotado al período (§12): "quién nos debe hoy". */
export async function saldosPendientesTop(db: Queryable, limite = 20): Promise<SaldoPendienteEntidad[]> {
  const { rows } = await db.query<{ tipo: "odontologo" | "clinica"; id: number; nombre: string; moneda: Moneda; saldo: number }>(
    `SELECT 'odontologo' AS tipo, o.id AS id, o.nombre AS nombre, s.moneda AS moneda, s.saldo_centavos AS saldo
     FROM v_saldo_odontologo_moneda s JOIN odontologos o ON o.id = s.odontologo_id
     WHERE s.saldo_centavos > 0
     UNION ALL
     SELECT 'clinica' AS tipo, c.id AS id, c.nombre AS nombre, s.moneda AS moneda, s.saldo_centavos AS saldo
     FROM v_saldo_clinica_moneda s JOIN clinicas c ON c.id = s.clinica_id
     WHERE s.saldo_centavos > 0
     ORDER BY saldo DESC
     LIMIT $1`,
    [limite]
  );
  return rows.map((f) => ({ tipo: f.tipo, id: f.id, nombre: f.nombre, moneda: f.moneda, saldoCentavos: f.saldo }));
}
