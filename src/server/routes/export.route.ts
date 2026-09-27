import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import { generarExportWeb, nombreArchivoSeguro } from "../exportWeb";
import { registrarAuditoria } from "../../main/db/repositories/auditoriaRepo";
import { traducirErrorPostgres } from "../../main/utils/errors";
import { PERMISOS, tienePermiso } from "../../shared/constants/permisos";
import { requireAuth, type RequestConSesion } from "../middleware/requireAuth";

const esquemaTipo = z.enum(["odontologos", "clinicas", "pacientes", "trabajos", "cuenta", "pagos", "estadisticas", "auditoria"]);
const esquemaFormato = z.enum(["csv", "xlsx", "pdf"]);

const esquemaRango = z.object({ desde: z.string(), hasta: z.string() });
const esquemaFiltroAuditoria = z
  .object({
    busqueda: z.string().optional(),
    usuarioId: z.number().int().positive().optional(),
    accion: z.string().optional(),
    entidad: z.string().optional(),
    periodo: z.enum(["todos", "hoy", "ultimos7", "esteMes", "mesAnterior", "ultimos30", "personalizado"]).optional(),
    desde: z.string().optional(),
    hasta: z.string().optional()
  })
  .optional();

const esquemaBody = z.object({
  tipo: esquemaTipo,
  formato: esquemaFormato,
  nombreSugerido: z.string().trim().min(1),
  opciones: z
    .object({
      odontologoId: z.number().int().positive().optional(),
      clinicaId: z.number().int().positive().optional(),
      rango: esquemaRango.optional(),
      filtroAuditoria: esquemaFiltroAuditoria
    })
    .optional()
});

/**
 * Equivalente de src/main/ipc/export.ipc.ts (EXPORT_GENERAR). Reutiliza
 * exportService.ts sin modificar su lógica de datos — mismas columnas,
 * mismos formatos, mismo criterio ARS/USD separado. La única diferencia
 * real es la entrega: ver src/server/exportWeb.ts.
 *
 * Permiso: igual que Desktop — "auditoria" es la única exportación que
 * exige AUDITORIA_VER (información sensible); el resto no exige ningún
 * permiso, mismo comportamiento preexistente, no se toca.
 */
export function crearRouterExport(db: Pool): Router {
  const router = Router();
  router.use(requireAuth);

  router.post("/", async (req, res) => {
    try {
      const { tipo, formato, nombreSugerido, opciones } = esquemaBody.parse(req.body);

      if (tipo === "auditoria") {
        const sesion = (req as unknown as RequestConSesion).sesion;
        if (!tienePermiso(sesion.permisos, PERMISOS.AUDITORIA_VER)) {
          res.status(403).json({ error: "No tenés permiso para realizar esta acción." });
          return;
        }
      }

      const { buffer, contentType } = await generarExportWeb(db, tipo, formato, opciones ?? {});

      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "exportar",
        entidad: tipo,
        detalle: { formato }
      });

      const nombreArchivo = nombreArchivoSeguro(nombreSugerido, formato);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${nombreArchivo}"`);
      res.send(buffer);
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}
