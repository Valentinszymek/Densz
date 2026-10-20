import { ipcMain } from "electron";
import { z } from "zod";
import type { Pool } from "pg";
import { listarPagos, listarPagosClinica, listarUltimosPagos, listarMediosPago, crearMedioPago } from "../db/repositories/pagosRepo";
import { registrarPago, anularPago } from "../services/pagoService";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { getUsuarioActualId, requerirPermiso } from "../services/sessionService";
import { PERMISOS } from "../../shared/constants/permisos";
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
  // Corrección (hallazgo pre-lanzamiento comercial, 2026-10-20): ningún
  // canal de pagos exigía permiso hasta ahora — solo sesión iniciada. El
  // botón de "Anular" se ocultaba según el rol del lado de la pantalla,
  // pero nada lo hacía cumplir acá, así que un rol sin pagos.anular (ej.
  // RECEPCION) igual podía anular si llamaba al canal directamente. Con
  // Densz vendiéndose a otros laboratorios, cada uno carga sus propios
  // roles confiando en que esta restricción es real.
  ipcMain.handle(IPC_CHANNELS.PAGOS_LISTAR, (_e, odontologoId: number) => {
    requerirPermiso(PERMISOS.PAGOS_VER);
    return listarPagos(db, odontologoId);
  });

  ipcMain.handle(IPC_CHANNELS.PAGOS_LISTAR_CLINICA, (_e, clinicaId: number) => {
    requerirPermiso(PERMISOS.PAGOS_VER);
    return listarPagosClinica(db, clinicaId);
  });

  ipcMain.handle(IPC_CHANNELS.PAGOS_LISTAR_ULTIMOS, (_e, limite?: number) => {
    requerirPermiso(PERMISOS.PAGOS_VER);
    return listarUltimosPagos(db, limite ?? 5);
  });

  ipcMain.handle(IPC_CHANNELS.PAGOS_REGISTRAR, async (_e, data, confirmarDuplicado?: boolean) => {
    try {
      requerirPermiso(PERMISOS.PAGOS_CREAR);
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
      requerirPermiso(PERMISOS.PAGOS_ANULAR);
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
