import type { Queryable } from "../db/types";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { getConfig, setConfig } from "../db/repositories/configRepo";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { DenszError } from "../utils/errors";

/**
 * Protección opcional por contraseña para Estadísticas y Cuentas.
 *
 * Guardado: reutiliza la tabla `configuracion` existente (clave/valor) —
 * nunca en texto plano, ni la contraseña ni el código de recuperación:
 * ambos se guardan como hash bcrypt (igual que las contraseñas de
 * usuario en `authService.ts`). El código de recuperación en texto plano
 * solo existe en la respuesta de la llamada que lo genera — después de
 * eso, es irrecuperable (solo queda su hash, para poder validarlo).
 *
 * Desbloqueo: vive SOLO en memoria de este proceso (una variable de
 * módulo, igual patrón que `sessionService.ts`) — nunca se persiste en
 * ningún lado, nunca con timeout. A propósito NO es una "sesión" que dura
 * mientras la app está abierta: el frontend (`ProteccionGuard`) llama a
 * `bloquearProteccion()` cada vez que el usuario sale de Cuentas o
 * Estadísticas (navega afuera, cambia entre las dos, usa "Atrás", o
 * recarga), así que el desbloqueo solo vale mientras la sección sigue
 * montada en pantalla. Reiniciar Densz, cambiar de usuario (logout), o
 * simplemente dejar de ver la sección, siempre vuelve a exigir la
 * contraseña.
 */

const CLAVE_ACTIVADA = "proteccion.activada";
const CLAVE_PASSWORD_HASH = "proteccion.passwordHash";
const CLAVE_RECOVERY_HASH = "proteccion.recoveryCodeHash";

let desbloqueadoEnEstaSesion = false;

export function estaDesbloqueadoEnEstaSesion(): boolean {
  return desbloqueadoEnEstaSesion;
}

function marcarDesbloqueado(): void {
  desbloqueadoEnEstaSesion = true;
}

/** Vuelve a exigir la contraseña. La llama el frontend cada vez que el
 * usuario sale de Cuentas o Estadísticas (§ regla fundamental: la
 * autorización no sobrevive a la navegación), y también `authService` al
 * cerrar sesión de usuario. Sin efecto si ya estaba bloqueado. */
export function bloquearProteccion(): void {
  desbloqueadoEnEstaSesion = false;
}

export async function proteccionActivada(db: Queryable): Promise<boolean> {
  return (await getConfig(db, CLAVE_ACTIVADA)) === "1";
}

export async function obtenerEstadoProteccion(db: Queryable): Promise<{ activada: boolean }> {
  return { activada: await proteccionActivada(db) };
}

/**
 * Guardia real de acceso (§10 — "no solamente ocultar componentes
 * visuales"): la llaman los handlers IPC de Estadísticas y Cuentas antes
 * de devolver cualquier dato, así que ni con la consola de DevTools se
 * puede leer esa información sin haber desbloqueado la sesión primero.
 */
export async function requerirDesbloqueoProteccion(db: Queryable): Promise<void> {
  if ((await proteccionActivada(db)) && !desbloqueadoEnEstaSesion) {
    throw new DenszError("Esta sección está protegida por contraseña.");
  }
}

// Sin 0/O, 1/I/L: evita confusiones al transcribir el código a mano.
const ALFABETO_CODIGO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function generarCodigoRecuperacion(): string {
  const grupo = () =>
    Array.from({ length: 4 }, () => ALFABETO_CODIGO[crypto.randomInt(ALFABETO_CODIGO.length)]).join("");
  return `DENSZ-${grupo()}-${grupo()}-${grupo()}`;
}

function validarPasswordNueva(password: string, confirmar: string): void {
  if (!password || password.trim().length === 0) {
    throw new DenszError("La contraseña no puede estar vacía.");
  }
  if (password !== confirmar) {
    throw new DenszError("Las contraseñas no coinciden.");
  }
}

async function requerirActivada(db: Queryable): Promise<void> {
  if (!(await proteccionActivada(db))) throw new DenszError("La protección no está activada.");
}

async function verificarPasswordOFallar(db: Queryable, password: string): Promise<void> {
  const hash = await getConfig(db, CLAVE_PASSWORD_HASH);
  if (!hash || !bcrypt.compareSync(password, hash)) {
    throw new DenszError("Contraseña incorrecta.");
  }
}

export async function activarProteccion(
  db: Queryable,
  data: { password: string; confirmarPassword: string; usuarioId: number }
): Promise<{ codigoRecuperacion: string }> {
  if (await proteccionActivada(db)) throw new DenszError("La protección ya está activada.");
  validarPasswordNueva(data.password, data.confirmarPassword);

  const codigoRecuperacion = generarCodigoRecuperacion();

  await setConfig(db, CLAVE_PASSWORD_HASH, bcrypt.hashSync(data.password, 10));
  await setConfig(db, CLAVE_RECOVERY_HASH, bcrypt.hashSync(codigoRecuperacion, 10));
  await setConfig(db, CLAVE_ACTIVADA, "1");

  await registrarAuditoria(db, {
    usuarioId: data.usuarioId,
    accion: "activar_proteccion",
    entidad: "configuracion",
    detalle: { mensaje: "Activó la protección de Estadísticas y Cuentas." }
  });

  // Quien la acaba de activar y anotar su código de recuperación no
  // necesita volver a escribirla en el acto para entrar a esas secciones.
  marcarDesbloqueado();
  return { codigoRecuperacion };
}

export async function desactivarProteccion(db: Queryable, data: { passwordActual: string; usuarioId: number }): Promise<void> {
  await requerirActivada(db);
  await verificarPasswordOFallar(db, data.passwordActual);

  await setConfig(db, CLAVE_ACTIVADA, "0");
  await setConfig(db, CLAVE_PASSWORD_HASH, "");
  await setConfig(db, CLAVE_RECOVERY_HASH, "");

  await registrarAuditoria(db, {
    usuarioId: data.usuarioId,
    accion: "desactivar_proteccion",
    entidad: "configuracion",
    detalle: { mensaje: "Desactivó la protección de Estadísticas y Cuentas." }
  });
}

/** Usado por el modal de acceso ("Acceso protegido"): si la protección no
 * está activada no hay nada que verificar, se considera desbloqueado. */
export async function verificarPasswordProteccion(db: Queryable, password: string): Promise<boolean> {
  if (!(await proteccionActivada(db))) return true;
  const hash = await getConfig(db, CLAVE_PASSWORD_HASH);
  if (!hash) return false;
  const ok = bcrypt.compareSync(password, hash);
  if (ok) marcarDesbloqueado();
  return ok;
}

export async function cambiarPasswordProteccion(
  db: Queryable,
  data: { passwordActual: string; passwordNueva: string; confirmarNueva: string; usuarioId: number }
): Promise<void> {
  await requerirActivada(db);
  await verificarPasswordOFallar(db, data.passwordActual);
  validarPasswordNueva(data.passwordNueva, data.confirmarNueva);

  await setConfig(db, CLAVE_PASSWORD_HASH, bcrypt.hashSync(data.passwordNueva, 10));

  await registrarAuditoria(db, {
    usuarioId: data.usuarioId,
    accion: "cambiar_password_proteccion",
    entidad: "configuracion",
    detalle: { mensaje: "Cambió la contraseña de acceso protegido." }
  });
}

/** Genera un código de recuperación NUEVO, invalidando el anterior — lo
 * pide tanto "Generar nuevo código" desde Configuración como el propio
 * flujo de recuperación (§8, §9), pero cada uno con su propia auditoría. */
export async function generarNuevoCodigoRecuperacion(
  db: Queryable,
  data: { usuarioId: number }
): Promise<{ codigoRecuperacion: string }> {
  await requerirActivada(db);
  const codigoRecuperacion = generarCodigoRecuperacion();
  await setConfig(db, CLAVE_RECOVERY_HASH, bcrypt.hashSync(codigoRecuperacion, 10));

  await registrarAuditoria(db, {
    usuarioId: data.usuarioId,
    accion: "generar_codigo_proteccion",
    entidad: "configuracion",
    detalle: { mensaje: "Generó un nuevo código de recuperación (el anterior quedó invalidado)." }
  });

  return { codigoRecuperacion };
}

export async function verificarCodigoRecuperacion(db: Queryable, codigo: string): Promise<boolean> {
  await requerirActivada(db);
  const hash = await getConfig(db, CLAVE_RECOVERY_HASH);
  if (!hash) return false;
  return bcrypt.compareSync(codigo.trim().toUpperCase(), hash);
}

/** Recuperación completa (§9): valida el código, define una contraseña
 * nueva y rota el código de recuperación (el usado queda invalidado, se
 * entrega uno nuevo) — todo en un único paso atómico. */
export async function restablecerPasswordConCodigo(
  db: Queryable,
  data: { codigo: string; passwordNueva: string; confirmarNueva: string; usuarioId: number }
): Promise<{ codigoRecuperacion: string }> {
  await requerirActivada(db);
  if (!(await verificarCodigoRecuperacion(db, data.codigo))) {
    throw new DenszError("No pudimos verificar el código de recuperación.");
  }
  validarPasswordNueva(data.passwordNueva, data.confirmarNueva);

  const nuevoCodigo = generarCodigoRecuperacion();
  await setConfig(db, CLAVE_PASSWORD_HASH, bcrypt.hashSync(data.passwordNueva, 10));
  await setConfig(db, CLAVE_RECOVERY_HASH, bcrypt.hashSync(nuevoCodigo, 10));

  await registrarAuditoria(db, {
    usuarioId: data.usuarioId,
    accion: "recuperar_proteccion",
    entidad: "configuracion",
    detalle: { mensaje: "Restableció la contraseña de acceso protegido usando el código de recuperación." }
  });

  marcarDesbloqueado();
  return { codigoRecuperacion: nuevoCodigo };
}
