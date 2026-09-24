import type { Queryable } from "../types";
import type { Odontologo, OdontologoConEstadisticas, SaldoPorMoneda, Moneda } from "../../../shared/types/entities";

interface FilaOdontologo {
  id: number;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  lista_precio_id: number;
  lista_precio_nombre: string | null;
  lista_precio_moneda: Moneda | null;
  clinica_id: number | null;
  clinica_nombre: string | null;
  fecha_alta: string;
  activo: number;
}

const SELECT_BASE = `
  SELECT o.*, l.nombre AS lista_precio_nombre, l.moneda AS lista_precio_moneda, c.nombre AS clinica_nombre
  FROM odontologos o
  LEFT JOIN listas_precio l ON l.id = o.lista_precio_id
  LEFT JOIN clinicas c ON c.id = o.clinica_id
`;

function mapear(fila: FilaOdontologo): Odontologo {
  return {
    id: fila.id,
    nombre: fila.nombre,
    telefono: fila.telefono,
    direccion: fila.direccion,
    listaPrecioId: fila.lista_precio_id,
    listaPrecioNombre: fila.lista_precio_nombre ?? undefined,
    listaPrecioMoneda: fila.lista_precio_moneda ?? undefined,
    clinicaId: fila.clinica_id,
    clinicaNombre: fila.clinica_nombre,
    fechaAlta: fila.fecha_alta,
    activo: fila.activo === 1
  };
}

export interface FiltroOdontologos {
  soloActivos?: boolean;
  busqueda?: string;
  /** Filtra a los profesionales de una clínica puntual (o `null` explícito = independientes). */
  clinicaId?: number | null;
}

export async function listarOdontologos(db: Queryable, filtro: FiltroOdontologos = {}): Promise<Odontologo[]> {
  let sql = SELECT_BASE + " WHERE 1=1";
  const params: unknown[] = [];
  if (filtro.soloActivos) sql += " AND o.activo = 1";
  if (filtro.busqueda && filtro.busqueda.trim()) {
    params.push(`%${filtro.busqueda.trim()}%`);
    sql += ` AND o.nombre ILIKE $${params.length}`;
  }
  if (filtro.clinicaId !== undefined) {
    if (filtro.clinicaId === null) {
      sql += " AND o.clinica_id IS NULL";
    } else {
      params.push(filtro.clinicaId);
      sql += ` AND o.clinica_id = $${params.length}`;
    }
  }
  sql += " ORDER BY lower(o.nombre)";
  const { rows } = await db.query<FilaOdontologo>(sql, params);
  return rows.map(mapear);
}

export async function obtenerOdontologo(db: Queryable, id: number): Promise<Odontologo | null> {
  const { rows } = await db.query<FilaOdontologo>(SELECT_BASE + " WHERE o.id = $1", [id]);
  return rows[0] ? mapear(rows[0]) : null;
}

export interface DatosOdontologo {
  nombre: string;
  telefono?: string | null;
  direccion?: string | null;
  listaPrecioId: number;
  /** `null` o `undefined` = profesional independiente (sin clínica). */
  clinicaId?: number | null;
}

export async function crearOdontologo(db: Queryable, data: DatosOdontologo): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    "INSERT INTO odontologos (nombre, telefono, direccion, lista_precio_id, clinica_id) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [
      data.nombre.trim(),
      data.telefono?.trim() || null,
      data.direccion?.trim() || null,
      data.listaPrecioId,
      data.clinicaId ?? null
    ]
  );
  return rows[0].id;
}

export async function actualizarOdontologo(db: Queryable, id: number, data: DatosOdontologo): Promise<void> {
  await db.query(
    "UPDATE odontologos SET nombre = $1, telefono = $2, direccion = $3, lista_precio_id = $4, clinica_id = $5 WHERE id = $6",
    [
      data.nombre.trim(),
      data.telefono?.trim() || null,
      data.direccion?.trim() || null,
      data.listaPrecioId,
      data.clinicaId ?? null,
      id
    ]
  );
}

/** Solo cambia la lista de precios asignada (atajo usado desde el listado/ficha). */
export async function asignarListaPrecio(db: Queryable, id: number, listaPrecioId: number): Promise<void> {
  await db.query("UPDATE odontologos SET lista_precio_id = $1 WHERE id = $2", [listaPrecioId, id]);
}

/** Asigna (o quita, con `null`) la clínica de un profesional. Nunca afecta OTs ya creadas (§24). */
export async function asignarClinica(db: Queryable, id: number, clinicaId: number | null): Promise<void> {
  await db.query("UPDATE odontologos SET clinica_id = $1 WHERE id = $2", [clinicaId, id]);
}

export async function setActivoOdontologo(db: Queryable, id: number, activo: boolean): Promise<void> {
  await db.query("UPDATE odontologos SET activo = $1 WHERE id = $2", [activo ? 1 : 0, id]);
}

export async function obtenerEstadisticasOdontologo(db: Queryable, id: number): Promise<OdontologoConEstadisticas | null> {
  const base = await obtenerOdontologo(db, id);
  if (!base) return null;

  const [{ rows: saldosRows }, { rows: trabajosRows }, { rows: ultimoRows }] = await Promise.all([
    db.query<{ moneda: Moneda; total_debe_centavos: number; total_haber_centavos: number; saldo_centavos: number }>(
      "SELECT moneda, total_debe_centavos, total_haber_centavos, saldo_centavos FROM v_saldo_odontologo_moneda WHERE odontologo_id = $1",
      [id]
    ),
    db.query<{ c: number }>("SELECT COUNT(*) AS c FROM ordenes WHERE odontologo_id = $1 AND estado != 'anulado'", [id]),
    db.query<{ fecha_trabajo: string }>(
      "SELECT fecha_trabajo FROM ordenes WHERE odontologo_id = $1 AND estado != 'anulado' ORDER BY fecha_trabajo DESC LIMIT 1",
      [id]
    )
  ]);

  const saldos: SaldoPorMoneda[] = saldosRows.map((f) => ({
    moneda: f.moneda,
    totalDebeCentavos: f.total_debe_centavos,
    totalHaberCentavos: f.total_haber_centavos,
    saldoCentavos: f.saldo_centavos
  }));

  return {
    ...base,
    cantidadTrabajos: trabajosRows[0].c,
    saldos,
    ultimoTrabajoFecha: ultimoRows[0]?.fecha_trabajo ?? null
  };
}

/** Fecha del trabajo (no anulado) más reciente de cada odontólogo, para
 * ordenar el listado por actividad reciente. Los odontólogos sin ningún
 * trabajo registrado simplemente no aparecen en el resultado. */
export async function obtenerUltimaActividadOdontologos(
  db: Queryable
): Promise<Array<{ odontologoId: number; ultimoTrabajoFecha: string }>> {
  const { rows } = await db.query<{ odontologoId: number; ultimoTrabajoFecha: string }>(
    `SELECT odontologo_id AS "odontologoId", MAX(fecha_trabajo) AS "ultimoTrabajoFecha"
     FROM ordenes
     WHERE estado != 'anulado'
     GROUP BY odontologo_id`
  );
  return rows;
}

export async function tieneRegistrosAsociados(db: Queryable, id: number): Promise<boolean> {
  const [{ rows: pacientesRows }, { rows: ordenesRows }] = await Promise.all([
    db.query<{ c: number }>("SELECT COUNT(*) AS c FROM pacientes WHERE odontologo_id = $1", [id]),
    db.query<{ c: number }>("SELECT COUNT(*) AS c FROM ordenes WHERE odontologo_id = $1", [id])
  ]);
  return pacientesRows[0].c > 0 || ordenesRows[0].c > 0;
}
