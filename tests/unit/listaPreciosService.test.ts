import { describe, it, expect, afterEach } from "vitest";
import { createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearCategoria, crearPrestacion } from "../../src/main/db/repositories/preciosRepo";
import { crearLista, cambiarPrecioEnLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { generarListaPreciosPdf } from "../../src/main/services/listaPreciosService";

const pdfFalso = async () => {};

describe("listaPreciosService", () => {
  let ctx: TestDb;

  afterEach(async () => {
    if (ctx) {
      await ctx.finalizar();
      ctx = undefined as unknown as TestDb;
    }
  });

  it("genera la lista general con los precios vigentes de esa lista, agrupados por categoría", async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    const listaId = await idListaGeneral(db);
    const categoriaId = await crearCategoria(db, "CORONAS");
    const coronaId = await crearPrestacion(db, { categoriaId, nombre: "Corona de zirconio" });
    await cambiarPrecioEnLista(db, listaId, coronaId, 9000000);

    let htmlCapturado = "";
    const { pdfPath } = await generarListaPreciosPdf(db, { listaId }, async (html, ruta) => {
      htmlCapturado = html;
      void ruta;
    });

    expect(pdfPath).toContain("lista-precios");
    expect(htmlCapturado).toContain("LISTA DE PRECIOS");
    expect(htmlCapturado).toContain("CORONAS");
    expect(htmlCapturado).toContain("Corona de zirconio");
    expect(htmlCapturado).toContain("90.000,00");
    // Modo "lista general": no debe mostrar el nombre de ningún odontólogo.
    expect(htmlCapturado).not.toContain("Odontólogo:");
  });

  it("la lista personalizada de un odontólogo usa SU precio, no el de la lista general", async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    const listaGeneralId = await idListaGeneral(db);
    const categoriaId = await crearCategoria(db, "CORONAS");
    const coronaId = await crearPrestacion(db, { categoriaId, nombre: "Corona de zirconio" });
    await cambiarPrecioEnLista(db, listaGeneralId, coronaId, 9000000); // $90.000 en la lista general

    // El odontólogo tiene su PROPIA lista, con un precio distinto.
    const listaPersonalizadaId = await crearLista(db, { nombre: "Lista Dr. X", moneda: "ARS" });
    await cambiarPrecioEnLista(db, listaPersonalizadaId, coronaId, 8500000); // $85.000 personalizado
    const odontologoId = await crearOdontologo(db, { nombre: "Dr. X", listaPrecioId: listaPersonalizadaId });

    let htmlCapturado = "";
    await generarListaPreciosPdf(db, { odontologoId }, async (html) => {
      htmlCapturado = html;
    });

    expect(htmlCapturado).toContain("Odontólogo: Dr. X");
    expect(htmlCapturado).toContain("85.000,00");
    expect(htmlCapturado).not.toContain("90.000,00");
  });

  it("no incluye prestaciones sin precio configurado en esa lista", async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    const listaId = await idListaGeneral(db);
    const categoriaId = await crearCategoria(db, "CORONAS");
    await crearPrestacion(db, { categoriaId, nombre: "Prestación sin precio" });
    const conPrecioId = await crearPrestacion(db, { categoriaId, nombre: "Corona de zirconio" });
    await cambiarPrecioEnLista(db, listaId, conPrecioId, 9000000);

    let htmlCapturado = "";
    await generarListaPreciosPdf(db, { listaId }, async (html) => {
      htmlCapturado = html;
    });

    expect(htmlCapturado).toContain("Corona de zirconio");
    expect(htmlCapturado).not.toContain("Prestación sin precio");
  });

  it("respeta la moneda de la lista (USD no se confunde con ARS)", async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    const listaUsdId = await crearLista(db, { nombre: "Dólares", moneda: "USD" });
    const categoriaId = await crearCategoria(db, "CORONAS");
    const coronaId = await crearPrestacion(db, { categoriaId, nombre: "Corona de zirconio" });
    await cambiarPrecioEnLista(db, listaUsdId, coronaId, 7500);

    let htmlCapturado = "";
    await generarListaPreciosPdf(db, { listaId: listaUsdId }, async (html) => {
      htmlCapturado = html;
    });

    expect(htmlCapturado).toContain("USD");
    expect(htmlCapturado).toContain("75.00");
  });

  it("exige elegir lista u odontólogo, nunca ambos ni ninguno", async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    const listaId = await idListaGeneral(db);
    const odontologoId = await crearOdontologo(db, { nombre: "Dr. Y", listaPrecioId: listaId });

    await expect(generarListaPreciosPdf(db, {}, pdfFalso)).rejects.toThrow(/elegí/i);
    await expect(generarListaPreciosPdf(db, { listaId, odontologoId }, pdfFalso)).rejects.toThrow(/no ambos/i);
  });
});
