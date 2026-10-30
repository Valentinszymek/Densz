import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import { getConfig, setConfig } from "../../main/db/repositories/configRepo";
import { registrarAuditoria } from "../../main/db/repositories/auditoriaRepo";
import {
  obtenerTamanoImpresionComprobante,
  guardarTamanoImpresionComprobante
} from "../../main/services/comprobanteService";
import { PERMISOS } from "../../shared/constants/permisos";
import { requireAuth, type RequestConSesion } from "../middleware/requireAuth";
import { requireActiveSubscription } from "../middleware/requireActiveSubscription";
import { attachTenantDb, type RequestConTenantDb } from "../middleware/tenantDb";
import { requirePermission } from "../middleware/requirePermission";

const CLAVE_LABORATORIO_NOMBRE = "laboratorio.nombre";
// Mismo valor de fábrica que src/main/ipc/config.ipc.ts — nunca se muestra
// como si fuera un nombre real elegido por el laboratorio.
const VALOR_DE_FABRICA = "Densz";

/** Equivalente de solo lectura de src/main/ipc/config.ipc.ts (CONFIG_LABORATORIO_OBTENER). */
export function crearRouterConfig(db: Pool): Router {
  const router = Router();
  router.use(requireAuth);
  router.use(requireActiveSubscription);
  router.use(attachTenantDb(db));

  router.get("/laboratorio", requirePermission(PERMISOS.CONFIGURACION_EDITAR), async (_req, res) => {
    const db = (_req as unknown as RequestConTenantDb).db;
    const valor = await getConfig(db, CLAVE_LABORATORIO_NOMBRE);
    res.json(valor && valor.trim() !== VALOR_DE_FABRICA ? valor.trim() : null);
  });

  // Escritura: mismo permiso que la lectura (CONFIGURACION_EDITAR),
  // igual que src/main/ipc/config.ipc.ts línea 26.
  router.put("/laboratorio", requirePermission(PERMISOS.CONFIGURACION_EDITAR), async (req, res) => {
    const db = (req as unknown as RequestConTenantDb).db;
    try {
      const nombre = z.string().trim().min(1, "Ingresá un nombre.").max(100).parse(req.body.nombre);
      await setConfig(db, CLAVE_LABORATORIO_NOMBRE, nombre);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "modificar",
        entidad: "configuracion",
        detalle: { clave: CLAVE_LABORATORIO_NOMBRE, valor: nombre }
      });
      res.json({ ok: true });
    } catch {
      res.status(400).json({ error: "Ingresá un nombre válido (máximo 100 caracteres)." });
    }
  });

  router.get("/tamano-impresion", requirePermission(PERMISOS.CONFIGURACION_EDITAR), async (_req, res) => {
    const db = (_req as unknown as RequestConTenantDb).db;
    res.json(await obtenerTamanoImpresionComprobante(db));
  });

  router.put("/tamano-impresion", requirePermission(PERMISOS.CONFIGURACION_EDITAR), async (req, res) => {
    const db = (req as unknown as RequestConTenantDb).db;
    try {
      const valor = z.enum(["ticket", "a4"]).parse(req.body.valor);
      await guardarTamanoImpresionComprobante(db, valor);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "modificar",
        entidad: "configuracion",
        detalle: { clave: "comprobante.tamanoImpresion", valor }
      });
      res.json({ ok: true });
    } catch {
      res.status(400).json({ error: "Valor inválido." });
    }
  });

  // Única configuración que persiste el escritorio en Postgres hoy
  // (impresoraService.ts): el nombre de la impresora física elegida. Antes
  // se leía/escribía con una conexión local directa; se agrega acá para
  // que el futuro cliente HTTP del escritorio (ver plan de seguridad del
  // escritorio) tenga una ruta equivalente — mismo patrón exacto que
  // /tamano-impresion de arriba.
  router.get("/impresora", requirePermission(PERMISOS.CONFIGURACION_EDITAR), async (_req, res) => {
    const db = (_req as unknown as RequestConTenantDb).db;
    const nombreDispositivo = await getConfig(db, "impresora.nombreDispositivo");
    if (!nombreDispositivo) {
      res.json(null);
      return;
    }
    const nombreVisible = (await getConfig(db, "impresora.nombreVisible")) ?? nombreDispositivo;
    res.json({ nombreDispositivo, nombreVisible });
  });

  router.put("/impresora", requirePermission(PERMISOS.CONFIGURACION_EDITAR), async (req, res) => {
    const db = (req as unknown as RequestConTenantDb).db;
    try {
      const { nombreDispositivo, nombreVisible } = z
        .object({
          nombreDispositivo: z.string().trim().min(1),
          nombreVisible: z.string().trim().min(1)
        })
        .parse(req.body);
      await setConfig(db, "impresora.nombreDispositivo", nombreDispositivo);
      await setConfig(db, "impresora.nombreVisible", nombreVisible);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "seleccionar_impresora",
        entidad: "configuracion",
        detalle: { nombreDispositivo, nombreVisible }
      });
      res.json({ ok: true });
    } catch {
      res.status(400).json({ error: "Datos de impresora inválidos." });
    }
  });

  return router;
}
