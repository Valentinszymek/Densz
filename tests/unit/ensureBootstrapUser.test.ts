import { describe, it, expect, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { createTestDb, type TestDb } from "../helpers/testDb";
import { ensureBootstrapUser, USUARIO_BOOTSTRAP } from "../../src/main/db/ensureBootstrapUser";

/**
 * Corrección post-auditoría (§23.4/§30-D de docs/AUDITORIA_MAESTRA_DENSZ.md):
 * antes, el usuario de arranque se creaba SIEMPRE con la contraseña fija
 * "densz123", escrita en texto plano en el código fuente de un repositorio
 * público (README.md incluido). Ahora nunca hay un valor fijo conocido de
 * antemano: por defecto se genera una contraseña aleatoria distinta cada
 * vez (nunca predecible), y opcionalmente se puede fijar una propia con
 * la variable de entorno BOOTSTRAP_ADMIN_PASSWORD (no configurada en
 * Railway — producción ya tiene usuarios reales, este código no se
 * dispara ahí).
 */
describe("ensureBootstrapUser", () => {
  let ctx: TestDb;
  const passwordOriginal = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  afterEach(async () => {
    // Nunca dejar la variable de entorno "manchada" para otros tests.
    if (passwordOriginal === undefined) delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    else process.env.BOOTSTRAP_ADMIN_PASSWORD = passwordOriginal;
    if (ctx) {
      await ctx.finalizar();
      ctx = undefined as unknown as TestDb;
    }
  });

  it("sin BOOTSTRAP_ADMIN_PASSWORD: genera una contraseña aleatoria (nunca 'densz123' ni ningún valor fijo)", async () => {
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    ctx = await createTestDb();
    const { db } = ctx;

    const usuarioId = await ensureBootstrapUser(db);
    const { rows } = await db.query<{ nombre_usuario: string; password_hash: string }>(
      "SELECT nombre_usuario, password_hash FROM usuarios WHERE id = $1",
      [usuarioId]
    );

    expect(rows[0].nombre_usuario).toBe(USUARIO_BOOTSTRAP);
    // El literal viejo, conocido públicamente, nunca puede ser la contraseña real ahora.
    expect(bcrypt.compareSync("densz123", rows[0].password_hash)).toBe(false);
  });

  it("dos bases distintas, ambas sin BOOTSTRAP_ADMIN_PASSWORD, terminan con contraseñas generadas DISTINTAS entre sí", async () => {
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;

    const ctx1 = await createTestDb();
    const usuarioId1 = await ensureBootstrapUser(ctx1.db);
    const { rows: rows1 } = await ctx1.db.query<{ password_hash: string }>("SELECT password_hash FROM usuarios WHERE id = $1", [
      usuarioId1
    ]);
    await ctx1.finalizar();

    ctx = await createTestDb();
    const usuarioId2 = await ensureBootstrapUser(ctx.db);
    const { rows: rows2 } = await ctx.db.query<{ password_hash: string }>("SELECT password_hash FROM usuarios WHERE id = $1", [
      usuarioId2
    ]);

    // Nunca el mismo hash (que implicaría la misma contraseña generada) entre dos arranques distintos.
    expect(rows1[0].password_hash).not.toBe(rows2[0].password_hash);
  });

  it("con BOOTSTRAP_ADMIN_PASSWORD configurada: usa exactamente esa contraseña", async () => {
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "una-contraseña-elegida-a-mano-999";
    ctx = await createTestDb();
    const { db } = ctx;

    const usuarioId = await ensureBootstrapUser(db);
    const { rows } = await db.query<{ password_hash: string }>("SELECT password_hash FROM usuarios WHERE id = $1", [usuarioId]);

    expect(bcrypt.compareSync("una-contraseña-elegida-a-mano-999", rows[0].password_hash)).toBe(true);
  });

  it("si ya existe CUALQUIER usuario, no crea ni toca nada (producción real: este código nunca se dispara)", async () => {
    ctx = await createTestDb();
    const { db } = ctx;
    const roles = await db.query<{ id: number }>("SELECT id FROM roles WHERE nombre = 'ADMINISTRADOR'");
    await db.query("INSERT INTO usuarios (nombre_usuario, nombre_completo, password_hash, rol_id) VALUES ($1, $2, $3, $4)", [
      "ya-existe",
      "Ya Existe",
      bcrypt.hashSync("lo-que-sea", 10),
      roles.rows[0].id
    ]);

    const antes = await db.query("SELECT COUNT(*) AS c FROM usuarios");
    const usuarioId = await ensureBootstrapUser(db);
    const despues = await db.query("SELECT COUNT(*) AS c FROM usuarios");

    expect(despues.rows[0].c).toBe(antes.rows[0].c); // ni un usuario más
    const { rows } = await db.query<{ nombre_usuario: string }>("SELECT nombre_usuario FROM usuarios WHERE id = $1", [usuarioId]);
    expect(rows[0].nombre_usuario).toBe("ya-existe"); // devuelve el que ya había, no crea "admin"
  });

  it("llamado dos veces sobre la misma base vacía: la segunda vez devuelve el mismo usuario, sin duplicar", async () => {
    ctx = await createTestDb();
    const { db } = ctx;

    const primeraVez = await ensureBootstrapUser(db);
    const segundaVez = await ensureBootstrapUser(db);
    expect(segundaVez).toBe(primeraVez);

    const { rows } = await db.query("SELECT COUNT(*) AS c FROM usuarios WHERE nombre_usuario = $1", [USUARIO_BOOTSTRAP]);
    expect(rows[0].c).toBe(1);
  });
});
