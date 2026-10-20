import type { Queryable } from "../types";
import type { LaboratorioParaAdmin } from "../../../shared/types/entities";

interface FilaLaboratorio {
  id: number;
  nombre: string;
  email_contacto: string;
  plan: string;
  estado_suscripcion: string;
  trial_termina_en: string | null;
  activo: number;
  creado_en: string;
}

function mapear(fila: FilaLaboratorio): LaboratorioParaAdmin {
  return {
    id: fila.id,
    nombre: fila.nombre,
    emailContacto: fila.email_contacto,
    plan: fila.plan,
    estadoSuscripcion: fila.estado_suscripcion,
    trialTerminaEn: fila.trial_termina_en,
    activo: fila.activo === 1,
    creadoEn: fila.creado_en
  };
}

/** Todos los laboratorios registrados en Densz (plan multi-laboratorio) —
 * `laboratorios` no tiene RLS (tiene que ser visible para resolver el
 * login antes de saber el tenant), así que esta consulta SIEMPRE trae
 * todos sin importar la sesión de la conexión. Por eso quien llama a esto
 * tiene que verificar `esSuperAdmin` ANTES — nunca exponerla sin ese
 * chequeo (ver auth.route.ts / laboratorios.ipc.ts). */
export async function listarTodosLosLaboratorios(db: Queryable): Promise<LaboratorioParaAdmin[]> {
  const { rows } = await db.query<FilaLaboratorio>(
    "SELECT id, nombre, email_contacto, plan, estado_suscripcion, trial_termina_en, activo, creado_en FROM laboratorios ORDER BY creado_en DESC"
  );
  return rows.map(mapear);
}
