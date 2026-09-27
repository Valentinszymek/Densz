import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import { obtenerEstadoProteccionWeb, verificarPasswordProteccionWeb } from "../proteccion";
import { bloquearProteccionHttp, marcarDesbloqueoProteccionHttp } from "../session";
import {
  activarProteccion,
  desactivarProteccion,
  cambiarPasswordProteccion,
  generarNuevoCodigoRecuperacion,
  verificarCodigoRecuperacion,
  restablecerPasswordConCodigo
} from "../../main/services/proteccionService";
import { requireAuth, type RequestConSesion } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISOS } from "../../shared/constants/permisos";
import { traducirErrorPostgres } from "../../main/utils/errors";

const esquemaPassword = z.string().min(1);

/**
 * Infraestructura para el desbloqueo por sesión de Cuentas/Estadísticas
 * (GET /estado, POST /verificar — ver src/server/proteccion.ts), más
 * (Fase 10C) la administración de la protección en sí: activar, desactivar,
 * cambiar contraseña, generar/verificar/usar código de recuperación, y
 * bloquear a mitad de sesión. Estas últimas reutilizan exactamente
 * src/main/services/proteccionService.ts — la misma lógica que ya usa
 * Desktop por IPC (proteccion.ipc.ts) — sin reescribirla. La única
 * diferencia real es CÓMO se registra el desbloqueo resultante: en vez del
 * flag de módulo global de proteccionService.ts (pensado para un único
 * proceso Electron), se marca por sesión HTTP vía session.ts —
 * `marcarDesbloqueoProteccionHttp(sesionId)` — igual patrón que
 * verificarPasswordProteccionWeb() en proteccion.ts. La llamada interna a
 * `marcarDesbloqueado()` dentro de activarProteccion/restablecerPasswordConCodigo
 * sigue ocurriendo (es parte de esa función reutilizada), pero es inerte en
 * este proceso: ningún código del servidor web lee ese flag global.
 */
export function crearRouterProteccion(db: Pool): Router {
  const router = Router();
  router.use(requireAuth);

  // Candado compartido para VER — cualquier usuario con sesión iniciada,
  // no una función administrativa (mismo criterio que proteccion.ipc.ts).
  router.get("/estado", async (_req, res) => {
    res.json(await obtenerEstadoProteccionWeb(db));
  });

  router.post("/verificar", async (req, res) => {
    try {
      const password = esquemaPassword.parse(req.body.password);
      const { sesionId } = req as RequestConSesion;
      const ok = await verificarPasswordProteccionWeb(db, password, sesionId);
      res.json({ ok });
    } catch {
      res.status(400).json({ error: "Falta la contraseña." });
    }
  });

  // Vuelve a exigir la contraseña para ESTA sesión — lo llama
  // <ProteccionGuard> cada vez que se sale de Cuentas/Estadísticas. Sin
  // permiso especial, igual que PROTECCION_BLOQUEAR en Desktop.
  router.post("/bloquear", (req, res) => {
    const { sesionId } = req as RequestConSesion;
    bloquearProteccionHttp(sesionId);
    res.json({ ok: true });
  });

  // A partir de acá, administración de la protección en sí — restringida
  // al Administrador (mismo permiso exacto que exige proteccion.ipc.ts
  // en cada uno de estos canales: PERMISOS.CONFIGURACION_EDITAR).
  router.use(requirePermission(PERMISOS.CONFIGURACION_EDITAR));

  router.post("/activar", async (req, res) => {
    try {
      const esquema = z.object({ password: esquemaPassword, confirmarPassword: esquemaPassword });
      const validado = esquema.parse(req.body);
      const { sesion, sesionId } = req as RequestConSesion;
      const resultado = await activarProteccion(db, { ...validado, usuarioId: sesion.usuarioId });
      marcarDesbloqueoProteccionHttp(sesionId);
      res.json(resultado);
    } catch (err) {
      res.status(400).json({ error: traducirErrorPostgres(err).message });
    }
  });

  router.post("/desactivar", async (req, res) => {
    try {
      const passwordActual = esquemaPassword.parse(req.body.passwordActual);
      const { sesion } = req as RequestConSesion;
      await desactivarProteccion(db, { passwordActual, usuarioId: sesion.usuarioId });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: traducirErrorPostgres(err).message });
    }
  });

  router.post("/cambiar-password", async (req, res) => {
    try {
      const esquema = z.object({
        passwordActual: esquemaPassword,
        passwordNueva: esquemaPassword,
        confirmarNueva: esquemaPassword
      });
      const validado = esquema.parse(req.body);
      const { sesion } = req as RequestConSesion;
      await cambiarPasswordProteccion(db, { ...validado, usuarioId: sesion.usuarioId });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: traducirErrorPostgres(err).message });
    }
  });

  router.post("/generar-codigo", async (req, res) => {
    try {
      const { sesion } = req as RequestConSesion;
      const resultado = await generarNuevoCodigoRecuperacion(db, { usuarioId: sesion.usuarioId });
      res.json(resultado);
    } catch (err) {
      res.status(400).json({ error: traducirErrorPostgres(err).message });
    }
  });

  router.post("/verificar-codigo", async (req, res) => {
    try {
      const codigo = esquemaPassword.parse(req.body.codigo);
      const ok = await verificarCodigoRecuperacion(db, codigo);
      res.json({ ok });
    } catch (err) {
      res.status(400).json({ error: traducirErrorPostgres(err).message });
    }
  });

  router.post("/restablecer-con-codigo", async (req, res) => {
    try {
      const esquema = z.object({
        codigo: esquemaPassword,
        passwordNueva: esquemaPassword,
        confirmarNueva: esquemaPassword
      });
      const validado = esquema.parse(req.body);
      const { sesion, sesionId } = req as RequestConSesion;
      const resultado = await restablecerPasswordConCodigo(db, { ...validado, usuarioId: sesion.usuarioId });
      marcarDesbloqueoProteccionHttp(sesionId);
      res.json(resultado);
    } catch (err) {
      res.status(400).json({ error: traducirErrorPostgres(err).message });
    }
  });

  return router;
}
