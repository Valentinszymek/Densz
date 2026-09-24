// El preload de Electron corre en sandbox: true, donde `require` solo
// resuelve un set interno de módulos (electron, events, timers, url) y NO
// puede resolver otros archivos del proyecto en tiempo de ejecución. Por
// eso el preload se empaqueta con esbuild directamente desde el .ts
// fuente (no desde la salida de tsc): el resultado final es un único
// archivo autocontenido, sin requires locales, apto para sandbox.
import * as esbuild from "esbuild";
import path from "node:path";

const projectRoot = path.resolve(new URL(".", import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, "$1"), "..");
const entry = path.join(projectRoot, "src", "main", "preload", "preload.ts");
const outfile = path.join(projectRoot, "dist-electron", "main", "preload", "preload.js");

const opciones = {
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  external: ["electron"],
  logLevel: "info"
};

const watch = process.argv.includes("--watch");

if (watch) {
  const ctx = await esbuild.context(opciones);
  await ctx.watch();
  console.log("[bundle-preload] Watching src/main/preload/preload.ts…");
} else {
  await esbuild.build(opciones);
  console.log(`[bundle-preload] preload.js empaquetado en ${outfile}`);
}
