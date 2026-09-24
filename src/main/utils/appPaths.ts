import fs from "node:fs";
import path from "node:path";

/** Detecta si el proceso actual corre dentro del runtime de Electron (en vez de un `node` plano). */
function isElectronRuntime(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require("electron");
    return typeof electron !== "string";
  } catch {
    return false;
  }
}

export function getUserDataDir(): string {
  if (process.env.DENSZ_DATA_DIR) {
    return process.env.DENSZ_DATA_DIR;
  }

  const esDesarrollo = process.env.NODE_ENV === "development";

  // En desarrollo (`npm run dev`) se usa siempre la misma carpeta local del
  // proyecto. Solo la app empaquetada (producción) usa la carpeta de datos
  // de usuario de Windows. Esto es solo para archivos generados (PDFs) —
  // los datos en sí viven en Postgres, no acá.
  if (isElectronRuntime() && !esDesarrollo) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require("electron");
    return app.getPath("userData");
  }

  return path.join(process.cwd(), "data");
}

export function getComprobantesDir(): string {
  return path.join(getUserDataDir(), "comprobantes");
}

/**
 * Ubicación del archivo `.env` con `DATABASE_URL`: en desarrollo, la raíz
 * del proyecto; en la app empaquetada, la carpeta `resources` (ver
 * `extraResources` en electron-builder.yml) — nunca dentro del asar, para
 * poder reemplazarlo sin recompilar y para que nunca quede commiteado.
 */
function getEnvFilePath(): string {
  if (isElectronRuntime() && process.env.NODE_ENV !== "development") {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require("electron");
    return path.join(process.resourcesPath ?? path.dirname(app.getPath("exe")), ".env");
  }
  return path.join(process.cwd(), ".env");
}

/**
 * Parser mínimo de `.env` (KEY=VALUE por línea, sin soporte de comillas
 * multilínea): evita agregar una dependencia solo para esto. Nunca
 * sobreescribe una variable que ya esté seteada en el entorno real.
 */
export function loadEnvFile(): void {
  const rutaEnv = getEnvFilePath();
  if (!fs.existsSync(rutaEnv)) return;

  const contenido = fs.readFileSync(rutaEnv, "utf-8");
  for (const linea of contenido.split("\n")) {
    const l = linea.trim();
    if (!l || l.startsWith("#")) continue;
    const idx = l.indexOf("=");
    if (idx === -1) continue;
    const clave = l.slice(0, idx).trim();
    let valor = l.slice(idx + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    if (process.env[clave] === undefined) {
      process.env[clave] = valor;
    }
  }
}

export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Falta DATABASE_URL. Configurá un archivo .env con la cadena de conexión a Postgres (ver .env.example)."
    );
  }
  return url;
}

/** Cadena de conexión al proyecto Supabase separado dedicado a tests (ver
 * tests/helpers/testDb.ts) — nunca el mismo proyecto que la base real. */
export function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "Falta TEST_DATABASE_URL. Configurá un archivo .env con la cadena de conexión al proyecto Supabase de tests (ver .env.example)."
    );
  }
  return url;
}
