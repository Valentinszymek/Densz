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
import { openDatabase, checkConnection } from "../main/db/connection";
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
import { crearRouterCuentas } from "./routes/cuentas.route";
import { crearRouterComprobantes } from "./routes/comprobantes.route";
import { crearRouterEstadisticas } from "./routes/estadisticas.route";
import { crearRouterExport } from "./routes/export.route";

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
  app.use("/cuentas", crearRouterCuentas(pool));
  app.use("/comprobantes", crearRouterComprobantes(pool));
  app.use("/estadisticas", crearRouterEstadisticas(pool));
  app.use("/export", crearRouterExport(pool));

  // Red de seguridad centralizada (corrección post-auditoría §23.7/§38.2):
  // debe ir DESPUÉS de montar todos los routers (Express la reconoce como
  // error-handler solo por tener 4 parámetros). Ver src/server/middleware/errorHandler.ts.
  app.use(errorHandler);

  app.listen(PUERTO, () => {
    // eslint-disable-next-line no-console
    console.log(`Servidor Densz escuchando en http://localhost:${PUERTO}`);
  });
}

main().catch((err) => {
  console.error("No se pudo iniciar el servidor:", err);
  process.exit(1);
});
