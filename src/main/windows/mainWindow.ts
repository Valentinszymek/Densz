import { BrowserWindow } from "electron";
import path from "node:path";
import { logger } from "../utils/logger";

const isDev = process.env.NODE_ENV === "development";

// Solo hace falta setear el ícono explícitamente en dev (el .exe apunta a
// electron.exe genérico). En la app empaquetada, Windows toma el ícono
// embebido en el .exe por electron-builder (ver electron-builder.yml).
const ICON_PATH_DEV = path.join(__dirname, "..", "..", "..", "build", "icon.ico");

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#0E0E10",
    title: "Densz",
    ...(isDev ? { icon: ICON_PATH_DEV } : {}),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
    // Reenvía la consola del renderer al log del proceso main, para poder
    // diagnosticar errores de la UI sin depender de una captura visual.
    win.webContents.on("console-message", (_e, level, message, line, sourceId) => {
      logger.info(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
  } else {
    win.loadFile(path.join(__dirname, "..", "..", "..", "dist-renderer", "index.html"));
  }

  return win;
}
