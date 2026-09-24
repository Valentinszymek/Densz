import type { Queryable } from "./types";
import bcrypt from "bcryptjs";
import { logger } from "../utils/logger";

export const USUARIO_BOOTSTRAP = "admin";
const PASSWORD_BOOTSTRAP = "densz123";

/**
 * Garantiza que exista al menos un usuario ADMINISTRADOR en la base.
 *
 * Las órdenes, pagos y comprobantes exigen un usuario válido (creado_por)
 * por integridad referencial. Este usuario de arranque (con contraseña
 * conocida y documentada en el README) solo se crea si la base está
 * completamente vacía de usuarios — en la base real migrada, siempre hay
 * usuarios existentes y esta función no hace nada.
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
  const hash = bcrypt.hashSync(PASSWORD_BOOTSTRAP, 10);
  const { rows } = await db.query<{ id: number }>(
    "INSERT INTO usuarios (nombre_usuario, nombre_completo, password_hash, rol_id) VALUES ($1, $2, $3, $4) RETURNING id",
    [USUARIO_BOOTSTRAP, "Administrador", hash, rolAdmin.id]
  );

  logger.info(
    `Usuario administrador de arranque creado (usuario: "${USUARIO_BOOTSTRAP}", contraseña por defecto: "${PASSWORD_BOOTSTRAP}" — cambiarla desde Configuración > Usuarios).`
  );

  return rows[0].id;
}
