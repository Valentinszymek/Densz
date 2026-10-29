import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Stripe from "stripe";
import crypto from "crypto";
import { createTestDb, crearLaboratorioDePrueba, type TestDb } from "../helpers/testDb";
import {
  crearCheckout,
  cancelarSuscripcion,
  procesarWebhookStripe,
  procesarWebhookMercadoPago
} from "../../src/main/services/billingService";
import { obtenerFacturacionLaboratorio, actualizarFacturacionLaboratorio } from "../../src/main/db/repositories/laboratoriosRepo";

/**
 * Corre contra las cuentas de PRUEBA (test mode) reales de Stripe y Mercado
 * Pago — nunca mockeadas — con las claves de test del `.env` (mismo criterio
 * que `serverStorage.test.ts` contra el bucket real). No mueve plata: crear
 * un checkout, una preapproval o una suscripción de prueba es gratis en
 * ambos proveedores. Si falta alguna clave de test, el `describe.skipIf`
 * de cada bloque lo salta en vez de fallar.
 */

// Nunca correr estos tests con una clave que no sea explícitamente de
// prueba — evita que un .env mal configurado (claves live) termine
// creando suscripciones reales como efecto colateral de correr `npm test`.
// Stripe sí distingue test/live por prefijo ("sk_test_..."); Mercado Pago
// NO (sus access tokens de sandbox también empiezan con "APP_USR-", igual
// que los de producción — confirmado a mano contra el dashboard real el
// 2026-10-29), así que la única forma confiable de saber a qué cuenta
// pertenece un MERCADOPAGO_ACCESS_TOKEN es preguntárselo a la propia API.
const tieneStripe = Boolean(process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) && Boolean(process.env.STRIPE_WEBHOOK_SECRET);

async function esCuentaDePruebaDeMercadoPago(): Promise<boolean> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token || !process.env.MERCADOPAGO_WEBHOOK_SECRET) return false;
  try {
    const respuesta = await fetch("https://api.mercadopago.com/users/me", { headers: { Authorization: `Bearer ${token}` } });
    const datos = (await respuesta.json()) as { nickname?: string };
    // Las cuentas de prueba de Mercado Pago siempre tienen un nickname que
    // empieza con "TESTUSER" (lo arma MP, no es configurable) — es la única
    // señal real de "esto es sandbox, no la cuenta real del laboratorio".
    return Boolean(datos.nickname?.startsWith("TESTUSER"));
  } catch {
    return false;
  }
}

const tieneMercadoPago = await esCuentaDePruebaDeMercadoPago();

function firmarStripe(payload: string): string {
  return Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET!
  });
}

function firmarMercadoPago(dataId: string, requestId: string, secret = process.env.MERCADOPAGO_WEBHOOK_SECRET!) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hash = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  return { xSignature: `ts=${ts},v1=${hash}`, xRequestId: requestId };
}

describe.skipIf(!tieneStripe)("billingService — Stripe (test mode real)", () => {
  let ctx: TestDb;
  let stripe: Stripe;

  beforeEach(async () => {
    ctx = await createTestDb();
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  it("USD crea una sesión de checkout real y guarda la moneda de facturación", async () => {
    const { db, laboratorioId } = ctx;
    const resultado = await crearCheckout(db, {
      laboratorioId,
      planId: "essential",
      moneda: "USD",
      email: "test@example.com",
      origenWeb: "http://localhost:5174"
    });

    expect(resultado.url).toContain("checkout.stripe.com");
    const facturacion = await obtenerFacturacionLaboratorio(db, laboratorioId);
    expect(facturacion?.monedaFacturacion).toBe("USD");
  });

  it("plan desconocido: tira un error claro sin llamar a Stripe", async () => {
    const { db, laboratorioId } = ctx;
    await expect(
      crearCheckout(db, { laboratorioId, planId: "inexistente" as never, moneda: "USD", email: "a@b.com", origenWeb: "http://x" })
    ).rejects.toThrow("Plan desconocido");
  });

  it("checkout.session.completed activa la suscripción y guarda los ids de Stripe", async () => {
    const { db, laboratorioId } = ctx;
    const payload = JSON.stringify({
      id: "evt_test_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_fake",
          client_reference_id: String(laboratorioId),
          customer: "cus_test_fake",
          subscription: "sub_test_fake",
          metadata: { laboratorioId: String(laboratorioId), plan: "professional" }
        }
      }
    });

    await procesarWebhookStripe(db, Buffer.from(payload), firmarStripe(payload));

    const facturacion = await obtenerFacturacionLaboratorio(db, laboratorioId);
    expect(facturacion?.estadoSuscripcion).toBe("active");
    expect(facturacion?.plan).toBe("professional");
    expect(facturacion?.stripeCustomerId).toBe("cus_test_fake");
    expect(facturacion?.stripeSubscriptionId).toBe("sub_test_fake");
  });

  it("customer.subscription.updated refleja el estado (past_due) en el laboratorio correspondiente", async () => {
    const { db, laboratorioId } = ctx;
    await actualizarFacturacionLaboratorio(db, laboratorioId, { stripeSubscriptionId: "sub_test_update" });

    const payload = JSON.stringify({
      id: "evt_test_update",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_test_update", status: "past_due" } }
    });
    await procesarWebhookStripe(db, Buffer.from(payload), firmarStripe(payload));

    const facturacion = await obtenerFacturacionLaboratorio(db, laboratorioId);
    expect(facturacion?.estadoSuscripcion).toBe("past_due");
  });

  it("customer.subscription.deleted cancela la suscripción", async () => {
    const { db, laboratorioId } = ctx;
    await actualizarFacturacionLaboratorio(db, laboratorioId, { stripeSubscriptionId: "sub_test_delete" });

    const payload = JSON.stringify({
      id: "evt_test_delete",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_test_delete", status: "canceled" } }
    });
    await procesarWebhookStripe(db, Buffer.from(payload), firmarStripe(payload));

    const facturacion = await obtenerFacturacionLaboratorio(db, laboratorioId);
    expect(facturacion?.estadoSuscripcion).toBe("canceled");
  });

  it("firma inválida: rechaza el webhook sin tocar el laboratorio", async () => {
    const { db, laboratorioId } = ctx;
    const payload = JSON.stringify({
      id: "evt_test_bad_sig",
      type: "checkout.session.completed",
      data: { object: { id: "cs_x", client_reference_id: String(laboratorioId), customer: "cus_x", subscription: "sub_x" } }
    });

    await expect(procesarWebhookStripe(db, Buffer.from(payload), "t=1,v1=firmainventada")).rejects.toThrow("Firma inválida");

    const facturacion = await obtenerFacturacionLaboratorio(db, laboratorioId);
    expect(facturacion?.stripeSubscriptionId).toBeNull();
  });

  it("cancelarSuscripcion cancela de verdad una suscripción real de Stripe en modo test", async () => {
    const { db, laboratorioId } = ctx;

    const customer = await stripe.customers.create({
      email: "test@example.com",
      payment_method: "pm_card_visa",
      invoice_settings: { default_payment_method: "pm_card_visa" }
    });
    const price = await stripe.prices.create({
      unit_amount: 1900,
      currency: "usd",
      recurring: { interval: "month" },
      product_data: { name: "Densz Essential — test" }
    });
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: price.id }]
    });
    expect(subscription.status).toBe("active");

    await actualizarFacturacionLaboratorio(db, laboratorioId, { stripeSubscriptionId: subscription.id });

    await cancelarSuscripcion(db, laboratorioId);

    const subscriptionCancelada = await stripe.subscriptions.retrieve(subscription.id);
    expect(subscriptionCancelada.status).toBe("canceled");
    const facturacion = await obtenerFacturacionLaboratorio(db, laboratorioId);
    expect(facturacion?.estadoSuscripcion).toBe("canceled");
  });

  it("cancelarSuscripcion: un laboratorio exento no puede cancelar (no tiene nada que cancelar)", async () => {
    const { db, laboratorioId } = ctx;
    await db.query("UPDATE laboratorios SET exento_facturacion = 1 WHERE id = $1", [laboratorioId]);

    await expect(cancelarSuscripcion(db, laboratorioId)).rejects.toThrow("no tiene una suscripción paga");
  });

  it("cancelarSuscripcion: sin ninguna suscripción activa, tira un error claro", async () => {
    const { db, laboratorioId } = ctx;
    await expect(cancelarSuscripcion(db, laboratorioId)).rejects.toThrow("No encontramos una suscripción activa");
  });
});

// Mercado Pago rechaza `back_url` con host `localhost` ("Invalid value for
// back_url, must be a valid URL" — confirmado a mano el 2026-10-29) aunque
// la cuenta sea de sandbox; el dominio real de la web (público, aunque acá
// no se le llegue a pegar) es la única forma de probar `crearCheckout` con
// moneda ARS. Esto es una limitación real de probar en local, no un bug de
// Densz — el flujo real en producción (`densz.vercel.app`) nunca pasa por
// localhost.
const ORIGEN_WEB_PARA_MP = "https://densz.vercel.app";

describe.skipIf(!tieneMercadoPago)("billingService — Mercado Pago (test mode real)", () => {
  let ctx: TestDb;

  beforeEach(async () => {
    ctx = await createTestDb();
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  it("ARS crea una preapproval real y guarda el id de suscripción de Mercado Pago", async () => {
    const { db, laboratorioId } = ctx;
    const resultado = await crearCheckout(db, {
      laboratorioId,
      planId: "professional",
      moneda: "ARS",
      email: "test_user@testuser.com",
      origenWeb: ORIGEN_WEB_PARA_MP
    });

    expect(resultado.url).toContain("mercadopago");
    const facturacion = await obtenerFacturacionLaboratorio(db, laboratorioId);
    expect(facturacion?.monedaFacturacion).toBe("ARS");
    expect(facturacion?.mercadopagoSubscriptionId).toBeTruthy();
  });

  it("subscription_preapproval con firma válida: refleja el estado real que reporta Mercado Pago", async () => {
    const { db, laboratorioId } = ctx;
    const { url: _url } = await crearCheckout(db, {
      laboratorioId,
      planId: "essential",
      moneda: "ARS",
      email: "test_user@testuser.com",
      origenWeb: ORIGEN_WEB_PARA_MP
    });
    const facturacionPrevia = await obtenerFacturacionLaboratorio(db, laboratorioId);
    const preapprovalId = facturacionPrevia!.mercadopagoSubscriptionId!;

    const { xSignature, xRequestId } = firmarMercadoPago(preapprovalId, "req-test-1");
    await procesarWebhookMercadoPago(db, { tipo: "subscription_preapproval", xSignature, xRequestId, dataId: preapprovalId });

    // Una preapproval recién creada todavía no fue autorizada por nadie —
    // su estado real en Mercado Pago es "pending", que este servicio
    // mapea a "past_due" (nunca se asume activo sin confirmación real).
    const facturacion = await obtenerFacturacionLaboratorio(db, laboratorioId);
    expect(facturacion?.estadoSuscripcion).toBe("past_due");
  });

  // La rama "authorized" -> "active" de mapearEstadoMercadoPago (la que
  // importa más: la que de verdad activa una suscripción paga) no tiene un
  // test automatizado acá a propósito — Mercado Pago no tiene forma de
  // autorizar una preapproval por API, solo mediante el checkout real con
  // un comprador humano (ver docs/REPORTE_LANZAMIENTO_COMERCIAL_DENSZ.md,
  // addendum 2026-10-29: se verificó a mano, de punta a punta, en el
  // sandbox — login como Buyer Test User, tarjeta de prueba, confirmación
  // real de Mercado Pago — y la preapproval se canceló después para no
  // dejar un cobro de prueba pendiente). Un test que dependiera de ESA
  // preapproval puntual quedaría roto apenas se cancelara (como pasó acá
  // mismo la primera vez) — por eso la verificación de esa rama queda
  // documentada en el reporte en vez de hardcodeada en un test.

  it("firma inválida: rechaza el webhook sin consultar a Mercado Pago ni tocar el laboratorio", async () => {
    const { db, laboratorioId } = ctx;
    await actualizarFacturacionLaboratorio(db, laboratorioId, { mercadopagoSubscriptionId: "no-deberia-tocarse" });

    await expect(
      procesarWebhookMercadoPago(db, {
        tipo: "subscription_preapproval",
        xSignature: "ts=1,v1=firmainventada",
        xRequestId: "req-x",
        dataId: "no-deberia-tocarse"
      })
    ).rejects.toThrow("Firma inválida");

    const facturacion = await obtenerFacturacionLaboratorio(db, laboratorioId);
    expect(facturacion?.estadoSuscripcion).not.toBe("past_due");
  });

  it("tipo distinto de subscription_preapproval: se ignora sin tocar nada", async () => {
    const { db, laboratorioId } = ctx;
    const estadoPrevio = (await obtenerFacturacionLaboratorio(db, laboratorioId))?.estadoSuscripcion;

    const { xSignature, xRequestId } = firmarMercadoPago("cualquier-id", "req-test-2");
    await procesarWebhookMercadoPago(db, { tipo: "payment", xSignature, xRequestId, dataId: "cualquier-id" });

    const facturacion = await obtenerFacturacionLaboratorio(db, laboratorioId);
    expect(facturacion?.estadoSuscripcion).toBe(estadoPrevio);
  });

  it("cancelarSuscripcion cancela de verdad una preapproval real de Mercado Pago en modo test", async () => {
    const { db, laboratorioId } = ctx;
    await crearCheckout(db, {
      laboratorioId,
      planId: "essential",
      moneda: "ARS",
      email: "test_user@testuser.com",
      origenWeb: ORIGEN_WEB_PARA_MP
    });

    await cancelarSuscripcion(db, laboratorioId);

    const facturacion = await obtenerFacturacionLaboratorio(db, laboratorioId);
    expect(facturacion?.estadoSuscripcion).toBe("canceled");
  });
});

describe("billingService — aislamiento cruzado entre laboratorios", () => {
  let ctx: TestDb;

  beforeEach(async () => {
    ctx = await createTestDb();
  });

  afterEach(async () => {
    await ctx.finalizar();
  });

  it.skipIf(!tieneStripe)("un webhook de Stripe de un laboratorio nunca toca el estado de otro", async () => {
    const { db, laboratorioId } = ctx;
    const otroLaboratorioId = await crearLaboratorioDePrueba(db, "Otro laboratorio");
    await actualizarFacturacionLaboratorio(db, laboratorioId, { stripeSubscriptionId: "sub_mio" });
    await actualizarFacturacionLaboratorio(db, otroLaboratorioId, { stripeSubscriptionId: "sub_otro" });

    const payload = JSON.stringify({
      id: "evt_cruzado",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_mio", status: "past_due" } }
    });
    await procesarWebhookStripe(db, Buffer.from(payload), firmarStripe(payload));

    const miFacturacion = await obtenerFacturacionLaboratorio(db, laboratorioId);
    const otraFacturacion = await obtenerFacturacionLaboratorio(db, otroLaboratorioId);
    expect(miFacturacion?.estadoSuscripcion).toBe("past_due");
    expect(otraFacturacion?.estadoSuscripcion).toBe("active");
  });
});
