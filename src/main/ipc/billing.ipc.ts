import { ipcMain, shell } from "electron";
import { apiClient } from "../services/apiClient";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

/** Suscripciones desde el escritorio — ver billingService.ts (backend) y
 * el comentario de `billingCheckout` en ipc-contracts.ts. El checkout
 * nunca se embebe en la ventana de Electron: el backend arma la URL
 * (apiClient.billingCheckout, mismo endpoint que ya usa la web) y acá se
 * abre en el navegador del sistema — mismo patrón que el login con
 * Google (ver googleOAuthDesktop.ts). La confirmación de pago la ve la
 * persona en el navegador; el escritorio se entera en el próximo
 * `billingEstado`, después de que el webhook actualice la base. */
export function registrarHandlersBilling(): void {
  ipcMain.handle(IPC_CHANNELS.BILLING_ESTADO, () => apiClient.billingEstado());

  ipcMain.handle(IPC_CHANNELS.BILLING_CHECKOUT, async (_e, plan: "essential" | "professional", moneda: "ARS" | "USD") => {
    const resultado = await apiClient.billingCheckout(plan, moneda);
    if (resultado?.url) await shell.openExternal(resultado.url);
  });

  ipcMain.handle(IPC_CHANNELS.BILLING_CANCELAR, () => apiClient.billingCancelar());
}
