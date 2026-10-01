# Densz — Dental Laboratory Management

Aplicación de escritorio para Windows que gestiona un laboratorio dental:
odontólogos, pacientes, precios (históricos y personalizados), órdenes de
trabajo con odontograma FDI, comprobantes de entrega no fiscales, cuentas
corrientes y pagos, dashboard y estadísticas, y usuarios/roles/auditoría.

**Base de datos: PostgreSQL en Supabase.** La app se conecta en vivo a un
proyecto de Supabase — no funciona sin conexión a internet ni sin una
`DATABASE_URL` configurada (ver [Configuración](#configuración)).

> **¿Buscás la versión web?** Todavía no existe. Este repo es hoy una app
> de escritorio Electron. Antes de convertirla a web hace falta un backend
> HTTP real (el navegador no puede conectarse directo a Postgres) — ver el
> análisis completo, qué código es reutilizable y qué falta, en
> [`docs/ARQUITECTURA_Y_MIGRACION_WEB.md`](docs/ARQUITECTURA_Y_MIGRACION_WEB.md).

## Arquitectura

- **Electron** (proceso `main`, Node/TypeScript) — única capa con acceso a
  la base de datos. Repositorios (`src/main/db/repositories`) para acceso
  a datos (async, `pg`/Postgres), servicios (`src/main/services`) para
  lógica de negocio transaccional, handlers IPC (`src/main/ipc`) como
  frontera de validación (zod) y auditoría.
- **React + TypeScript + Vite** (proceso `renderer`) — interfaz, sin
  acceso directo a Node ni a la base de datos. TanStack Query para datos
  vía IPC, Zustand para estado de UI/sesión. Antes de mostrar cualquier
  pantalla, un `ConexionGate` espera a que la conexión con la base
  responda (con reintento automático).
- **IPC tipado** (`src/main/preload/preload.ts` + `src/shared/types/ipc-contracts.ts`)
  como única frontera entre ambos procesos.
- **PostgreSQL (Supabase)** vía `pg` (`node-postgres`), con un rol de base
  de datos dedicado de mínimo privilegio (no el superusuario `postgres`),
  búsqueda global con `tsvector`/GIN, y triggers que mantienen sincronizado
  el índice de búsqueda.

## Requisitos

- Node.js 22+ (LTS) y npm.
- Windows 10/11 x64 (para la app de escritorio empaquetada).
- Un proyecto de Supabase (o cualquier Postgres accesible) con el esquema
  de Densz ya aplicado.

## Configuración

Copiar `.env.example` a `.env` y completar con una cadena de conexión real:

```bash
cp .env.example .env
```

```
DATABASE_URL=postgresql://usuario:password@host:5432/postgres
```

`TEST_DATABASE_URL` es opcional para desarrollo normal — solo hace falta
para correr la suite de tests (ver [Tests](#tests)), y **debe apuntar a un
proyecto/base separado del real**, nunca al mismo que `DATABASE_URL`: cada
test corre dentro de una transacción con `ROLLBACK`, pero por las dudas
nunca se usa la base de producción para esto.

El archivo `.env` nunca se commitea (está en `.gitignore`). En la app
empaquetada, el `.env` real se coloca junto al ejecutable (carpeta
`resources/`, ver `extraResources` en `electron-builder.yml`) — nunca
dentro del código fuente.

## Instalación

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```

Levanta en paralelo: Vite (renderer, puerto 5173), la compilación en watch
del proceso `main`, el empaquetado en watch del preload, y Electron
apuntando a todo eso.

## Acceso / usuarios

El primer arranque, si la base está completamente vacía de usuarios, crea
automáticamente un usuario administrador (`admin`) — en una base real
migrada esto nunca se dispara porque ya existen usuarios reales. La
contraseña de ese usuario de arranque **nunca es un valor fijo conocido de
antemano**: se genera aleatoriamente en cada arranque y se imprime una
única vez en el log de la consola (ej. `[densz] Usuario administrador de
arranque creado (usuario: "admin", contraseña generada: "...")`) —
guardala de ahí y cambiala cuanto antes desde **Usuarios** (menú lateral,
solo visible para el rol ADMINISTRADOR). Si preferís elegir vos la
contraseña inicial en vez de que se genere una al azar, definí
`BOOTSTRAP_ADMIN_PASSWORD` en el `.env` antes del primer arranque (ver
`.env.example`) — nunca hace falta configurarla en producción, porque ahí
ya existen usuarios reales y este código no se ejecuta.

## Modelo de datos (resumen)

- **Listas de precios** (`listas_precio` + `lista_precio_items`): cada
  lista tiene un nombre y **una sola moneda** (ARS o USD, fija de por
  vida) y contiene un precio histórico por prestación — nunca se
  sobrescribe un precio, se cierra el vigente y se abre uno nuevo. Cada
  odontólogo tiene siempre una lista asignada.
- **Densz nunca convierte moneda.** Si una lista está en USD, sus precios
  se guardan y se muestran en USD tal cual.
- **Una OT puede tener varias prestaciones**, y **cada prestación tiene
  sus propias piezas** (odontograma FDI) — no una lista global para toda
  la orden. La OT congela, por línea, el nombre de la prestación, su
  categoría, cantidad, precio unitario y si el precio vino de la lista o
  fue cargado a mano.
- **El pasado no cambia**: precio, moneda, lista, prestación, cantidad,
  piezas, subtotal y total de una OT ya creada quedan congelados para
  siempre.
- El saldo de cada odontólogo/clínica se calcula siempre desde
  `movimientos_cuenta` (vistas `v_saldo_odontologo_moneda` /
  `v_saldo_clinica_moneda`), agrupado por moneda — nunca es un campo
  editable a mano.
- Nada se borra físicamente por defecto: se anula o se marca inactivo,
  con motivo y usuario. Las únicas excepciones explícitas (solo ADMIN, con
  confirmación) son "Eliminar OT" y corregir un registro cargado por error
  sin ningún historial asociado — y siempre queda registrado en auditoría.

## Backups

El backup de archivo local (`VACUUM INTO`, USB) que existía en la versión
SQLite ya no aplica — los datos viven en Supabase, así que la continuidad
depende del respaldo del proyecto de Supabase, no de un archivo local en
esta computadora. La pantalla **Backups** de la app queda con un mensaje
informativo al respecto.

## Compilación / typecheck / tests

```bash
npm run typecheck   # tsc sobre main, preload y renderer, sin emitir
npm run test        # vitest, contra Postgres real (ver TEST_DATABASE_URL)
npm run build       # compila main + preload + renderer para producción
```

### Tests

Los tests corren con `ELECTRON_RUN_AS_NODE=1 electron ...` en vez de
`node` directamente (mismo runtime que usa la app). Cada archivo de test
abre su propia conexión y cada `it()` corre dentro de una transacción que
siempre termina en `ROLLBACK` — así los tests nunca dejan datos, corriendo
contra Postgres real en vez de mocks. **Nunca configurar `TEST_DATABASE_URL`
apuntando al mismo proyecto que `DATABASE_URL`.**

Vitest corre los archivos de test **secuencialmente, no en paralelo**
(`fileParallelism: false` en `vitest.config.ts`) porque el pooler de
Postgres tiene un límite de conexiones concurrentes.

## Empaquetado (instalador de Windows)

```bash
npm run dist
```

Genera `release/Densz Setup <versión>.exe` (instalador NSIS) junto con
`release/win-unpacked/`. El ícono se genera con `npm run build:icon` a
partir de `build/icon-source.png`.

**Nota sobre firma de código**: `electron-builder.yml` tiene
`signAndEditExecutable: false` porque Densz no tiene certificado de firma
de código. Si en el futuro se agrega uno, hay que quitar esa línea.

## Estructura del proyecto

```
src/main/
  db/
    repositories/*.ts       # acceso a datos async (pg/Postgres), uno por dominio
    connection.ts            # pool pg.Pool, parsers de tipos Postgres
    withTransaction.ts        # helper de transacciones (BEGIN/COMMIT/ROLLBACK)
    ensureBootstrapUser.ts
  services/                 # lógica de negocio transaccional
  ipc/                       # un archivo de handlers por dominio (valida con zod)
  preload/preload.ts         # única API expuesta al renderer
  utils/                     # appPaths, numbering, errors, logger
src/renderer/
  app/                       # router, navegación
  components/                # ui/ (kit propio), layout/, odontograma/, system/ConexionGate
  features/<dominio>/        # hooks de TanStack Query por dominio
  pages/<Modulo>/             # una carpeta por sección del sidebar
  store/                      # zustand (ui, auth, toasts)
src/shared/
  types/                      # entidades + contrato IPC (único lugar que main y renderer comparten)
  constants/                  # piezas FDI, permisos
tests/unit/                   # vitest, contra Postgres real (no mocks de la base)
docs/
  ARQUITECTURA_Y_MIGRACION_WEB.md   # qué es reutilizable para una versión web y qué falta
```
