import Stripe from "stripe";
import { MercadoPagoConfig, PreApproval, WebhookSignatureValidator, InvalidWebhookSignatureError } from "mercadopago";
import type { Queryable } from "../db/types";
import { obtenerPlanComercial, type PlanId } from "../../shared/constants/planes";
import {
  actualizarFacturacionLaboratorio,
  buscarLaboratorioPorSuscripcion,
  obtenerFacturacionLaboratorio
} from "../db/repositories/laboratoriosRepo";
import { DenszError } from "../utils/errors";
import { logger } from "../utils/logger";

/**
 * Integración de pagos (docs/PLAN_COMERCIAL_DENSZ.md §6-7): Mercado Pago
 * para suscripciones en ARS, Stripe para USD — decisión tomada después de
 * investigar que ningún proveedor único confirma soporte verificado para
 * cobrar en los dos casos desde una empresa radicada en Argentina.
 *
 * Nunca se confía en un monto que mande el cliente: `obtenerPlanComercial`
 * (shared/constants/planes.ts) es la única fuente de precios, tanto acá
 * como en la landing — el checkout siempre recalcula el monto él mismo.
 */

function clienteStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new DenszError("Los pagos en dólares no están configurados todavía. Contactá al administrador de Densz.");
  }
  return new Stripe(secretKey);
}

function clienteMercadoPago(): MercadoPagoConfig {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    throw new DenszError("Los pagos en pesos no están configurados todavía. Contactá al administrador de Densz.");
  }
  return new MercadoPagoConfig({ accessToken });
}

export interface InicioCheckout {
  laboratorioId: number;
  planId: PlanId;
  moneda: "ARS" | "USD";
  email: string;
  /** Origen de la web (ej. https://densz.vercel.app) — para armar las URLs de vuelta. */
  origenWeb: string;
}

/** Crea el checkout de suscripción en el proveedor correspondiente a la
 * moneda elegida y devuelve la URL a la que redirigir al navegador. No
 * activa la suscripción todavía — eso lo hace el webhook cuando el
 * proveedor confirma el pago (ver procesarWebhookMercadoPago/Stripe). */
export async function crearCheckout(db: Queryable, datos: InicioCheckout): Promise<{ url: string }> {
  const plan = obtenerPlanComercial(datos.planId);
  if (!plan) throw new DenszError("Plan desconocido.");

  if (datos.moneda === "ARS") {
    const config = clienteMercadoPago();
    const preapproval = new PreApproval(config);
    const resultado = await preapproval.create({
      body: {
        reason: `${plan.nombre} — Densz`,
        payer_email: datos.email,
        external_reference: `laboratorio:${datos.laboratorioId}:plan:${datos.planId}`,
        back_url: `${datos.origenWeb}/#/configuracion?suscripcion=mp`,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: plan.precioArs,
          currency_id: "ARS"
        }
      }
    });
    if (!resultado.init_point || !resultado.id) {
      throw new DenszError("Mercado Pago no devolvió un link de pago válido.");
    }
    // Guarda el id de la preapproval YA (antes de que la persona la
    // autorice) para que el webhook pueda encontrar el laboratorio por
    // `mercadopago_subscription_id` apenas llegue la notificación.
    await actualizarFacturacionLaboratorio(db, datos.laboratorioId, {
      monedaFacturacion: "ARS",
      mercadopagoSubscriptionId: resultado.id
    });
    return { url: resultado.init_point };
  }

  const stripe = clienteStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: datos.email,
    client_reference_id: String(datos.laboratorioId),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          recurring: { interval: "month" },
          unit_amount: Math.round(plan.precioUsd * 100),
          product_data: { name: `${plan.nombre} — Densz` }
        }
      }
    ],
    metadata: { laboratorioId: String(datos.laboratorioId), plan: datos.planId },
    success_url: `${datos.origenWeb}/#/configuracion?suscripcion=exito`,
    cancel_url: `${datos.origenWeb}/#/configuracion?suscripcion=cancelado`
  });
  if (!session.url) throw new DenszError("Stripe no devolvió un link de pago válido.");
  await actualizarFacturacionLaboratorio(db, datos.laboratorioId, { monedaFacturacion: "USD" });
  return { url: session.url };
}

/** Cancela la suscripción activa (en el proveedor que corresponda) y
 * refleja el estado al toque — el webhook más tarde confirma lo mismo,
 * así que es seguro que ambos caminos escriban 'canceled'. */
export async function cancelarSuscripcion(db: Queryable, laboratorioId: number): Promise<void> {
  const info = await obtenerFacturacionLaboratorio(db, laboratorioId);
  if (!info) throw new DenszError("Laboratorio no encontrado.");
  if (info.exentoFacturacion) {
    throw new DenszError("Este laboratorio no tiene una suscripción paga para cancelar.");
  }

  if (info.mercadopagoSubscriptionId) {
    const config = clienteMercadoPago();
    const preapproval = new PreApproval(config);
    await preapproval.update({ id: info.mercadopagoSubscriptionId, body: { status: "cancelled" } });
  } else if (info.stripeSubscriptionId) {
    const stripe = clienteStripe();
    await stripe.subscriptions.cancel(info.stripeSubscriptionId);
  } else {
    throw new DenszError("No encontramos una suscripción activa para cancelar.");
  }

  await actualizarFacturacionLaboratorio(db, laboratorioId, { estadoSuscripcion: "canceled" });
}

function planDesdeExternalReference(ref: string | undefined): PlanId | undefined {
  const match = ref?.match(/plan:(essential|professional)/);
  return match ? (match[1] as PlanId) : undefined;
}

function mapearEstadoMercadoPago(status: string | undefined): string {
  switch (status) {
    case "authorized":
      return "active";
    case "paused":
      return "past_due";
    case "cancelled":
      return "canceled";
    default:
      // 'pending' (todavía no autorizada por el pagador) u otro valor no
      // documentado: nunca se asume activo.
      return "past_due";
  }
}

/** Procesa una notificación de Mercado Pago (`POST /billing/webhook/mercadopago`)
 * — verifica la firma con el validador oficial del SDK (nunca un HMAC
 * hecho a mano) antes de tocar cualquier dato. Solo reacciona a eventos de
 * tipo `subscription_preapproval`; cualquier otro tipo se ignora (ver
 * notas de la Fase 1 sobre qué eventos importan acá). */
export async function procesarWebhookMercadoPago(
  db: Queryable,
  opts: {
    tipo: string | undefined;
    xSignature: string | undefined;
    xRequestId: string | undefined;
    dataId: string | undefined;
  }
): Promise<void> {
  if (opts.tipo !== "subscription_preapproval") return;

  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("Webhook de Mercado Pago recibido pero falta MERCADOPAGO_WEBHOOK_SECRET en el servidor — se ignora.");
    return;
  }

  try {
    WebhookSignatureValidator.validate({
      xSignature: opts.xSignature,
      xRequestId: opts.xRequestId,
      dataId: opts.dataId,
      secret,
      toleranceSeconds: 300
    });
  } catch (err) {
    if (err instanceof InvalidWebhookSignatureError) {
      logger.error(`Firma de webhook de Mercado Pago inválida (${err.reason}) — se rechaza.`);
      throw new DenszError("Firma inválida.");
    }
    throw err;
  }

  if (!opts.dataId) return;

  const config = clienteMercadoPago();
  const preapproval = new PreApproval(config);
  const suscripcion = await preapproval.get({ id: opts.dataId });

  const laboratorioId = await buscarLaboratorioPorSuscripcion(db, "mercadopago_subscription_id", opts.dataId);
  if (!laboratorioId) {
    logger.error(`Webhook de Mercado Pago: no se encontró ningún laboratorio para la suscripción ${opts.dataId}.`);
    return;
  }

  const estado = mapearEstadoMercadoPago(suscripcion.status);
  await actualizarFacturacionLaboratorio(db, laboratorioId, {
    estadoSuscripcion: estado,
    plan: estado === "active" ? planDesdeExternalReference(suscripcion.external_reference) : undefined
  });
}

function mapearEstadoStripe(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "past_due";
  }
}

/** Procesa un evento de Stripe (`POST /billing/webhook/stripe`) — body
 * CRUDO sin parsear (ver server/index.ts, tiene que registrarse con
 * express.raw ANTES del express.json global) porque `constructEvent`
 * necesita los bytes exactos para validar la firma. */
export async function procesarWebhookStripe(db: Queryable, rawBody: Buffer, signature: string | undefined): Promise<void> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error("Webhook de Stripe recibido pero falta STRIPE_WEBHOOK_SECRET en el servidor — se ignora.");
    return;
  }

  const stripe = clienteStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature ?? "", webhookSecret);
  } catch (err) {
    logger.error("Firma de webhook de Stripe inválida — se rechaza.", err);
    throw new DenszError("Firma inválida.");
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const laboratorioId = session.client_reference_id ? Number(session.client_reference_id) : null;
      const plan = session.metadata?.plan as PlanId | undefined;
      if (!laboratorioId || !session.customer || !session.subscription) break;
      await actualizarFacturacionLaboratorio(db, laboratorioId, {
        estadoSuscripcion: "active",
        plan,
        stripeCustomerId: String(session.customer),
        stripeSubscriptionId: String(session.subscription)
      });
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const laboratorioId = await buscarLaboratorioPorSuscripcion(db, "stripe_subscription_id", subscription.id);
      if (!laboratorioId) break;
      const estado = event.type === "customer.subscription.deleted" ? "canceled" : mapearEstadoStripe(subscription.status);
      await actualizarFacturacionLaboratorio(db, laboratorioId, { estadoSuscripcion: estado });
      break;
    }
    default:
      break;
  }
}
