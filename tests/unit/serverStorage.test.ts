import { describe, it, expect } from "vitest";
import { loadEnvFile } from "../../src/main/utils/appPaths";

loadEnvFile();

const CONFIGURADO = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Prueba real contra el bucket "documentos" de Supabase Storage — pero
 * SOLO si SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY están configurados en el
 * entorno (nunca hardcodeados ni pedidos por chat, ver README). Si no
 * están, el test se salta explícitamente en vez de fallar — Storage sigue
 * siendo opcional para todo lo demás.
 *
 * El archivo que sube es un .txt sintético, claramente de prueba, sin
 * relación con ningún comprobante/cuenta/orden real — se borra al final
 * del mismo test, nunca queda como dato real en Storage.
 */
describe.skipIf(!CONFIGURADO)("server/storage (Supabase Storage real)", () => {
  it("sube, descarga y borra un documento de prueba en la carpeta 'comprobantes/'", async () => {
    const { subirDocumento, descargarDocumento, eliminarDocumento } = await import("../../src/server/storage");

    const nombreArchivo = `test-verificacion-${Date.now()}.txt`;
    const contenidoOriginal = Buffer.from(`Densz — archivo de prueba de Storage, ${new Date().toISOString()}`, "utf-8");

    const rutaObjeto = await subirDocumento("comprobantes", nombreArchivo, contenidoOriginal);
    expect(rutaObjeto).toBe(`comprobantes/${nombreArchivo}`);

    const contenidoDescargado = await descargarDocumento(rutaObjeto);
    expect(contenidoDescargado.toString("utf-8")).toBe(contenidoOriginal.toString("utf-8"));

    // Limpieza: nunca dejar el archivo de prueba en el bucket real. No se
    // vuelve a intentar descargar para "confirmar" el borrado — la API de
    // Storage no es estrictamente consistente de inmediato (se observó un
    // falso negativo intermitente), así que la prueba confiable es que
    // eliminarDocumento() no lance error, no una re-descarga inmediata.
    await eliminarDocumento(rutaObjeto);
  });

  // Fase 8D — Cuentas/Storage: único smoke test real (autosupervisado, tal
  // como se acordó) contra el prefijo "estados-cuenta/" del mismo bucket
  // real — confirma que el cableado real (credenciales, nombre de bucket,
  // permisos) funciona también para esta carpeta nueva, sin depender solo
  // de los mocks de cuentasWebStorage.test.ts. Mismo criterio de limpieza
  // que el test de arriba: se borra siempre, nunca queda en el bucket.
  it("sube, descarga y borra un documento de prueba en la carpeta 'estados-cuenta/'", async () => {
    const { subirDocumento, descargarDocumento, eliminarDocumento } = await import("../../src/server/storage");

    const nombreArchivo = `test-verificacion-cuentas-${Date.now()}.txt`;
    const contenidoOriginal = Buffer.from(`Densz — archivo de prueba de Storage (Cuentas), ${new Date().toISOString()}`, "utf-8");

    const rutaObjeto = await subirDocumento("estados-cuenta", nombreArchivo, contenidoOriginal);
    expect(rutaObjeto).toBe(`estados-cuenta/${nombreArchivo}`);

    const contenidoDescargado = await descargarDocumento(rutaObjeto);
    expect(contenidoDescargado.toString("utf-8")).toBe(contenidoOriginal.toString("utf-8"));

    await eliminarDocumento(rutaObjeto);
  });
});
