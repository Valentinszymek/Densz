import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearCategoria, crearPrestacion } from "../../src/main/db/repositories/preciosRepo";
import { cambiarPrecioEnLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { crearOrdenConPrestaciones } from "../../src/main/services/ordenService";
import { obtenerOrden } from "../../src/main/db/repositories/ordenesRepo";
import {
  crearPaciente,
  listarPacientes,
  obtenerPaciente,
  actualizarPaciente,
  setActivoPaciente,
  contarTrabajosPaciente,
  eliminarOInactivarPaciente
} from "../../src/main/db/repositories/pacientesRepo";

describe("pacientesRepo", () => {
  let ctx: TestDb;
  let odontologoId: number;

  beforeEach(async () => {
    ctx = await createTestDb();
    const listaId = await idListaGeneral(ctx.db);
    odontologoId = await crearOdontologo(ctx.db, { nombre: "Dr. Base", listaPrecioId: listaId });
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  it("crea un paciente asociado a un odontólogo con nombre completo único", async () => {
    const { db } = ctx;
    const id = await crearPaciente(db, { nombreCompleto: "Juan Gómez", odontologoId });
    const p = await obtenerPaciente(db, id);
    expect(p?.nombreCompleto).toBe("Juan Gómez");
    expect(p?.odontologoId).toBe(odontologoId);
    expect(p?.odontologoNombre).toBe("Dr. Base");
  });

  it("no permite crear un paciente con un odontólogo inexistente (integridad referencial)", async () => {
    const { db } = ctx;
    await expect(crearPaciente(db, { nombreCompleto: "X Y", odontologoId: 999999 })).rejects.toThrow();
  });

  it("filtra pacientes por odontólogo", async () => {
    const { db } = ctx;
    const listaId = await idListaGeneral(db);
    const otroOdontologo = await crearOdontologo(db, { nombre: "Dr. Otro", listaPrecioId: listaId });
    await crearPaciente(db, { nombreCompleto: "A A", odontologoId });
    await crearPaciente(db, { nombreCompleto: "B B", odontologoId });
    await crearPaciente(db, { nombreCompleto: "C C", odontologoId: otroOdontologo });

    const delPrimero = await listarPacientes(db, { odontologoId });
    expect(delPrimero.length).toBe(2);
  });

  it("actualiza y reasigna de odontólogo, unificando siempre en un solo campo de nombre", async () => {
    const { db } = ctx;
    const listaId = await idListaGeneral(db);
    const otroOdontologo = await crearOdontologo(db, { nombre: "Dr. Otro", listaPrecioId: listaId });
    const id = await crearPaciente(db, { nombreCompleto: "Juan Gómez", odontologoId });
    await actualizarPaciente(db, id, { nombreCompleto: "Juan Gómez Nuevo", odontologoId: otroOdontologo });
    const p = await obtenerPaciente(db, id);
    expect(p?.odontologoId).toBe(otroOdontologo);
    expect(p?.nombreCompleto).toBe("Juan Gómez Nuevo");
    expect(p?.apellido).toBeNull();
  });

  it("desactivar no elimina el registro", async () => {
    const { db } = ctx;
    const id = await crearPaciente(db, { nombreCompleto: "Juan Gómez", odontologoId });
    await setActivoPaciente(db, id, false);
    const p = await obtenerPaciente(db, id);
    expect(p?.activo).toBe(false);
  });

  it("un paciente migrado con nombre y apellido separados muestra el nombre completo combinado", async () => {
    const { db } = ctx;
    const { rows } = await db.query<{ id: number }>(
      "INSERT INTO pacientes (nombre, apellido, odontologo_id) VALUES ('Maribel', 'Gómez', $1) RETURNING id",
      [odontologoId]
    );
    const p = await obtenerPaciente(db, rows[0].id);
    expect(p?.nombreCompleto).toBe("Maribel Gómez");
  });

  describe("orden", () => {
    it("por defecto (sin especificar orden) ordena por nombre A → Z, como antes", async () => {
      const { db } = ctx;
      await crearPaciente(db, { nombreCompleto: "Beto Bianchi", odontologoId });
      await crearPaciente(db, { nombreCompleto: "Ana Alonso", odontologoId });
      const lista = await listarPacientes(db, { odontologoId });
      expect(lista.map((p) => p.nombreCompleto)).toEqual(["Ana Alonso", "Beto Bianchi"]);
    });

    it("nombre_desc invierte el orden alfabético", async () => {
      const { db } = ctx;
      await crearPaciente(db, { nombreCompleto: "Ana Alonso", odontologoId });
      await crearPaciente(db, { nombreCompleto: "Beto Bianchi", odontologoId });
      const lista = await listarPacientes(db, { odontologoId, orden: "nombre_desc" });
      expect(lista.map((p) => p.nombreCompleto)).toEqual(["Beto Bianchi", "Ana Alonso"]);
    });

    it("reciente y antiguo usan la fecha_alta real, no el orden de creación por casualidad", async () => {
      const { db } = ctx;
      const idViejo = await crearPaciente(db, { nombreCompleto: "Zeta Último", odontologoId });
      await db.query("UPDATE pacientes SET fecha_alta = '2020-01-01 00:00:00' WHERE id = $1", [idViejo]);
      const idNuevo = await crearPaciente(db, { nombreCompleto: "Ana Primero", odontologoId });
      await db.query("UPDATE pacientes SET fecha_alta = '2026-01-01 00:00:00' WHERE id = $1", [idNuevo]);

      const recientes = await listarPacientes(db, { odontologoId, orden: "reciente" });
      expect(recientes.map((p) => p.id)).toEqual([idNuevo, idViejo]);

      const antiguos = await listarPacientes(db, { odontologoId, orden: "antiguo" });
      expect(antiguos.map((p) => p.id)).toEqual([idViejo, idNuevo]);
    });

    it("todo paciente (incluso uno migrado a mano) tiene una fecha_alta real, nunca nula", async () => {
      const { db } = ctx;
      const { rows } = await db.query<{ id: number }>(
        "INSERT INTO pacientes (nombre, apellido, odontologo_id) VALUES ('Migrado', NULL, $1) RETURNING id",
        [odontologoId]
      );
      const p = await obtenerPaciente(db, rows[0].id);
      expect(p?.fechaAlta).toBeTruthy();
    });

    it("la búsqueda y el filtro de activos siguen funcionando sin importar el orden elegido", async () => {
      const { db } = ctx;
      const inactivoId = await crearPaciente(db, { nombreCompleto: "Carlos Zabala", odontologoId });
      await setActivoPaciente(db, inactivoId, false);
      await crearPaciente(db, { nombreCompleto: "Carlos Aramburu", odontologoId });

      const resultado = await listarPacientes(db, { odontologoId, orden: "reciente", soloActivos: true, busqueda: "Carlos" });
      expect(resultado).toHaveLength(1);
      expect(resultado[0].nombreCompleto).toBe("Carlos Aramburu");
    });
  });

  describe("eliminarOInactivarPaciente — eliminación segura", () => {
    it("elimina físicamente un paciente sin ningún trabajo asociado", async () => {
      const { db } = ctx;
      const id = await crearPaciente(db, { nombreCompleto: "Sin Historial", odontologoId });

      const resultado = await eliminarOInactivarPaciente(db, id);

      expect(resultado).toEqual({ eliminadoFisicamente: true });
      expect(await obtenerPaciente(db, id)).toBeNull();
    });

    it("no borra otros pacientes ni al odontólogo al eliminar uno sin historial", async () => {
      const { db } = ctx;
      const otro = await crearPaciente(db, { nombreCompleto: "Otro Paciente", odontologoId });
      const id = await crearPaciente(db, { nombreCompleto: "A Borrar", odontologoId });

      await eliminarOInactivarPaciente(db, id);

      expect(await obtenerPaciente(db, otro)).not.toBeNull();
    });

    it("con trabajos históricos: NO borra la fila, la inactiva — y la OT sigue mostrando el nombre correcto", async () => {
      const inner = await createTestDbConUsuario();
      try {
        const dbConUsuario = inner.db;
        const listaId = await idListaGeneral(dbConUsuario);
        const odoId = await crearOdontologo(dbConUsuario, { nombre: "Dr. Historial", listaPrecioId: listaId });
        const categoriaId = await crearCategoria(dbConUsuario, "CORONAS");
        const prestacionId = await crearPrestacion(dbConUsuario, { categoriaId, nombre: "Corona" });
        await cambiarPrecioEnLista(dbConUsuario, listaId, prestacionId, 500000);
        const pacienteId = await crearPaciente(dbConUsuario, { nombreCompleto: "Con Historial", odontologoId: odoId });

        const orden = await crearOrdenConPrestaciones(dbConUsuario, {
          odontologoId: odoId,
          pacienteId,
          fechaTrabajo: "2026-01-05",
          prestaciones: [{ prestacionId, cantidad: 1, piezasFdi: [] }],
          creadoPor: inner.usuarioId
        });

        const resultado = await eliminarOInactivarPaciente(dbConUsuario, pacienteId);

        expect(resultado).toEqual({ eliminadoFisicamente: false, cantidadTrabajos: 1 });

        // No se borró: sigue existiendo, solo que inactivo.
        const paciente = await obtenerPaciente(dbConUsuario, pacienteId);
        expect(paciente).not.toBeNull();
        expect(paciente?.activo).toBe(false);

        // La OT histórica sigue intacta y sigue mostrando el nombre correcto
        // (se resuelve por JOIN contra la misma fila, que nunca se borró).
        const ordenRecargada = await obtenerOrden(dbConUsuario, orden.id);
        expect(ordenRecargada).not.toBeNull();
        expect(ordenRecargada?.pacienteNombreCompleto).toBe("Con Historial");
        expect(ordenRecargada?.totalCentavos).toBe(500000);
      } finally {
        await inner.finalizar();
      }
    });

    it("contarTrabajosPaciente cuenta correctamente antes y después de facturar", async () => {
      const inner = await createTestDbConUsuario();
      try {
        const dbConUsuario = inner.db;
        const listaId = await idListaGeneral(dbConUsuario);
        const odoId = await crearOdontologo(dbConUsuario, { nombre: "Dr. Conteo", listaPrecioId: listaId });
        const categoriaId = await crearCategoria(dbConUsuario, "CORONAS");
        const prestacionId = await crearPrestacion(dbConUsuario, { categoriaId, nombre: "Corona" });
        await cambiarPrecioEnLista(dbConUsuario, listaId, prestacionId, 500000);
        const pacienteId = await crearPaciente(dbConUsuario, { nombreCompleto: "Paciente Conteo", odontologoId: odoId });

        expect(await contarTrabajosPaciente(dbConUsuario, pacienteId)).toBe(0);

        await crearOrdenConPrestaciones(dbConUsuario, {
          odontologoId: odoId,
          pacienteId,
          fechaTrabajo: "2026-01-05",
          prestaciones: [{ prestacionId, cantidad: 1, piezasFdi: [] }],
          creadoPor: inner.usuarioId
        });

        expect(await contarTrabajosPaciente(dbConUsuario, pacienteId)).toBe(1);
      } finally {
        await inner.finalizar();
      }
    });
  });
});
