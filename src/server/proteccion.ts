import bcrypt from "bcryptjs";
import type { Queryable } from "../main/db/types";
import { getConfig } from "../main/db/repositories/configRepo";
import { DenszError } from "../main/utils/errors";
import { marcarDesbloqueoProteccionHttp, estaDesbloqueadaProteccionHttp } from "./session";

/**
 * Equivalente web de src/main/services/proteccionService.ts, reescrito a
 * propósito como un módulo SEPARADO (no se modifica el original, usado por
 * el escritorio) — la única diferencia real es que el desbloqueo se guarda
 * por sesión de cookie (session.ts) en vez de en una variable de módulo
 * compartida por todo el proceso.
 *
 * Estas claves de configuración deben coincidir exactamente con las
 * privadas de proteccionService.ts — se duplican como texto literal (no se
 * importan) porque ese archivo no exporta nada, a propósito, para no tener
 * que tocarlo.
 */
const CLAVE_ACTIVADA = "proteccion.activada";
const CLAVE_PASSWORD_HASH = "proteccion.passwordHash";

export async function proteccionActivadaWeb(db: Queryable): Promise<boolean> {
  return (await getConfig(db, CLAVE_ACTIVADA)) === "1";
}

export async function obtenerEstadoProteccionWeb(db: Queryable): Promise<{ activada: boolean }> {
  return { activada: await proteccionActivadaWeb(db) };
}

/**
 * Verifica la contraseña de protección para ESTA sesión y, si es correcta
 * (o si la protección ni siquiera está activada), la marca desbloqueada —
 * solo para el id de sesión recibido, nunca para el proceso entero.
 */
export async function verificarPasswordProteccionWeb(db: Queryable, password: string, sesionId: string): Promise<boolean> {
  if (!(await proteccionActivadaWeb(db))) {
    marcarDesbloqueoProteccionHttp(sesionId);
    return true;
  }
  const hash = await getConfig(db, CLAVE_PASSWORD_HASH);
  if (!hash) return false;
  const ok = bcrypt.compareSync(password, hash);
  if (ok) marcarDesbloqueoProteccionHttp(sesionId);
  return ok;
}

/** Guardia real de acceso — mismo rol que requerirDesbloqueoProteccion() en
 * el escritorio, pero mirando el desbloqueo de ESTA sesión, no un global. */
export async function requerirDesbloqueoProteccionWeb(db: Queryable, sesionId: string): Promise<void> {
  if ((await proteccionActivadaWeb(db)) && !estaDesbloqueadaProteccionHttp(sesionId)) {
    throw new DenszError("Esta sección está protegida por contraseña.");
  }
}
