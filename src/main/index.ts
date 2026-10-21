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
import { logger } from "./utils/logger";
import { ensureBootstrapUser } from "./db/ensureBootstrapUser";
import { intentarRestaurarSesionGoogle } from "./services/googleOAuthDesktop";
import { getLaboratorioActualId } from "./services/sessionService";
import { iniciarAutoUpdate } from "./services/autoUpdaterService";

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

    // Se intenta restaurar la sesión de Google guardada LO ANTES POSIBLE
    // (antes de cualquier otra cosa que toque la base) para que el
    // laboratorio quede resuelto cuanto antes — ver connection.ts, cada
    // conexión nueva del pool lo lee. Nunca tira: si no hay sesión
    // guardada o falla, sigue el arranque normal sin laboratorio todavía.
    await intentarRestaurarSesionGoogle(pool);

    // A diferencia de SQLite (siempre disponible localmente), acá la base
    // depende de la red: el arranque NO bloquea esperando la conexión —
    // la ventana se muestra enseguida y es el `ConexionGate` del renderer
    // (con `window.densz.ping()`) el que muestra el spinner/reintento
    // hasta que la primera consulta real funcione. `ensureBootstrapUser`
    // solo tiene sentido si ya se sabe a qué laboratorio pertenece esta
    // instalación (si no, no hay dónde crear el usuario todavía — recién
    // se resuelve con el primer login de Google, ver plan §4).
    if (getLaboratorioActualId() !== null) {
      ensureBootstrapUser(pool).catch((err) => {
        logger.error("No se pudo verificar/crear el usuario administrador de arranque:", err);
      });
    }

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
    registrarHandlersDeudas(pool);
    registrarHandlersEstadisticas(pool);
    registrarHandlersBackups(pool);
    registrarHandlersAuth(pool);
    registrarHandlersUsuarios(pool);
    registrarHandlersAuditoria(pool);
    registrarHandlersExport(pool);
    registrarHandlersLaboratorios(pool);
    registrarHandlersBilling(pool);
    registrarHandlersImpresora(pool);
    registrarHandlersProteccion(pool);
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
    void closeDatabase();
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
