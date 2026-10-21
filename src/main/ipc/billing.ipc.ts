import { ipcMain, shell } from "electron";
import { z } from "zod";
import type { Pool } from "pg";
import { crearCheckout, cancelarSuscripcion } from "../services/billingService";
import { obtenerFacturacionLaboratorio } from "../db/repositories/laboratoriosRepo";
import { registrarAuditoria } from "../db/repositories/auditoriaRepo";
import { getSesionActual, getUsuarioActualId, requerirPermiso } from "../services/sessionService";
import { PERMISOS } from "../../shared/constants/permisos";
import { DenszError, traducirErrorPostgres } from "../utils/errors";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

const esquemaCheckout = z.object({
  plan: z.enum(["essential", "professional"]),
  moneda: z.enum(["ARS", "USD"])
});

// El escritorio no tiene un "origen web" propio (no corre en un navegador)
// — después de pagar en el navegador del sistema, la persona vuelve a la
// web (no a la app de escritorio, que no puede recibir un redirect). Mismo
// fallback de desarrollo que usa el backend web (auth.route.ts).
const ORIGEN_WEB_PARA_VOLVER = process.env.WEB_ORIGIN_PUBLICO ?? "http://localhost:5174";

/** Suscripciones desde el escritorio — hoy sin usuarios reales (Dental
 * Szymek está exenta), pero construido completo para cualquier
 * laboratorio nuevo que use el escritorio (se vende igual que la web, ver
 * docs/PLAN_COMERCIAL_DENSZ.md). El checkout nunca se embebe en la
 * ventana de Electron: abre el navegador del sistema (mismo patrón que el
 * login con Google, ver googleOAuthDesktop.ts) y listo — la confirmación
 * de pago la ve la persona en el navegador, el escritorio se entera en el
 * próximo `billingEstado` (después de que el webhook actualice la base). */
export function registrarHandlersBilling(db: Pool): void {
  ipcMain.handle(IPC_CHANNELS.BILLING_ESTADO, async () => {
    try {
      const laboratorioId = getSesionActual()?.laboratorioId;
      if (!laboratorioId) throw new DenszError("Esta cuenta no pertenece a ningún laboratorio.");
      return await obtenerFacturacionLaboratorio(db, laboratorioId);
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.BILLING_CHECKOUT, async (_e, plan: unknown, moneda: unknown) => {
    try {
      requerirPermiso(PERMISOS.CONFIGURACION_EDITAR);
      const laboratorioId = getSesionActual()?.laboratorioId;
      if (!laboratorioId) throw new DenszError("Esta cuenta no pertenece a ningún laboratorio.");
      const datos = esquemaCheckout.parse({ plan, moneda });
      const info = await obtenerFacturacionLaboratorio(db, laboratorioId);
      if (!info) throw new DenszError("Laboratorio no encontrado.");
      const { url } = await crearCheckout(db, {
        laboratorioId,
        planId: datos.plan,
        moneda: datos.moneda,
        email: info.emailContacto,
        origenWeb: ORIGEN_WEB_PARA_VOLVER
      });
      await shell.openExternal(url);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "checkout_suscripcion",
        entidad: "laboratorios",
        entidadId: laboratorioId
      });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });

  ipcMain.handle(IPC_CHANNELS.BILLING_CANCELAR, async () => {
    try {
      requerirPermiso(PERMISOS.CONFIGURACION_EDITAR);
      const laboratorioId = getSesionActual()?.laboratorioId;
      if (!laboratorioId) throw new DenszError("Esta cuenta no pertenece a ningún laboratorio.");
      await cancelarSuscripcion(db, laboratorioId);
      await registrarAuditoria(db, {
        usuarioId: getUsuarioActualId(),
        accion: "cancelar_suscripcion",
        entidad: "laboratorios",
        entidadId: laboratorioId
      });
    } catch (err) {
      throw traducirErrorPostgres(err);
    }
  });
}
