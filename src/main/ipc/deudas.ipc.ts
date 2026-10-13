import { ipcMain } from "electron";
import { z } from "zod";
import type { Pool } from "pg";
import { registrarDeuda, anularDeuda } from "../services/deudaService";
import { getUsuarioActualId } from "../services/sessionService";
import { traducirErrorPostgres } from "../utils/errors";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

const esquemaDeuda = z
  .object({
    odontologoId: z.number().int().positive().nullable().optional(),
    clinicaId: z.number().int().positive().nullable().optional(),
    fecha: z.string().min(1),
    importeCentavos: z.number().int().positive("El importe debe ser mayor a cero."),
    moneda: z.enum(["ARS", "USD"]),
    descripcion: z.string().trim().min(1, "Ingresá una descripción.").max(200)
  })
  .transform((d) => ({ ...d, odontologoId: d.odontologoId ?? null, clinicaId: d.clinicaId ?? null }));

/** Deuda agregada a mano (sin ninguna orden detrás) — ver deudaService.ts.
 * Mismo criterio de permisos que pagos.ipc.ts: ningún canal exige
 * requerirPermiso hoy, así que acá tampoco se agrega uno nuevo. */
export function registrarHandlersDeudas(db: Pool): void {
  ipcMain.handle(IPC_CHANNELS.DEUDAS_REGISTRAR, async (_e, data) => {
    try {
      const validado = esquemaDeuda.parse(data);
      const usuarioId = getUsuarioActualId();
      return await registrarDeuda(db, validado, usuarioId);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.DEUDAS_ANULAR, async (_e, id: number, motivo: string) => {
    try {
      const motivoValidado = z.string().trim().min(3, "Ingresá un motivo de al menos 3 caracteres.").parse(motivo);
      const usuarioId = getUsuarioActualId();
      await anularDeuda(db, id, motivoValidado, usuarioId);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
}
