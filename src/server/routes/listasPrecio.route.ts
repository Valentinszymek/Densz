import { Router } from "express";
import { z } from "zod";
import type { Pool } from "pg";
import * as repo from "../../main/db/repositories/listasPrecioRepo";
import { registrarAuditoria } from "../../main/db/repositories/auditoriaRepo";
import { traducirErrorPostgres } from "../../main/utils/errors";
import { requireAuth, type RequestConSesion } from "../middleware/requireAuth";
import { zBooleanQuery } from "../utils/zQuery";
import { generarListaPreciosWeb, descargarListaPreciosWeb } from "../listaPreciosWeb";

const esquemaId = z.coerce.number().int().positive();
const esquemaLista = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio."),
  moneda: z.enum(["ARS", "USD"])
});
const esquemaPrecio = z.number().int().nonnegative("El precio no puede ser negativo.");
// Mismo esquema exacto que src/main/ipc/listaPrecios.ipc.ts (esquemaOpciones).
const esquemaOpcionesPdf = z.object({
  listaId: z.number().int().positive().optional(),
  odontologoId: z.number().int().positive().optional()
});

/** Equivalente de solo lectura de src/main/ipc/listasPrecio.ipc.ts. */
export function crearRouterListasPrecio(db: Pool): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    try {
      const soloActivas = zBooleanQuery.parse(req.query.soloActivas as string | undefined);
      res.json(await repo.listarListas(db, soloActivas));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  // Registradas ANTES de "/:id" a propósito: "/pdf" nunca debe matchear el
  // parámetro genérico :id (Express prueba las rutas en orden).
  //
  // Genera el PDF (Bloque 2 / Parte C) — puramente informativo, no crea
  // ningún registro en la base. Reutiliza generarListaPreciosPdf() sin
  // modificarla; el PDF se sube a Storage (bucket "documentos", prefijo
  // "listas-precio/") vía src/server/listaPreciosWeb.ts, mismo patrón que
  // Comprobantes/Cuentas. Sin permiso, igual que listaPrecios.ipc.ts hoy.
  router.post("/pdf", async (req, res) => {
    try {
      const opciones = esquemaOpcionesPdf.parse(req.body);
      const resultado = await generarListaPreciosWeb(db, opciones);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "generar",
        entidad: "lista_precios",
        detalle: opciones
      });
      res.json(resultado);
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  // Descarga autenticada — el `path` recibido nunca se usa "tal cual" sin
  // validar: descargarListaPreciosWeb() lo rechaza si no tiene exactamente
  // la forma "listas-precio/<uuid>.pdf" (ver comentario en
  // listaPreciosWeb.ts), así que no acepta un path arbitrario del bucket.
  router.get("/pdf", async (req, res) => {
    try {
      const pdfPath = z.string().trim().min(1).parse(req.query.path);
      const buffer = await descargarListaPreciosWeb(pdfPath);
      res.setHeader("Content-Type", "application/pdf");
      res.send(buffer);
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/:id", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      res.json(await repo.obtenerLista(db, id));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/:id/uso", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      res.json(await repo.contarUsoLista(db, id));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/:id/items", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      const soloActivas = zBooleanQuery.parse(req.query.soloActivas as string | undefined) ?? false;
      res.json(await repo.listarPrestacionesDeLista(db, id, soloActivas));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/:id/items/:prestacionId/historial", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      const prestacionId = esquemaId.parse(req.params.prestacionId);
      res.json(await repo.historialPrecioEnLista(db, id, prestacionId));
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  // Escritura: sin chequeo de permiso, igual que src/main/ipc/listasPrecio.ipc.ts
  // hoy (ninguno de sus canales llama a requerirPermiso). No se porta
  // LISTAS_PRECIO_ELIMINAR en este bloque.

  router.post("/", async (req, res) => {
    try {
      const validado = esquemaLista.parse(req.body);
      const id = await repo.crearLista(db, validado);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "crear",
        entidad: "listas_precio",
        entidadId: id,
        detalle: validado
      });
      res.status(201).json(id);
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.put("/:id", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      const nombre = z.string().trim().min(1).parse(req.body.nombre);
      await repo.actualizarLista(db, id, { nombre });
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "modificar",
        entidad: "listas_precio",
        entidadId: id
      });
      res.json({ ok: true });
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  router.patch("/:id/activo", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      const activo = z.boolean().parse(req.body.activo);
      await repo.setActivaLista(db, id, activo);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: activo ? "activar" : "desactivar",
        entidad: "listas_precio",
        entidadId: id
      });
      res.json({ ok: true });
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  // Cambia el precio vigente de una prestación dentro de una lista — toca
  // datos de precios usados por futuras OTs. Se implementa reutilizando
  // exactamente cambiarPrecioEnLista() (nunca sobrescribe: cierra el
  // vigente y abre uno nuevo, igual que el escritorio), pero no se probó
  // en vivo contra producción en este bloque — ver informe.
  router.patch("/:id/items/:prestacionId/precio", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      const prestacionId = esquemaId.parse(req.params.prestacionId);
      const nuevoPrecioCentavos = esquemaPrecio.parse(req.body.nuevoPrecioCentavos);
      await repo.cambiarPrecioEnLista(db, id, prestacionId, nuevoPrecioCentavos);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "cambiar_precio",
        entidad: "lista_precio_items",
        entidadId: prestacionId,
        detalle: { listaId: id, nuevoPrecioCentavos }
      });
      res.json({ ok: true });
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  // Eliminación segura (Bloque 2 / Parte B): reutiliza eliminarLista tal
  // cual — bloquea si está asignada a algún odontólogo o si tiene uso
  // histórico. Sin permiso, igual que el resto de la escritura de este
  // router (ninguno de sus canales lo exige, tampoco en Desktop).
  router.delete("/:id", async (req, res) => {
    try {
      const id = esquemaId.parse(req.params.id);
      await repo.eliminarLista(db, id);
      await registrarAuditoria(db, {
        usuarioId: (req as unknown as RequestConSesion).sesion.usuarioId,
        accion: "eliminar",
        entidad: "listas_precio",
        entidadId: id
      });
      res.json({ ok: true });
    } catch (err) {
      const error = traducirErrorPostgres(err);
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}
