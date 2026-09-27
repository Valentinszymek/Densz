import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import { login, logout } from "../../main/services/authService";
import { listarUsuariosActivosParaSeleccion } from "../../main/db/repositories/usuariosRepo";
import { traducirErrorPostgres } from "../../main/utils/errors";
import { crearSesionHttp, obtenerSesionHttp, destruirSesionHttp, COOKIE_SESION } from "../session";

const esquemaLogin = z.object({
  nombreUsuario: z.string().trim().min(1, "Ingresá tu usuario."),
  password: z.string().min(1, "Ingresá tu contraseña.")
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
      const sesion = await login(db, datos.nombreUsuario, datos.password);
      const idSesion = crearSesionHttp(sesion);
      res.cookie(COOKIE_SESION, idSesion, opcionesCookie);
      res.json(sesion);
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(401).json({ error: error.message });
    }
  });

  router.post("/logout", async (req, res) => {
    const idSesion = req.cookies?.[COOKIE_SESION] as string | undefined;
    const sesion = obtenerSesionHttp(idSesion);
    if (sesion) {
      await logout(db, sesion.usuarioId);
      destruirSesionHttp(idSesion);
    }
    // Mismos atributos que al crearla (sameSite/secure) — si no coinciden,
    // algunos navegadores no la reconocen como la misma cookie y no la borran.
    res.clearCookie(COOKIE_SESION, opcionesCookie);
    res.json({ ok: true });
  });

  router.get("/session", (req, res) => {
    const idSesion = req.cookies?.[COOKIE_SESION] as string | undefined;
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
