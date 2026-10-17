import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Config de Vite EXCLUSIVA de la versión web — nunca la usa el escritorio
 * (vite.config.ts, sin tocar, sigue siendo la del build de Electron).
 * Mismo `root`/alias que la de escritorio (comparten TODO src/renderer),
 * pero:
 * - apunta a index.web.html (main.web.tsx) en vez de index.html (main.tsx);
 * - build de salida separado (dist-renderer-web/), nunca pisa dist-renderer/;
 * - puerto de dev distinto (5174, no 5173 — coincide con el WEB_ORIGIN
 *   por defecto que ya espera el backend, ver .env.example).
 */
export default defineConfig({
  root: path.resolve(__dirname, "src/renderer"),
  // Por defecto Vite busca el .env en `root` (src/renderer) — pero el
  // .env real del proyecto vive en la raíz del repo (junto a DATABASE_URL,
  // etc., ver .env.example). Sin esto, ninguna variable VITE_* definida
  // ahí se leía de verdad (bug preexistente, recién notado al agregar
  // VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY — VITE_API_URL "funcionaba"
  // de pura casualidad, porque su valor real coincide con el fallback
  // hardcodeado en webApi.ts).
  envDir: path.resolve(__dirname, "."),
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared"),
      "@": path.resolve(__dirname, "src/renderer")
    }
  },
  build: {
    outDir: path.resolve(__dirname, "dist-renderer-web"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "src/renderer/index.web.html")
    }
  },
  server: {
    port: 5174,
    strictPort: true
  }
});
