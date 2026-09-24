import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 60000,
    // Cada archivo de test abre su propio Pool contra el proyecto Supabase
    // dedicado a tests, que tiene un límite duro de 15 conexiones
    // concurrentes (Session Pooler, plan Free) — correr los archivos en
    // paralelo agota ese límite enseguida. Los tests dentro de un mismo
    // archivo siguen corriendo en orden normal de Vitest.
    fileParallelism: false
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared")
    }
  }
});
