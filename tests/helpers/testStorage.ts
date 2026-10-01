import { loadEnvFile } from "../../src/main/utils/appPaths";

loadEnvFile();

/**
 * Corrección post-auditoría (§25/§30-D de docs/AUDITORIA_MAESTRA_DENSZ.md):
 * a diferencia de Postgres (TEST_DATABASE_URL, un proyecto de Supabase
 * dedicado y separado de producción), Supabase Storage nunca tuvo esa
 * separación — 5 archivos de test subían/bajaban/borraban objetos REALES
 * contra el mismo bucket "documentos" que usa producción, mitigado solo
 * por nombres claramente sintéticos y limpieza al final de cada test.
 *
 * `src/server/storage.ts` ahora lee el nombre del bucket de
 * `TEST_STORAGE_BUCKET` (con "documentos" como default, igual que
 * siempre, para no cambiar nada en producción). Definiendo esa variable
 * en el `.env` de desarrollo — apuntando a un bucket separado, creado a
 * mano desde el panel de Supabase — los tests quedan REALMENTE aislados.
 *
 * Qué falta para el aislamiento completo (no se hizo automáticamente a
 * propósito — crear infraestructura en Supabase es un cambio externo,
 * fuera del alcance de este bloque, ver docs/AUDITORIA_MAESTRA_DENSZ.md):
 * 1. Crear un bucket nuevo (ej. "documentos-test"), privado, en el
 *    proyecto de Supabase que ya se usa para TEST_DATABASE_URL
 *    ("Densz-Test") — o en el mismo proyecto de producción si se prefiere
 *    no pagar/mantener Storage en dos proyectos, mientras el NOMBRE sea
 *    distinto al de producción.
 * 2. Definir `TEST_STORAGE_BUCKET=documentos-test` (o el nombre elegido)
 *    en el `.env` local — nunca en Railway/producción.
 *
 * Mientras esa variable no exista, estos tests SIGUEN corriendo (no se
 * quita cobertura que ya existía), pero contra el bucket compartido de
 * siempre — y lo avisan en voz alta (una sola vez por corrida) para que
 * nunca sea un hecho silencioso/accidental.
 */
export const STORAGE_CONFIGURADO = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
export const STORAGE_TEST_AISLADO = Boolean(process.env.TEST_STORAGE_BUCKET);

let avisoImpreso = false;

/** Llamar una vez, al definir el `describe` de cualquier test que toque Storage real. */
export function avisarSiStorageCompartido(): void {
  if (!STORAGE_CONFIGURADO || STORAGE_TEST_AISLADO || avisoImpreso) return;
  avisoImpreso = true;
  // eslint-disable-next-line no-console
  console.warn(
    "\n⚠️  [tests] Storage/PDF: corriendo contra el bucket 'documentos' COMPARTIDO con " +
      "producción (TEST_STORAGE_BUCKET no está definido). Se limpian solos con nombres " +
      "sintéticos, pero no hay aislamiento real todavía. Ver tests/helpers/testStorage.ts " +
      "para dejarlo aislado de verdad.\n"
  );
}
