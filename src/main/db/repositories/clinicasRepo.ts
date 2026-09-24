import type { Queryable } from "../types";
import type { Clinica, ClinicaConEstadisticas, SaldoPorMoneda, Moneda } from "../../../shared/types/entities";
import { DenszError } from "../../utils/errors";

interface FilaClinica {
  id: number;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  fecha_alta: string;
  activo: number;
}

function mapear(f: FilaClinica): Clinica {
  return {
    id: f.id,
    nombre: f.nombre,
    telefono: f.telefono,
    direccion: f.direccion,
    fechaAlta: f.fecha_alta,
    activo: f.activo === 1
  };
}

export interface FiltroClinicas {
  soloActivas?: boolean;
  busqueda?: string;
}

export async function listarClinicas(db: Queryable, filtro: FiltroClinicas = {}): Promise<Clinica[]> {
  let sql = "SELECT * FROM clinicas WHERE 1=1";
  const params: unknown[] = [];
  if (filtro.soloActivas) sql += " AND activo = 1";
  if (filtro.busqueda?.trim()) {
    params.push(`%${filtro.busqueda.trim()}%`);
    sql += ` AND nombre ILIKE $${params.length}`;
  }
  sql += " ORDER BY lower(nombre)";
  const { rows } = await db.query<FilaClinica>(sql, params);
  return rows.map(mapear);
}

export async function obtenerClinica(db: Queryable, id: number): Promise<Clinica | null> {
  const { rows } = await db.query<FilaClinica>("SELECT * FROM clinicas WHERE id = $1", [id]);
  return rows[0] ? mapear(rows[0]) : null;
}

export interface DatosClinica {
  nombre: string;
  telefono?: string | null;
  direccion?: string | null;
}

export async function crearClinica(db: Queryable, data: DatosClinica): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    "INSERT INTO clinicas (nombre, telefono, direccion) VALUES ($1, $2, $3) RETURNING id",
    [data.nombre.trim(), data.telefono?.trim() || null, data.direccion?.trim() || null]
  );
  return rows[0].id;
}

export async function actualizarClinica(db: Queryable, id: number, data: DatosClinica): Promise<void> {
  await db.query("UPDATE clinicas SET nombre = $1, telefono = $2, direccion = $3 WHERE id = $4", [
    data.nombre.trim(),
    data.telefono?.trim() || null,
    data.direccion?.trim() || null,
    id
  ]);
}

export async function setActivaClinica(db: Queryable, id: number, activo: boolean): Promise<void> {
  await db.query("UPDATE clinicas SET activo = $1 WHERE id = $2", [activo ? 1 : 0, id]);
}

export async function obtenerEstadisticasClinica(db: Queryable, id: number): Promise<ClinicaConEstadisticas | null> {
  const base = await obtenerClinica(db, id);
  if (!base) return null;

  const [{ rows: profesionalesRows }, { rows: trabajosRows }, { rows: saldosRows }] = await Promise.all([
    db.query<{ c: number }>("SELECT COUNT(*) AS c FROM odontologos WHERE clinica_id = $1", [id]),
    db.query<{ c: number }>("SELECT COUNT(*) AS c FROM ordenes WHERE clinica_id = $1 AND estado != 'anulado'", [id]),
    db.query<{ moneda: Moneda; total_debe_centavos: number; total_haber_centavos: number; saldo_centavos: number }>(
      "SELECT moneda, total_debe_centavos, total_haber_centavos, saldo_centavos FROM v_saldo_clinica_moneda WHERE clinica_id = $1",
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
    cantidadProfesionales: profesionalesRows[0].c,
    cantidadTrabajos: trabajosRows[0].c,
    saldos
  };
}

/** Profesionales (odontólogos) que pertenecen a una clínica. */
export async function tieneRegistrosAsociados(db: Queryable, id: number): Promise<boolean> {
  const [{ rows: profesionalesRows }, { rows: ordenesRows }] = await Promise.all([
    db.query<{ c: number }>("SELECT COUNT(*) AS c FROM odontologos WHERE clinica_id = $1", [id]),
    db.query<{ c: number }>("SELECT COUNT(*) AS c FROM ordenes WHERE clinica_id = $1", [id])
  ]);
  return profesionalesRows[0].c > 0 || ordenesRows[0].c > 0;
}

export interface UsoClinica {
  cantidadProfesionales: number;
  cantidadTrabajos: number;
  cantidadComprobantes: number;
  cantidadPagos: number;
  cantidadMovimientos: number;
}

export async function contarUsoClinica(db: Queryable, id: number): Promise<UsoClinica> {
  const [
    { rows: profesionalesRows },
    { rows: trabajosRows },
    { rows: comprobantesRows },
    { rows: pagosRows },
    { rows: movimientosRows }
  ] = await Promise.all([
    db.query<{ c: number }>("SELECT COUNT(*) c FROM odontologos WHERE clinica_id = $1", [id]),
    db.query<{ c: number }>("SELECT COUNT(*) c FROM ordenes WHERE clinica_id = $1", [id]),
    db.query<{ c: number }>(
      "SELECT COUNT(*) c FROM comprobantes cp JOIN ordenes o ON o.id = cp.orden_id WHERE o.clinica_id = $1",
      [id]
    ),
    db.query<{ c: number }>("SELECT COUNT(*) c FROM pagos WHERE clinica_id = $1", [id]),
    db.query<{ c: number }>("SELECT COUNT(*) c FROM movimientos_cuenta WHERE clinica_id = $1", [id])
  ]);
  return {
    cantidadProfesionales: profesionalesRows[0].c,
    cantidadTrabajos: trabajosRows[0].c,
    cantidadComprobantes: comprobantesRows[0].c,
    cantidadPagos: pagosRows[0].c,
    cantidadMovimientos: movimientosRows[0].c
  };
}

/**
 * Elimina físicamente una clínica — solo si NO tiene absolutamente ningún
 * registro histórico asociado (ni profesionales, ni trabajos, ni pagos, ni
 * movimientos de cuenta). Esto existe únicamente para corregir una clínica
 * cargada por error: si tiene cualquier historial, se bloquea por completo
 * (nunca se borra información real) y la vía segura es desactivarla.
 */
export async function eliminarClinica(db: Queryable, id: number): Promise<void> {
  const uso = await contarUsoClinica(db, id);
  const tieneHistorial =
    uso.cantidadProfesionales > 0 || uso.cantidadTrabajos > 0 || uso.cantidadPagos > 0 || uso.cantidadMovimientos > 0;
  if (tieneHistorial) {
    throw new DenszError(
      "Esta clínica tiene información histórica asociada y no puede eliminarse sin perder registros."
    );
  }
  await db.query("DELETE FROM clinicas WHERE id = $1", [id]);
}
