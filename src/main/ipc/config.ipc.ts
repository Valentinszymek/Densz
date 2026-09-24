import { ipcMain } from "electron";
import { z } from "zod";
import type { Pool } from "pg";
import { getConfig, setConfig } from "../db/repositories/configRepo";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { getUsuarioActualId, requerirPermiso } from "../services/sessionService";
import { PERMISOS } from "../../shared/constants/permisos";
import { traducirErrorPostgres } from "../utils/errors";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

const CLAVE_LABORATORIO_NOMBRE = "laboratorio.nombre";
/** Valor de fábrica (nunca configurado por el laboratorio) — equivale a
 * "sin nombre propio todavía" (§9/§11 del pedido de identidad del
 * laboratorio): no se muestra como si fuera un nombre real elegido. */
const VALOR_DE_FABRICA = "Densz";

export function registrarHandlersConfig(db: Pool): void {
  ipcMain.handle(IPC_CHANNELS.CONFIG_LABORATORIO_OBTENER, async () => {
    requerirPermiso(PERMISOS.CONFIGURACION_EDITAR);
    const valor = await getConfig(db, CLAVE_LABORATORIO_NOMBRE);
    return valor && valor.trim() !== VALOR_DE_FABRICA ? valor.trim() : null;
  });

  ipcMain.handle(IPC_CHANNELS.CONFIG_LABORATORIO_GUARDAR, async (_e, nombre: string) => {
    try {
      requerirPermiso(PERMISOS.CONFIGURACION_EDITAR);
      const validado = z.string().trim().min(1, "Ingresá un nombre.").max(100).parse(nombre);
      await setConfig(db, CLAVE_LABORATORIO_NOMBRE, validado);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "modificar",
        entidad: "configuracion",
        detalle: { clave: CLAVE_LABORATORIO_NOMBRE, valor: validado }
      });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
}
