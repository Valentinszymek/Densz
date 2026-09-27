import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

/**
 * Integración con Supabase Storage. El bucket "documentos" ya existe en
 * producción (creado explícitamente, no público — ver informe del bloque
 * de Storage), con la misma carpeta lógica por tipo de documento descripta
 * abajo. Todavía no lo usa ningún flujo real (Comprobantes/Cuentas siguen
 * sin implementarse) — estas funciones quedan preparadas para cuando se
 * implementen esos dominios.
 *
 * Diseño:
 * - Bucket único "documentos", NO público — se sube con la service role
 *   key (que solo vive en el servidor, nunca en el navegador) y se
 *   descarga siempre a través del backend (nunca con una URL pública
 *   directa de Supabase), para que la descarga pase por los mismos
 *   chequeos de sesión/permiso que ya tiene cada ruta HTTP.
 * - Una carpeta por tipo de documento: `comprobantes/`, `estados-cuenta/`,
 *   `listas-precio/` — mismo criterio que ya usan las carpetas locales de
 *   Windows hoy (appPaths.ts). Son carpetas "lógicas" (un storage de
 *   objetos no tiene carpetas reales): existen en cuanto se sube el primer
 *   archivo con ese prefijo, no hace falta crearlas aparte.
 * - La columna `pdf_path` de `comprobantes`/`resumenes_mensuales` no
 *   cambia de nombre ni de forma: pasa de guardar una ruta de Windows a
 *   guardar la ruta del objeto dentro del bucket (ej.
 *   "comprobantes/CB-00000123.pdf"), nunca una URL pública.
 * - Seguridad: RLS está activo en `storage.objects` y a propósito NO tiene
 *   ninguna política — eso deniega el acceso por defecto a los roles
 *   `anon`/`authenticated` de Supabase. Como este código nunca usa esos
 *   roles (solo `service_role`, que sortea RLS por diseño de Supabase) no
 *   hace falta agregar ninguna política: el estado "sin políticas" ya es
 *   el más restrictivo posible para este bucket.
 */

const NOMBRE_BUCKET = "documentos";

let clienteAdmin: SupabaseClient | null = null;

/** Cliente con la service role key — SOLO se usa del lado del servidor
 * (este archivo vive en src/server/**, nunca se importa desde
 * src/renderer/**), nunca se envía al navegador. Lanza un error claro si
 * faltan las variables de entorno (ver .env.example: SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY — opcionales, solo hacen falta para Storage). */
function getClienteStorage(): SupabaseClient {
  if (clienteAdmin) return clienteAdmin;
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Storage no está configurado todavía: faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. " +
        "El bucket 'documentos' tampoco existe aún — ver docs/ARQUITECTURA_Y_MIGRACION_WEB.md."
    );
  }
  clienteAdmin = createClient(url, serviceRoleKey, {
    // Storage no usa Realtime para nada, pero el cliente de supabase-js
    // siempre intenta inicializarlo al construirse — en runtimes con Node
    // < 22 (o el Node embebido en Electron, usado por el test runner)
    // eso falla porque no existe el WebSocket global nativo. Se le pasa
    // una implementación explícita (paquete "ws") en vez de agregar un
    // polyfill global — no afecta al resto del proceso.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: WebSocket as any }
  });
  return clienteAdmin;
}

export type CarpetaDocumento = "comprobantes" | "estados-cuenta" | "listas-precio";

/** Sube un PDF ya generado al bucket y devuelve la ruta del objeto para
 * guardar en `pdf_path` — no genera ninguna URL pública. */
export async function subirDocumento(carpeta: CarpetaDocumento, nombreArchivo: string, contenido: Buffer): Promise<string> {
  const rutaObjeto = `${carpeta}/${nombreArchivo}`;
  const { error } = await getClienteStorage()
    .storage.from(NOMBRE_BUCKET)
    .upload(rutaObjeto, contenido, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`No se pudo subir el documento a Storage: ${error.message}`);
  return rutaObjeto;
}

/** Descarga un documento del bucket para servirlo a través del backend
 * (nunca con una URL directa de Supabase) — la ruta a pasar acá es
 * exactamente el valor ya guardado en `pdf_path`. */
export async function descargarDocumento(rutaObjeto: string): Promise<Buffer> {
  const { data, error } = await getClienteStorage().storage.from(NOMBRE_BUCKET).download(rutaObjeto);
  if (error) throw new Error(`No se pudo descargar el documento de Storage: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

/** Borra un documento del bucket — no la usa ningún flujo real todavía;
 * existe para poder limpiar datos de prueba (ver tests/unit/serverStorage.test.ts). */
export async function eliminarDocumento(rutaObjeto: string): Promise<void> {
  const { error } = await getClienteStorage().storage.from(NOMBRE_BUCKET).remove([rutaObjeto]);
  if (error) throw new Error(`No se pudo borrar el documento de Storage: ${error.message}`);
}
