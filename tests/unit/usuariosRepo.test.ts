import { describe, it, expect, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { createTestDb, idListaGeneral, type TestDb } from "../helpers/testDb";
import {
  crearUsuario,
  listarRoles,
  obtenerUsuarioPorId,
  contarUsoUsuario,
  eliminarUsuario
} from "../../src/main/db/repositories/usuariosRepo";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearPaciente } from "../../src/main/db/repositories/pacientesRepo";
import { login, logout } from "../../src/main/services/authService";
import { limpiarSesion } from "../../src/main/services/sessionService";

describe("usuariosRepo — eliminación segura", () => {
  let ctx: TestDb;
  let rolId: number;

  beforeEach(async () => {
    ctx = await createTestDb();
    limpiarSesion();
    rolId = (await listarRoles(ctx.db)).find((r) => r.nombre === "RECEPCION")!.id;
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  it("un usuario recién creado, nunca usado, no tiene ningún historial", async () => {
    const { db } = ctx;
    const id = await crearUsuario(db, { nombreUsuario: "nuevo", nombreCompleto: "nuevo", rolId }, bcrypt.hashSync("clave123", 10));
    const uso = await contarUsoUsuario(db, id);
    expect(Object.values(uso).every((c) => c === 0)).toBe(true);
  });

  it("elimina físicamente un usuario sin ningún historial asociado", async () => {
    const { db } = ctx;
    const id = await crearUsuario(db, { nombreUsuario: "porrar", nombreCompleto: "porrar", rolId }, bcrypt.hashSync("clave123", 10));
    await eliminarUsuario(db, id);
    expect(await obtenerUsuarioPorId(db, id)).toBeNull();
  });

  it("bloquea la eliminación si el usuario tiene eventos de Auditoría (ej: ya inició sesión alguna vez)", async () => {
    const { db } = ctx;
    const id = await crearUsuario(db, { nombreUsuario: "logueado", nombreCompleto: "logueado", rolId }, bcrypt.hashSync("clave123", 10));
    const sesion = await login(db, "logueado", "clave123");
    await logout(db, sesion.usuarioId);

    const uso = await contarUsoUsuario(db, id);
    expect(uso.cantidadEventosAuditoria).toBeGreaterThan(0);
    await expect(eliminarUsuario(db, id)).rejects.toThrow(/actividad registrada/i);
    // Nunca se borra: sigue existiendo.
    expect(await obtenerUsuarioPorId(db, id)).not.toBeNull();
  });

  it("bloquea la eliminación si el usuario creó una orden de trabajo (creado_por)", async () => {
    const { db } = ctx;
    const id = await crearUsuario(db, { nombreUsuario: "creador", nombreCompleto: "creador", rolId }, bcrypt.hashSync("clave123", 10));
    const listaId = await idListaGeneral(db);
    const odontologoId = await crearOdontologo(db, { nombre: "Dr. Prueba", listaPrecioId: listaId });
    const pacienteId = await crearPaciente(db, { nombreCompleto: "Paciente Prueba", odontologoId });

    await db.query(
      `INSERT INTO ordenes (numero, odontologo_id, paciente_id, fecha_trabajo, moneda, lista_precio_id,
        lista_precio_nombre, total_centavos, creado_por)
       VALUES ('OT-TEST-1', $1, $2, densz_now(), 'ARS', $3, 'General', 1000, $4)`,
      [odontologoId, pacienteId, listaId, id]
    );

    const uso = await contarUsoUsuario(db, id);
    expect(uso.cantidadOrdenesCreadas).toBe(1);
    await expect(eliminarUsuario(db, id)).rejects.toThrow(/actividad registrada/i);
    expect(await obtenerUsuarioPorId(db, id)).not.toBeNull();
  });
});
