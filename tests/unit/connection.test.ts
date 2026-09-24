import { describe, it, expect, afterEach } from "vitest";
import { openDatabase, closeDatabase, checkConnection, getDatabase } from "../../src/main/db/connection";
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
});
