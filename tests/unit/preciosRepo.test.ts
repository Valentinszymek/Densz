import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import {
  crearCategoria,
  listarCategorias,
  actualizarCategoria,
  setActivaCategoria,
  moverCategoria,
  contarUsoCategoria,
  eliminarCategoria,
  crearPrestacion,
  listarPrestaciones,
  obtenerPrestacion,
  actualizarPrestacion,
  setActivaPrestacion,
  contarUsoPrestacion,
  eliminarPrestacion
} from "../../src/main/db/repositories/preciosRepo";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { cambiarPrecioEnLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { crearOrdenConPrestaciones } from "../../src/main/services/ordenService";
import { obtenerOrden } from "../../src/main/db/repositories/ordenesRepo";

describe("preciosRepo (catálogo de categorías y prestaciones)", () => {
  let ctx: TestDb;

  beforeEach(async () => {
    ctx = await createTestDb();
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  it("crea una prestación sin precio (el precio vive en las listas de precios)", async () => {
    const { db } = ctx;
    const categoriaId = await crearCategoria(db, "CORONAS");
    const prestacionId = await crearPrestacion(db, { categoriaId, nombre: "Corona de zirconio" });
    const prestacion = await obtenerPrestacion(db, prestacionId);
    expect(prestacion?.nombre).toBe("Corona de zirconio");
    expect(prestacion?.categoriaNombre).toBe("CORONAS");
    expect(prestacion).not.toHaveProperty("precioGeneralCentavos");
  });

  it("actualiza nombre y categoría de una prestación", async () => {
    const { db } = ctx;
    const categoriaId = await crearCategoria(db, "CORONAS");
    const otraCategoria = await crearCategoria(db, "PRÓTESIS");
    const prestacionId = await crearPrestacion(db, { categoriaId, nombre: "Corona" });

    await actualizarPrestacion(db, prestacionId, { categoriaId: otraCategoria, nombre: "Corona renombrada" });

    const prestacion = await obtenerPrestacion(db, prestacionId);
    expect(prestacion?.nombre).toBe("Corona renombrada");
    expect(prestacion?.categoriaId).toBe(otraCategoria);
  });

  it("desactivar una prestación no la elimina, solo dejar de ofrecerla como activa", async () => {
    const { db } = ctx;
    const categoriaId = await crearCategoria(db, "CORONAS");
    const prestacionId = await crearPrestacion(db, { categoriaId, nombre: "Corona" });
    await setActivaPrestacion(db, prestacionId, false);

    const activas = await listarPrestaciones(db, { soloActivas: true });
    expect(activas.find((p) => p.id === prestacionId)).toBeUndefined();
    expect((await obtenerPrestacion(db, prestacionId))?.activo).toBe(false);
  });

  it("filtra prestaciones por categoría y búsqueda", async () => {
    const { db } = ctx;
    const categoriaId = await crearCategoria(db, "CORONAS");
    const otraCategoria = await crearCategoria(db, "PRÓTESIS");
    await crearPrestacion(db, { categoriaId, nombre: "Corona de zirconio" });
    await crearPrestacion(db, { categoriaId: otraCategoria, nombre: "Prótesis completa" });

    expect((await listarPrestaciones(db, { categoriaId })).length).toBe(1);
    expect((await listarPrestaciones(db, { busqueda: "zirconio" })).length).toBe(1);
  });

  it("categorías: crear, listar en orden, actualizar, desactivar y reordenar", async () => {
    const { db } = ctx;
    const id1 = await crearCategoria(db, "CORONAS");
    const id2 = await crearCategoria(db, "PRÓTESIS");

    expect((await listarCategorias(db)).map((c) => c.id)).toEqual([id1, id2]);

    await moverCategoria(db, id2, "arriba");
    expect((await listarCategorias(db)).map((c) => c.id)).toEqual([id2, id1]);

    await actualizarCategoria(db, id1, "CORONAS RENOMBRADA");
    expect((await listarCategorias(db)).find((c) => c.id === id1)?.nombre).toBe("CORONAS RENOMBRADA");

    await setActivaCategoria(db, id1, false);
    expect((await listarCategorias(db, true)).find((c) => c.id === id1)).toBeUndefined();
  });

  describe("borrado seguro", () => {
    it("elimina una prestación sin ningún uso", async () => {
      const { db } = ctx;
      const categoriaId = await crearCategoria(db, "CORONAS");
      const prestacionId = await crearPrestacion(db, { categoriaId, nombre: "Corona" });

      const uso = await contarUsoPrestacion(db, prestacionId);
      expect(uso).toEqual({ enTrabajosHistoricos: 0, enListasActuales: 0, odontologosAfectados: 0 });

      await eliminarPrestacion(db, prestacionId);
      expect(await obtenerPrestacion(db, prestacionId)).toBeNull();
    });

    it("eliminar una prestación con precio vigente en una lista también limpia esa asignación", async () => {
      const inner = await createTestDbConUsuario();
      try {
        const dbCU = inner.db;
        const listaId = await idListaGeneral(dbCU);
        const categoriaId = await crearCategoria(dbCU, "CORONAS");
        const prestacionId = await crearPrestacion(dbCU, { categoriaId, nombre: "Corona" });
        await crearOdontologo(dbCU, { nombre: "Dr. Test", listaPrecioId: listaId });
        await cambiarPrecioEnLista(dbCU, listaId, prestacionId, 900000);

        const uso = await contarUsoPrestacion(dbCU, prestacionId);
        expect(uso.enListasActuales).toBe(1);
        expect(uso.odontologosAfectados).toBe(1);
        expect(uso.enTrabajosHistoricos).toBe(0);

        await eliminarPrestacion(dbCU, prestacionId);
        expect(await obtenerPrestacion(dbCU, prestacionId)).toBeNull();
        const { rows } = await dbCU.query<{ c: number }>("SELECT COUNT(*) c FROM lista_precio_items WHERE prestacion_id = $1", [
          prestacionId
        ]);
        expect(rows[0].c).toBe(0);
      } finally {
        await inner.finalizar();
      }
    });

    it("NO permite eliminar una prestación usada en un trabajo histórico — el precio de esa OT queda intacto", async () => {
      const inner = await createTestDbConUsuario();
      try {
        const { db: dbCU, usuarioId } = inner;
        const listaId = await idListaGeneral(dbCU);
        const categoriaId = await crearCategoria(dbCU, "CORONAS");
        const prestacionId = await crearPrestacion(dbCU, { categoriaId, nombre: "Corona de zirconio" });
        await cambiarPrecioEnLista(dbCU, listaId, prestacionId, 900000);
        const odontologoId = await crearOdontologo(dbCU, { nombre: "Dr. Test", listaPrecioId: listaId });

        const orden = await crearOrdenConPrestaciones(dbCU, {
          odontologoId,
          pacienteNombreCompleto: "Juan Pérez",
          fechaTrabajo: "2026-01-01",
          prestaciones: [{ prestacionId, cantidad: 1, piezasFdi: [11] }],
          creadoPor: usuarioId
        });

        expect((await contarUsoPrestacion(dbCU, prestacionId)).enTrabajosHistoricos).toBe(1);
        await expect(eliminarPrestacion(dbCU, prestacionId)).rejects.toThrow(/no se puede eliminar/i);

        // La prestación sigue existiendo, y la OT conserva su precio congelado tal cual.
        expect(await obtenerPrestacion(dbCU, prestacionId)).not.toBeNull();
        const ordenIntacta = (await obtenerOrden(dbCU, orden.id))!;
        expect(ordenIntacta.prestaciones[0].precioUnitarioCentavos).toBe(900000);

        // Desactivarla (en vez de eliminarla) sí es una vía válida para sacarla del catálogo activo.
        await setActivaPrestacion(dbCU, prestacionId, false);
        expect((await obtenerPrestacion(dbCU, prestacionId))?.activo).toBe(false);
        expect((await obtenerOrden(dbCU, orden.id))!.prestaciones[0].precioUnitarioCentavos).toBe(900000);
      } finally {
        await inner.finalizar();
      }
    });

    it("elimina una categoría junto con sus prestaciones cuando ninguna tiene uso histórico", async () => {
      const { db } = ctx;
      const categoriaId = await crearCategoria(db, "PRÓTESIS");
      await crearPrestacion(db, { categoriaId, nombre: "Prótesis completa" });
      await crearPrestacion(db, { categoriaId, nombre: "Prótesis parcial" });

      expect(await contarUsoCategoria(db, categoriaId)).toEqual({ cantidadPrestaciones: 2, prestacionesConHistorial: 0 });

      await eliminarCategoria(db, categoriaId);
      expect((await listarCategorias(db)).find((c) => c.id === categoriaId)).toBeUndefined();
      expect(await listarPrestaciones(db, { categoriaId })).toHaveLength(0);
    });

    it("NO permite eliminar una categoría con una prestación usada en un trabajo histórico", async () => {
      const inner = await createTestDbConUsuario();
      try {
        const { db: dbCU, usuarioId } = inner;
        const listaId = await idListaGeneral(dbCU);
        const categoriaId = await crearCategoria(dbCU, "CORONAS");
        const prestacionId = await crearPrestacion(dbCU, { categoriaId, nombre: "Corona de zirconio" });
        await cambiarPrecioEnLista(dbCU, listaId, prestacionId, 900000);
        const odontologoId = await crearOdontologo(dbCU, { nombre: "Dr. Test", listaPrecioId: listaId });
        await crearOrdenConPrestaciones(dbCU, {
          odontologoId,
          pacienteNombreCompleto: "Juan Pérez",
          fechaTrabajo: "2026-01-01",
          prestaciones: [{ prestacionId, cantidad: 1, piezasFdi: [11] }],
          creadoPor: usuarioId
        });

        await expect(eliminarCategoria(dbCU, categoriaId)).rejects.toThrow(/no se puede eliminar/i);
        expect((await listarCategorias(dbCU)).find((c) => c.id === categoriaId)).toBeDefined();
        expect(await obtenerPrestacion(dbCU, prestacionId)).not.toBeNull();
      } finally {
        await inner.finalizar();
      }
    });
  });
});
