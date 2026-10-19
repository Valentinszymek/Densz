import type { Queryable } from "../db/types";
import bcrypt from "bcryptjs";
import { buscarUsuarioParaLoginPassword, registrarAcceso } from "../db/repositories/usuariosRepo";
import { cargarSesionDesdeUsuario, limpiarSesion, type SesionActual } from "./sessionService";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { fijarLaboratorioEnConexion } from "../db/tenantContext";
import { withTransaction } from "../db/withTransaction";
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

  const usuarioEncontrado = usuario;

  // A partir de acá ya se sabe a qué laboratorio pertenece este nombre de
  // usuario. Todo lo que sigue corre DENTRO de una única transacción (una
  // sola conexión física) — si no, `fijarLaboratorioEnConexion` y las
  // consultas de después (auditoría, último acceso, re-fetch de
  // cargarSesionDesdeUsuario) podrían terminar en conexiones DISTINTAS
  // del pool, y las de después nunca verían el laboratorio recién fijado.
  const resultado = await withTransaction(db, async (client) => {
    await fijarLaboratorioEnConexion(client, usuarioEncontrado.laboratorioId);

    // Registra el intento fallido con el mismo detalle sin importar el
    // motivo (inactivo o contraseña incorrecta) — la Auditoría es solo
    // para ADMINISTRADOR (requerirPermiso(AUDITORIA_VER)), así que acá sí
    // puede quedar registrado el motivo real sin que eso filtre nada
    // hacia quien intentó entrar (que siempre recibe el mismo mensaje
    // genérico). Nunca tira acá adentro — tirar haría ROLLBACK y se
    // perdería la fila; en cambio devuelve `null` y quien llama decide
    // afuera, ya con la transacción commiteada.
    async function registrarIntentoFallido(): Promise<null> {
      await registrarAuditoria(client, {
        usuarioId: usuarioEncontrado.id,
        accion: "login_fallido",
        entidad: "usuarios",
        entidadId: usuarioEncontrado.id,
        detalle: { nombreUsuario: nombreLimpio }
      });
      return null;
    }

    if (!usuarioEncontrado.activo) return registrarIntentoFallido();

    const passwordOk = bcrypt.compareSync(password, usuarioEncontrado.passwordHash);
    if (!passwordOk) return registrarIntentoFallido();

    await cargarSesionDesdeUsuario(client, usuarioEncontrado.id);
    await registrarAcceso(client, usuarioEncontrado.id);
    await registrarAuditoria(client, { usuarioId: usuarioEncontrado.id, accion: "login", entidad: "usuarios", entidadId: usuarioEncontrado.id });

    return {
      usuarioId: usuarioEncontrado.id,
      nombreUsuario: usuarioEncontrado.nombreUsuario,
      nombreCompleto: usuarioEncontrado.nombreCompleto,
      rolNombre: usuarioEncontrado.rolNombre ?? "",
      permisos: usuarioEncontrado.permisos,
      laboratorioId: usuarioEncontrado.laboratorioId
    };
  });

  if (!resultado) throw credencialesInvalidas;
  return resultado;
}

export async function logout(db: Queryable, usuarioId: number): Promise<void> {
  await registrarAuditoria(db, { usuarioId, accion: "logout", entidad: "usuarios", entidadId: usuarioId });
  limpiarSesion();
  // El desbloqueo de Estadísticas/Cuentas es por sesión de usuario, no
  // global: si otro usuario inicia sesión después, tiene que volver a
  // escribir la contraseña de acceso protegido (§11).
  bloquearProteccion();
}
