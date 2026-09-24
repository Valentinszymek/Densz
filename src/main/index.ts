import { app, BrowserWindow } from "electron";
import { openDatabase, closeDatabase } from "./db/connection";
import { loadEnvFile, getDatabaseUrl } from "./utils/appPaths";
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
import { registrarHandlersEstadisticas } from "./ipc/estadisticas.ipc";
import { registrarHandlersBackups } from "./ipc/backups.ipc";
import { registrarHandlersAuth } from "./ipc/auth.ipc";
import { registrarHandlersUsuarios } from "./ipc/usuarios.ipc";
import { registrarHandlersAuditoria } from "./ipc/auditoria.ipc";
import { registrarHandlersExport } from "./ipc/export.ipc";
import { registrarHandlersImpresora } from "./ipc/impresora.ipc";
import { registrarHandlersProteccion } from "./ipc/proteccion.ipc";
import { createMainWindow } from "./windows/mainWindow";
import { logger } from "./utils/logger";
import { ensureBootstrapUser } from "./db/ensureBootstrapUser";

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
    const pool = openDatabase(getDatabaseUrl());

    // A diferencia de SQLite (siempre disponible localmente), acá la base
    // depende de la red: el arranque NO bloquea esperando la conexión —
    // la ventana se muestra enseguida y es el `ConexionGate` del renderer
    // (con `window.densz.ping()`) el que muestra el spinner/reintento
    // hasta que la primera consulta real funcione. `ensureBootstrapUser`
    // igual se intenta ya mismo: si la red no está lista todavía, sale en
    // el log y no bloquea nada — la base real migrada siempre tiene
    // usuarios, así que en la práctica no hace nada de todos modos.
    ensureBootstrapUser(pool).catch((err) => {
      logger.error("No se pudo verificar/crear el usuario administrador de arranque:", err);
    });

    registrarHandlersSistema(pool);
    registrarHandlersConfig(pool);
    registrarHandlersBusqueda(pool);
    registrarHandlersOdontologos(pool);
    registrarHandlersClinicas(pool);
    registrarHandlersPacientes(pool);
    registrarHandlersPrecios(pool);
    registrarHandlersListasPrecio(pool);
    registrarHandlersListaPrecios(pool);
    registrarHandlersOrdenes(pool);
    registrarHandlersComprobantes(pool);
    registrarHandlersCuentas(pool);
    registrarHandlersPagos(pool);
    registrarHandlersEstadisticas(pool);
    registrarHandlersBackups(pool);
    registrarHandlersAuth(pool);
    registrarHandlersUsuarios(pool);
    registrarHandlersAuditoria(pool);
    registrarHandlersExport(pool);
    registrarHandlersImpresora(pool);
    registrarHandlersProteccion(pool);

    createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    void closeDatabase();
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
