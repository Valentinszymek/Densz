/**
 * Sesión activa en memoria del proceso main. Vive solo mientras la app
 * está abierta (no persiste entre reinicios): cada arranque exige un
 * login real por la pantalla de Login (authService.ts).
 */
import type { Queryable } from "../db/types";
import { obtenerUsuarioPorId, obtenerLaboratorioIdDeUsuario, esSuperAdmin } from "../db/repositories/usuariosRepo";
import { DenszError } from "../utils/errors";

export interface SesionActual {
  usuarioId: number;
  nombreUsuario: string;
  nombreCompleto: string;
  rolNombre: string;
  permisos: string[];
  /** A qué laboratorio pertenece este usuario (plan multi-laboratorio).
   * `null` hasta que la sesión viene de un login con Google (web o
   * escritorio) — el login de escritorio con usuario/contraseña (bcrypt)
   * no lo resuelve. */
  laboratorioId: number | null;
  /** Dueño del producto Densz (no de un laboratorio cliente) — habilita
   * el panel de laboratorios registrados. Ver usuariosRepo.ts#esSuperAdmin.
   * Opcional (nunca `undefined` en sesiones reales, siempre lo setea
   * cargarSesionDesdeUsuario) solo para no obligar a cada sesión sintética
   * de test a declararlo — todo chequeo lo trata como `false` si falta. */
  superAdmin?: boolean;
}

let sesionActual: SesionActual | null = null;

export function setUsuarioActual(sesion: SesionActual): void {
  sesionActual = sesion;
}

export function limpiarSesion(): void {
  sesionActual = null;
}

export function getSesionActual(): SesionActual | null {
  return sesionActual;
}

/** A qué laboratorio pertenece la sesión actual del escritorio — usada
 * por `connection.ts` para fijar `app.current_laboratorio_id` en cada
 * conexión física nueva del pool (ver googleOAuthDesktop.ts). `null`
 * antes de loguearse, o si todavía se usa el login bcrypt. */
export function getLaboratorioActualId(): number | null {
  return sesionActual?.laboratorioId ?? null;
}

/** Devuelve el id de usuario a usar como actor de una operación (creado_por/auditoría). */
export function getUsuarioActualId(): number {
  if (!sesionActual) {
    throw new DenszError("No hay una sesión activa. Iniciá sesión para continuar.");
  }
  return sesionActual.usuarioId;
}

export function tienePermisoActual(permiso: string): boolean {
  if (!sesionActual) return false;
  return sesionActual.permisos.includes("*") || sesionActual.permisos.includes(permiso);
}

/** Lanza un error claro si el usuario actual no tiene el permiso pedido. */
export function requerirPermiso(permiso: string): void {
  if (!tienePermisoActual(permiso)) {
    throw new DenszError("No tenés permiso para realizar esta acción.");
  }
}

/** Carga la sesión en memoria a partir de un usuario ya persistido (login o arranque). */
export async function cargarSesionDesdeUsuario(db: Queryable, usuarioId: number): Promise<void> {
  const usuario = await obtenerUsuarioPorId(db, usuarioId);
  if (!usuario) throw new Error("Usuario inexistente.");
  const laboratorioId = await obtenerLaboratorioIdDeUsuario(db, usuarioId);
  const superAdmin = await esSuperAdmin(db, usuarioId);
  setUsuarioActual({
    usuarioId: usuario.id,
    nombreUsuario: usuario.nombreUsuario,
    nombreCompleto: usuario.nombreCompleto,
    rolNombre: usuario.rolNombre ?? "",
    permisos: usuario.permisos,
    laboratorioId,
    superAdmin
  });
}
