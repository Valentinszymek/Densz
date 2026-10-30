import { app, BrowserWindow } from "electron";
import { loadEnvFile } from "./utils/appPaths";
import { registrarHandlersSistema } from "./ipc/system.ipc";
import { registrarHandlersConfig } from "./ipc/config.ipc";
import { registrarHandlersBusqueda } from "./ipc/search.ipc";
import { registrarHandlersOdontologos } from "./ipc/odontologos.ipc";
import { registrarHandlersClinicas } from "./ipc/clinicas.ipc";
import { registrarHandlersPacientes } from "./ipc/pacientes.ipc";
import { registrarHandlersPrecios } from "./ipc/precios.ipc";
import { registrarHandlersListasPrecio } from "./ipc/listasPrecio.ipc";
import { registrarHandlersListaPrecios } from "./ipc/listaPrecios.ipc";
import { registrarHandlersOrdenes } from "./ipc/ordenes.ipc";
import { registrarHandlersComprobantes } from "./ipc/comprobantes.ipc";
import { registrarHandlersCuentas } from "./ipc/cuentas.ipc";
import { registrarHandlersPagos } from "./ipc/pagos.ipc";
import { registrarHandlersDeudas } from "./ipc/deudas.ipc";
import { registrarHandlersEstadisticas } from "./ipc/estadisticas.ipc";
import { registrarHandlersBackups } from "./ipc/backups.ipc";
import { registrarHandlersAuth } from "./ipc/auth.ipc";
import { registrarHandlersUsuarios } from "./ipc/usuarios.ipc";
import { registrarHandlersAuditoria } from "./ipc/auditoria.ipc";
import { registrarHandlersExport } from "./ipc/export.ipc";
import { registrarHandlersLaboratorios } from "./ipc/laboratorios.ipc";
import { registrarHandlersBilling } from "./ipc/billing.ipc";
import { registrarHandlersImpresora } from "./ipc/impresora.ipc";
import { registrarHandlersProteccion } from "./ipc/proteccion.ipc";
import { registrarHandlersActualizacion } from "./ipc/actualizacion.ipc";
import { createMainWindow } from "./windows/mainWindow";
import { intentarRestaurarSesionGoogle } from "./services/googleOAuthDesktop";
import { iniciarAutoUpdate } from "./services/autoUpdaterService";
import { alExpirarSesion } from "./services/apiClient";
import { limpiarSesion } from "./services/sessionService";
import { IPC_CHANNELS } from "../shared/types/ipc-contracts";

// Evita instancias múltiples de Densz pisándose entre sí al arrancar.
const obtuvoElLock = app.requestSingleInstanceLock();
if (!obtuvoElLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    loadEnvFile();

    // Plan de seguridad del escritorio: ya no se abre ninguna conexión
    // directa a Postgres acá — cada handler de abajo habla por HTTP con
    // Railway a través de apiClient.ts (mismo backend que ya usa la web).
    // Un 401 en cualquier pedido (ej. Railway se reinició y perdió su
    // mapa de sesiones en memoria) limpia la sesión local y avisa a la
    // ventana para que vuelva al login con un mensaje claro, en vez de
    // quedarse fallando en silencio en la pantalla donde estaba.
    alExpirarSesion(() => {
      limpiarSesion();
      BrowserWindow.getAllWindows()[0]?.webContents.send(IPC_CHANNELS.AUTH_SESION_EXPIRADA);
    });

    // Se intenta restaurar la sesión guardada LO ANTES POSIBLE. Nunca
    // tira: si no hay nada guardado o falla, sigue el arranque normal sin
    // sesión todavía (pantalla de login).
    await intentarRestaurarSesionGoogle();

    registrarHandlersSistema();
    registrarHandlersConfig();
    registrarHandlersBusqueda();
    registrarHandlersOdontologos();
    registrarHandlersClinicas();
    registrarHandlersPacientes();
    registrarHandlersPrecios();
    registrarHandlersListasPrecio();
    registrarHandlersListaPrecios();
    registrarHandlersOrdenes();
    registrarHandlersComprobantes();
    registrarHandlersCuentas();
    registrarHandlersPagos();
    registrarHandlersDeudas();
    registrarHandlersEstadisticas();
    registrarHandlersBackups();
    registrarHandlersAuth();
    registrarHandlersUsuarios();
    registrarHandlersAuditoria();
    registrarHandlersExport();
    registrarHandlersLaboratorios();
    registrarHandlersBilling();
    registrarHandlersImpresora();
    registrarHandlersProteccion();
    registrarHandlersActualizacion();

    createMainWindow();
    iniciarAutoUpdate();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
