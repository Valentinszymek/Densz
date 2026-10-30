import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import { login, logout } from "../../main/services/authService";
import { loginConGoogle, registrarseConGoogle } from "../../main/services/googleAuthService";
import { listarUsuariosActivosParaSeleccion } from "../../main/db/repositories/usuariosRepo";
import { traducirErrorPostgres } from "../../main/utils/errors";
import { crearSesionHttp, obtenerSesionHttp, destruirSesionHttp, obtenerIdSesionDeRequest, COOKIE_SESION } from "../session";
import { verificarTokenGoogle } from "../googleAuth";
import {
  estaBloqueadoPorIntentos,
  registrarIntentoFallido,
  limpiarIntentos,
  MENSAJE_BLOQUEADO_POR_INTENTOS
} from "../loginRateLimit";
import { logger } from "../../main/utils/logger";

const esquemaLogin = z.object({
  nombreUsuario: z.string().trim().min(1, "Ingresá tu usuario."),
  password: z.string().min(1, "Ingresá tu contraseña.")
});

const esquemaLoginGoogle = z.object({
  accessToken: z.string().trim().min(1, "Falta el token de Google.")
});

const esquemaRegistroGoogle = z.object({
  accessToken: z.string().trim().min(1, "Falta el token de Google."),
  nombreLaboratorio: z.string().trim().min(1, "Ingresá el nombre de tu laboratorio.")
});

const esProduccion = process.env.NODE_ENV === "production";

// En local, frontend y backend son ambos "localhost" (mismo sitio para el
// navegador aunque el puerto difiera) — "lax" alcanza. En producción,
// frontend (Vercel) y backend (Railway) quedan en dominios distintos, así
// que sin "none" el navegador nunca manda la cookie de sesión en los
// pedidos del frontend al backend. "none" exige "secure" (ya es true en
// producción), si no el navegador la descarta directamente.
const SAME_SITE: "none" | "lax" = esProduccion ? "none" : "lax";

const opcionesCookie = {
  httpOnly: true,
  sameSite: SAME_SITE,
  secure: esProduccion,
  maxAge: 8 * 60 * 60 * 1000
};

/** Rutas HTTP equivalentes a src/main/ipc/auth.ipc.ts, reutilizando la misma lógica de negocio (authService). */
export function crearRouterAuth(db: Pool): Router {
  const router = Router();

  router.post("/login", async (req, res) => {
    try {
      const datos = esquemaLogin.parse(req.body);

      // Corrección post-auditoría (§23.5/§30-D): límite de intentos por
      // usuario, ANTES de tocar la base — mismo mensaje genérico que
      // cualquier otro fallo de login, nunca revela si el usuario existe.
      if (estaBloqueadoPorIntentos(datos.nombreUsuario)) {
        res.status(429).json({ error: MENSAJE_BLOQUEADO_POR_INTENTOS });
        return;
      }

      try {
        const sesion = await login(db, datos.nombreUsuario, datos.password);
        limpiarIntentos(datos.nombreUsuario); // login correcto: nunca queda penalizado por errores previos
        const idSesion = crearSesionHttp(sesion);
        res.cookie(COOKIE_SESION, idSesion, opcionesCookie);
        // `sesionId` en el cuerpo, además de la cookie: la web lo ignora
        // (sigue usando solo la cookie); el escritorio no tiene cookie-jar
        // en su proceso principal de Node, así que lo guarda y lo manda
        // como `Authorization: Bearer <sesionId>` de ahí en más.
        res.json({ ...sesion, sesionId: idSesion });
      } catch (errLogin) {
        registrarIntentoFallido(datos.nombreUsuario);
        throw errLogin;
      }
    } catch (err) {
      logger.error("Error en POST /auth/login:", err);
      const error = traducirErrorPostgres(err);
      res.status(401).json({ error: error.message });
    }
  });

  // Login con Google (plan multi-laboratorio) — el frontend ya hizo todo
  // el intercambio con Supabase Auth y llega acá solo con el access
  // token; este endpoint lo revalida contra Supabase (nunca confía en lo
  // que mande el navegador) y recién ahí busca/vincula el usuario de
  // Densz correspondiente. Mismo límite de intentos por... acá no aplica
  // "nombreUsuario" (no se sabe todavía a quién pertenece un token
  // inválido) — el propio rate limit de Supabase Auth ya cubre intentos
  // de login con Google mal habidos antes de llegar a este endpoint.
  router.post("/google-callback", async (req, res) => {
    try {
      const { accessToken } = esquemaLoginGoogle.parse(req.body);
      const identidad = await verificarTokenGoogle(accessToken);
      const sesion = await loginConGoogle(db, identidad);
      const idSesion = crearSesionHttp(sesion);
      res.cookie(COOKIE_SESION, idSesion, opcionesCookie);
      // Ver comentario de /login: sesionId también en el cuerpo, para el
      // escritorio (bearer token) — la web sigue usando solo la cookie.
      res.json({ ...sesion, sesionId: idSesion });
    } catch (err) {
      // Este catch responde con su propio 401 (nunca pasa por el
      // errorHandler global, que ya loguea) — sin esto, un fallo real acá
      // queda invisible en los logs de Railway (confirmado en vivo:
      // 2026-10-19, el login con Google en la web fallaba y no dejaba
      // ningún rastro server-side).
      logger.error("Error en POST /auth/google-callback:", err);
      const error = traducirErrorPostgres(err);
      res.status(401).json({ error: error.message });
    }
  });

  // Alta de laboratorio nuevo ("Crear mi laboratorio") — mismo chequeo de
  // token que /google-callback; si la identidad ya pertenece a un
  // laboratorio existente, registrarseConGoogle no duplica nada, loguea
  // directo (ver googleAuthService.ts).
  router.post("/google-register", async (req, res) => {
    try {
      const { accessToken, nombreLaboratorio } = esquemaRegistroGoogle.parse(req.body);
      const identidad = await verificarTokenGoogle(accessToken);
      const sesion = await registrarseConGoogle(db, identidad, nombreLaboratorio);
      const idSesion = crearSesionHttp(sesion);
      res.cookie(COOKIE_SESION, idSesion, opcionesCookie);
      // Ver comentario de /login: sesionId también en el cuerpo, para el
      // escritorio (bearer token) — la web sigue usando solo la cookie.
      res.json({ ...sesion, sesionId: idSesion });
    } catch (err) {
      logger.error("Error en POST /auth/google-register:", err);
      const error = traducirErrorPostgres(err);
      res.status(401).json({ error: error.message });
    }
  });

  router.post("/logout", async (req, res) => {
    const idSesion = obtenerIdSesionDeRequest(req);
    const sesion = obtenerSesionHttp(idSesion);
    if (sesion) {
      await logout(db, sesion.usuarioId);
      destruirSesionHttp(idSesion);
    }
    // Mismos atributos que al crearla (sameSite/secure) — si no coinciden,
    // algunos navegadores no la reconocen como la misma cookie y no la
    // borran. Inofensivo para el escritorio (que no tiene esa cookie):
    // "borrar una cookie que no existe" no hace nada.
    res.clearCookie(COOKIE_SESION, opcionesCookie);
    res.json({ ok: true });
  });

  router.get("/session", (req, res) => {
    const idSesion = obtenerIdSesionDeRequest(req);
    res.json(obtenerSesionHttp(idSesion));
  });

  // Equivalente de AUTH_USUARIOS_DISPONIBLES (auth.ipc.ts) — se llama ANTES
  // de autenticarse (selector "¿Quién va a utilizar Densz?"), por eso sin
  // requireAuth, igual que el escritorio. El repositorio ya devuelve solo
  // id/usuario/nombre/rol de usuarios activos, nunca nada sensible.
  router.get("/usuarios-disponibles", async (_req, res) => {
    res.json(await listarUsuariosActivosParaSeleccion(db));
  });

  return router;
}
