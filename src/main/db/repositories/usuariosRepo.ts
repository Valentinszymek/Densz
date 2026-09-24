import type { Queryable } from "../types";
import type { Usuario, Rol, UsuarioParaSeleccion } from "../../../shared/types/entities";
import { DenszError } from "../../utils/errors";

interface FilaUsuario {
  id: number;
  nombre_usuario: string;
  nombre_completo: string;
  password_hash: string;
  rol_id: number;
  rol_nombre: string;
  permisos: string;
  activo: number;
  creado_en: string;
  ultimo_acceso: string | null;
}

const SELECT_BASE = `
  SELECT u.*, r.nombre AS rol_nombre, r.permisos AS permisos
  FROM usuarios u
  JOIN roles r ON r.id = u.rol_id
`;

export interface UsuarioConCredenciales extends Usuario {
  passwordHash: string;
  permisos: string[];
}

function mapear(fila: FilaUsuario): UsuarioConCredenciales {
  return {
    id: fila.id,
    nombreUsuario: fila.nombre_usuario,
    nombreCompleto: fila.nombre_completo,
    rolId: fila.rol_id,
    rolNombre: fila.rol_nombre,
    activo: fila.activo === 1,
    creadoEn: fila.creado_en,
    ultimoAcceso: fila.ultimo_acceso,
    passwordHash: fila.password_hash,
    permisos: JSON.parse(fila.permisos) as string[]
  };
}

export async function obtenerUsuarioPorId(db: Queryable, id: number): Promise<UsuarioConCredenciales | null> {
  const { rows } = await db.query<FilaUsuario>(SELECT_BASE + " WHERE u.id = $1", [id]);
  return rows[0] ? mapear(rows[0]) : null;
}

export async function obtenerUsuarioPorNombre(db: Queryable, nombreUsuario: string): Promise<UsuarioConCredenciales | null> {
  const { rows } = await db.query<FilaUsuario>(SELECT_BASE + " WHERE u.nombre_usuario = $1", [nombreUsuario]);
  return rows[0] ? mapear(rows[0]) : null;
}

export async function listarUsuarios(db: Queryable): Promise<Usuario[]> {
  const { rows } = await db.query<FilaUsuario>(SELECT_BASE + " ORDER BY u.nombre_usuario");
  return rows.map(mapear);
}

/** Usuarios activos con solo los datos necesarios para el selector de la
 * pantalla de login (previo a autenticarse) — nunca expone hash de
 * contraseña, permisos ni último acceso. */
export async function listarUsuariosActivosParaSeleccion(db: Queryable): Promise<UsuarioParaSeleccion[]> {
  const { rows } = await db.query<{ id: number; nombre_usuario: string; nombre_completo: string; rol_nombre: string }>(
    `SELECT u.id, u.nombre_usuario, u.nombre_completo, r.nombre AS rol_nombre
     FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     WHERE u.activo = 1
     ORDER BY u.nombre_completo`
  );
  return rows.map((f) => ({
    id: f.id,
    nombreUsuario: f.nombre_usuario,
    nombreCompleto: f.nombre_completo,
    rolNombre: f.rol_nombre
  }));
}

export async function registrarAcceso(db: Queryable, id: number): Promise<void> {
  await db.query("UPDATE usuarios SET ultimo_acceso = densz_now() WHERE id = $1", [id]);
}

export interface DatosUsuario {
  nombreUsuario: string;
  nombreCompleto: string;
  rolId: number;
}

export async function crearUsuario(db: Queryable, data: DatosUsuario, passwordHash: string): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    "INSERT INTO usuarios (nombre_usuario, nombre_completo, password_hash, rol_id) VALUES ($1, $2, $3, $4) RETURNING id",
    [data.nombreUsuario.trim(), data.nombreCompleto.trim(), passwordHash, data.rolId]
  );
  return rows[0].id;
}

export async function actualizarUsuario(db: Queryable, id: number, data: DatosUsuario): Promise<void> {
  await db.query("UPDATE usuarios SET nombre_usuario = $1, nombre_completo = $2, rol_id = $3 WHERE id = $4", [
    data.nombreUsuario.trim(),
    data.nombreCompleto.trim(),
    data.rolId,
    id
  ]);
}

export async function cambiarPassword(db: Queryable, id: number, passwordHash: string): Promise<void> {
  await db.query("UPDATE usuarios SET password_hash = $1 WHERE id = $2", [passwordHash, id]);
}

export async function setActivoUsuario(db: Queryable, id: number, activo: boolean): Promise<void> {
  await db.query("UPDATE usuarios SET activo = $1 WHERE id = $2", [activo ? 1 : 0, id]);
}

export interface UsoUsuario {
  cantidadOrdenesCreadas: number;
  cantidadOrdenesAnuladas: number;
  cantidadPagosCreados: number;
  cantidadPagosAnulados: number;
  cantidadComprobantesCreados: number;
  cantidadComprobantesAnulados: number;
  cantidadResumenesGenerados: number;
  cantidadEventosAuditoria: number;
}

/** Toda referencia histórica que un usuario puede dejar atrás — las mismas
 * tablas que tienen una FK real a usuarios(id) (creado_por/anulado_por/
 * generado_por/usuario_id). Si algo de esto es mayor a 0, eliminarlo
 * físicamente rompería esa referencia (o directamente lo bloquearía la
 * propia base, que corre con las FK verificadas siempre). */
export async function contarUsoUsuario(db: Queryable, id: number): Promise<UsoUsuario> {
  const [
    { rows: ordenesCreadas },
    { rows: ordenesAnuladas },
    { rows: pagosCreados },
    { rows: pagosAnulados },
    { rows: comprobantesCreados },
    { rows: comprobantesAnulados },
    { rows: resumenesGenerados },
    { rows: eventosAuditoria }
  ] = await Promise.all([
    db.query<{ c: number }>("SELECT COUNT(*) c FROM ordenes WHERE creado_por = $1", [id]),
    db.query<{ c: number }>("SELECT COUNT(*) c FROM ordenes WHERE anulado_por = $1", [id]),
    db.query<{ c: number }>("SELECT COUNT(*) c FROM pagos WHERE creado_por = $1", [id]),
    db.query<{ c: number }>("SELECT COUNT(*) c FROM pagos WHERE anulado_por = $1", [id]),
    db.query<{ c: number }>("SELECT COUNT(*) c FROM comprobantes WHERE creado_por = $1", [id]),
    db.query<{ c: number }>("SELECT COUNT(*) c FROM comprobantes WHERE anulado_por = $1", [id]),
    db.query<{ c: number }>("SELECT COUNT(*) c FROM resumenes_mensuales WHERE generado_por = $1", [id]),
    db.query<{ c: number }>("SELECT COUNT(*) c FROM auditoria WHERE usuario_id = $1", [id])
  ]);
  return {
    cantidadOrdenesCreadas: ordenesCreadas[0].c,
    cantidadOrdenesAnuladas: ordenesAnuladas[0].c,
    cantidadPagosCreados: pagosCreados[0].c,
    cantidadPagosAnulados: pagosAnulados[0].c,
    cantidadComprobantesCreados: comprobantesCreados[0].c,
    cantidadComprobantesAnulados: comprobantesAnulados[0].c,
    cantidadResumenesGenerados: resumenesGenerados[0].c,
    cantidadEventosAuditoria: eventosAuditoria[0].c
  };
}

/**
 * Elimina físicamente un usuario — solo si NO tiene absolutamente ningún
 * registro histórico asociado (ni órdenes, ni pagos, ni comprobantes, ni
 * resúmenes mensuales, ni eventos de auditoría a su nombre). Esto existe
 * únicamente para corregir un usuario cargado por error: si tiene
 * cualquier historial, se bloquea por completo (nunca se borra información
 * real) y la vía segura sigue siendo desactivarlo.
 */
export async function eliminarUsuario(db: Queryable, id: number): Promise<void> {
  const uso = await contarUsoUsuario(db, id);
  const tieneHistorial = Object.values(uso).some((cantidad) => cantidad > 0);
  if (tieneHistorial) {
    throw new DenszError(
      "Este usuario tiene actividad registrada (trabajos, pagos, comprobantes o auditoría) y no puede eliminarse sin perder esa información. Desactivalo en su lugar."
    );
  }
  await db.query("DELETE FROM usuarios WHERE id = $1", [id]);
}

export async function listarRoles(db: Queryable): Promise<Rol[]> {
  const { rows } = await db.query<{ id: number; nombre: string; permisos: string }>(
    "SELECT id, nombre, permisos FROM roles ORDER BY id"
  );
  return rows.map((f) => ({ id: f.id, nombre: f.nombre, permisos: JSON.parse(f.permisos) as string[] }));
}
