import type { Queryable } from "./types";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { logger } from "../utils/logger";

export const USUARIO_BOOTSTRAP = "admin";

/**
 * Genera una contraseña de arranque que nadie puede conocer de antemano
 * (nunca queda un valor fijo escrito en el código fuente ni en el
 * repositorio público — corrección post-auditoría §23.4/§30-D de
 * docs/AUDITORIA_MAESTRA_DENSZ.md). 16 caracteres en base64url (sin `+`,
 * `/` ni `=`, fáciles de copiar/pegar desde una consola), a partir de
 * bytes aleatorios criptográficamente seguros — no `Math.random()`.
 */
function generarPasswordBootstrapAleatoria(): string {
  return crypto.randomBytes(12).toString("base64url");
}

/**
 * Garantiza que exista al menos un usuario ADMINISTRADOR en la base.
 *
 * Las órdenes, pagos y comprobantes exigen un usuario válido (creado_por)
 * por integridad referencial. Este usuario de arranque solo se crea si la
 * base está completamente vacía de usuarios — en la base real migrada,
 * siempre hay usuarios existentes y esta función no hace nada (producción
 * actual: sin cambios, este código ni se ejecuta ahí).
 *
 * La contraseña NUNCA es un valor fijo conocido de antemano:
 * - Si existe `BOOTSTRAP_ADMIN_PASSWORD` en el entorno, se usa esa (para
 *   quien prefiera elegir la contraseña inicial explícitamente en una
 *   instalación nueva) — variable opcional, documentada en `.env.example`,
 *   NO configurada en Railway (no hace falta: producción ya tiene usuarios
 *   reales, este código nunca se dispara ahí).
 * - Si no existe, se genera una aleatoria de verdad (nunca predecible) y
 *   se imprime UNA sola vez en el log de arranque — quien instala Densz
 *   por primera vez la lee ahí y la cambia enseguida desde Configuración >
 *   Usuarios, igual que antes.
 */
export async function ensureBootstrapUser(db: Queryable): Promise<number> {
  const { rows: existenteRows } = await db.query<{ id: number }>(
    "SELECT id FROM usuarios WHERE nombre_usuario = $1",
    [USUARIO_BOOTSTRAP]
  );
  if (existenteRows[0]) return existenteRows[0].id;

  const { rows: cualquierUsuarioRows } = await db.query<{ id: number }>("SELECT id FROM usuarios LIMIT 1");
  if (cualquierUsuarioRows[0]) return cualquierUsuarioRows[0].id;

  const { rows: rolRows } = await db.query<{ id: number }>("SELECT id FROM roles WHERE nombre = 'ADMINISTRADOR'");
  const rolAdmin = rolRows[0];
  const passwordGenerada = !process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const passwordBootstrap = process.env.BOOTSTRAP_ADMIN_PASSWORD || generarPasswordBootstrapAleatoria();
  const hash = bcrypt.hashSync(passwordBootstrap, 10);
  const { rows } = await db.query<{ id: number }>(
    "INSERT INTO usuarios (nombre_usuario, nombre_completo, password_hash, rol_id) VALUES ($1, $2, $3, $4) RETURNING id",
    [USUARIO_BOOTSTRAP, "Administrador", hash, rolAdmin.id]
  );

  if (passwordGenerada) {
    logger.info(
      `Usuario administrador de arranque creado (usuario: "${USUARIO_BOOTSTRAP}", contraseña generada: "${passwordBootstrap}" — ` +
        "guardala ahora, no se vuelve a mostrar, y cambiala cuanto antes desde Configuración > Usuarios)."
    );
  } else {
    logger.info(
      `Usuario administrador de arranque creado (usuario: "${USUARIO_BOOTSTRAP}", con la contraseña de BOOTSTRAP_ADMIN_PASSWORD — cambiarla desde Configuración > Usuarios).`
    );
  }

  return rows[0].id;
}
