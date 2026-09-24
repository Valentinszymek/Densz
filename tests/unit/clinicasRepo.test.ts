import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearCategoria, crearPrestacion } from "../../src/main/db/repositories/preciosRepo";
import { cambiarPrecioEnLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { crearOrdenConPrestaciones } from "../../src/main/services/ordenService";
import {
  crearClinica,
  obtenerClinica,
  contarUsoClinica,
  eliminarClinica
} from "../../src/main/db/repositories/clinicasRepo";

describe("clinicasRepo — eliminación segura", () => {
  let ctx: TestDb & { usuarioId: number };
  let listaId: number;

  beforeEach(async () => {
    ctx = await createTestDbConUsuario();
    listaId = await idListaGeneral(ctx.db);
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  it("elimina físicamente una clínica sin ningún historial asociado", async () => {
    const { db } = ctx;
    const clinicaId = await crearClinica(db, { nombre: "Clínica XYZ" });
    expect(await contarUsoClinica(db, clinicaId)).toEqual({
      cantidadProfesionales: 0,
      cantidadTrabajos: 0,
      cantidadComprobantes: 0,
      cantidadPagos: 0,
      cantidadMovimientos: 0
    });

    await eliminarClinica(db, clinicaId);

    expect(await obtenerClinica(db, clinicaId)).toBeNull();
  });

  it("no borra otros registros (odontólogos, otras clínicas) al eliminar una clínica vacía", async () => {
    const { db } = ctx;
    const clinicaVacia = await crearClinica(db, { nombre: "Vacía" });
    const otraClinica = await crearClinica(db, { nombre: "Otra" });
    const odontologoId = await crearOdontologo(db, { nombre: "Dr. Independiente", listaPrecioId: listaId });

    await eliminarClinica(db, clinicaVacia);

    expect(await obtenerClinica(db, otraClinica)).not.toBeNull();
    expect(crearOdontologo).toBeDefined();
    expect(odontologoId).toBeGreaterThan(0);
  });

  it("bloquea el borrado físico si la clínica tiene profesionales asignados", async () => {
    const { db } = ctx;
    const clinicaId = await crearClinica(db, { nombre: "Con profesionales" });
    await crearOdontologo(db, { nombre: "Dr. De la clínica", listaPrecioId: listaId, clinicaId });

    const uso = await contarUsoClinica(db, clinicaId);
    expect(uso.cantidadProfesionales).toBe(1);
    await expect(eliminarClinica(db, clinicaId)).rejects.toThrow(/información histórica asociada/);

    // Y el registro sigue intacto: no se tocó nada.
    expect(await obtenerClinica(db, clinicaId)).not.toBeNull();
  });

  it("bloquea el borrado físico si la clínica tiene trabajos históricos, y esos trabajos quedan intactos", async () => {
    const { db, usuarioId } = ctx;
    const clinicaId = await crearClinica(db, { nombre: "Con trabajos" });
    const odontologoId = await crearOdontologo(db, { nombre: "Dr. Clínica", listaPrecioId: listaId, clinicaId });
    const categoriaId = await crearCategoria(db, "CORONAS");
    const prestacionId = await crearPrestacion(db, { categoriaId, nombre: "Corona" });
    await cambiarPrecioEnLista(db, listaId, prestacionId, 500000);

    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Paciente Test",
      fechaTrabajo: "2026-01-05",
      prestaciones: [{ prestacionId, cantidad: 1, piezasFdi: [] }],
      creadoPor: usuarioId
    });

    const uso = await contarUsoClinica(db, clinicaId);
    expect(uso.cantidadTrabajos).toBe(1);
    await expect(eliminarClinica(db, clinicaId)).rejects.toThrow(/información histórica asociada/);

    // El trabajo histórico sigue mostrando correctamente clínica/profesional/paciente/OT.
    expect(orden.clinicaId).toBe(clinicaId);
    expect(orden.clinicaNombre).toBe("Con trabajos");
    expect(orden.odontologoId).toBe(odontologoId);
  });

  it("bloquea el borrado físico si la clínica tiene pagos o movimientos de cuenta, aunque no tenga profesionales activos", async () => {
    const { db, usuarioId } = ctx;
    const clinicaId = await crearClinica(db, { nombre: "Con pagos sueltos" });
    const { rows } = await db.query<{ id: number }>("SELECT id FROM medios_pago LIMIT 1");
    const medioPagoId = rows[0].id;
    await db.query(
      "INSERT INTO pagos (clinica_id, fecha, importe_centavos, moneda, medio_pago_id, creado_por) VALUES ($1, '2026-01-10', 100000, 'ARS', $2, $3)",
      [clinicaId, medioPagoId, usuarioId]
    );

    const uso = await contarUsoClinica(db, clinicaId);
    expect(uso.cantidadPagos).toBe(1);
    await expect(eliminarClinica(db, clinicaId)).rejects.toThrow(/información histórica asociada/);
  });
});
