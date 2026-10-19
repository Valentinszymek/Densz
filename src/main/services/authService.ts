import type { Queryable } from "../db/types";
import bcrypt from "bcryptjs";
import { buscarUsuarioParaLoginPassword, registrarAcceso } from "../db/repositories/usuariosRepo";
import { cargarSesionDesdeUsuario, limpiarSesion, type SesionActual } from "./sessionService";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { fijarLaboratorioEnConexion } from "../db/tenantContext";
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
  const usuario = await buscarUsuarioParaLoginPassword(db, nombreLimpio);
  const credencialesInvalidas = new DenszError("Usuario o contraseña incorrectos.");

  if (!usuario) {
    // Nombre de usuario que no existe en NINGÚN laboratorio — a
    // diferencia de los casos de abajo, acá no hay ningún laboratorio al
    // que atribuir una fila de auditoría (su columna es NOT NULL), así
    // que no se registra el intento. No es una pérdida real de
    // trazabilidad: antes del login multi-laboratorio tampoco existía
    // ningún lugar significativo donde guardar esto.
    throw credencialesInvalidas;
  }

  // A partir de acá ya se sabe a qué laboratorio pertenece este nombre de
  // usuario — se fija ANTES de cualquier otra consulta sobre esta misma
  // conexión (auditoría, último acceso, re-fetch de cargarSesionDesdeUsuario),
  // que de otra forma seguirían viendo el laboratorio sin resolver.
  await fijarLaboratorioEnConexion(db, usuario.laboratorioId);

  // Registra el intento fallido con el mismo detalle sin importar el motivo
  // (inactivo o contraseña incorrecta) — la Auditoría es solo para
  // ADMINISTRADOR (requerirPermiso(AUDITORIA_VER)), así que acá sí puede
  // quedar registrado el motivo real sin que eso filtre nada hacia quien
  // intentó entrar (que siempre recibe el mismo mensaje genérico).
  function registrarIntentoFallido(id: number): Promise<void> {
    return registrarAuditoria(db, {
      usuarioId: id,
      accion: "login_fallido",
      entidad: "usuarios",
      entidadId: id,
      detalle: { nombreUsuario: nombreLimpio }
    });
  }

  if (!usuario.activo) {
    await registrarIntentoFallido(usuario.id);
    throw credencialesInvalidas;
  }

  const passwordOk = bcrypt.compareSync(password, usuario.passwordHash);
  if (!passwordOk) {
    await registrarIntentoFallido(usuario.id);
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
    permisos: usuario.permisos,
    laboratorioId: usuario.laboratorioId
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
