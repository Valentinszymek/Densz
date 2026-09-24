import type { Queryable } from "../db/types";
import bcrypt from "bcryptjs";
import { obtenerUsuarioPorNombre, registrarAcceso } from "../db/repositories/usuariosRepo";
import { cargarSesionDesdeUsuario, limpiarSesion, type SesionActual } from "./sessionService";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { bloquearProteccion } from "./proteccionService";
import { DenszError } from "../utils/errors";

/**
 * Autentica un usuario. Usa siempre el mismo mensaje de error para
 * "usuario inexistente" y "contraseña incorrecta" — nunca hay que revelar
 * cuál de las dos cosas fue, o se facilita adivinar nombres de usuario
 * válidos.
 */
export async function login(db: Queryable, nombreUsuario: string, password: string): Promise<SesionActual> {
  const nombreLimpio = nombreUsuario.trim();
  const usuario = await obtenerUsuarioPorNombre(db, nombreLimpio);
  const credencialesInvalidas = new DenszError("Usuario o contraseña incorrectos.");

  // Registra el intento fallido con el mismo detalle sin importar el motivo
  // (usuario inexistente, inactivo o contraseña incorrecta) — la Auditoría
  // es solo para ADMINISTRADOR (requerirPermiso(AUDITORIA_VER)), así que acá
  // sí puede quedar registrado el motivo real sin que eso filtre nada hacia
  // quien intentó entrar (que siempre recibe el mismo mensaje genérico).
  async function registrarIntentoFallido(): Promise<void> {
    await registrarAuditoria(db, {
      usuarioId: usuario?.id ?? null,
      accion: "login_fallido",
      entidad: "usuarios",
      entidadId: usuario?.id ?? null,
      detalle: { nombreUsuario: nombreLimpio }
    });
  }

  if (!usuario || !usuario.activo) {
    await registrarIntentoFallido();
    throw credencialesInvalidas;
  }

  const passwordOk = bcrypt.compareSync(password, usuario.passwordHash);
  if (!passwordOk) {
    await registrarIntentoFallido();
    throw credencialesInvalidas;
  }

  await cargarSesionDesdeUsuario(db, usuario.id);
  await registrarAcceso(db, usuario.id);
  await registrarAuditoria(db, { usuarioId: usuario.id, accion: "login", entidad: "usuarios", entidadId: usuario.id });

  return {
    usuarioId: usuario.id,
    nombreUsuario: usuario.nombreUsuario,
    nombreCompleto: usuario.nombreCompleto,
    rolNombre: usuario.rolNombre ?? "",
    permisos: usuario.permisos
  };
}

export async function logout(db: Queryable, usuarioId: number): Promise<void> {
  await registrarAuditoria(db, { usuarioId, accion: "logout", entidad: "usuarios", entidadId: usuarioId });
  limpiarSesion();
  // El desbloqueo de Estadísticas/Cuentas es por sesión de usuario, no
  // global: si otro usuario inicia sesión después, tiene que volver a
  // escribir la contraseña de acceso protegido (§11).
  bloquearProteccion();
}
