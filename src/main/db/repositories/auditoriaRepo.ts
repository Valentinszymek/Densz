import type { Queryable } from "../types";
import type {
  RegistroAuditoria,
  FiltroAuditoriaDto,
  ResultadoAuditoriaDto,
  OpcionesFiltroAuditoriaDto,
  PeriodoAuditoria
} from "../../../shared/types/entities";

export interface NuevaAuditoria {
  usuarioId: number | null;
  accion: string;
  entidad: string;
  entidadId?: number | null;
  detalle?: Record<string, unknown>;
}

export async function registrarAuditoria(db: Queryable, entrada: NuevaAuditoria): Promise<void> {
  await db.query(
    "INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle) VALUES ($1, $2, $3, $4, $5)",
    [
      entrada.usuarioId,
      entrada.accion,
      entrada.entidad,
      entrada.entidadId ?? null,
      entrada.detalle ? JSON.stringify(entrada.detalle) : null
    ]
  );
}

interface FilaAuditoria {
  id: number;
  usuario_id: number | null;
  usuario_nombre: string | null;
  usuario_login: string | null;
  fecha: string;
  accion: string;
  entidad: string;
  entidad_id: number | null;
  detalle: string | null;
}

function mapear(f: FilaAuditoria): RegistroAuditoria {
  return {
    id: f.id,
    usuarioId: f.usuario_id,
    usuarioNombre: f.usuario_nombre,
    usuarioLogin: f.usuario_login,
    fecha: f.fecha,
    accion: f.accion,
    entidad: f.entidad,
    entidadId: f.entidad_id,
    detalle: f.detalle ? (JSON.parse(f.detalle) as Record<string, unknown>) : null
  };
}

const SELECT_CON_USUARIO = `
  SELECT a.*, u.nombre_completo AS usuario_nombre, u.nombre_usuario AS usuario_login
  FROM auditoria a
  LEFT JOIN usuarios u ON u.id = a.usuario_id
`;

/** @deprecated usar listarAuditoriaFiltrada — se conserva sin tocar por si
 * algo más además de Auditoria/index.tsx llega a depender de esta forma
 * simple (no se encontró ningún otro punto de uso al auditar el código). */
export async function listarAuditoria(
  db: Queryable,
  opts: { limite?: number; entidad?: string } = {}
): Promise<RegistroAuditoria[]> {
  let sql = SELECT_CON_USUARIO + " WHERE 1=1";
  const params: unknown[] = [];
  if (opts.entidad) {
    params.push(opts.entidad);
    sql += ` AND a.entidad = $${params.length}`;
  }
  params.push(opts.limite ?? 200);
  sql += ` ORDER BY a.fecha DESC, a.id DESC LIMIT $${params.length}`;

  const { rows } = await db.query<FilaAuditoria>(sql, params);
  return rows.map(mapear);
}

const TAMANO_PAGINA_DEFECTO = 50;

/** Convierte un Date (instante absoluto, construido a partir de campos
 * LOCALES — año/mes/día/hora locales del sistema) al string UTC
 * "YYYY-MM-DD HH:MM:SS" que usa `densz_now()` en la columna `fecha` —
 * así el filtro de período compara siempre contra la hora local real del
 * sistema, sin depender de cómo interprete fechas el navegador/renderer. */
function aFechaSqlUtc(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function inicioDeDiaLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function finDeDiaLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Calcula el rango [desde, hasta] (en UTC, listo para comparar contra la
 * columna `fecha`) de cada período relativo, tomando SIEMPRE la hora local
 * del sistema como referencia — nunca la del navegador/renderer. Para
 * "personalizado" espera fechas "YYYY-MM-DD" (las que entrega un
 * `<input type="date">`), tratadas como fechas locales, inclusive. */
export function calcularRangoPeriodo(
  periodo: PeriodoAuditoria | undefined,
  desdeCustom?: string,
  hastaCustom?: string
): { desde: string | null; hasta: string | null } {
  if (!periodo || periodo === "todos") return { desde: null, hasta: null };
  const ahora = new Date();

  switch (periodo) {
    case "hoy":
      return { desde: aFechaSqlUtc(inicioDeDiaLocal(ahora)), hasta: aFechaSqlUtc(finDeDiaLocal(ahora)) };

    case "ultimos7": {
      const ini = new Date(ahora);
      ini.setDate(ini.getDate() - 6);
      return { desde: aFechaSqlUtc(inicioDeDiaLocal(ini)), hasta: aFechaSqlUtc(finDeDiaLocal(ahora)) };
    }

    case "ultimos30": {
      const ini = new Date(ahora);
      ini.setDate(ini.getDate() - 29);
      return { desde: aFechaSqlUtc(inicioDeDiaLocal(ini)), hasta: aFechaSqlUtc(finDeDiaLocal(ahora)) };
    }

    case "esteMes": {
      const ini = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      return { desde: aFechaSqlUtc(inicioDeDiaLocal(ini)), hasta: aFechaSqlUtc(finDeDiaLocal(ahora)) };
    }

    case "mesAnterior": {
      const ini = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
      const fin = new Date(ahora.getFullYear(), ahora.getMonth(), 0); // día 0 del mes actual = último día del anterior
      return { desde: aFechaSqlUtc(inicioDeDiaLocal(ini)), hasta: aFechaSqlUtc(finDeDiaLocal(fin)) };
    }

    case "personalizado": {
      if (!desdeCustom || !hastaCustom) return { desde: null, hasta: null };
      const [ya, ma, da] = desdeCustom.split("-").map(Number);
      const [yb, mb, db_] = hastaCustom.split("-").map(Number);
      return {
        desde: aFechaSqlUtc(new Date(ya, ma - 1, da, 0, 0, 0, 0)),
        hasta: aFechaSqlUtc(new Date(yb, mb - 1, db_, 23, 59, 59, 999))
      };
    }

    default:
      return { desde: null, hasta: null };
  }
}

function armarWhere(filtro: FiltroAuditoriaDto): { where: string; params: unknown[] } {
  const partes: string[] = ["1=1"];
  const params: unknown[] = [];

  if (filtro.usuarioId) {
    params.push(filtro.usuarioId);
    partes.push(`a.usuario_id = $${params.length}`);
  }
  if (filtro.accion) {
    params.push(filtro.accion);
    partes.push(`a.accion = $${params.length}`);
  }
  if (filtro.entidad) {
    params.push(filtro.entidad);
    partes.push(`a.entidad = $${params.length}`);
  }

  const { desde, hasta } = calcularRangoPeriodo(filtro.periodo, filtro.desde, filtro.hasta);
  if (desde) {
    params.push(desde);
    partes.push(`a.fecha >= $${params.length}`);
  }
  if (hasta) {
    params.push(hasta);
    partes.push(`a.fecha <= $${params.length}`);
  }

  if (filtro.busqueda?.trim()) {
    const like = `%${filtro.busqueda.trim()}%`;
    const idxs = [1, 2, 3, 4, 5, 6, 7].map(() => {
      params.push(like);
      return params.length;
    });
    partes.push(
      `(u.nombre_completo ILIKE $${idxs[0]} OR u.nombre_usuario ILIKE $${idxs[1]} OR
        a.accion ILIKE $${idxs[2]} OR a.entidad ILIKE $${idxs[3]} OR
        CAST(a.id AS TEXT) LIKE $${idxs[4]} OR CAST(a.entidad_id AS TEXT) LIKE $${idxs[5]} OR
        a.detalle ILIKE $${idxs[6]})`
    );
  }

  return { where: partes.join(" AND "), params };
}

/** Lista Auditoría con todos los filtros combinables + paginación real
 * (LIMIT/OFFSET en SQL — nunca trae todo a memoria para filtrar en JS). */
export async function listarAuditoriaFiltrada(db: Queryable, filtro: FiltroAuditoriaDto = {}): Promise<ResultadoAuditoriaDto> {
  const { where, params } = armarWhere(filtro);
  const tamanoPagina = TAMANO_PAGINA_DEFECTO;
  const pagina = Math.max(1, filtro.pagina ?? 1);
  const offset = (pagina - 1) * tamanoPagina;

  const { rows: totalRows } = await db.query<{ c: number }>(
    `SELECT COUNT(*) c FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id WHERE ${where}`,
    params
  );
  const total = totalRows[0].c;

  const paramsPagina = [...params, tamanoPagina, offset];
  const { rows } = await db.query<FilaAuditoria>(
    `${SELECT_CON_USUARIO} WHERE ${where} ORDER BY a.fecha DESC, a.id DESC LIMIT $${paramsPagina.length - 1} OFFSET $${paramsPagina.length}`,
    paramsPagina
  );

  return { items: rows.map(mapear), total, pagina, tamanoPagina };
}

/** Igual que listarAuditoriaFiltrada pero sin paginar — solo para
 * exportar: el usuario espera que "Exportar" traiga TODOS los resultados
 * que cumplen los filtros activos, no solo la página visible en pantalla. */
export async function listarAuditoriaFiltradaCompleta(db: Queryable, filtro: FiltroAuditoriaDto = {}): Promise<RegistroAuditoria[]> {
  const { where, params } = armarWhere(filtro);
  const { rows } = await db.query<FilaAuditoria>(
    `${SELECT_CON_USUARIO} WHERE ${where} ORDER BY a.fecha DESC, a.id DESC`,
    params
  );
  return rows.map(mapear);
}

/** Opciones reales para los tres filtros de la barra de herramientas —
 * nunca listas inventadas: usuarios solo si tienen al menos un evento
 * (así un usuario inactivo con historial sigue apareciendo, y uno recién
 * creado sin actividad todavía no ensucia el filtro), acciones y
 * entidades tal como existen hoy en la tabla. */
export async function obtenerOpcionesFiltroAuditoria(db: Queryable): Promise<OpcionesFiltroAuditoriaDto> {
  const [{ rows: usuarios }, { rows: accionesRows }, { rows: entidadesRows }] = await Promise.all([
    db.query<{ id: number; nombre: string; nombreUsuario: string }>(
      `SELECT * FROM (
         SELECT DISTINCT a.usuario_id AS id, u.nombre_completo AS nombre, u.nombre_usuario AS "nombreUsuario"
         FROM auditoria a
         JOIN usuarios u ON u.id = a.usuario_id
       ) t
       ORDER BY lower(nombre)`
    ),
    db.query<{ accion: string }>("SELECT DISTINCT accion FROM auditoria ORDER BY accion"),
    db.query<{ entidad: string }>("SELECT DISTINCT entidad FROM auditoria ORDER BY entidad")
  ]);

  return {
    usuarios,
    acciones: accionesRows.map((r) => r.accion),
    entidades: entidadesRows.map((r) => r.entidad)
  };
}
