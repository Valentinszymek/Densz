import { ipcMain } from "electron";
import { z } from "zod";
import type { Pool } from "pg";
import { listarPagos, listarPagosClinica, listarUltimosPagos, listarMediosPago, crearMedioPago } from "../db/repositories/pagosRepo";
import { registrarPago, anularPago } from "../services/pagoService";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { getUsuarioActualId } from "../services/sessionService";
import { traducirErrorPostgres } from "../utils/errors";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

const esquemaPago = z
  .object({
    odontologoId: z.number().int().positive().nullable().optional(),
    clinicaId: z.number().int().positive().nullable().optional(),
    fecha: z.string().min(1),
    importeCentavos: z.number().int().positive("El importe debe ser mayor a cero."),
    moneda: z.enum(["ARS", "USD"]),
    medioPagoId: z.number().int().positive(),
    referencia: z.string().trim().max(200).nullable().optional()
  })
  .transform((d) => ({ ...d, odontologoId: d.odontologoId ?? null, clinicaId: d.clinicaId ?? null }));

export function registrarHandlersPagos(db: Pool): void {
  ipcMain.handle(IPC_CHANNELS.PAGOS_LISTAR, (_e, odontologoId: number) => listarPagos(db, odontologoId));

  ipcMain.handle(IPC_CHANNELS.PAGOS_LISTAR_CLINICA, (_e, clinicaId: number) => listarPagosClinica(db, clinicaId));

  ipcMain.handle(IPC_CHANNELS.PAGOS_LISTAR_ULTIMOS, (_e, limite?: number) => listarUltimosPagos(db, limite ?? 5));

  ipcMain.handle(IPC_CHANNELS.PAGOS_REGISTRAR, async (_e, data, confirmarDuplicado?: boolean) => {
    try {
      const validado = esquemaPago.parse(data);
      const usuarioId = getUsuarioActualId();
      // registrarPago ya audita "crear" adentro de su propia transacción
      // (corrección post-auditoría §26/§30-D) — no duplicar acá.
      return await registrarPago(db, validado, usuarioId, confirmarDuplicado ?? false);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.PAGOS_ANULAR, async (_e, id: number, motivo: string) => {
    try {
      const motivoValidado = z.string().trim().min(3, "Ingresá un motivo de al menos 3 caracteres.").parse(motivo);
      const usuarioId = getUsuarioActualId();
      // anularPago ya audita "anular" adentro de su propia transacción
      // (corrección post-auditoría §26/§30-D) — no duplicar acá.
      await anularPago(db, id, motivoValidado, usuarioId);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.MEDIOS_PAGO_LISTAR, () => listarMediosPago(db));

  ipcMain.handle(IPC_CHANNELS.MEDIOS_PAGO_CREAR, async (_e, nombre: string) => {
    try {
      const id = await crearMedioPago(db, z.string().trim().min(1).parse(nombre));
      await registrarAuditoria(db, { usuarioId: getUsuarioActualId(), accion: "crear", entidad: "medios_pago", entidadId: id });
      return id;
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
}
