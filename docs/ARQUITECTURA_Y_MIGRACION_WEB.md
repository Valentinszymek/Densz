# Arquitectura actual y qué hace falta para una versión web

Este documento existe para responder una pregunta concreta antes de tocar
nada: **¿qué del código actual sirve tal cual para una versión web, y qué
es exclusivo de Electron/Windows?** No es un plan de migración ejecutado —
es el análisis previo, a propósito, para no improvisar una conversión.

## Resumen en una frase

Densz hoy es una app de **escritorio de un solo cliente confiable**: el
proceso `main` de Electron abre una conexión directa a Postgres (con un
rol de base de datos que puede leer y escribir todas las tablas) y expone
esa lógica al `renderer` por IPC. Una versión web **no puede replicar
esto tal cual**: un navegador nunca puede tener una cadena de conexión a
Postgres con permisos de escritura — cualquiera que abra las herramientas
de desarrollador se la robaría. Hace falta un servidor intermedio (una
API real) entre el navegador y la base.

## Arquitectura actual (post-migración a Supabase)

```
┌─────────────────────────────┐        ┌──────────────────────┐
│  Electron renderer (React)  │  IPC   │  Electron main        │      ┌──────────┐
│  src/renderer/**             │◄──────►│  (Node, confiable)    │◄────►│ Supabase  │
│  (UI, TanStack Query, router)│ preload│  src/main/**          │  pg  │ Postgres  │
└─────────────────────────────┘        └──────────────────────┘      └──────────┘
```

- El `renderer` **nunca** habla con Postgres directamente. Solo llama a
  `window.densz.*` (inyectado por `preload.ts` vía `contextBridge`), que
  reenvía por IPC al proceso `main`.
- El `main` es el único lugar con la cadena de conexión (`DATABASE_URL`,
  ver `.env`) y con un pool `pg.Pool` real contra Supabase. Ahí vive toda
  la lógica de negocio, validación (zod) y auditoría.
- Esta separación (UI nunca toca la base directo) es exactamente el mismo
  patrón que necesita un backend web — es la parte buena de la noticia.

## Qué es reutilizable casi tal cual para un backend web

Todo esto es TypeScript puro, sin ninguna dependencia de `electron`,
`ipcMain` ni `BrowserWindow` — son funciones `async` que reciben una
conexión Postgres (`Queryable` = `Pool | PoolClient` de `pg`) y devuelven
datos. Se podrían envolver en rutas HTTP (Express/Fastify/Next.js API
routes/Supabase Edge Functions) prácticamente sin tocarlas:

- `src/main/db/repositories/**` (15 archivos) — toda la capa de acceso a
  datos, ~140 funciones.
- `src/main/services/**` — la lógica de negocio transaccional
  (`ordenService`, `pagoService`, `comprobanteService`, `cuentaService`,
  `proteccionService`, `authService`, `sessionService`, `exportService`,
  `listaPreciosService`, `searchService`), **excepto** las partes puntuales
  que generan PDF o hablan con una impresora física (ver abajo).
- `src/main/db/withTransaction.ts`, `types.ts`, `connection.ts`,
  `pgTypes.ts` — el manejo de transacciones y del pool. `connection.ts`
  solo usa Node estándar (`pg`), nada de Electron.
- `src/main/utils/errors.ts`, `numbering.ts`, `formatShared.ts`.
- `src/shared/types/**` — entidades y DTOs. El archivo
  `ipc-contracts.ts` define además la forma exacta de cada
  request/response (`DenszApi`), que es literalmente el contrato que una
  API HTTP tendría que replicar (mismos nombres de campo, mismos tipos).
- `src/renderer/**` (React, páginas, componentes, hooks de TanStack
  Query, Zustand) — reutilizable en un frontend web **si** se reemplaza
  la única función que llama a `window.densz.*` por una que llame a
  `fetch()`/HTTP contra la nueva API, manteniendo la misma forma de
  datos. El diseño (Tailwind), los formularios, el odontograma FDI, todo
  eso no depende de Electron.

## Qué es exclusivo de Electron/Windows (no reutilizable tal cual)

| Archivo(s) | Por qué no sirve para web |
|---|---|
| `src/main/index.ts`, `src/main/windows/mainWindow.ts` | Ciclo de vida de la app de escritorio (`app.whenReady`, `BrowserWindow`, lock de instancia única). |
| `src/main/ipc/*.ipc.ts` (19 archivos) | Usan `ipcMain.handle` — es el transporte IPC de Electron, no HTTP. La lógica que envuelven (llaman a los repos/servicios de arriba) sí es reutilizable; el envoltorio no. |
| `src/main/preload/preload.ts` | `contextBridge` es un concepto exclusivo de Electron. |
| `src/main/services/pdfService.ts` | Usa `BrowserWindow.webContents.printToPDF` — API de Electron, no existe en un navegador ni en un servidor Node plano. Un backend web necesitaría otra estrategia (ej. Puppeteer/Playwright headless, o un servicio externo de generación de PDF). |
| `src/main/services/impresoraService.ts` | Usa `webContents.print()` e impresoras del sistema operativo Windows directamente. La web no tiene forma de elegir una impresora física ni de imprimir sin diálogo — como máximo, el diálogo de impresión nativo del navegador. |
| `src/main/services/brandAssets.ts` (si lee assets del bundle de Electron) | Depende de rutas empaquetadas de la app de escritorio. |
| `src/main/utils/appPaths.ts` | Usa `app.getPath("userData")` y rutas de archivos locales (Windows) para guardar PDFs generados (comprobantes, listas de precios, estados de cuenta). La web necesita un destino distinto (ej. Supabase Storage) en vez de una carpeta local. |
| `electron-builder.yml`, `scripts/build-icon.mjs`, `scripts/bundle-preload.mjs` | Empaquetado del instalador de Windows — no aplica a un deploy web. |
| El pool `pg.Pool` conectado directo desde el cliente | **Esto es lo más importante**: hoy la "confianza" de quién puede leer/escribir la base es "sos el proceso `main` de Electron, corriendo en la compu del laboratorio". Un navegador no tiene ese nivel de confianza — cualquier usuario puede leer el código JS que corre en su propia pestaña. |

## Qué falta realmente para tener Densz funcionando online

En orden de importancia:

1. **Un backend real entre el navegador y Postgres.** Las dos opciones
   razonables:
   - **(A) Servidor propio** (Node + Express/Fastify, o Next.js API
     routes) que reexponga como rutas HTTP la misma lógica de
     `repositories/` + `services/` que ya existe — es, en gran medida,
     tomar los handlers de `src/main/ipc/*.ipc.ts` y convertirlos de
     `ipcMain.handle(canal, fn)` a `router.post("/ruta", fn)`. El
     `DATABASE_URL` viviría como variable de entorno del servidor, nunca
     en el navegador.
   - **(B) Supabase directo desde el navegador** con `@supabase/supabase-js`
     y **Row Level Security (RLS) real** en cada tabla. Hoy RLS está
     deshabilitado a propósito (la arquitectura actual confía en el rol
     de Postgres, no en políticas RLS) — para exponer Supabase al
     navegador de forma segura habría que diseñar y probar políticas RLS
     para las 20 tablas, lo cual es un trabajo aparte, no trivial dado el
     modelo de permisos por rol (ADMINISTRADOR/RECEPCIÓN) que hoy vive en
     código de aplicación.
   - Recomendación: (A) reutiliza casi todo el código ya escrito y probado
     (215 tests) sin rediseñar el modelo de permisos; (B) es más "nativo"
     de Supabase pero implica repensar seguridad desde cero.

2. **Autenticación para la web.** Hoy el login valida usuario/contraseña
   (bcrypt) contra la tabla `usuarios` dentro de un proceso de confianza
   y guarda la sesión en una variable en memoria del proceso `main`
   (`sessionService.ts`) — eso no sirve para múltiples usuarios
   concurrentes desde distintos navegadores. Hace falta sesiones reales
   (cookies HTTP-only + backend propio, o Supabase Auth si se migra a
   RLS).

3. **Generación de PDF sin Electron.** `pdfService.ts`/`impresoraService.ts`
   hoy dependen 100% de APIs de Electron. Para web: un servicio headless
   (Puppeteer/Playwright) en el backend, o generar el PDF en el cliente
   con una librería JS (con limitaciones de fidelidad).

4. **Almacenamiento de archivos generados.** Los PDFs (comprobantes,
   listas de precios, estados de cuenta) hoy se guardan en el disco local
   del usuario (`appPaths.ts` → `%APPDATA%/Densz`). En web necesitan un
   destino accesible desde cualquier lado — el candidato natural es
   Supabase Storage.

5. **Impresión física.** Elegir una impresora y mandar a imprimir sin
   diálogo (como hace hoy `impresoraService.ts`) no tiene equivalente
   real en la web — como máximo, el diálogo de impresión nativo del
   navegador sobre un PDF. Esta funcionalidad probablemente cambia de
   forma, no solo de implementación.

6. **Despliegue del frontend y del backend.** Una vez que exista el
   backend (paso 1), el frontend (`src/renderer`, ya es una SPA de Vite)
   se puede desplegar en cualquier hosting estático (Vercel, Netlify,
   Cloudflare Pages); el backend necesita un runtime Node persistente
   (Render, Fly.io, Railway, una VM, o funciones serverless si se adapta
   a ese modelo).

## Lo que este repositorio NO incluye todavía

A propósito, esta primera subida **no** crea el backend HTTP, no cambia
`preload.ts`/`ipc/*` a rutas HTTP, ni conecta el `renderer` a nada que no
sea Electron. Eso es un cambio estructural real que conviene decidir y
hacer aparte, con su propio plan — no improvisado dentro de "subir el
código a GitHub".
