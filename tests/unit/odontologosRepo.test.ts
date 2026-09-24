import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, idListaGeneral, type TestDb } from "../helpers/testDb";
import {
  listarOdontologos,
  obtenerOdontologo,
  crearOdontologo,
  actualizarOdontologo,
  asignarListaPrecio,
  setActivoOdontologo,
  obtenerEstadisticasOdontologo,
  tieneRegistrosAsociados
} from "../../src/main/db/repositories/odontologosRepo";
import { crearLista } from "../../src/main/db/repositories/listasPrecioRepo";

describe("odontologosRepo", () => {
  let ctx: TestDb;
  let listaId: number;

  beforeEach(async () => {
    ctx = await createTestDb();
    listaId = await idListaGeneral(ctx.db);
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  it("crea un odontólogo y lo puede obtener, con su lista de precios asignada", async () => {
    const { db } = ctx;
    const id = await crearOdontologo(db, { nombre: "Dr. Pérez", telefono: "123", direccion: "Calle 1", listaPrecioId: listaId });
    const o = await obtenerOdontologo(db, id);
    expect(o).not.toBeNull();
    expect(o?.nombre).toBe("Dr. Pérez");
    expect(o?.activo).toBe(true);
    expect(o?.listaPrecioId).toBe(listaId);
    expect(o?.listaPrecioNombre).toBe("General");
    expect(o?.listaPrecioMoneda).toBe("ARS");
  });

  it("no permite crear un odontólogo con una lista de precios inexistente", async () => {
    const { db } = ctx;
    await expect(crearOdontologo(db, { nombre: "Dr. X", listaPrecioId: 999999 })).rejects.toThrow();
  });

  it("lista solo activos cuando se pide", async () => {
    const { db } = ctx;
    const id1 = await crearOdontologo(db, { nombre: "Dr. A", listaPrecioId: listaId });
    const id2 = await crearOdontologo(db, { nombre: "Dr. B", listaPrecioId: listaId });
    await setActivoOdontologo(db, id2, false);

    const activos = await listarOdontologos(db, { soloActivos: true });
    expect(activos.map((o) => o.id)).toEqual([id1]);

    const todos = await listarOdontologos(db, {});
    expect(todos.length).toBe(2);
  });

  it("busca por nombre (case-insensitive, parcial)", async () => {
    const { db } = ctx;
    await crearOdontologo(db, { nombre: "Dra. Silvana Furfaro", listaPrecioId: listaId });
    await crearOdontologo(db, { nombre: "Dr. Martín Alonso", listaPrecioId: listaId });

    const resultados = await listarOdontologos(db, { busqueda: "furfaro" });
    expect(resultados.length).toBe(1);
    expect(resultados[0].nombre).toContain("Furfaro");
  });

  it("actualiza los datos de un odontólogo", async () => {
    const { db } = ctx;
    const id = await crearOdontologo(db, { nombre: "Dr. Viejo Nombre", listaPrecioId: listaId });
    await actualizarOdontologo(db, id, { nombre: "Dr. Nuevo Nombre", telefono: "999", listaPrecioId: listaId });
    const o = await obtenerOdontologo(db, id);
    expect(o?.nombre).toBe("Dr. Nuevo Nombre");
    expect(o?.telefono).toBe("999");
  });

  it("puede cambiar la lista de precios asignada sin afectar el resto de los datos", async () => {
    const { db } = ctx;
    const otraLista = await crearLista(db, { nombre: "Dólares", moneda: "USD" });
    const id = await crearOdontologo(db, { nombre: "Dr. Cambia Lista", listaPrecioId: listaId });

    await asignarListaPrecio(db, id, otraLista);

    const o = await obtenerOdontologo(db, id);
    expect(o?.listaPrecioId).toBe(otraLista);
    expect(o?.listaPrecioMoneda).toBe("USD");
  });

  it("las estadísticas de un odontólogo sin trabajos no tienen saldos", async () => {
    const { db } = ctx;
    const id = await crearOdontologo(db, { nombre: "Dr. Sin Trabajos", listaPrecioId: listaId });
    const est = await obtenerEstadisticasOdontologo(db, id);
    expect(est?.cantidadTrabajos).toBe(0);
    expect(est?.saldos).toEqual([]);
    expect(est?.ultimoTrabajoFecha).toBeNull();
  });

  it("detecta que no tiene registros asociados al crearse", async () => {
    const { db } = ctx;
    const id = await crearOdontologo(db, { nombre: "Dr. Nuevo", listaPrecioId: listaId });
    expect(await tieneRegistrosAsociados(db, id)).toBe(false);
  });

  it("no permite eliminar físicamente: desactivar conserva el registro", async () => {
    const { db } = ctx;
    const id = await crearOdontologo(db, { nombre: "Dr. A Desactivar", listaPrecioId: listaId });
    await setActivoOdontologo(db, id, false);
    const o = await obtenerOdontologo(db, id);
    expect(o).not.toBeNull();
    expect(o?.activo).toBe(false);
  });
});
