import { describe, it, expect, afterEach } from "vitest";
import { z } from "zod";
import { traducirErrorPostgres, DenszError } from "../../src/main/utils/errors";
import { createTestDb, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearPaciente } from "../../src/main/db/repositories/pacientesRepo";

describe("traducirErrorPostgres", () => {
  let ctx: TestDb;

  afterEach(async () => {
    if (ctx) {
      await ctx.finalizar();
      ctx = undefined as unknown as TestDb;
    }
  });

  it("traduce una violación de FOREIGN KEY a un mensaje claro, nunca técnico", async () => {
    ctx = await createTestDb();
    const { db } = ctx;
    const listaId = await idListaGeneral(db);
    const odontologoId = await crearOdontologo(db, { nombre: "Dr. Con Pacientes", listaPrecioId: listaId });
    await crearPaciente(db, { nombreCompleto: "Juan Gómez", odontologoId });

    let error: unknown;
    try {
      // Intentar borrar físicamente un odontólogo con pacientes asociados
      // debe romper por FK — nunca lo hacemos desde la UI (se desactiva en
      // su lugar), pero sirve para probar la traducción de errores técnicos.
      await db.query("DELETE FROM odontologos WHERE id = $1", [odontologoId]);
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect((error as { code?: string }).code).toBe("23503");

    const traducido = traducirErrorPostgres(error);
    expect(traducido).toBeInstanceOf(DenszError);
    expect(traducido.message).not.toMatch(/SQLSTATE|23503/i);
    expect(traducido.message.toLowerCase()).toContain("datos relacionados");
  });

  it("traduce un ZodError al mensaje del primer problema de validación (no un mensaje genérico)", () => {
    const esquema = z.object({ nombre: z.string().min(2, "El nombre es obligatorio.") });
    let error: unknown;
    try {
      esquema.parse({ nombre: "" });
    } catch (err) {
      error = err;
    }
    const traducido = traducirErrorPostgres(error);
    expect(traducido.message).toBe("El nombre es obligatorio.");
  });

  it("preserva el mensaje de un DenszError propio sin modificarlo", () => {
    const original = new DenszError("Mensaje específico del dominio.");
    expect(traducirErrorPostgres(original).message).toBe("Mensaje específico del dominio.");
  });

  it("da un mensaje genérico (nunca técnico) para un error inesperado", () => {
    const traducido = traducirErrorPostgres(new Error("TypeError: cannot read property x of undefined"));
    expect(traducido.message).toBe("Ocurrió un error inesperado. La operación no se completó.");
  });
});
