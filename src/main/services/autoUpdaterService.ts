import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import { IPC_CHANNELS } from "../../shared/types/ipc-contracts";
import { logger } from "../utils/logger";

const INTERVALO_REVISION_MS = 4 * 60 * 60 * 1000; // cada 4 horas mientras la app sigue abierta
const DEMORA_PRIMERA_REVISION_MS = 15_000; // no compite con el arranque

/**
 * Auto-actualización del escritorio (pedido explícito, 2026-10-20: "que
 * cuando haga un cambio se modifique automáticamente en la app"). Publica
 * cada versión nueva a GitHub Releases (ver electron-builder.yml#publish
 * y `npm run release`) — electron-updater la detecta sola, la descarga en
 * segundo plano, y recién pide reiniciar cuando ya está lista (nunca
 * interrumpe a media tarea).
 *
 * Nunca tira ni bloquea el arranque: si falla la revisión (sin internet,
 * GitHub caído, lo que sea), Densz sigue funcionando normal — es
 * estrictamente una mejora, no una dependencia dura.
 */
export function iniciarAutoUpdate(): void {
  // Nunca en desarrollo (`npm run dev`) ni en un build sin empaquetar —
  // ahí no hay ninguna release real que buscar, y electron-updater
  // tirarìa errores de configuración constantemente sin sentido.
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  // La instalación en sí queda a elección de la persona (botón "Reiniciar
  // ahora" en el toast) — nunca se fuerza un reinicio sin avisar primero.
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-downloaded", (info) => {
    const [ventana] = BrowserWindow.getAllWindows();
    ventana?.webContents.send(IPC_CHANNELS.ACTUALIZACION_LISTA, info.version);
  });

  autoUpdater.on("error", (err) => {
    logger.info(`No se pudo revisar actualizaciones (no es crítico, se reintenta solo más tarde): ${String(err)}`);
  });

  const revisar = () => {
    autoUpdater.checkForUpdates().catch((err) => {
      logger.info(`Revisión de actualizaciones falló (no es crítico): ${String(err)}`);
    });
  };

  setTimeout(revisar, DEMORA_PRIMERA_REVISION_MS);
  setInterval(revisar, INTERVALO_REVISION_MS);
}

/** Reinicia la app para aplicar la actualización ya descargada. */
export function reiniciarParaActualizar(): void {
  autoUpdater.quitAndInstall();
}
