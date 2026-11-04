import { Router } from "express";
import { Readable } from "node:stream";
import { logger } from "../../main/utils/logger";

const REPO_GITHUB = "Valentinszymek/Densz";

interface AssetGithub {
  name: string;
  browser_download_url: string;
}

interface ReleaseGithub {
  assets: AssetGithub[];
}

/**
 * Hace de intermediario con el instalador real (publicado como GitHub
 * Release — ver electron-builder.yml) para que ningún cliente llegue a
 * ver esa URL ni el nombre de la cuenta/repositorio: el navegador solo
 * habla con este dominio, nunca con github.com. Sin autenticación a
 * propósito — tiene que poder bajarlo cualquiera, incluso antes de
 * registrarse.
 */
export function crearRouterDescargas(): Router {
  const router = Router();

  router.get("/windows", async (_req, res) => {
    try {
      const respuestaRelease = await fetch(`https://api.github.com/repos/${REPO_GITHUB}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "Densz-Servidor" }
      });
      if (!respuestaRelease.ok) {
        logger.error("No se pudo consultar la última release de GitHub:", respuestaRelease.status);
        res.status(502).json({ error: "No se pudo obtener la última versión de Densz." });
        return;
      }

      const release = (await respuestaRelease.json()) as ReleaseGithub;
      const asset = release.assets.find((a) => a.name.toLowerCase().endsWith(".exe"));
      if (!asset) {
        res.status(404).json({ error: "No se encontró el instalador para Windows." });
        return;
      }

      const respuestaArchivo = await fetch(asset.browser_download_url);
      if (!respuestaArchivo.ok || !respuestaArchivo.body) {
        logger.error("No se pudo descargar el instalador desde GitHub:", respuestaArchivo.status);
        res.status(502).json({ error: "No se pudo descargar el instalador." });
        return;
      }

      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${asset.name}"`);
      const longitud = respuestaArchivo.headers.get("content-length");
      if (longitud) res.setHeader("Content-Length", longitud);

      Readable.fromWeb(respuestaArchivo.body as import("stream/web").ReadableStream).pipe(res);
    } catch (err) {
      logger.error("Error inesperado descargando el instalador de Windows:", err);
      res.status(500).json({ error: "Error inesperado al descargar el instalador." });
    }
  });

  return router;
}
