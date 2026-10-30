import fs from "node:fs";
import path from "node:path";
import { getUserDataDir } from "../utils/appPaths";

/**
 * Guarda el id de sesión HTTP (`sesionId`, ver src/server/session.ts) que
 * el escritorio manda como `Authorization: Bearer <id>` en cada pedido a
 * Railway — un archivo JSON local en la carpeta de datos de la app
 * (`getUserDataDir()`, la misma que ya usan los PDFs y
 * `supabaseSessionStorage.ts`). Permite restaurar la sesión sola al
 * reabrir Densz, sin pedir el navegador de nuevo (ver
 * `intentarRestaurarSesion` en googleOAuthDesktop.ts).
 */

function rutaArchivoSesion(): string {
  return path.join(getUserDataDir(), "api-session.json");
}

export function leerTokenGuardado(): string | null {
  try {
    const contenido = fs.readFileSync(rutaArchivoSesion(), "utf-8");
    const datos = JSON.parse(contenido) as { sesionId?: string };
    return datos.sesionId ?? null;
  } catch {
    // No existe todavía, o quedó corrupto — "sin sesión guardada" es un
    // estado válido (primer arranque, o se borró con logout).
    return null;
  }
}

/** Escritura segura: a un archivo temporal y rename — así una app cerrada
 * a mitad de escritura nunca deja el archivo real corrupto. */
export function guardarToken(sesionId: string): void {
  const ruta = rutaArchivoSesion();
  const rutaTemp = `${ruta}.tmp`;
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(rutaTemp, JSON.stringify({ sesionId }), "utf-8");
  fs.renameSync(rutaTemp, ruta);
}

export function borrarTokenGuardado(): void {
  try {
    fs.rmSync(rutaArchivoSesion(), { force: true });
  } catch {
    // Si ya no existía, no hay nada que borrar — no es un error real.
  }
}
