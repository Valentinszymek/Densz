import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDbConUsuario, idListaGeneral, type TestDb } from "../helpers/testDb";
import { crearOdontologo } from "../../src/main/db/repositories/odontologosRepo";
import { crearCategoria, crearPrestacion } from "../../src/main/db/repositories/preciosRepo";
import { cambiarPrecioEnLista, crearLista } from "../../src/main/db/repositories/listasPrecioRepo";
import { crearOrdenConPrestaciones, anularOrden, eliminarOrdenDefinitivo } from "../../src/main/services/ordenService";
import { obtenerOrden } from "../../src/main/db/repositories/ordenesRepo";
import { obtenerPaciente, crearPaciente, listarPacientes, setActivoPaciente } from "../../src/main/db/repositories/pacientesRepo";
import { registrarMovimientoDebe, obtenerSaldos } from "../../src/main/db/repositories/movimientosRepo";
import { obtenerComprobantePorOrden } from "../../src/main/db/repositories/comprobantesRepo";

describe("ordenService", () => {
  let ctx: TestDb & { usuarioId: number };
  let odontologoId: number;
  let listaId: number;
  let coronaId: number;
  let tBaseId: number;

  beforeEach(async () => {
    ctx = await createTestDbConUsuario();
    const { db } = ctx;
    listaId = await idListaGeneral(db);
    odontologoId = await crearOdontologo(db, { nombre: "Dr. Test", listaPrecioId: listaId });
    const categoriaId = await crearCategoria(db, "CORONAS");
    coronaId = await crearPrestacion(db, { categoriaId, nombre: "Corona de zirconio" });
    tBaseId = await crearPrestacion(db, { categoriaId, nombre: "T-Base" });
    await cambiarPrecioEnLista(db, listaId, coronaId, 900000);
    await cambiarPrecioEnLista(db, listaId, tBaseId, 300000);
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  it("crea una OT con número asignado, paciente nuevo y precio congelado desde la lista del odontólogo", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Juan Pérez",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 3, piezasFdi: [11, 12, 13] }],
      creadoPor: usuarioId
    });

    expect(orden.numero).toMatch(/^OT-\d{8}$/);
    expect(orden.moneda).toBe("ARS");
    expect(orden.listaPrecioNombre).toBe("General");
    expect(orden.prestaciones).toHaveLength(1);
    expect(orden.prestaciones[0].precioUnitarioCentavos).toBe(900000);
    expect(orden.prestaciones[0].piezasFdi).toEqual([11, 12, 13]);
    expect(orden.totalCentavos).toBe(2700000);
    expect(orden.estado).toBe("pendiente_facturar");

    const paciente = await obtenerPaciente(db, orden.pacienteId);
    expect(paciente?.nombreCompleto).toBe("Juan Pérez");
    expect(paciente?.odontologoId).toBe(odontologoId);
  });

  it("una OT puede tener varias prestaciones, cada una con sus propias piezas y su propio subtotal", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Juan Pérez",
      fechaTrabajo: "2026-01-01",
      prestaciones: [
        { prestacionId: coronaId, cantidad: 3, piezasFdi: [11, 12, 13] },
        { prestacionId: tBaseId, cantidad: 3, piezasFdi: [11, 12, 13] }
      ],
      creadoPor: usuarioId
    });

    expect(orden.prestaciones).toHaveLength(2);
    const corona = orden.prestaciones.find((p) => p.prestacionId === coronaId)!;
    const tBase = orden.prestaciones.find((p) => p.prestacionId === tBaseId)!;
    expect(corona.subtotalCentavos).toBe(2700000);
    expect(tBase.subtotalCentavos).toBe(900000);
    expect(orden.totalCentavos).toBe(2700000 + 900000);
  });

  it("cada prestación de la OT tiene su propia relación con las piezas — no una lista global compartida", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Juan Pérez",
      fechaTrabajo: "2026-01-01",
      prestaciones: [
        { prestacionId: coronaId, cantidad: 3, piezasFdi: [11, 12, 13] },
        { prestacionId: tBaseId, cantidad: 1, piezasFdi: [21] }
      ],
      creadoPor: usuarioId
    });

    const corona = orden.prestaciones.find((p) => p.prestacionId === coronaId)!;
    const tBase = orden.prestaciones.find((p) => p.prestacionId === tBaseId)!;
    expect(corona.piezasFdi).toEqual([11, 12, 13]);
    expect(tBase.piezasFdi).toEqual([21]);
  });

  it("la cantidad puede ser distinta de la cantidad de piezas seleccionadas (control manual)", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Juan Pérez",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 2, piezasFdi: [11, 12, 13] }],
      creadoPor: usuarioId
    });
    expect(orden.prestaciones[0].cantidad).toBe(2);
    expect(orden.prestaciones[0].subtotalCentavos).toBe(1800000);
  });

  it("permite un precio manual por línea, que queda marcado como origen 'manual'", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Juan Pérez",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [], precioManualCentavos: 555555 }],
      creadoPor: usuarioId
    });
    expect(orden.prestaciones[0].origenPrecio).toBe("manual");
    expect(orden.prestaciones[0].precioUnitarioCentavos).toBe(555555);
  });

  it("una OT en un odontólogo con lista en USD queda toda en USD", async () => {
    const { db, usuarioId } = ctx;
    const listaDolares = await crearLista(db, { nombre: "Dólares", moneda: "USD" });
    await cambiarPrecioEnLista(db, listaDolares, coronaId, 10000);
    const odontologoUsd = await crearOdontologo(db, { nombre: "Dr. USD", listaPrecioId: listaDolares });

    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId: odontologoUsd,
      pacienteNombreCompleto: "Cliente Extranjero",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }],
      creadoPor: usuarioId
    });

    expect(orden.moneda).toBe("USD");
    expect(orden.prestaciones[0].precioUnitarioCentavos).toBe(10000);
  });

  it("numera las OT de forma incremental y nunca repite", async () => {
    const { db, usuarioId } = ctx;
    const datos = {
      odontologoId,
      pacienteNombreCompleto: "Juan Pérez",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }],
      creadoPor: usuarioId
    };
    const o1 = await crearOrdenConPrestaciones(db, datos);
    const o2 = await crearOrdenConPrestaciones(db, datos);
    expect(o1.numero).not.toBe(o2.numero);
    const n1 = Number(o1.numero.replace("OT-", ""));
    const n2 = Number(o2.numero.replace("OT-", ""));
    expect(n2).toBe(n1 + 1);
  });

  it("una OT ya creada NUNCA cambia su precio aunque el precio de la lista cambie después (histórico)", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Juan Pérez",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }],
      creadoPor: usuarioId
    });
    await cambiarPrecioEnLista(db, listaId, coronaId, 5000000);

    const releida = (await obtenerOrden(db, orden.id))!;
    expect(releida.prestaciones[0].precioUnitarioCentavos).toBe(900000);
    expect(releida.totalCentavos).toBe(900000);
  });

  it("falla con un mensaje claro si una prestación no tiene precio configurado en la lista", async () => {
    const { db, usuarioId } = ctx;
    const categoriaId = await crearCategoria(db, "SIN PRECIO");
    const prestacionSinPrecio = await crearPrestacion(db, { categoriaId, nombre: "Fantasma" });

    await expect(
      crearOrdenConPrestaciones(db, {
        odontologoId,
        pacienteNombreCompleto: "Juan Pérez",
        fechaTrabajo: "2026-01-01",
        prestaciones: [{ prestacionId: prestacionSinPrecio, cantidad: 1, piezasFdi: [] }],
        creadoPor: usuarioId
      })
    ).rejects.toThrow(/precio/i);
  });

  it("no permite crear una OT sin ninguna prestación", async () => {
    const { db, usuarioId } = ctx;
    await expect(
      crearOrdenConPrestaciones(db, {
        odontologoId,
        pacienteNombreCompleto: "Juan Pérez",
        fechaTrabajo: "2026-01-01",
        prestaciones: [],
        creadoPor: usuarioId
      })
    ).rejects.toThrow();
  });

  it("anular una orden pendiente la marca anulada con motivo y usuario", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Juan Pérez",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }],
      creadoPor: usuarioId
    });
    await anularOrden(db, orden.id, "Pedido por error", usuarioId);
    const releida = (await obtenerOrden(db, orden.id))!;
    expect(releida.estado).toBe("anulado");
    expect(releida.motivoAnulacion).toBe("Pedido por error");
  });

  it("anular una orden facturada revierte el movimiento de cuenta (el saldo baja)", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Juan Pérez",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }],
      creadoPor: usuarioId
    });
    await registrarMovimientoDebe(db, {
      odontologoId,
      ordenId: orden.id,
      importeCentavos: orden.totalCentavos,
      moneda: orden.moneda,
      fecha: orden.fechaTrabajo,
      descripcion: `Orden ${orden.numero}`
    });

    expect((await obtenerSaldos(db, odontologoId))[0].saldoCentavos).toBe(900000);

    await anularOrden(db, orden.id, "Error de carga", usuarioId);

    expect((await obtenerSaldos(db, odontologoId))[0].saldoCentavos).toBe(0);
  });

  it("no permite anular una orden ya anulada", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Juan Pérez",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }],
      creadoPor: usuarioId
    });
    await anularOrden(db, orden.id, "Motivo 1", usuarioId);
    await expect(anularOrden(db, orden.id, "Motivo 2", usuarioId)).rejects.toThrow();
  });

  it("eliminar definitivamente una OT borra la orden, sus movimientos y su comprobante, y queda en auditoría", async () => {
    const { db, usuarioId } = ctx;
    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteNombreCompleto: "Juan Pérez",
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [11] }],
      creadoPor: usuarioId
    });
    await registrarMovimientoDebe(db, {
      odontologoId,
      ordenId: orden.id,
      importeCentavos: orden.totalCentavos,
      moneda: orden.moneda,
      fecha: orden.fechaTrabajo,
      descripcion: `Orden ${orden.numero}`
    });

    await eliminarOrdenDefinitivo(db, orden.id, usuarioId, "cargado al odontólogo equivocado");

    expect(await obtenerOrden(db, orden.id)).toBeNull();
    expect(await obtenerComprobantePorOrden(db, orden.id)).toBeNull();
    expect(await obtenerSaldos(db, odontologoId)).toEqual([]);

    const { rows } = await db.query<{ detalle: string }>(
      "SELECT * FROM auditoria WHERE accion = 'eliminar_definitivo' AND entidad_id = $1",
      [orden.id]
    );
    const auditoria = rows[0];
    expect(auditoria).toBeDefined();
    const detalle = JSON.parse(auditoria!.detalle);
    expect(detalle.numero).toBe(orden.numero);
    expect(detalle.motivo).toBe("cargado al odontólogo equivocado");
    expect(detalle.pacienteNombreCompleto).toBeTruthy();
    expect(detalle.odontologoId).toBe(odontologoId);
  });

  it("eliminar una OT inexistente falla con un mensaje claro", async () => {
    const { db, usuarioId } = ctx;
    await expect(eliminarOrdenDefinitivo(db, 999999, usuarioId, "motivo cualquiera")).rejects.toThrow(/no existe/i);
  });

  it("al pasar pacienteId reutiliza el paciente existente en vez de crear uno nuevo", async () => {
    const { db, usuarioId } = ctx;
    const pacienteId = await crearPaciente(db, { nombreCompleto: "Ana Ruiz", odontologoId });

    const orden = await crearOrdenConPrestaciones(db, {
      odontologoId,
      pacienteId,
      fechaTrabajo: "2026-01-01",
      prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }],
      creadoPor: usuarioId
    });

    expect(orden.pacienteId).toBe(pacienteId);
    expect(await listarPacientes(db, { odontologoId })).toHaveLength(1);
  });

  it("no permite reutilizar un paciente que pertenece a otro odontólogo", async () => {
    const { db, usuarioId } = ctx;
    const otroOdontologoId = await crearOdontologo(db, { nombre: "Dr. Otro", listaPrecioId: listaId });
    const pacienteDeOtro = await crearPaciente(db, { nombreCompleto: "Paciente Ajeno", odontologoId: otroOdontologoId });

    await expect(
      crearOrdenConPrestaciones(db, {
        odontologoId,
        pacienteId: pacienteDeOtro,
        fechaTrabajo: "2026-01-01",
        prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }],
        creadoPor: usuarioId
      })
    ).rejects.toThrow(/no pertenece/i);
  });

  it("sin pacienteId ni pacienteNombreCompleto, falla con un mensaje claro", async () => {
    const { db, usuarioId } = ctx;
    await expect(
      crearOrdenConPrestaciones(db, {
        odontologoId,
        fechaTrabajo: "2026-01-01",
        prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }],
        creadoPor: usuarioId
      })
    ).rejects.toThrow(/paciente/i);
  });

  describe("paciente nuevo desde Nuevo Trabajo (pacienteNombreCompleto)", () => {
    it("si ya existe un paciente activo con ese nombre para el mismo odontólogo, lo reutiliza y no crea un duplicado", async () => {
      const { db, usuarioId } = ctx;
      const existenteId = await crearPaciente(db, { nombreCompleto: "Ana Ruiz", odontologoId });

      const orden = await crearOrdenConPrestaciones(db, {
        odontologoId,
        pacienteNombreCompleto: "Ana Ruiz",
        fechaTrabajo: "2026-01-01",
        prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }],
        creadoPor: usuarioId
      });

      expect(orden.pacienteId).toBe(existenteId);
      expect(await listarPacientes(db, { odontologoId })).toHaveLength(1);
    });

    it("la reutilización no distingue mayúsculas ni espacios al principio/final", async () => {
      const { db, usuarioId } = ctx;
      const existenteId = await crearPaciente(db, { nombreCompleto: "Ana Ruiz", odontologoId });

      const orden = await crearOrdenConPrestaciones(db, {
        odontologoId,
        pacienteNombreCompleto: "  ana ruiz  ", // espacios extremos + distinta capitalización
        fechaTrabajo: "2026-01-01",
        prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }],
        creadoPor: usuarioId
      });

      expect(orden.pacienteId).toBe(existenteId);
    });

    it("un paciente inactivo con el mismo nombre NO se reutiliza (no se reactiva solo): se crea uno nuevo", async () => {
      const { db, usuarioId } = ctx;
      const inactivoId = await crearPaciente(db, { nombreCompleto: "Ana Ruiz", odontologoId });
      await setActivoPaciente(db, inactivoId, false);

      const orden = await crearOrdenConPrestaciones(db, {
        odontologoId,
        pacienteNombreCompleto: "Ana Ruiz",
        fechaTrabajo: "2026-01-01",
        prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }],
        creadoPor: usuarioId
      });

      expect(orden.pacienteId).not.toBe(inactivoId);
      const nuevo = await obtenerPaciente(db, orden.pacienteId);
      expect(nuevo?.activo).toBe(true);
    });

    it("un paciente con el mismo nombre pero de OTRO odontólogo no se reutiliza: se crea uno propio", async () => {
      const { db, usuarioId } = ctx;
      const otroOdontologoId = await crearOdontologo(db, { nombre: "Dr. Otro", listaPrecioId: listaId });
      const deOtroId = await crearPaciente(db, { nombreCompleto: "Ana Ruiz", odontologoId: otroOdontologoId });

      const orden = await crearOrdenConPrestaciones(db, {
        odontologoId,
        pacienteNombreCompleto: "Ana Ruiz",
        fechaTrabajo: "2026-01-01",
        prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }],
        creadoPor: usuarioId
      });

      expect(orden.pacienteId).not.toBe(deOtroId);
      expect((await obtenerPaciente(db, orden.pacienteId))?.odontologoId).toBe(odontologoId);
    });

    it("crear un paciente nuevo desde Nuevo Trabajo queda auditado como 'crear' sobre 'pacientes'", async () => {
      const { db, usuarioId } = ctx;
      const orden = await crearOrdenConPrestaciones(db, {
        odontologoId,
        pacienteNombreCompleto: "Paciente Nuevo",
        fechaTrabajo: "2026-01-01",
        prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }],
        creadoPor: usuarioId
      });

      const { rows } = await db.query<{ detalle: string }>(
        "SELECT * FROM auditoria WHERE accion = 'crear' AND entidad = 'pacientes' AND entidad_id = $1",
        [orden.pacienteId]
      );
      const auditoria = rows[0];
      expect(auditoria).toBeDefined();
      const detalle = JSON.parse(auditoria!.detalle);
      expect(detalle.nombreCompleto).toBe("Paciente Nuevo");
      expect(detalle.origen).toBe("nuevo_trabajo");
    });

    it("reutilizar un paciente existente NO genera una auditoría de creación nueva", async () => {
      const { db, usuarioId } = ctx;
      await crearPaciente(db, { nombreCompleto: "Ana Ruiz", odontologoId });
      const { rows: antesRows } = await db.query<{ c: number }>("SELECT COUNT(*) AS c FROM auditoria WHERE entidad = 'pacientes'");
      const cantidadAntes = antesRows[0].c;

      await crearOrdenConPrestaciones(db, {
        odontologoId,
        pacienteNombreCompleto: "Ana Ruiz",
        fechaTrabajo: "2026-01-01",
        prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }],
        creadoPor: usuarioId
      });

      const { rows: despuesRows } = await db.query<{ c: number }>("SELECT COUNT(*) AS c FROM auditoria WHERE entidad = 'pacientes'");
      expect(despuesRows[0].c).toBe(cantidadAntes);
    });

    it("el paciente creado desde Nuevo Trabajo aparece luego al listar pacientes normalmente", async () => {
      const { db, usuarioId } = ctx;
      const orden = await crearOrdenConPrestaciones(db, {
        odontologoId,
        pacienteNombreCompleto: "Paciente Nuevo",
        fechaTrabajo: "2026-01-01",
        prestaciones: [{ prestacionId: coronaId, cantidad: 1, piezasFdi: [] }],
        creadoPor: usuarioId
      });

      const lista = await listarPacientes(db, { odontologoId });
      expect(lista.some((p) => p.id === orden.pacienteId && p.nombreCompleto === "Paciente Nuevo")).toBe(true);
    });
  });
});
