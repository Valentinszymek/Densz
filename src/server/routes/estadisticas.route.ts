import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import {
  obtenerKpisPeriodo,
  obtenerResumenOperativo,
  trabajosPorDia,
  ingresosPorOdontologo,
  trabajosPorCategoria,
  obtenerEvolucion,
  rankingOdontologos,
  rankingClinicas,
  prestacionesRanking,
  saldosPendientesTop
} from "../../main/db/repositories/estadisticasRepo";
import { traducirErrorPostgres } from "../../main/utils/errors";
import { PERMISOS } from "../../shared/constants/permisos";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { requireProteccion } from "../middleware/requireProteccion";

const esquemaRango = z.object({
  desde: z.string().min(1),
  hasta: z.string().min(1)
});

/**
 * Equivalente de src/main/ipc/estadisticas.ipc.ts (Estadísticas).
 * Reutiliza estadisticasRepo.ts sin modificarlo — mismas consultas, mismos
 * cálculos, ARS y USD siempre separados (cada repo devuelve un array/mapa
 * por moneda, nunca suma entre monedas ni convierte).
 *
 * Conteo real: el IPC tiene 10 canales, no 9 (se cuentan todos abajo) —
 * ESTADISTICAS_RESUMEN_OPERATIVO es la única excepción sin permiso ni
 * protección (usada por "Inicio", documentado en el propio código del
 * escritorio: nunca devuelve importes). Los otros 9 exigen
 * requerirPermiso(ESTADISTICAS_VER) + requerirDesbloqueoProteccion.
 *
 * PROTECCIÓN: usa requireProteccion (misma infraestructura por sesión ya
 * construida y probada para Cuentas) — nunca un estado global.
 */
export function crearRouterEstadisticas(db: Pool): Router {
  const router = Router();
  router.use(requireAuth);

  // Sin permiso ni protección — igual que ESTADISTICAS_RESUMEN_OPERATIVO hoy.
  router.get("/resumen-operativo", async (req, res) => {
    try {
      const rango = esquemaRango.parse(req.query);
      res.json(await obtenerResumenOperativo(db, rango));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  const requiereEstadisticas = [requirePermission(PERMISOS.ESTADISTICAS_VER), requireProteccion(db)];

  router.get("/kpis", ...requiereEstadisticas, async (req, res) => {
    try {
      const rango = esquemaRango.parse(req.query);
      res.json(await obtenerKpisPeriodo(db, rango));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/trabajos-por-dia", ...requiereEstadisticas, async (req, res) => {
    try {
      const rango = esquemaRango.parse(req.query);
      res.json(await trabajosPorDia(db, rango));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/ingresos-por-odontologo", ...requiereEstadisticas, async (req, res) => {
    try {
      const rango = esquemaRango.parse(req.query);
      res.json(await ingresosPorOdontologo(db, rango));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/trabajos-por-categoria", ...requiereEstadisticas, async (req, res) => {
    try {
      const rango = esquemaRango.parse(req.query);
      res.json(await trabajosPorCategoria(db, rango));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/evolucion", ...requiereEstadisticas, async (req, res) => {
    try {
      const rango = esquemaRango.parse(req.query);
      res.json(await obtenerEvolucion(db, rango));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/ranking-odontologos", ...requiereEstadisticas, async (req, res) => {
    try {
      const rango = esquemaRango.parse(req.query);
      res.json(await rankingOdontologos(db, rango));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/ranking-clinicas", ...requiereEstadisticas, async (req, res) => {
    try {
      const rango = esquemaRango.parse(req.query);
      res.json(await rankingClinicas(db, rango));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/prestaciones-ranking", ...requiereEstadisticas, async (req, res) => {
    try {
      const rango = esquemaRango.parse(req.query);
      res.json(await prestacionesRanking(db, rango));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/saldos-pendientes-top", ...requiereEstadisticas, async (req, res) => {
    try {
      const limite = req.query.limite !== undefined ? z.coerce.number().int().positive().parse(req.query.limite) : 20;
      res.json(await saldosPendientesTop(db, limite));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}
