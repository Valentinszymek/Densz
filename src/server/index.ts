import express from "express";
// Parchea Router para que un handler `async` que rechaza (throw dentro de
// una función async, incluyendo `.parse()` de Zod) llegue SIEMPRE al
// error-handler global de más abajo, en vez de quedar como una promesa
// rechazada sin manejar (Express 4 no hace esto por sí solo — recién lo
// incorpora Express 5). Debe importarse ANTES de crear cualquier router
// (por eso va primero, incluso antes de cookie-parser). Corrección
// post-auditoría (§23.7/§38.2): 5 rutas quedaban colgadas ante un query
// param inválido porque nada capturaba ese rechazo.
import "express-async-errors";
import cookieParser from "cookie-parser";
import { loadEnvFile, getDatabaseUrl } from "../main/utils/appPaths";
import { openDatabase, checkConnection, closeDatabase } from "../main/db/connection";
import { errorHandler } from "./middleware/errorHandler";
import { crearRouterAuth } from "./routes/auth.route";
import { crearRouterOdontologos } from "./routes/odontologos.route";
import { crearRouterClinicas } from "./routes/clinicas.route";
import { crearRouterPacientes } from "./routes/pacientes.route";
import { crearRouterPrecios } from "./routes/precios.route";
import { crearRouterListasPrecio } from "./routes/listasPrecio.route";
import { crearRouterConfig } from "./routes/config.route";
import { crearRouterSearch } from "./routes/search.route";
import { crearRouterSystem } from "./routes/system.route";
import { crearRouterUsuarios } from "./routes/usuarios.route";
import { crearRouterAuditoria } from "./routes/auditoria.route";
import { crearRouterProteccion } from "./routes/proteccion.route";
import { crearRouterTrabajos } from "./routes/trabajos.route";
import { crearRouterPagos } from "./routes/pagos.route";
import { crearRouterDeudas } from "./routes/deudas.route";
import { crearRouterCuentas } from "./routes/cuentas.route";
import { crearRouterComprobantes } from "./routes/comprobantes.route";
import { crearRouterEstadisticas } from "./routes/estadisticas.route";
import { crearRouterExport } from "./routes/export.route";
import { crearRouterLaboratorios } from "./routes/laboratorios.route";
import { crearRouterBilling } from "./routes/billing.route";
import { crearRouterDescargas } from "./routes/descargas.route";
import { procesarWebhookStripe } from "../main/services/billingService";
import { logger } from "../main/utils/logger";

/**
 * Punto de entrada del backend web (Etapa 1 del plan de conversión a web:
 * ver docs/ARQUITECTURA_Y_MIGRACION_WEB.md). Reutiliza sin modificar la
 * misma capa de repositorios/servicios que usa la app de escritorio —
 * este archivo es puramente el "sobre" HTTP nuevo alrededor de esa lógica.
 *
 * No toca nada de src/main/index.ts ni del empaquetado Electron: la app
 * de escritorio sigue funcionando exactamente igual, sin cambios.
 */
loadEnvFile();

// Red de seguridad de último recurso (investigación de estabilidad,
// 2026-11-19) — nunca debería activarse en el camino normal, porque
// express-async-errors (arriba) ya atrapa cualquier rechazo que escape de
// un handler/middleware de Express. Esto cubre lo que quedaría AFUERA de
// eso (una promesa suelta en el arranque, un callback de una librería de
// terceros que no la haga pasar por un handler de Express): antes, nada
// la registraba en ningún lado antes de que Node tirara abajo el proceso
// entero — Railway lo reiniciaba igual, pero sin ningún rastro de POR QUÉ,
// así que una caída real se veía indistinguible de un simple reinicio de
// rutina. Una promesa rechazada sola no implica que el proceso haya
// quedado en un estado roto, así que solo se loguea; una excepción
// sincrónica sin capturar sí puede dejarlo en un estado indefinido —ver
// la documentación de Node— así que ahí se loguea Y se cierra, para que
// Railway levante un proceso nuevo y limpio en vez de seguir en un estado
// desconocido.
process.on("unhandledRejection", (motivo) => {
  logger.error("Promesa rechazada sin manejar (no debería pasar — revisar de dónde vino):", motivo);
});
process.on("uncaughtException", (err) => {
  logger.error("Excepción no capturada — cerrando el proceso para que Railway lo reinicie limpio:", err);
  process.exit(1);
});

// La mayoría de los hosts (Railway incluido) asignan el puerto por la
// variable PORT, no por SERVER_PORT — se prioriza PORT si existe, y
// SERVER_PORT sigue funcionando igual que antes para desarrollo local.
const PUERTO = Number(process.env.PORT ?? process.env.SERVER_PORT ?? 4000);
const ORIGEN_WEB = process.env.WEB_ORIGIN ?? "http://localhost:5174";

async function main(): Promise<void> {
  const pool = openDatabase(getDatabaseUrl());
  const conectado = await checkConnection(pool);
  if (!conectado) {
    console.error("Advertencia: no se pudo confirmar la conexión a Postgres. Revisá DATABASE_URL en .env.");
  }

  const app = express();

  // Webhook de Stripe: tiene que ir ANTES de express.json() con el body
  // CRUDO (express.raw) — stripe.webhooks.constructEvent necesita los
  // bytes exactos tal como los mandó Stripe para validar la firma; una
  // vez que express.json() ya parseó el body a objeto, esa verificación
  // falla de forma intermitente (docs/PLAN_COMERCIAL_DENSZ.md §7).
  app.post("/billing/webhook/stripe", express.raw({ type: "application/json" }), async (req, res) => {
    try {
      await procesarWebhookStripe(pool, req.body as Buffer, req.header("stripe-signature"));
    } catch (err) {
      logger.error("Error procesando webhook de Stripe:", err);
    }
    res.sendStatus(200);
  });

  app.use(express.json());
  app.use(cookieParser());

  // CORS mínimo: un único origen permitido (nunca "*", porque la sesión
  // viaja en una cookie con credentials). El frontend web real (Etapa 3)
  // configura WEB_ORIGIN según dónde corra.
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", ORIGEN_WEB);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get("/health", async (_req, res) => {
    const ok = await checkConnection(pool);
    res.json({ ok });
  });

  // Visibilidad de pedidos lentos (§4 del reporte de estabilidad) — nunca
  // loguea cada pedido (sería puro ruido), solo los que de verdad tardan,
  // que es la señal real para distinguir "una query quedó bloqueada" de
  // "el usuario tiene mala conexión". Nunca incluye body/params, solo
  // método, ruta y duración.
  const UMBRAL_LENTO_MS = 3000;
  app.use((req, res, next) => {
    const inicio = Date.now();
    res.on("finish", () => {
      const duracionMs = Date.now() - inicio;
      if (duracionMs > UMBRAL_LENTO_MS) {
        logger.warn(`Pedido lento: ${req.method} ${req.path} — ${duracionMs}ms (status ${res.statusCode})`);
      }
    });
    next();
  });

  app.use("/auth", crearRouterAuth(pool));
  app.use("/odontologos", crearRouterOdontologos(pool));
  app.use("/clinicas", crearRouterClinicas(pool));
  app.use("/pacientes", crearRouterPacientes(pool));
  app.use("/precios", crearRouterPrecios(pool));
  app.use("/listas-precio", crearRouterListasPrecio(pool));
  app.use("/config", crearRouterConfig(pool));
  app.use("/search", crearRouterSearch(pool));
  app.use("/system", crearRouterSystem(pool));
  app.use("/usuarios", crearRouterUsuarios(pool));
  app.use("/auditoria", crearRouterAuditoria(pool));
  app.use("/proteccion", crearRouterProteccion(pool));
  app.use("/trabajos", crearRouterTrabajos(pool));
  app.use("/pagos", crearRouterPagos(pool));
  app.use("/deudas", crearRouterDeudas(pool));
  app.use("/cuentas", crearRouterCuentas(pool));
  app.use("/comprobantes", crearRouterComprobantes(pool));
  app.use("/estadisticas", crearRouterEstadisticas(pool));
  app.use("/laboratorios", crearRouterLaboratorios(pool));
  app.use("/export", crearRouterExport(pool));
  app.use("/billing", crearRouterBilling(pool));
  app.use("/descargas", crearRouterDescargas());

  // Red de seguridad centralizada (corrección post-auditoría §23.7/§38.2):
  // debe ir DESPUÉS de montar todos los routers (Express la reconoce como
  // error-handler solo por tener 4 parámetros). Ver src/server/middleware/errorHandler.ts.
  app.use(errorHandler);

  const servidor = app.listen(PUERTO, () => {
    // eslint-disable-next-line no-console
    console.log(`Servidor Densz escuchando en http://localhost:${PUERTO}`);
  });

  // Cada deploy a Railway manda SIGTERM al proceso viejo antes de arrancar
  // el nuevo — sin esto, el proceso moría de golpe sin avisarle nunca a
  // Postgres/al pooler de Supabase que esas 10 conexiones quedaban libres,
  // dejándolas como conexiones "zombies" del lado del servidor hasta que
  // el propio TCP keepalive las cortara solo, minutos después. Cerrar el
  // pool a mano en el apagado hace que cada deploy quede prolijo de
  // entrada, en vez de depender de que el otro lado lo note con demora.
  async function apagarProlijo(señal: string): Promise<void> {
    logger.info(`Señal ${señal} recibida — cerrando el pool de Postgres antes de salir.`);
    servidor.close();
    await closeDatabase();
    process.exit(0);
  }
  process.on("SIGTERM", () => void apagarProlijo("SIGTERM"));
  process.on("SIGINT", () => void apagarProlijo("SIGINT"));
}

main().catch((err) => {
  console.error("No se pudo iniciar el servidor:", err);
  process.exit(1);
});
