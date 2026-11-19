import { describe, it, expect, afterEach } from "vitest";
import { openDatabase, closeDatabase, checkConnection, getDatabase } from "../../src/main/db/connection";
import { withTransaction } from "../../src/main/db/withTransaction";
import { loadEnvFile, getTestDatabaseUrl } from "../../src/main/utils/appPaths";

loadEnvFile();

describe("connection", () => {
  afterEach(async () => {
    await closeDatabase();
  });

  it("abre el pool y checkConnection confirma que responde", async () => {
    const pool = openDatabase(getTestDatabaseUrl());
    expect(await checkConnection(pool)).toBe(true);
  });

  it("reutiliza el mismo pool si ya está abierto", () => {
    const pool1 = openDatabase(getTestDatabaseUrl());
    const pool2 = openDatabase(getTestDatabaseUrl());
    expect(pool1).toBe(pool2);
  });

  it("getDatabase falla con un mensaje claro si todavía no se abrió ningún pool", async () => {
    await closeDatabase();
    expect(() => getDatabase()).toThrow(/no fue inicializada/i);
  });

  // Blindspot conocido (ver memoria "Densz pool.connect() testing blindspot"):
  // la mayoría de los tests HTTP le pasan a cada router un PoolClient ya
  // abierto disfrazado de Pool (toda la request corre dentro de la misma
  // transacción de test), así que nunca ejercitan de verdad la rama real
  // de pool.connect() de withTransaction/attachTenantDb — exactamente la
  // rama que tenía el bug de conexiones rotas recicladas como "sanas"
  // (caída de prod del 2026-11-16, reaparecido en /auth/usuarios-del-laboratorio
  // el 2026-11-19 porque esa ruta en particular había quedado afuera del
  // arreglo). Estos tests sí usan un Pool real contra TEST_DATABASE_URL.
  describe("withTransaction (Pool real, no PoolClient disfrazado)", () => {
    it("COMMIT normal: el pool sigue sirviendo pedidos después", async () => {
      const pool = openDatabase(getTestDatabaseUrl());
      const resultado = await withTransaction(pool, async (client) => {
        const r = await client.query("SELECT 1 AS uno");
        return r.rows[0].uno;
      });
      expect(resultado).toBe(1);
      // El pool no quedó "gastado" ni en un estado raro — una consulta
      // normal después sigue funcionando.
      expect(await checkConnection(pool)).toBe(true);
    });

    it("una transacción que tira adentro hace ROLLBACK y el pool se recupera solo para el próximo pedido", async () => {
      const pool = openDatabase(getTestDatabaseUrl());
      await expect(
        withTransaction(pool, async (client) => {
          await client.query("SELECT 1");
          throw new Error("falla simulada adentro de la transacción");
        })
      ).rejects.toThrow("falla simulada adentro de la transacción");

      // La conexión usada arriba se liberó (sana o descartada, según
      // corresponda) y el pool puede seguir atendiendo pedidos nuevos sin
      // quedarse sin conexiones disponibles ni necesitar un reinicio.
      expect(await checkConnection(pool)).toBe(true);
      const resultado = await withTransaction(pool, async (client) => {
        const r = await client.query("SELECT 2 AS dos");
        return r.rows[0].dos;
      });
      expect(resultado).toBe(2);
    });

    it("corre 15 transacciones seguidas (más que el máximo de 10 conexiones) sin agotar el pool", async () => {
      const pool = openDatabase(getTestDatabaseUrl());
      for (let i = 0; i < 15; i++) {
        const r = await withTransaction(pool, async (client) => client.query("SELECT 1"));
        expect(r.rowCount).toBe(1);
      }
      expect(await checkConnection(pool)).toBe(true);
    });
  });
});
