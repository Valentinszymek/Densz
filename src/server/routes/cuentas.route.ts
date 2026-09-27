import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import {
  obtenerSaldos,
  obtenerSaldosClinica,
  listarMovimientos,
  listarMovimientosClinica,
  listarSaldosTodos,
  listarSaldosClinicasTodas,
  tienePagosRegistrados
} from "../../main/db/repositories/movimientosRepo";
import { listarResumenesMensuales } from "../../main/db/repositories/resumenesMensualesRepo";
import { calcularBloquesMes } from "../../main/services/cuentaService";
import { registrarAuditoria } from "../../main/db/repositories/auditoriaRepo";
import { traducirErrorPostgres } from "../../main/utils/errors";
import { PERMISOS } from "../../shared/constants/permisos";
import { requireAuth, type RequestConSesion } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { requireProteccion } from "../middleware/requireProteccion";
import { generarResumenOdontologoWeb, generarResumenClinicaWeb, descargarPdfResumenWeb } from "../cuentasWeb";

const esquemaId = z.coerce.number().int().positive();
const esquemaPeriodo = z.object({
  anio: z.coerce.number().int().positive(),
  mes: z.coerce.number().int().min(1).max(12)
});

/**
 * Equivalente de src/main/ipc/cuentas.ipc.ts (Cuentas). Reutiliza sin
 * modificar movimientosRepo.ts/resumenesMensualesRepo.ts/cuentaService.ts
 * — el saldo SIEMPRE se lee de las vistas v_saldo_odontologo_moneda /
 * v_saldo_clinica_moneda (derivadas de movimientos_cuenta), nunca se
 * calcula de otra forma ni se guarda en un campo editable.
 *
 * PERMISOS — revisado antes de implementar: todos los canales de
 * cuentas.ipc.ts exigen requerirPermiso(PERMISOS.CUENTAS_VER) +
 * requerirDesbloqueoProteccion(db), EXCEPTO CUENTAS_TIENE_PAGOS (líneas
 * 32-38 del IPC), que a propósito no tiene ninguno de los dos — es un
 * booleano usado por Nuevo Trabajo, no "entrar a Cuentas". Se repite
 * exactamente esa diferencia acá, documentada, sin inventar nada nuevo.
 *
 * PROTECCIÓN — usa requireProteccion (src/server/middleware/requireProteccion.ts),
 * que consulta el desbloqueo POR SESIÓN de cookie (src/server/proteccion.ts +
 * session.ts) — nunca un estado global compartido entre navegadores. No se
 * tocó proteccionService.ts del escritorio.
 */
export function crearRouterCuentas(db: Pool): Router {
  const router = Router();
  router.use(requireAuth);

  // Sin permiso ni protección — igual que CUENTAS_TIENE_PAGOS hoy.
  router.get("/tiene-pagos", async (req, res) => {
    const odontologoId = req.query.odontologoId !== undefined ? esquemaId.parse(req.query.odontologoId) : null;
    const clinicaId = req.query.clinicaId !== undefined ? esquemaId.parse(req.query.clinicaId) : null;
    res.json(await tienePagosRegistrados(db, { odontologoId, clinicaId }));
  });

  const requiereCuentas = [requirePermission(PERMISOS.CUENTAS_VER), requireProteccion(db)];

  router.get("/saldos", ...requiereCuentas, async (_req, res) => {
    res.json(await listarSaldosTodos(db));
  });

  router.get("/saldos/clinicas", ...requiereCuentas, async (_req, res) => {
    res.json(await listarSaldosClinicasTodas(db));
  });

  router.get("/clinica/:clinicaId/saldos", ...requiereCuentas, async (req, res) => {
    try {
      const clinicaId = esquemaId.parse(req.params.clinicaId);
      res.json(await obtenerSaldosClinica(db, clinicaId));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/clinica/:clinicaId/movimientos", ...requiereCuentas, async (req, res) => {
    try {
      const clinicaId = esquemaId.parse(req.params.clinicaId);
      res.json(await listarMovimientosClinica(db, clinicaId));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/clinica/:clinicaId/resumen-mes", ...requiereCuentas, async (req, res) => {
    try {
      const clinicaId = esquemaId.parse(req.params.clinicaId);
      const periodo = esquemaPeriodo.parse(req.query);
      res.json(await calcularBloquesMes(db, { odontologoId: null, clinicaId }, periodo.anio, periodo.mes));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/clinica/:clinicaId/resumenes", ...requiereCuentas, async (req, res) => {
    try {
      const clinicaId = esquemaId.parse(req.params.clinicaId);
      res.json(await listarResumenesMensuales(db, { odontologoId: null, clinicaId }));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  // Genera el resumen mensual de una clínica: reutiliza cuentaService.ts
  // tal cual (numera/graba resumenes_mensuales dentro de una transacción,
  // igual que el escritorio) y sube el PDF a Storage vía cuentasWeb.ts
  // (Fase 8D) — mismo patrón que Comprobantes.
  router.post("/clinica/:clinicaId/generar-resumen", ...requiereCuentas, async (req, res) => {
    try {
      const clinicaId = esquemaId.parse(req.params.clinicaId);
      const periodo = esquemaPeriodo.parse(req.body);
      const usuarioId = (req as unknown as RequestConSesion).sesion.usuarioId;
      const resumenes = await generarResumenClinicaWeb(db, clinicaId, periodo.anio, periodo.mes, usuarioId);
      await registrarAuditoria(db, {
        usuarioId,
        accion: "generar_resumen_mensual",
        entidad: "clinicas",
        entidadId: clinicaId,
        detalle: { anio: periodo.anio, mes: periodo.mes, resumenIds: resumenes.map((r) => r.id) }
      });
      res.status(201).json(resumenes);
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/:odontologoId/saldos", ...requiereCuentas, async (req, res) => {
    try {
      const odontologoId = esquemaId.parse(req.params.odontologoId);
      res.json(await obtenerSaldos(db, odontologoId));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/:odontologoId/movimientos", ...requiereCuentas, async (req, res) => {
    try {
      const odontologoId = esquemaId.parse(req.params.odontologoId);
      res.json(await listarMovimientos(db, odontologoId));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/:odontologoId/resumen-mes", ...requiereCuentas, async (req, res) => {
    try {
      const odontologoId = esquemaId.parse(req.params.odontologoId);
      const periodo = esquemaPeriodo.parse(req.query);
      res.json(await calcularBloquesMes(db, { odontologoId, clinicaId: null }, periodo.anio, periodo.mes));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/:odontologoId/resumenes", ...requiereCuentas, async (req, res) => {
    try {
      const odontologoId = esquemaId.parse(req.params.odontologoId);
      res.json(await listarResumenesMensuales(db, { odontologoId, clinicaId: null }));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  // Mismo criterio que el de clínica (ver comentario arriba): sube el PDF a
  // Storage vía cuentasWeb.ts (Fase 8D).
  router.post("/:odontologoId/generar-resumen", ...requiereCuentas, async (req, res) => {
    try {
      const odontologoId = esquemaId.parse(req.params.odontologoId);
      const periodo = esquemaPeriodo.parse(req.body);
      const usuarioId = (req as unknown as RequestConSesion).sesion.usuarioId;
      const resumenes = await generarResumenOdontologoWeb(db, odontologoId, periodo.anio, periodo.mes, usuarioId);
      await registrarAuditoria(db, {
        usuarioId,
        accion: "generar_resumen_mensual",
        entidad: "odontologos",
        entidadId: odontologoId,
        detalle: { anio: periodo.anio, mes: periodo.mes, resumenIds: resumenes.map((r) => r.id) }
      });
      res.status(201).json(resumenes);
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  // Descarga el PDF de un resumen ya generado — la ruta del objeto en
  // Storage nunca la elige el cliente: se reconstruye siempre a partir del
  // resumen real (id validado), nunca de un path recibido en el pedido
  // (§8 de Fase 8D). Mismo gate que el resto de Cuentas (permiso +
  // protección), a diferencia de Comprobantes (que no exige ninguno hoy).
  router.get("/resumenes/:id/pdf", ...requiereCuentas, async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      const buffer = await descargarPdfResumenWeb(db, id);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="resumen-${id}.pdf"`);
      res.send(buffer);
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}
