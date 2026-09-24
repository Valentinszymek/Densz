import { describe, it, expect, afterEach } from "vitest";
import { createTestDb, type TestDb } from "../helpers/testDb";
import { siguienteNumero } from "../../src/main/utils/numbering";

describe("numbering", () => {
  let ctx: TestDb;

  afterEach(async () => {
    if (ctx) {
      await ctx.finalizar();
      ctx = undefined as unknown as TestDb;
    }
  });

  it("formatea con el prefijo y la cantidad de dígitos configurados", async () => {
    ctx = await createTestDb();
    const numero = await siguienteNumero(ctx.db, "orden");
    expect(numero).toBe("OT-00000001");
  });

  it("incrementa y nunca repite, incluso alternando entre tipos", async () => {
    ctx = await createTestDb();
    const o1 = await siguienteNumero(ctx.db, "orden");
    const c1 = await siguienteNumero(ctx.db, "comprobante");
    const o2 = await siguienteNumero(ctx.db, "orden");

    expect(o1).toBe("OT-00000001");
    expect(c1).toBe("CB-00000001");
    expect(o2).toBe("OT-00000002");
  });

  it("falla con un error claro si el tipo de numerador no existe", async () => {
    ctx = await createTestDb();
    // @ts-expect-error - forzamos un tipo inválido a propósito
    await expect(siguienteNumero(ctx.db, "inexistente")).rejects.toThrow(/numerador/i);
  });
});
