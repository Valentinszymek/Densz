import { ipcMain } from "electron";
import { apiClient } from "../services/apiClient";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";

export function registrarHandlersPagos(): void {
  ipcMain.handle(IPC_CHANNELS.PAGOS_LISTAR, (_e, odontologoId: number) => apiClient.pagosListar(odontologoId));
  ipcMain.handle(IPC_CHANNELS.PAGOS_LISTAR_CLINICA, (_e, clinicaId: number) => apiClient.pagosListarClinica(clinicaId));
  ipcMain.handle(IPC_CHANNELS.PAGOS_LISTAR_ULTIMOS, (_e, limite?: number) => apiClient.pagosListarUltimos(limite));
  ipcMain.handle(IPC_CHANNELS.PAGOS_REGISTRAR, (_e, data, confirmarDuplicado?: boolean) =>
    apiClient.pagosRegistrar(data, confirmarDuplicado)
  );
  ipcMain.handle(IPC_CHANNELS.PAGOS_ANULAR, (_e, id: number, motivo: string) => apiClient.pagosAnular(id, motivo));
  ipcMain.handle(IPC_CHANNELS.MEDIOS_PAGO_LISTAR, () => apiClient.mediosPagoListar());
  ipcMain.handle(IPC_CHANNELS.MEDIOS_PAGO_CREAR, (_e, nombre: string) => apiClient.mediosPagoCrear(nombre));
}
