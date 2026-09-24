import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearCategoria, crearPrestacion } from "../../src/main/db/repositories/preciosRepo";
import {
  listarListas,
  obtenerLista,
  crearLista,
  actualizarLista,
  setActivaLista,
  listarPrestacionesDeLista,
  precioVigenteEnLista,
  historialPrecioEnLista,
  cambiarPrecioEnLista,
  contarUsoLista,
  eliminarLista
} from "../../src/main/db/repositories/listasPrecioRepo";
import { crearOdontologo, actualizarOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearOrdenConPrestaciones } from "../../src/main/services/ordenService";

describe("listasPrecioRepo", () => {
  let ctx: TestDb;
  let categoriaId: number;
  let prestacionId: number;
  let listaGeneralId: number;

  beforeEach(async () => {
    ctx = await createTestDb();
    const { db } = ctx;
    listaGeneralId = await idListaGeneral(db);
    categoriaId = await crearCategoria(db, "CORONAS");
    prestacionId = await crearPrestacion(db, { categoriaId, nombre: "Corona de zirconio" });
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  it("la lista 'General' existe siempre por defecto, en ARS", async () => {
    const general = await obtenerLista(ctx.db, listaGeneralId);
    expect(general?.nombre).toBe("General");
    expect(general?.moneda).toBe("ARS");
  });

  it("crea listas adicionales en otra moneda", async () => {
    const { db } = ctx;
    const id = await crearLista(db, { nombre: "Dólares", moneda: "USD" });
    const lista = await obtenerLista(db, id);
    expect(lista?.moneda).toBe("USD");
    expect((await listarListas(db)).map((l) => l.nombre)).toContain("Dólares");
  });

  it("una prestación sin precio en una lista aparece como precioCentavos null", async () => {
    const items = await listarPrestacionesDeLista(ctx.db, listaGeneralId);
    expect(items.find((i) => i.id === prestacionId)?.precioCentavos).toBeNull();
  });

  it("cambiar el precio en una lista NUNCA pisa el histórico: queda una fila cerrada y una nueva vigente", async () => {
    const { db } = ctx;
    await cambiarPrecioEnLista(db, listaGeneralId, prestacionId, 1000000);
    await cambiarPrecioEnLista(db, listaGeneralId, prestacionId, 1200000);

    const historial = await historialPrecioEnLista(db, listaGeneralId, prestacionId);
    expect(historial.length).toBe(2);

    const vigente = historial.find((h) => h.vigenteHasta === null);
    const cerrado = historial.find((h) => h.vigenteHasta !== null);
    expect(vigente?.precioCentavos).toBe(1200000);
    expect(cerrado?.precioCentavos).toBe(1000000);

    expect((await precioVigenteEnLista(db, listaGeneralId, prestacionId))?.precioCentavos).toBe(1200000);
  });

  it("el mismo precio puede variar independientemente entre dos listas distintas", async () => {
    const { db } = ctx;
    const listaDolares = await crearLista(db, { nombre: "Dólares", moneda: "USD" });
    await cambiarPrecioEnLista(db, listaGeneralId, prestacionId, 1000000);
    await cambiarPrecioEnLista(db, listaDolares, prestacionId, 10000);

    expect((await precioVigenteEnLista(db, listaGeneralId, prestacionId))?.precioCentavos).toBe(1000000);
    expect((await precioVigenteEnLista(db, listaDolares, prestacionId))?.precioCentavos).toBe(10000);
  });

  it("actualizar el nombre de una lista no le permite cambiar de moneda", async () => {
    const { db } = ctx;
    const id = await crearLista(db, { nombre: "Aumentados", moneda: "ARS" });
    await actualizarLista(db, id, { nombre: "Aumentados VIP" });
    const lista = await obtenerLista(db, id);
    expect(lista?.nombre).toBe("Aumentados VIP");
    expect(lista?.moneda).toBe("ARS");
  });

  it("desactivar una lista no borra sus precios históricos", async () => {
    const { db } = ctx;
    await cambiarPrecioEnLista(db, listaGeneralId, prestacionId, 500000);
    await setActivaLista(db, listaGeneralId, false);
    expect((await obtenerLista(db, listaGeneralId))?.activo).toBe(false);
    expect((await precioVigenteEnLista(db, listaGeneralId, prestacionId))?.precioCentavos).toBe(500000);
  });

  describe("borrado seguro", () => {
    it("elimina una lista sin odontólogos asignados y sin uso histórico", async () => {
      const { db } = ctx;
      const id = await crearLista(db, { nombre: "Sin uso", moneda: "ARS" });
      await cambiarPrecioEnLista(db, id, prestacionId, 100000);

      expect(await contarUsoLista(db, id)).toEqual({ odontologosAsignados: 0, usosHistoricos: 0 });
      await eliminarLista(db, id);
      expect(await obtenerLista(db, id)).toBeNull();
      const { rows } = await db.query<{ c: number }>("SELECT COUNT(*) c FROM lista_precio_items WHERE lista_id = $1", [id]);
      expect(rows[0].c).toBe(0);
    });

    it("NO permite eliminar una lista asignada a un odontólogo", async () => {
      const { db } = ctx;
      const id = await crearLista(db, { nombre: "Odontólogos VIP", moneda: "ARS" });
      await crearOdontologo(db, { nombre: "Dr. Test", listaPrecioId: id });

      expect((await contarUsoLista(db, id)).odontologosAsignados).toBe(1);
      await expect(eliminarLista(db, id)).rejects.toThrow(/asignada a 1 odont/i);
      expect(await obtenerLista(db, id)).not.toBeNull();
    });

    it("NO permite eliminar una lista usada en un trabajo histórico, aunque ya no esté asignada a nadie", async () => {
      const inner = await createTestDbConUsuario();
      try {
        const { db: dbCU, usuarioId } = inner;
        // Nombre DISTINTO del "CORONAS" que crea el beforeEach de este
        // archivo: esa categoría vive en la transacción del `ctx` externo,
        // todavía abierta (sin commit) mientras este test corre en su
        // propia conexión separada — insertar el mismo nombre acá haría
        // que Postgres bloquee esta inserción esperando a ver si la otra
        // transacción hace commit o rollback (nunca pasa hasta que termina
        // el test), colgando el test hasta el timeout.
        const catId = await crearCategoria(dbCU, "CORONAS HISTORICAS");
        const prestId = await crearPrestacion(dbCU, { categoriaId: catId, nombre: "Corona" });
        const listaId = await crearLista(dbCU, { nombre: "Histórica", moneda: "ARS" });
        await cambiarPrecioEnLista(dbCU, listaId, prestId, 700000);
        const odontologoId = await crearOdontologo(dbCU, { nombre: "Dr. Test", listaPrecioId: listaId });

        await crearOrdenConPrestaciones(dbCU, {
          odontologoId,
          pacienteNombreCompleto: "Juan Pérez",
          fechaTrabajo: "2026-01-01",
          prestaciones: [{ prestacionId: prestId, cantidad: 1, piezasFdi: [11] }],
          creadoPor: usuarioId
        });

        // Reasignamos al odontólogo a otra lista — ya no hay nadie asignado a "Histórica"...
        const otraListaId = await idListaGeneral(dbCU);
        await actualizarOdontologo(dbCU, odontologoId, { nombre: "Dr. Test", listaPrecioId: otraListaId });
        expect((await contarUsoLista(dbCU, listaId)).odontologosAsignados).toBe(0);

        // ...pero sigue bloqueada porque una OT real la usó: el pasado no se toca.
        expect((await contarUsoLista(dbCU, listaId)).usosHistoricos).toBe(1);
        await expect(eliminarLista(dbCU, listaId)).rejects.toThrow(/trabajo\(s\) histórico/i);
        expect(await obtenerLista(dbCU, listaId)).not.toBeNull();
      } finally {
        await inner.finalizar();
      }
    });
  });
});
