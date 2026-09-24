import { ipcMain } from "electron";
import { z } from "zod";
import type { Pool } from "pg";
import { listarOrdenes, obtenerOrden, editarFechaTrabajo } from "../db/repositories/ordenesRepo";
import { obtenerComprobantePorOrden } from "../db/repositories/comprobantesRepo";
import { crearOrdenConPrestaciones, editarOrdenConPrestaciones, anularOrden, eliminarOrdenDefinitivo } from "../services/ordenService";
import { regenerarPdfComprobante } from "../services/comprobanteService";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { getUsuarioActualId, requerirPermiso } from "../services/sessionService";
import { PERMISOS } from "../../shared/constants/permisos";
import { traducirErrorPostgres } from "../utils/errors";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

const esquemaLinea = z.object({
  prestacionId: z.number().int().positive(),
  cantidad: z.number().int().positive("La cantidad debe ser mayor a cero."),
  piezasFdi: z.array(z.number().int()).default([]),
  precioManualCentavos: z.number().int().nonnegative().nullable().optional()
});

const esquemaCrear = z
  .object({
    odontologoId: z.number().int().positive(),
    pacienteId: z.number().int().positive().nullable().optional(),
    pacienteNombreCompleto: z.string().trim().min(2).optional(),
    fechaTrabajo: z.string().min(1),
    prestaciones: z.array(esquemaLinea).min(1, "Agregá al menos una prestación.")
  })
  .refine((d) => d.pacienteId != null || (d.pacienteNombreCompleto?.trim().length ?? 0) >= 2, {
    message: "Seleccioná un paciente existente o ingresá el nombre de uno nuevo.",
    path: ["pacienteNombreCompleto"]
  });

export function registrarHandlersOrdenes(db: Pool): void {
  ipcMain.handle(IPC_CHANNELS.ORDENES_LISTAR, (_e, filtro) => listarOrdenes(db, filtro ?? {}));

  ipcMain.handle(IPC_CHANNELS.ORDENES_OBTENER, (_e, id: number) => obtenerOrden(db, id));

  ipcMain.handle(IPC_CHANNELS.ORDENES_CREAR, async (_e, data) => {
    try {
      const validado = esquemaCrear.parse(data);
      const usuarioId = getUsuarioActualId();
      const orden = await crearOrdenConPrestaciones(db, { ...validado, creadoPor: usuarioId });
      await registrarAuditoria(db, {
        usuarioId,
        accion: "crear",
        entidad: "ordenes",
        entidadId: orden.id,
        detalle: { numero: orden.numero, totalCentavos: orden.totalCentavos, moneda: orden.moneda }
      });
      return orden;
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.ORDENES_EDITAR, async (_e, id: number, data) => {
    try {
      // Misma validación que crear: la ficha de "Editar OT" es, a
      // propósito, la misma que "Nuevo Trabajo" (§ no crear una pantalla
      // distinta), solo que aplicada sobre una orden ya existente.
      const validado = esquemaCrear.parse(data);
      const usuarioId = getUsuarioActualId();
      const orden = await editarOrdenConPrestaciones(db, id, { ...validado, editadoPor: usuarioId });
      // "Ver PDF" / "Imprimir" abren un archivo PDF ya generado en disco
      // (no datos en vivo) — si la OT ya tenía comprobante, hay que
      // regenerar ese archivo con los datos actualizados para que nunca
      // muestre la versión vieja (§11, §12). El comprobante en sí (su
      // número, fecha de emisión) no cambia — solo su contenido impreso.
      const comprobante = await obtenerComprobantePorOrden(db, id);
      if (comprobante) {
        await regenerarPdfComprobante(db, comprobante.id);
      }
      return orden;
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.ORDENES_ANULAR, async (_e, id: number, motivo: string) => {
    try {
      const motivoValidado = z.string().trim().min(3, "Ingresá un motivo de al menos 3 caracteres.").parse(motivo);
      const usuarioId = getUsuarioActualId();
      await anularOrden(db, id, motivoValidado, usuarioId);
      await registrarAuditoria(db, { usuarioId, accion: "anular", entidad: "ordenes", entidadId: id, detalle: { motivo: motivoValidado } });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.ORDENES_ELIMINAR, async (_e, id: number, motivo: string) => {
    try {
      // Eliminación definitiva: solo ADMIN (permiso "*") — la recepción
      // trabaja con anulación, nunca con borrado físico (§20).
      requerirPermiso(PERMISOS.ORDENES_ELIMINAR);
      const motivoValidado = z.string().trim().min(3, "Ingresá un motivo de al menos 3 caracteres.").parse(motivo);
      const usuarioId = getUsuarioActualId();
      await eliminarOrdenDefinitivo(db, id, usuarioId, motivoValidado);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.ORDENES_EDITAR_FECHA, async (_e, id: number, fechaTrabajo: string) => {
    try {
      await editarFechaTrabajo(db, id, z.string().min(1).parse(fechaTrabajo));
      await registrarAuditoria(db, { usuarioId: getUsuarioActualId(), accion: "editar_fecha", entidad: "ordenes", entidadId: id });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
}
