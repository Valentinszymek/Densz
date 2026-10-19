import fs from "node:fs";
import path from "node:path";
import { getUserDataDir } from "../utils/appPaths";

/**
 * Almacenamiento de la sesión de Google (plan multi-laboratorio, login en
 * escritorio) — un archivo JSON local en la carpeta de datos de la app
 * (`getUserDataDir()`, la misma que ya usan los PDFs de comprobantes).
 * `@supabase/auth-js` (`GoTrueClient`) lo usa para no pedir el navegador
 * en cada arranque: si hay una sesión guardada válida (o renovable), la
 * restaura sola.
 *
 * Implementa `SupportedStorage` de auth-js: getItem/setItem/removeItem
 * por clave, igual forma que `localStorage` del navegador — pero acá no
 * hay navegador, así que esto es lo que lo reemplaza del lado de
 * escritorio.
 */

function rutaArchivoSesion(): string {
  return path.join(getUserDataDir(), "google-session.json");
}

/** Todas las claves viven en el mismo archivo, como un objeto plano —
 * auth-js solo guarda una o dos claves (la sesión, el verifier de PKCE
 * mientras dura el login), no hace falta un archivo por clave. */
function leerArchivo(): Record<string, string> {
  try {
    const contenido = fs.readFileSync(rutaArchivoSesion(), "utf-8");
    return JSON.parse(contenido) as Record<string, string>;
  } catch {
    // No existe todavía, o quedó corrupto — un storage "vacío" es un
    // estado válido (auth-js simplemente no encuentra sesión guardada).
    return {};
  }
}

/** Escritura seguro: a un archivo temporal y rename — así una app
 * cerrada a mitad de escritura nunca deja el archivo real corrupto. */
function escribirArchivo(datos: Record<string, string>): void {
  const ruta = rutaArchivoSesion();
  const rutaTemp = `${ruta}.tmp`;
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(rutaTemp, JSON.stringify(datos), "utf-8");
  fs.renameSync(rutaTemp, ruta);
}

export function crearAlmacenamientoDeSesion(): {
  getItem: (clave: string) => string | null;
  setItem: (clave: string, valor: string) => void;
  removeItem: (clave: string) => void;
} {
  return {
    getItem: (clave) => leerArchivo()[clave] ?? null,
    setItem: (clave, valor) => {
      const datos = leerArchivo();
      datos[clave] = valor;
      escribirArchivo(datos);
    },
    removeItem: (clave) => {
      const datos = leerArchivo();
      delete datos[clave];
      escribirArchivo(datos);
    }
  };
}

/** Cerrar sesión (plan multi-laboratorio) borra también la sesión de
 * Google guardada acá — la próxima vez que se abra Densz, vuelve a pedir
 * el navegador, en vez de restaurar sola la sesión de quien cerró. */
export function borrarSesionGuardada(): void {
  try {
    fs.rmSync(rutaArchivoSesion(), { force: true });
  } catch {
    // Si ya no existía, no hay nada que borrar — no es un error real.
  }
}
