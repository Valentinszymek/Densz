import { describe, it, expect, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { createTestDbConUsuario, type TestDb } from "../helpers/testDb";
import type { PoolClient } from "pg";
import {
  registrarAuditoria,
  listarAuditoriaFiltrada,
  listarAuditoriaFiltradaCompleta,
  obtenerOpcionesFiltroAuditoria,
  calcularRangoPeriodo
} from "../../src/main/db/repositories/auditoriaRepo";
import { crearUsuario, listarRoles } from "../../src/main/db/repositories/usuariosRepo";

/** Inserta un evento con una fecha EXACTA (no densz_now()) para poder
 * probar filtros de período de forma determinística. */
async function insertarConFecha(
  db: PoolClient,
  fechaUtc: string,
  datos: { usuarioId: number; accion: string; entidad: string }
) {
  await db.query("INSERT INTO auditoria (usuario_id, accion, entidad, fecha) VALUES ($1, $2, $3, $4)", [
    datos.usuarioId,
    datos.accion,
    datos.entidad,
    fechaUtc
  ]);
}

describe("auditoriaRepo — filtros, paginación y período", () => {
  let ctx: TestDb & { usuarioId: number };

  beforeEach(async () => {
    ctx = await createTestDbConUsuario();
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  it("lista en orden más reciente → más antiguo", async () => {
    const { db, usuarioId } = ctx;
    await registrarAuditoria(db, { usuarioId, accion: "crear", entidad: "pacientes", entidadId: 1 });
    await registrarAuditoria(db, { usuarioId, accion: "editar", entidad: "pacientes", entidadId: 1 });
    const { items } = await listarAuditoriaFiltrada(db, {});
    expect(items[0].accion).toBe("editar");
    expect(items[1].accion).toBe("crear");
  });

  it("pagina correctamente: 3 páginas de 2 con tamaño de página fijo en 50 (total real)", async () => {
    const { db, usuarioId } = ctx;
    for (let i = 0; i < 5; i++) {
      await registrarAuditoria(db, { usuarioId, accion: "crear", entidad: "pacientes", entidadId: i });
    }
    const pagina1 = await listarAuditoriaFiltrada(db, { pagina: 1 });
    expect(pagina1.total).toBe(5);
    expect(pagina1.items.length).toBe(5); // tamaño de página (50) > total, entra todo en una página
    expect(pagina1.tamanoPagina).toBe(50);
  });

  it("filtra por usuario", async () => {
    const { db, usuarioId } = ctx;
    const rolId = (await listarRoles(db)).find((r) => r.nombre === "RECEPCION")!.id;
    const otroId = await crearUsuario(db, { nombreUsuario: "otro", nombreCompleto: "otro", rolId }, bcrypt.hashSync("clave123", 10));
    await registrarAuditoria(db, { usuarioId, accion: "crear", entidad: "pacientes" });
    await registrarAuditoria(db, { usuarioId: otroId, accion: "crear", entidad: "pacientes" });
    const { items, total } = await listarAuditoriaFiltrada(db, { usuarioId });
    expect(total).toBe(1);
    expect(items.every((e) => e.usuarioId === usuarioId)).toBe(true);
  });

  it("filtra por acción", async () => {
    const { db, usuarioId } = ctx;
    await registrarAuditoria(db, { usuarioId, accion: "crear", entidad: "pacientes" });
    await registrarAuditoria(db, { usuarioId, accion: "eliminar", entidad: "pacientes" });
    const { items, total } = await listarAuditoriaFiltrada(db, { accion: "eliminar" });
    expect(total).toBe(1);
    expect(items[0].accion).toBe("eliminar");
  });

  it("filtra por entidad", async () => {
    const { db, usuarioId } = ctx;
    await registrarAuditoria(db, { usuarioId, accion: "crear", entidad: "pacientes" });
    await registrarAuditoria(db, { usuarioId, accion: "crear", entidad: "odontologos" });
    const { total } = await listarAuditoriaFiltrada(db, { entidad: "odontologos" });
    expect(total).toBe(1);
  });

  it("la búsqueda encuentra por acción, entidad, ID y detalle", async () => {
    const { db, usuarioId } = ctx;
    await registrarAuditoria(db, { usuarioId, accion: "eliminar", entidad: "usuarios", entidadId: 42, detalle: { nombreUsuario: "nicolas" } });
    await registrarAuditoria(db, { usuarioId, accion: "crear", entidad: "pacientes", entidadId: 7 });

    expect((await listarAuditoriaFiltrada(db, { busqueda: "eliminar" })).total).toBe(1);
    expect((await listarAuditoriaFiltrada(db, { busqueda: "usuarios" })).total).toBe(1);
    expect((await listarAuditoriaFiltrada(db, { busqueda: "nicolas" })).total).toBe(1);
    expect((await listarAuditoriaFiltrada(db, { busqueda: "no-existe-nada" })).total).toBe(0);

    // Corrección de un test frágil detectado durante el bloque de
    // corrección post-auditoría (docs/AUDITORIA_MAESTRA_DENSZ.md §25):
    // la búsqueda por texto también matchea contra `a.id` (el id INTERNO
    // de cada fila de auditoría, a propósito — armarWhere() en
    // auditoriaRepo.ts, "CAST(a.id AS TEXT) LIKE"), no solo contra
    // `entidad_id`. `a.id` es una secuencia de Postgres GLOBAL a toda la
    // corrida de tests (nunca se resetea con el ROLLBACK de cada test),
    // así que no hay forma de garantizar que NINGUNA otra fila de este
    // mismo test tenga, por pura coincidencia, un `a.id` que contenga la
    // subcadena "42" — antes esto asumía `total === 1`, lo cual es frágil
    // (dependía de cuántas auditorías se hubieran registrado ya en el
    // resto de la suite). Se verifica CONTENIDO (aparece la fila
    // correcta) en vez de un total exacto.
    const resultadoPorEntidadId = await listarAuditoriaFiltrada(db, { busqueda: "42" });
    expect(resultadoPorEntidadId.items.some((i) => i.entidadId === 42 && i.accion === "eliminar" && i.entidad === "usuarios")).toBe(
      true
    );
  });

  it("combina todos los filtros a la vez (AND)", async () => {
    const { db, usuarioId } = ctx;
    await registrarAuditoria(db, { usuarioId, accion: "eliminar", entidad: "usuarios" });
    await registrarAuditoria(db, { usuarioId, accion: "eliminar", entidad: "pacientes" });
    await registrarAuditoria(db, { usuarioId, accion: "crear", entidad: "usuarios" });
    const { total } = await listarAuditoriaFiltrada(db, { usuarioId, accion: "eliminar", entidad: "usuarios" });
    expect(total).toBe(1);
  });

  it("listarAuditoriaFiltradaCompleta (para exportar) trae TODO lo filtrado, sin límite de página", async () => {
    const { db, usuarioId } = ctx;
    for (let i = 0; i < 120; i++) {
      await registrarAuditoria(db, { usuarioId, accion: "crear", entidad: "pacientes" });
    }
    const paginado = await listarAuditoriaFiltrada(db, {});
    const completo = await listarAuditoriaFiltradaCompleta(db, {});
    expect(paginado.items.length).toBe(50); // una página
    expect(completo.length).toBe(120); // exportación completa
  });

  it("calcularRangoPeriodo('hoy') incluye eventos de hoy y excluye los de ayer", async () => {
    const { db, usuarioId } = ctx;
    const hoyMedianoche = new Date();
    hoyMedianoche.setHours(12, 0, 0, 0);
    const ayer = new Date(hoyMedianoche);
    ayer.setDate(ayer.getDate() - 1);

    await insertarConFecha(db, hoyMedianoche.toISOString().slice(0, 19).replace("T", " "), { usuarioId, accion: "crear", entidad: "pacientes" });
    await insertarConFecha(db, ayer.toISOString().slice(0, 19).replace("T", " "), { usuarioId, accion: "crear", entidad: "pacientes" });

    const { total } = await listarAuditoriaFiltrada(db, { periodo: "hoy" });
    expect(total).toBe(1);
  });

  it("calcularRangoPeriodo('personalizado') es inclusivo en ambos extremos", async () => {
    const { db, usuarioId } = ctx;
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, "0");
    const dd = String(hoy.getDate()).padStart(2, "0");
    const hoyStr = `${yyyy}-${mm}-${dd}`;

    const mediodiaHoy = new Date();
    mediodiaHoy.setHours(12, 0, 0, 0);
    await insertarConFecha(db, mediodiaHoy.toISOString().slice(0, 19).replace("T", " "), { usuarioId, accion: "crear", entidad: "pacientes" });

    const { total } = await listarAuditoriaFiltrada(db, { periodo: "personalizado", desde: hoyStr, hasta: hoyStr });
    expect(total).toBe(1);
  });

  it("calcularRangoPeriodo('personalizado') sin ambas fechas no filtra nada (se trata como 'todos')", () => {
    expect(calcularRangoPeriodo("personalizado", "2026-01-01", undefined)).toEqual({ desde: null, hasta: null });
    expect(calcularRangoPeriodo("personalizado")).toEqual({ desde: null, hasta: null });
  });

  it("obtenerOpcionesFiltroAuditoria solo lista usuarios que tienen al menos un evento", async () => {
    const { db, usuarioId } = ctx;
    await registrarAuditoria(db, { usuarioId, accion: "login", entidad: "usuarios" });
    const opciones = await obtenerOpcionesFiltroAuditoria(db);
    expect(opciones.usuarios.some((u) => u.id === usuarioId)).toBe(true);
    expect(opciones.acciones).toContain("login");
    expect(opciones.entidades).toContain("usuarios");
  });

  it("no expone ninguna función de actualizar o eliminar eventos (Auditoría es solo lectura desde el código)", async () => {
    const modulo = await import("../../src/main/db/repositories/auditoriaRepo");
    const nombres = Object.keys(modulo);
    expect(nombres.some((n) => /actualizar|editar|modificar|eliminar|borrar|vaciar/i.test(n))).toBe(false);
  });
});
