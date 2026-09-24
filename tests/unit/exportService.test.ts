import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearCategoria, crearPrestacion } from "../../src/main/db/repositories/preciosRepo";
import { cambiarPrecioEnLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { crearOrdenConPrestaciones } from "../../src/main/services/ordenService";
import { exportarDatos } from "../../src/main/services/exportService";
import { registrarAuditoria } from "../../src/main/db/repositories/auditoriaRepo";

describe("exportService", () => {
  const temporales: string[] = [];
  let ctx: TestDb;

  afterEach(async () => {
    for (const f of temporales) if (fs.existsSync(f)) fs.unlinkSync(f);
    temporales.length = 0;
    if (ctx) {
      await ctx.finalizar();
      ctx = undefined as unknown as TestDb;
    }
  });

  it("exporta odontólogos a CSV con datos reales", async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    await crearOdontologo(db, { nombre: "Dra. Furfaro", telefono: "341-1234", listaPrecioId: await idListaGeneral(db) });

    const destino = path.join(os.tmpdir(), `densz-odontologos-${Date.now()}.csv`);
    temporales.push(destino);
    await exportarDatos(db, "odontologos", "csv", destino);

    const contenido = fs.readFileSync(destino, "utf-8");
    expect(contenido).toContain("Dra. Furfaro");
    expect(contenido).toContain("341-1234");
  });

  it("exporta trabajos de un odontólogo específico a CSV, con paciente y odontólogo visibles", async () => {
    ctx = await createTestDbConUsuario();
    const { db, usuarioId } = ctx as TestDb & { usuarioId: number };
    const listaId = await idListaGeneral(db);
    const odontologoId = await crearOdontologo(db, { nombre: "Dr. Uno", listaPrecioId: listaId });
    const otroOdontologoId = await crearOdontologo(db, { nombre: "Dr. Dos", listaPrecioId: listaId });
    const categoriaId = await crearCategoria(db, "CORONAS");
    const prestacionId = await crearPrestacion(db, { categoriaId, nombre: "Corona" });
    await cambiarPrecioEnLista(db, listaId, prestacionId, 1000000);

    const orden1 = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Ana Benítez",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId, cantidad: 1, piezasFdi: [11] }],
      creadoPor: usuarioId
    });
    await crearOrdenConPrestaciones(db, {
      odontologoId: otroOdontologoId,
      pacienteNombreCompleto: "Carlos Díaz",
      fechaTrabajo: "2026-01-02",
      prestaciones: [{ prestacionId, cantidad: 1, piezasFdi: [] }],
      creadoPor: usuarioId
    });

    const destino = path.join(os.tmpdir(), `densz-trabajos-${Date.now()}.csv`);
    temporales.push(destino);
    await exportarDatos(db, "trabajos", "csv", destino, { odontologoId });

    const contenido = fs.readFileSync(destino, "utf-8");
    expect(contenido).toContain(orden1.numero);
    expect(contenido).toContain("Ana Benítez");
    expect(contenido).toContain("Dr. Uno");
    // No debe incluir la orden del otro odontólogo.
    const lineas = contenido.trim().split("\n");
    expect(lineas.length).toBe(2); // encabezado + 1 fila
  });

  it("exportar cuenta sin odontólogo especificado falla con mensaje claro", async () => {
    ctx = await createTestDbConUsuario();
    await expect(exportarDatos(ctx.db, "cuenta", "csv", "x.csv", {})).rejects.toThrow(/odontólogo/i);
  });

  it("exporta Auditoría respetando el filtro activo, no la tabla completa", async () => {
    ctx = await createTestDbConUsuario();
    const { db, usuarioId } = ctx as TestDb & { usuarioId: number };
    await registrarAuditoria(db, { usuarioId, accion: "eliminar", entidad: "usuarios", entidadId: 5 });
    await registrarAuditoria(db, { usuarioId, accion: "crear", entidad: "pacientes", entidadId: 9 });

    const destino = path.join(os.tmpdir(), `densz-auditoria-${Date.now()}.csv`);
    temporales.push(destino);
    await exportarDatos(db, "auditoria", "csv", destino, { filtroAuditoria: { accion: "eliminar" } });

    const contenido = fs.readFileSync(destino, "utf-8");
    const lineas = contenido.trim().split("\n");
    expect(lineas.length).toBe(2); // encabezado + solo el evento "eliminar"
    expect(contenido).toContain("Eliminó");
    expect(contenido).not.toContain("Creó");
  });
});
