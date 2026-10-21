import type { Queryable } from "../types";
import type { LaboratorioParaAdmin, InfoFacturacionLaboratorioDto } from "../../../shared/types/entities";

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

interface FilaFacturacion {
  email_contacto: string;
  plan: string;
  estado_suscripcion: string;
  trial_termina_en: string | null;
  moneda_facturacion: string | null;
  exento_facturacion: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  mercadopago_customer_id: string | null;
  mercadopago_subscription_id: string | null;
}

/** Datos de facturación de UN laboratorio — usada para armar la sesión
 * (gating por plan/estado) y por las rutas de `/billing/*`. A diferencia
 * de `listarTodosLosLaboratorios` (exclusiva de superAdmin), esta consulta
 * SÍ pasa por RLS normalmente: solo tiene sentido pedir la del propio
 * laboratorio de la conexión actual. */
export async function obtenerFacturacionLaboratorio(db: Queryable, laboratorioId: number): Promise<InfoFacturacionLaboratorioDto | null> {
  const { rows } = await db.query<FilaFacturacion>(
    `SELECT email_contacto, plan, estado_suscripcion, trial_termina_en, moneda_facturacion, exento_facturacion,
            stripe_customer_id, stripe_subscription_id, mercadopago_customer_id, mercadopago_subscription_id
     FROM laboratorios WHERE id = $1`,
    [laboratorioId]
  );
  const fila = rows[0];
  if (!fila) return null;
  return {
    emailContacto: fila.email_contacto,
    plan: fila.plan,
    estadoSuscripcion: fila.estado_suscripcion,
    trialTerminaEn: fila.trial_termina_en,
    monedaFacturacion: fila.moneda_facturacion as "ARS" | "USD" | null,
    exentoFacturacion: fila.exento_facturacion === 1,
    stripeCustomerId: fila.stripe_customer_id,
    stripeSubscriptionId: fila.stripe_subscription_id,
    mercadopagoCustomerId: fila.mercadopago_customer_id,
    mercadopagoSubscriptionId: fila.mercadopago_subscription_id
  };
}

/** Actualiza el estado de suscripción de un laboratorio — usada por el
 * checkout (fija moneda/proveedor elegido) y por los webhooks de
 * Mercado Pago/Stripe (reflejan el estado real que reporta el proveedor).
 * Todos los campos son opcionales: cada llamado solo toca lo que cambió. */
export async function actualizarFacturacionLaboratorio(
  db: Queryable,
  laboratorioId: number,
  cambios: Partial<{
    plan: string;
    estadoSuscripcion: string;
    monedaFacturacion: "ARS" | "USD";
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    stripePriceId: string;
    mercadopagoCustomerId: string;
    mercadopagoSubscriptionId: string;
  }>
): Promise<void> {
  const columnas: Record<string, string> = {
    plan: "plan",
    estadoSuscripcion: "estado_suscripcion",
    monedaFacturacion: "moneda_facturacion",
    stripeCustomerId: "stripe_customer_id",
    stripeSubscriptionId: "stripe_subscription_id",
    stripePriceId: "stripe_price_id",
    mercadopagoCustomerId: "mercadopago_customer_id",
    mercadopagoSubscriptionId: "mercadopago_subscription_id"
  };
  const sets: string[] = [];
  const valores: unknown[] = [];
  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor === undefined) continue;
    valores.push(valor);
    sets.push(`${columnas[clave]} = $${valores.length}`);
  }
  if (sets.length === 0) return;
  valores.push(laboratorioId);
  await db.query(`UPDATE laboratorios SET ${sets.join(", ")} WHERE id = $${valores.length}`, valores);
}

/** Busca un laboratorio por el id de cliente/suscripción de un proveedor
 * — usada por los webhooks, que identifican al laboratorio por ESE id
 * (nunca por datos que mande el request sin verificar la firma primero).
 * Mira todos los laboratorios sin scoping de tenant, igual que
 * `listarTodosLosLaboratorios` — correcto acá porque quien llama ya
 * verificó la firma criptográfica del proveedor antes de buscar nada. */
export async function buscarLaboratorioPorSuscripcion(
  db: Queryable,
  campo: "stripe_subscription_id" | "stripe_customer_id" | "mercadopago_subscription_id" | "mercadopago_customer_id",
  valor: string
): Promise<number | null> {
  const { rows } = await db.query<{ id: number }>(`SELECT id FROM laboratorios WHERE ${campo} = $1`, [valor]);
  return rows[0]?.id ?? null;
}
