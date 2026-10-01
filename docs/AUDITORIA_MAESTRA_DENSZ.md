# DENSZ — MASTER AUDIT REPORT

**Versión:** 1.0
**Fecha:** 2026-09-28
**Commit analizado:** `474bc28` (`main`, rama `main` = `origin/main`)
**Método:** auditoría de solo lectura — código fuente completo + Supabase (producción, solo lectura) + verificación en vivo de `https://densz.vercel.app` / `https://densz-production.up.railway.app`. No se modificó código, no se hizo commit/push, no se cambió producción.

> Este documento es la fotografía técnica y funcional de Densz al momento indicado. Donde no pude verificar algo con certeza, está marcado explícitamente como `NO DETERMINADO`, `NO VERIFICADO`, `DOCUMENTACIÓN ≠ CÓDIGO` o `WEB ≠ DESKTOP`.

---

## 1. Resumen ejecutivo

Densz es un sistema de gestión para un laboratorio dental (Dental Szymek): odontólogos, clínicas, pacientes, órdenes de trabajo (OT) con odontograma FDI, precios históricos, comprobantes de entrega no fiscales, cuentas corrientes (DEBE/HABER) en ARS/USD, pagos, estadísticas, usuarios/roles, auditoría y una protección por contraseña adicional sobre Cuentas/Estadísticas.

Corre en **dos plataformas desde el mismo código de React** (`src/renderer`):
- **Desktop**: app Electron para Windows, con acceso directo a Postgres desde el proceso `main` vía IPC.
- **Web**: desplegada en producción (Vercel + Railway), hablando por HTTP con un backend Express que reutiliza gran parte de la lógica de negocio del Desktop.

Ambas comparten **la misma base de datos Postgres en Supabase** (proyecto `Densz`, `cvplaqzlaeyhnwbrrkfi`) — no hay dos bases ni sincronización, es una sola fuente de verdad.

**Estado general:** el sistema está funcionalmente completo y en uso real en producción (70 OTs, 70 comprobantes, 74 pacientes, 64 odontólogos al momento de esta auditoría). Tiene una suite de tests grande (46 archivos, ~465 casos) que corre contra Postgres real. Se encontraron **un bug de negocio real** (doble conteo en el estado de cuenta mensual al editar una OT ya facturada en el mismo mes — ver §38.1), varios problemas de robustez menores en el backend web (peticiones que quedan colgadas ante query params inválidos), y una serie de decisiones de seguridad heredadas del modelo "Desktop de un solo operador" que vale la pena revisar ahora que la app es multiusuario por internet (RLS de Supabase desactivado, casi ningún endpoint de escritura pide permiso específico más allá de tener sesión).

---

## 2. Arquitectura

### Frase central
```
Desktop: [Electron] → IPC → [servicios/repositorios] → [Postgres/Supabase]
Web:     [Navegador] → HTTPS → [Vercel: React estático]
                                       ↓ fetch(credentials:include)
                                [Railway: Express] → [servicios/repositorios] → [Postgres/Supabase]
                                       ↓
                                [Supabase Storage: PDFs]
```

### Qué es compartido vs. específico

| Capa | Compartido Desktop/Web | Específico Desktop | Específico Web |
|---|---|---|---|
| UI (`src/renderer/pages`, `components`, `features/*/hooks.ts`) | ✅ Casi 100% el mismo código | — | `main.web.tsx` (entry point) en vez de `main.tsx` |
| Capa de llamada a API | Mismo nombre de método (`window.densz.xxx`) | `preload.ts` → IPC (`ipcRenderer.invoke`) | `webApi.ts` → `fetch()` HTTP |
| Lógica de negocio (`src/main/services/*`) | ✅ Reutilizada literalmente por ambos (`ordenService`, `pagoService`, `comprobanteService`, `cuentaService`, `proteccionService`, `authService`, `listaPreciosService`, `searchService`, `exportService`) | — | `src/server/*Web.ts` son capas finas de orquestación (Storage, descarga HTTP) alrededor de los mismos servicios |
| Repositorios (`src/main/db/repositories/*`) | ✅ 100% reutilizados | — | — |
| Base de datos | ✅ Misma Postgres/Supabase | — | — |
| Generación de PDF | — | `pdfService.ts` (Electron `webContents.printToPDF`) | `src/server/pdf.ts` (Puppeteer, Chromium headless real) |
| Impresión física | — | `impresoraService.ts` (impresora Windows real) | No existe — ver §18 |
| Sesión/autenticación | Mismo `authService`/bcrypt | Global de proceso (`sessionService.ts`) | Cookie HTTP por navegador (`session.ts`, Map en memoria) |
| Storage de archivos | — | Carpeta local de Windows (histórico) | Supabase Storage (bucket `documentos`, privado) |

### Dónde se ejecuta cada cosa
- **Frontend Web**: Vercel (estático, build de Vite) → `https://densz.vercel.app`.
- **Backend Web**: Railway (proceso Node persistente) → `https://densz-production.up.railway.app`.
- **Desktop**: instalador NSIS de Windows (`npm run dist`), corre 100% local salvo la conexión a Postgres.
- **Base de datos + Storage**: Supabase, proyecto `Densz` (`cvplaqzlaeyhnwbrrkfi`, región `ca-central-1`, Postgres 17.6).

---

## 3. Producción actual

Verificado en vivo el 2026-09-28 (sin exponer secretos):

| Ítem | Valor |
|---|---|
| Frontend | `https://densz.vercel.app` — 200 OK, sirve el build real de React |
| Backend | `https://densz-production.up.railway.app` — `/health` → `{"ok":true}` con conexión real a Postgres confirmada |
| Hosting frontend | Vercel, plan Hobby, sin dominio propio (subdominio gratuito) |
| Hosting backend | Railway, proceso Node persistente (no serverless — necesario por Puppeteer) |
| Base de datos | Supabase Postgres 17.6, proyecto `Densz` (`cvplaqzlaeyhnwbrrkfi`), plan **gratuito** |
| Storage | Bucket `documentos` en Supabase Storage, **privado** (no público), solo accesible con `service_role key` desde el backend |
| HTTPS | Sí, en ambos extremos (Vercel y Railway lo proveen por defecto) |
| CORS | Un único origen fijo permitido (`WEB_ORIGIN` = `https://densz.vercel.app` en prod), nunca `*`, `credentials: true` |
| Cookies de sesión | `httpOnly`, `secure` en prod, `sameSite: "none"` en prod (cross-origin Vercel↔Railway), `maxAge: 8h` |
| Health check | `GET /health`, sin autenticación, `SELECT` real contra Postgres |
| Build backend | `npm run build:server` (Railway, configurado a mano en el dashboard, ver §41.2) |
| Build frontend | `npm run build:web-frontend` → `dist-renderer-web/` (Vercel) |
| Dominio | Ninguno propio — subdominios gratuitos de Vercel/Railway |
| Repo GitHub | **Público** (`Valentinszymek/Densz`, `visibility: public`) — ver §23 |

**Conteos de producción al momento de esta auditoría** (ver §24 para el detalle completo): 70 órdenes, 70 comprobantes, 74 pacientes, 64 odontólogos, 5 clínicas, 15 pagos, 5 usuarios.

---

## 4. Estructura del proyecto (árbol conceptual)

```
Densz
├── src/main/                    — Electron (proceso "main", Node/TS)
│   ├── db/
│   │   ├── repositories/*.ts    — 14 archivos, acceso a datos async (pg)
│   │   ├── connection.ts        — pool pg.Pool (ssl: rejectUnauthorized:false)
│   │   ├── withTransaction.ts   — único helper transaccional de toda la app
│   │   └── ensureBootstrapUser.ts — crea admin/densz123 si la tabla usuarios está vacía
│   ├── services/                — 17 archivos, lógica de negocio transaccional
│   ├── ipc/                     — 20 archivos, un dominio por archivo (~130 canales)
│   ├── preload/preload.ts       — window.densz (contextBridge)
│   ├── windows/mainWindow.ts    — BrowserWindow (1440×900, sandbox:true)
│   ├── utils/                   — appPaths, numbering, errors, logger
│   └── index.ts                 — bootstrap
├── src/server/                  — Backend Web (Express, Node/TS) — 24 archivos
│   ├── routes/*.ts               — 17 routers (un dominio por archivo)
│   ├── middleware/               — requireAuth, requirePermission, requireProteccion
│   ├── session.ts                — sesiones HTTP en memoria (Map)
│   ├── proteccion.ts             — protección Cuentas/Estadísticas del lado web
│   ├── storage.ts                — Supabase Storage (service_role)
│   ├── pdf.ts                    — Puppeteer
│   └── index.ts                  — entry point, CORS, mount de routers
├── src/renderer/                — React + TS + Vite (compartido Desktop/Web)
│   ├── app/                      — router.tsx, navigation.ts
│   ├── pages/<Modulo>/           — 18 carpetas, una por sección
│   ├── features/<dominio>/hooks.ts — TanStack Query, uno por dominio
│   ├── components/               — ui/ (kit propio), layout/, odontograma/, proteccion/
│   ├── store/                    — zustand (auth, ui, toasts)
│   └── webApi.ts                 — implementación Web de DenszApi (HTTP)
├── src/shared/                  — único código que main y renderer comparten
│   ├── types/ipc-contracts.ts    — interfaz DenszApi + canales IPC
│   ├── types/entities.ts         — entidades de dominio
│   └── constants/                — permisos.ts, piezasFDI.ts, auditoriaAcciones.ts
├── tests/unit/                  — 46 archivos, ~465 tests, contra Postgres real
├── docs/ARQUITECTURA_Y_MIGRACION_WEB.md — plan original de migración a web
├── electron-builder.yml          — empaquetado Windows NSIS
├── nixpacks.toml                 — build config backend (Railway)
└── package.json                  — 13 scripts npm (build/dev/test por cada capa)
```

---

## 5. Base de datos

### 5.1 Tablas (22) + vistas (2)

Todas con PK `id integer`. Prácticamente todas usan `activo`/`anulado` (soft-delete) en vez de borrado físico — ver columna "Eliminación" y §27/§29.

| Tabla | Propósito | Columnas clave | Eliminación | Auditoría propia |
|---|---|---|---|---|
| `roles` | Roles de usuario | `nombre`, `permisos` (JSON string) | N/A (catálogo fijo: 2 filas) | No |
| `usuarios` | Cuentas de acceso | `nombre_usuario`, `password_hash` (bcrypt), `rol_id`, `activo` | Soft; hard-delete bloqueado si hay historial | No (registrado desde servicios) |
| `clinicas` | Clínicas odontológicas | `nombre`, `activo` | Soft; hard-delete bloqueado si hay uso | No |
| `odontologos` | Profesionales | `lista_precio_id` (NOT NULL), `clinica_id` (nullable) | **Solo soft** — no existe función de hard-delete | No |
| `pacientes` | Pacientes | `odontologo_id`, `activo` | **Híbrido**: hard-delete si no tiene trabajos, soft si tiene | No |
| `categorias_precio` | Categorías del catálogo | `orden`, `activo` | Soft; hard-delete bloqueado si hay uso | No |
| `prestaciones` | Catálogo de prestaciones | `categoria_id`, `activo` | Soft; hard-delete bloqueado si hay uso | No |
| `listas_precio` | Listas de precios | `moneda` (ARS\|USD, **fija de por vida**), `activo` | Soft; hard-delete bloqueado si está asignada/usada | No |
| `lista_precio_items` | Precio histórico por prestación/lista | `vigente_desde`, `vigente_hasta` (append-only) | Nunca se borra ni pisa — se cierra vigencia y se abre una nueva | No |
| `ordenes` | Órdenes de trabajo (OT) | `numero`, `estado` (pendiente_facturar\|facturado\|anulado), `total_centavos`, `clinica_id` (congelado al crear) | Soft (`anular`) normal; hard-delete solo ADMIN vía "Eliminar OT" | No |
| `orden_prestaciones` | Líneas de una OT | `precio_unitario_centavos` (congelado), `origen_precio` (lista\|manual) | Cascada con la orden | No |
| `orden_prestacion_piezas` | Piezas FDI por línea | `pieza_fdi` | Cascada | No |
| `comprobantes` | Comprobantes de entrega (no fiscales) | `numero`, `orden_id`, `pdf_path`, `anulado` | Soft normal; hard solo junto con "Eliminar OT" | No |
| `pagos` | Pagos de odontólogos/clínicas | `importe_centavos`, `moneda`, `medio_pago_id`, `anulado` | Soft | No |
| `movimientos_cuenta` | Ledger DEBE/HABER | `tipo` (debe\|haber), `importe_centavos`, `moneda`, `anulado` | Soft normal; hard solo junto con "Eliminar OT" | No |
| `numeradores` | Contador de OT/comprobantes | `tipo`, `prefijo`, `digitos`, `ultimo_numero` | N/A | No |
| `medios_pago` | Catálogo de medios de pago | `nombre`, `activo` | Soft (nunca se borran) | No |
| `configuracion` | Clave/valor de config | `clave`, `valor` | N/A | No |
| `auditoria` | Log de auditoría | `usuario_id`, `accion`, `entidad`, `entidad_id`, `detalle` | **Append-only**, inmutable | Es la propia tabla |
| `backups` | Metadatos de backups | — | 0 filas — **feature obsoleta**, ver §26 | No |
| `resumenes_mensuales` | Estados de cuenta generados | `saldo_pendiente_centavos`, `pdf_path` | Append-only (cada generación es un registro nuevo) | No |
| `busqueda_global` | Índice de búsqueda FTS | `texto_tsv` (tsvector) | Mantenida por triggers | No |
| `v_saldo_odontologo_moneda` (vista) | Saldo actual por odontólogo/moneda | `SECURITY DEFINER` (ver §23) | — | — |
| `v_saldo_clinica_moneda` (vista) | Saldo actual por clínica/moneda | `SECURITY DEFINER` (ver §23) | — | — |

### 5.2 Mapa de relaciones (confirmado por foreign keys reales)

```
roles ← usuarios → (crea/anula/audita) todo lo demás
listas_precio → lista_precio_items → prestaciones ← categorias_precio
clinicas ← odontologos → listas_precio
odontologos ← pacientes
odontologos/clinicas + pacientes → ordenes → orden_prestaciones → orden_prestacion_piezas
ordenes → comprobantes → movimientos_cuenta (tipo=debe)
odontologos/clinicas + medios_pago → pagos → movimientos_cuenta (tipo=haber)
movimientos_cuenta → v_saldo_odontologo_moneda / v_saldo_clinica_moneda
odontologos/clinicas → resumenes_mensuales
```
Coincide con el diagrama conceptual del pedido original.

### 5.3 Numeración (`numeradores`)
Al momento de esta auditoría: `orden` → prefijo `OT-`, 8 dígitos, `ultimo_numero=76`; `comprobante` → prefijo `CB-`, 8 dígitos, `ultimo_numero=76`. **`NO DETERMINADO`**: hay una diferencia entre `ultimo_numero` (76) y la cantidad real de filas en `ordenes`/`comprobantes` (70) — 6 números "de más" consumidos sin fila correspondiente. Esto es **compatible** con el diseño (números nunca se reutilizan, ni con "Eliminar OT" ni con transacciones que hicieron ROLLBACK después de incrementar el numerador dentro de la misma transacción — en ese caso el propio ROLLBACK revierte el incremento también, así que lo más probable es que sean OTs eliminadas definitivamente en algún momento). No es un bug — es el comportamiento esperado de una secuencia que nunca retrocede — pero se deja documentado como observación.

La función `siguienteNumero()` (`src/main/utils/numbering.ts`) es **atómica y seguro ante condiciones de carrera**: usa `UPDATE numeradores SET ultimo_numero = ultimo_numero + 1 ... RETURNING` como sentencia única, que toma un row-lock exclusivo — dos transacciones concurrentes nunca pueden leer el mismo número.

---

## 6. Autenticación y usuarios

- **Login**: usuario+contraseña, `bcrypt.compareSync`. Mensaje de error **siempre genérico** ("Usuario o contraseña incorrectos") sea el motivo real usuario inexistente/inactivo/contraseña incorrecta — nunca revela cuál. El motivo real sí se guarda en Auditoría (solo visible para ADMIN).
- **Sesión Desktop**: variable global de módulo en el proceso Electron (`sessionService.ts`) — un solo usuario a la vez, coherente con una ventana por instalación.
- **Sesión Web**: cookie HTTP (`densz_session`) + `Map<string, Sesion>` en memoria del proceso Node (`src/server/session.ts`). **Cada request resuelve su propio usuario desde su propia cookie** — soporta múltiples navegadores simultáneos correctamente. **Limitación real**: al no persistir en ningún lado, un restart/redeploy del backend en Railway borra todas las sesiones activas de golpe (próximo request de cada usuario = 401, tiene que volver a loguearse). Tampoco hay limpieza automática de sesiones vencidas — quedan en el Map hasta que el proceso se reinicia (fuga de memoria lenta, no crítica).
- **Roles**: exactamente 2 en la base — `ADMINISTRADOR` (permiso `"*"`, todo) y `RECEPCION` (10 permisos puntuales: `ordenes.crear/ver`, `pacientes.crear/ver`, `odontologos.ver`, `pagos.crear/ver`, `comprobantes.crear/ver`, `clinicas.crear/ver`). RECEPCION **no puede**: anular/eliminar órdenes, editar precios, anular pagos, gestionar backups/usuarios, editar configuración, ver auditoría/cuentas/estadísticas, ni crear odontólogos (solo puede verlos).
- **Expiración**: cookie web expira a las 8h (`maxAge`). Desktop no tiene expiración explícita — dura mientras la app esté abierta.
- **Recuperación de contraseña de usuario**: `NO DETERMINADO` — no se encontró un flujo de "olvidé mi contraseña" para usuarios de Densz (sí existe, pero es un sistema **aparte**, para la protección de Cuentas/Estadísticas — ver §9).
- **Activación/desactivación**: soft (`activo`), un usuario no puede desactivarse ni eliminarse a sí mismo (bloqueado server-side).
- **Bootstrap**: si la tabla `usuarios` está completamente vacía, se crea automáticamente `admin`/`densz123` (`src/main/db/ensureBootstrapUser.ts`, credencial hardcodeada en el código fuente y ya documentada en el propio `README.md`). Inerte en producción porque ya existen usuarios reales — solo se dispararía ante una restauración de una base completamente vacía. Ver riesgo en §23.

---

## 7. Roles y permisos

Fuente única de verdad: `src/shared/constants/permisos.ts` (compartido Desktop/Web).

```
PERMISOS = "*" (todo) | ordenes.{crear,ver,anular,eliminar} | pacientes.{crear,ver} |
odontologos.{crear,ver} | clinicas.{crear,ver} | precios.editar | pagos.{crear,ver,anular} |
comprobantes.{crear,ver} | backups.gestionar | usuarios.gestionar | configuracion.editar |
auditoria.ver | cuentas.ver | estadisticas.ver
```

**Hallazgo importante (confirmado independientemente por la auditoría de backend Web):** varios de estos permisos existen como constantes pero **nunca se usan** en ningún `requirePermission()` del backend Web — `ordenes.crear/ver/anular`, `pacientes.crear/ver`, `odontologos.crear/ver`, `clinicas.crear/ver`, `pagos.crear/ver/anular`, `comprobantes.crear/ver`, `backups.gestionar`. En la práctica, en la versión Web, **cualquier usuario autenticado** (sin importar el rol) puede crear/editar/desactivar odontólogos, clínicas, pacientes; registrar y anular pagos; generar comprobantes; crear y anular órdenes. Esto está **documentado explícitamente en los comentarios del código** como "coincide con el comportamiento del Desktop" — es decir, es una decisión heredada, no un descuido, pero es un punto real a revisar ahora que Densz es multiusuario por internet en vez de una sola PC. Ver §23.6.

Sí están correctamente permission-gateados: Usuarios (`usuarios.gestionar`), Auditoría (`auditoria.ver`), Configuración (`configuracion.editar`), Cuentas/Estadísticas (`cuentas.ver`/`estadisticas.ver` **+** protección por contraseña), escritura de Precios (`precios.editar`), y `DELETE /trabajos/:id` (`ordenes.eliminar`, en la práctica solo asignado a ADMIN).

---

## 8. Auditoría

- **Qué se audita**: 26 tipos de acción catalogados en `src/shared/constants/auditoriaAcciones.ts` — crear, editar, modificar, anular, eliminar, eliminar_definitivo, activar, desactivar, login, login_fallido, logout, cambiar_precio, generar, generar_resumen_mensual, cambiar_password, imprimir_estado_cuenta, editar_fecha, activar/desactivar_proteccion, cambiar_password_proteccion, recuperar_proteccion, generar_codigo_proteccion, exportar, entre otros.
- **Quién audita**: la mayoría de las escrituras la generan los **servicios**, no los repositorios (`ordenService`, `authService`, `proteccionService`, casi todas las rutas del backend Web). **Excepción confirmada**: `pagoService.ts` (Desktop) **no llama a `registrarAuditoria` en ningún punto** — ni al registrar ni al anular un pago — a diferencia de todos los demás servicios que sí lo hacen consistentemente. Marcado como posible gap. También `CATEGORIAS_MOVER` (reordenar categorías, tanto IPC como HTTP) no genera entrada de auditoría, a diferencia de cada otra escritura en ese mismo archivo.
- **Inmutable**: la tabla `auditoria` es append-only, sin ninguna función de update/delete en ningún repo.
- **Quién puede verla**: solo `AUDITORIA_VER` (ADMIN por defecto vía `"*"`).
- **Filtros**: búsqueda de texto, usuario, acción, entidad, período (con rangos predefinidos + personalizado), paginado.
- **Exportación**: CSV/XLSX/PDF, respetando **exactamente el filtro activo en pantalla** (nunca exporta la tabla completa entera si hay un filtro puesto).
- **Qué NO se guarda**: nunca contraseñas ni hashes ni tokens (verificado explícitamente en los tests: `serverUsuariosAdmin.test.ts`, `serverProteccionAdmin.test.ts` afirman "no secrets leaked in response or audit").

---

## 9. Protección (Cuentas/Estadísticas)

Gate de contraseña adicional, **lab-wide** (una sola contraseña compartida, no por usuario), sobre las secciones Cuentas y Estadísticas — pensado para que no cualquiera que tenga acceso a la PC/sesión pueda ver montos.

- **Activación**: toggle en Configuración, solo ADMIN. Contraseña hasheada con bcrypt (`configuracion.proteccion.passwordHash`).
- **Desbloqueo Desktop**: variable global del proceso Electron (`desbloqueadoEnEstaSesion` en `proteccionService.ts`) — un único desbloqueo para toda la app mientras está abierta; `logout()` la vuelve a bloquear.
- **Desbloqueo Web**: **por sesión de cookie** (`Set<sesionId>` en `src/server/session.ts`), **nunca comparte el global de Desktop** — cada navegador/usuario necesita desbloquear el suyo, cosa que el Desktop (pensado para un solo operador) no necesitaba resolver. Confirmado con tests dedicados de aislamiento (`serverProteccionSesion.test.ts`, `serverProteccionCompartida.test.ts`).
- **Comportamiento en frontend**: un único guard (`ProteccionGuard`) envuelve **ambas** rutas `/cuentas*` y `/estadisticas` a la vez — desbloquear una desbloquea la otra (es una sola "zona protegida" desde la perspectiva del usuario). Se re-bloquea en cada *mount* del guard (entrar por primera vez, volver después de salir, recargar la página) — llama a `POST /proteccion/bloquear` tanto al montar como al desmontar, así que el bloqueo es real del lado del servidor, no solo cosmético en la UI (no se puede leer con DevTools sin haber desbloqueado la sesión real).
- **Después de logout**: siempre vuelve a pedir contraseña (logout re-bloquea explícitamente).
- **Recuperación**: código de formato `DENSZ-XXXX-XXXX-XXXX` (alfabeto sin 0/O/1/I/L, generado con `crypto.randomInt`, CSPRNG real, no `Math.random`), se muestra **una sola vez** al generarlo, y se **rota automáticamente** al usarse para restablecer (el código usado queda invalidado).
- **Comparación de riesgo**: dado que el desbloqueo web sí es por sesión-cookie y no un global de proceso, el modelo web es **más correcto** que el desktop en un escenario multiusuario — el propio código lo señala explícitamente en varios comentarios.

---

## 10-18. Módulo por módulo (resumen consolidado)

> Nota de formato: dado el volumen (18 módulos × ~20 subpreguntas cada uno pedidas en el prompt original), se consolida aquí lo esencial de cada uno; el detalle línea-por-línea de rutas HTTP/IPC/repos está en los apéndices §21/§22/§35.

### 10. Inicio (Dashboard)
Pantalla única, sin formularios. Muestra: resumen operativo (sin montos — deliberado, no requiere protección), últimos 5 trabajos, pendientes de facturar, últimas anuladas, últimos 5 comprobantes, accesos rápidos. **Funciona igual en Desktop y Web.**

### 11. Odontólogos
CRUD completo + estadísticas + última actividad + asignación de lista de precios/clínica + activar/desactivar (soft, **sin hard-delete** — es el único catálogo principal sin esa opción). **WEB ≠ DESKTOP**: en Web, cualquier usuario autenticado puede crear/editar (sin `odontologos.crear`), en Desktop lo mismo por diseño explícito documentado.

### 12. Clínicas
CRUD + estadísticas + "zona de peligro" con hard-delete **bloqueado si hay cualquier historial** (profesionales, trabajos, pagos, movimientos) — solo permite borrar una clínica cargada por error y sin uso; si está bloqueada, ofrece "marcar como inactiva" en su lugar.

### 13. Pacientes
Único lugar donde se crean pacientes explícitamente (en Nuevo Trabajo solo se seleccionan existentes o se escribe un nombre nuevo que se crea implícitamente al guardar). Eliminación **híbrida inteligente**: borrado físico si no tiene ningún trabajo histórico, si no, se inactiva — decidido automáticamente por el propio repositorio, nunca a elección del usuario.

### 14. Trabajos / OT — ver §32 y §38 para el análisis especial pedido.

### 15. Precios (categorías + prestaciones) y 16. Listas de precio
Una lista de precios tiene **una moneda fija de por vida** (ARS o USD, nunca se cambia — para otra moneda se crea una lista nueva). Cambiar el precio de un ítem **nunca pisa el anterior**: cierra la vigencia (`vigente_hasta`) y abre una fila nueva — historial de precios 100% preservado, append-only. El precio de una OT ya creada queda **congelado para siempre**, sin importar qué pase después con la lista.

### 17. Comprobantes — ver §14 dedicada más abajo.

### 18. Pagos
Registro con **detección de duplicados** (mismo odontólogo/clínica, importe, moneda, fecha, medio) — si detecta uno similar reciente, no inserta nada y devuelve `{posibleDuplicado:true}`; el usuario debe confirmar explícitamente para forzar la carga. Anulación siempre soft (nunca se borra un pago).

### 19. Cuentas — ver §12 (ya cubierta en detalle arriba, cálculo de saldo).

### 20. Estadísticas
KPIs, evolución (día/mes según rango), rankings de odontólogos/clínicas/prestaciones, saldos pendientes top-20. **Siempre separado por moneda** — nunca suma ARS+USD (verificado repetidamente en comentarios y tests). Requiere protección (excepto el resumen operativo del Dashboard, que nunca muestra montos).

---

## 12 (detalle). Cuentas — DEBE/HABER, saldo, clínica-vs-odontólogo

**Fórmula de saldo** (vistas SQL `v_saldo_odontologo_moneda`/`v_saldo_clinica_moneda`, `SECURITY DEFINER`):
```sql
saldo_centavos = Σ(importe WHERE tipo='debe' AND anulado=0) − Σ(importe WHERE tipo='haber' AND anulado=0)
```
Agrupado siempre por moneda — nunca se mezclan ARS y USD.

**Quién es el titular de la deuda (clínica vs. odontólogo)**, resuelto una sola vez y aplicado en dos momentos:
1. **Al crear la OT**: se congela `clinica_id` desde el odontólogo en ese instante (`ordenService.crearOrdenConPrestaciones`) — si el profesional cambia de clínica después, la OT ya creada no se entera.
2. **Al facturar**: `comprobanteService.generarComprobante` decide el titular del movimiento DEBE: si `orden.clinicaId` existe → el DEBE es de la **clínica** (el odontólogo que hizo el trabajo queda registrado igual, pero no es el titular del saldo); si el odontólogo es independiente → el DEBE es directamente suyo.

**Estado de cuenta mensual** (`cuentaService.calcularBloquesMes`): `saldoPendiente = saldoAnterior + totalTrabajosDelMes − totalPagosDelMes`, calculado por moneda, con un `resumenes_mensuales` append-only por cada generación (nunca se pisa un resumen viejo). Ver **bug real** en §38.1.

---

## 21. API (backend Web) — inventario completo

19 routers montados en `src/server/index.ts` + `/health`. **Todos** requieren `requireAuth` salvo exactamente 5 endpoints (ver tabla). Tabla completa de los ~95 endpoints (método, path, auth, permiso, servicio) — provista íntegra por la auditoría dedicada; resumen por router:

| Router | Endpoints | Requiere permiso específico | Requiere protección |
|---|---|---|---|
| `/health` | 1 | No | No |
| `/auth` | 4 | No (es el propio login) | No |
| `/odontologos` | 9 | No (solo sesión) | No |
| `/clinicas` | 8 | No (solo sesión) | No |
| `/pacientes` | 7 | No (solo sesión) | No |
| `/precios` | 13 | Solo escrituras (`precios.editar`) | No |
| `/listas-precio` | 12 | No (solo sesión) | No |
| `/config` | 2 | `configuracion.editar` | No |
| `/search` | 1 | No (solo sesión) | No |
| `/system` | 1 | No (solo sesión) | No |
| `/usuarios` | 7 | `usuarios.gestionar` (todas) | No |
| `/auditoria` | 2 | `auditoria.ver` (todas) | No |
| `/proteccion` | 9 | Mixto: 3 abiertas, 6 admin (`configuracion.editar`) | — |
| `/trabajos` | 7 | Solo DELETE (`ordenes.eliminar`) | No |
| `/pagos` | 7 | No (solo sesión) | No |
| `/cuentas` | 13 | `cuentas.ver` (salvo 1 excepción) | **Sí** (salvo 1 excepción) |
| `/comprobantes` | 4 | No (solo sesión) | No |
| `/estadisticas` | 10 | `estadisticas.ver` (salvo 1 excepción) | **Sí** (salvo 1 excepción) |
| `/export` | 1 | Solo si `tipo=auditoria` | No |

**Endpoints sin autenticación (los únicos 5 de toda la superficie HTTP)**: `GET /health`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/session`, `GET /auth/usuarios-disponibles` — todos con justificación explícita en el código, ninguno filtra datos sensibles.

**Sesión/cookie/CORS**: ver §3 y §23 para el detalle exacto de código.

---

## 22. DenszApi (Desktop IPC vs. Web HTTP)

`window.densz` expone ~110 métodos (interfaz `DenszApi`, `src/shared/types/ipc-contracts.ts`), implementados dos veces:
- **Desktop** (`src/main/preload/preload.ts` + 20 archivos `*.ipc.ts`, ~130 canales IPC — algunos IPC internos no tienen un método 1:1 en `DenszApi`).
- **Web** (`src/renderer/webApi.ts`, 513 líneas) — mismo nombre de método, implementado como `fetch()` HTTP.

Estado por grupo:

| Grupo | 🟢 Conectado en Web | 🔴 Stub (`pendiente()`) en Web | Motivo |
|---|---|---|---|
| System/Search/Config/Odontólogos/Clínicas/Pacientes/Precios/Listas/Trabajos/Comprobantes (lectura+la mayoría)/Cuentas/Pagos/Estadísticas/Proteccion/Usuarios/Auditoría/Export | ✅ | — | — |
| `backups*` (9 métodos) | — | 🔴 Todos | Sin equivalente en Supabase, obsoleto en **ambas** plataformas (ver §26) |
| `impresora*` (5 métodos) | — | 🔴 Todos | Impresión física a impresora local — estructuralmente imposible desde un navegador |
| `comprobantesImprimir` | — | 🔴 | Mismo motivo — la Web usa "Ver PDF" en su lugar |

Ningún método de `DenszApi` quedó **sin implementación en ningún lado** (ni huérfano) — la auditoría de frontend confirmó que cada hook que llama un método existe también en `webApi.ts`, aunque sea como stub explícito.

---

## 23. Seguridad — auditoría documental

Clasificación: 🔴 crítico · 🟠 importante · 🟡 moderado · 🟢 correcto · ⚪ decisión futura.

### 23.1 — 🟠 Row Level Security desactivado en las 22 tablas de Supabase
Confirmado vía Supabase Advisors (`rls_disabled_in_public`, nivel ERROR, 22 hallazgos). En teoría, cualquiera con la `anon key` del proyecto podría leer/escribir cualquier fila directamente contra la API REST de Supabase. **Mitigante real, verificado en código**: el navegador **nunca** recibe la `anon key` ni ninguna otra credencial de Supabase — `src/server/storage.ts` (único lugar que usa `@supabase/supabase-js`) vive exclusivamente en `src/server/**`, usa solo la `service_role key` (que ignora RLS por diseño), y nunca se importa desde `src/renderer/**`. Hoy no es explotable a través de la app, pero es una configuración de base de datos objetivamente insegura si alguna vez se agrega cualquier código cliente que use el SDK de Supabase directamente.

### 23.2 — 🟡 Vistas `v_saldo_*` con `SECURITY DEFINER`
Corren con los permisos de quien las creó, no de quien consulta — señalado por Supabase Advisors. Relacionado con 23.1: irrelevante mientras RLS siga desactivado igual, pero sumaría riesgo si se activa RLS sin ajustar esto.

### 23.3 — 🟡 Repositorio de GitHub público
`Valentinszymek/Densz` es público (`visibility: public`, confirmado vía API de GitHub). Se verificó que `.env` nunca se commiteó (correctamente en `.gitignore`, `git log --all` sin resultados para su adición) — no hay secretos reales expuestos en el historial. Pero: todo el código de negocio, la estructura de la base, y la credencial de bootstrap `admin`/`densz123` (§23.4) son visibles para cualquiera en internet. Esto es una decisión de producto/negocio (¿un lab dental quiere su sistema de gestión con código abierto al público?), no técnicamente un bug — pero vale que lo sepas si no fue una decisión consciente.

### 23.4 — 🟡 Credencial de bootstrap predecible en el código fuente
`admin` / `densz123`, hardcodeada en `src/main/db/ensureBootstrapUser.ts`, documentada en `README.md`. Solo se activa si la tabla `usuarios` queda completamente vacía (p. ej. una restauración de backup incompleta). Inerte hoy (ya hay usuarios reales), pero sigue siendo una contraseña default conocida publicamente en un repo público.

### 23.5 — 🟡 Login web sin límite de intentos
No existe `express-rate-limit` ni ningún mecanismo de throttling en `/auth/login` (confirmado por grep — cero coincidencias en todo `src/server`). Los intentos fallidos **sí quedan auditados** (`login_fallido`), pero nada bloquea a un atacante de probar contraseñas repetidamente.

### 23.6 — 🟠 Modelo de autorización Web = "paridad con Desktop", no reforzado para multiusuario
Ver §7 — la mayoría de las escrituras (odontólogos, clínicas, pacientes, listas de precio, pagos, comprobantes, la mayor parte de trabajos) solo requieren *tener sesión*, no un permiso específico, siguiendo el comportamiento original del Desktop de un solo operador. Documentado explícitamente en comentarios de código como intencional. En un despliegue web con más de un usuario/rol, esto significa que RECEPCION puede hacer más de lo que la matriz de permisos de §7 sugeriría a primera vista.

### 23.7 — 🟠 Peticiones que quedan colgadas ante parámetros inválidos (5 rutas)
Bug real de robustez, no de seguridad per se: 5 endpoints (`GET /precios/categorias`, `GET /listas-precio/`, `GET /estadisticas/saldos-pendientes-top`, `GET /pagos/ultimos`, `GET /cuentas/tiene-pagos`) parsean un query param con Zod **sin try/catch**, y como Express 4 no captura rechazos de promesas en handlers `async` sin un error-handler global (que tampoco existe en `index.ts`), un query param malformado (`?limite=abc`, `?soloActivas=yes`) deja el request colgado hasta timeout del cliente en vez de devolver un 400 limpio.

### 23.8 — 🟡 Variable global de sesión Desktop tocada también por el login Web (inerte hoy)
`POST /auth/login` del backend Web llama a `authService.login()`, que internamente sigue escribiendo la variable global de proceso pensada para Desktop (`sessionService.ts`). Hoy es inofensivo porque ningún archivo de `src/server/**` lee esa variable — pero es un "gatillo fácil" latente: cualquier código futuro que por error importe de `sessionService.ts` dentro del servidor web filtraría la sesión de un navegador a otro.

### 23.9 — 🟢 TLS sin verificación estricta de certificado (documentado y acotado)
`connection.ts`: `ssl: { rejectUnauthorized: false }` — deshabilita la verificación de la cadena de certificados contra el pooler de Supabase. Documentado como necesario por un problema conocido de CA raíz en Windows. La conexión sigue **cifrada**, solo no autenticada contra una CA — técnicamente un vector MITM en una red no confiable, pero un riesgo bajo dado el contexto (conexión saliente desde servidores propios/PC de trabajo hacia Supabase).

### 23.10 — 🟢 Manejo de secretos, en general, correcto
Contraseñas siempre bcrypt (nunca texto plano) — confirmado en usuarios y en protección. Passwords nunca se devuelven en ninguna respuesta HTTP (`usuarios.route.ts` los quita explícitamente antes de responder, verificado también por tests). PDFs de comprobantes/estados de cuenta nunca son públicos — el bucket de Storage es privado, se descarga siempre a través del backend con su propio chequeo de sesión. Path de descarga de PDFs siempre reconstruido server-side desde la base, nunca aceptado literal del cliente (previene path traversal) — con una excepción menor de inconsistencia de `Content-Disposition` en `/listas-precio/pdf` (no un riesgo, solo UX).
Único hallazgo menor de robustez SQL: `system.route.ts` interpola un nombre de tabla en una query (`SELECT COUNT(*) FROM "${tabla}"`), pero el valor viene exclusivamente de una consulta previa a `information_schema.tables`, nunca de input del usuario — no explotable hoy, solo un patrón a vigilar si se refactoriza.

### 23.11 — ⚪ CSRF: mitigado mayormente por diseño, sin defensa explícita adicional
El CORS nunca refleja el `Origin` entrante (siempre devuelve el valor fijo de `WEB_ORIGIN`), lo que bloquea el preflight de cualquier origen no autorizado para requests con JSON body (todos los POST/PUT/PATCH de la app). No hay token CSRF explícito como capa adicional — decisión arquitectónica razonable dado lo anterior, marcada como "a criterio futuro" más que como hallazgo.

---

## 24. Datos y producción — conteos verificados

| Tabla | Filas (2026-09-28) |
|---|---|
| usuarios | 5 |
| roles | 2 |
| clinicas | 5 |
| odontologos | 64 |
| pacientes | 74 |
| categorias_precio | 1 |
| prestaciones | 22 |
| listas_precio | 3 |
| lista_precio_items | 28 |
| ordenes | 70 |
| orden_prestaciones | 90 |
| orden_prestacion_piezas | 164 |
| comprobantes | 70 |
| pagos | 15 |
| movimientos_cuenta | 89 |
| numeradores | 2 |
| medios_pago | 3 |
| configuracion | 13 |
| auditoria | 792 |
| backups | 0 |
| resumenes_mensuales | 22 |
| busqueda_global | 283 |

---

## 25. Tests

**46 archivos, ~465 casos, framework Vitest.** Ejecutados durante esta misma sesión de trabajo (bloque de deploy anterior): **478/478 pasaron** (el número exacto de "tests" que reporta Vitest agrupa algunos casos distinto a como los cuenta esta auditoría por archivo, pero la corrida real fue 100% verde, 0 fallos).

**Hecho central**: la inmensa mayoría de la suite **no son tests unitarios con mocks** — corren contra una base Postgres real dedicada a tests (`TEST_DATABASE_URL`, proyecto Supabase **separado** de producción, `Densz-Test`), envolviendo cada `it()` en `BEGIN...ROLLBACK` para que nunca queden datos. Documentado así explícitamente en el propio `README.md`.

- **21 archivos** son tests HTTP reales (`supertest` contra el Express real).
- **22 archivos** prueban la capa de servicio/repositorio de Desktop directamente.
- **3 archivos** son verdaderos tests unitarios sin base de datos (`exportWriters`, `serverPdf`, `serverStorage` — Puppeteer/filesystem/Storage reales, pero sin Postgres).

**Gaps de cobertura confirmados** (sin test dedicado):
- `POST /auth/login` **no tiene ningún test HTTP** — todos los tests que necesitan sesión la crean con un helper interno (`crearSesionHttp`), saltándose la ruta real de login.
- `odontologos.route.ts`: solo 3 de sus 9 endpoints tienen cobertura HTTP (vía un archivo de "casos borde", no un `serverOdontologos.test.ts` dedicado como cada otro dominio).
- `configRepo.ts`, `searchService.ts`, `impresoraService.ts`, `brandAssets.ts`, las 3 plantillas HTML, `withTransaction.ts` en aislamiento, y 5 repositorios (`movimientosRepo`, `ordenesRepo`, `pagosRepo`, `comprobantesRepo`, `resumenesMensualesRepo`) — sin test dedicado propio (se ejercitan indirectamente vía tests de servicio).

**Riesgo de infraestructura de tests (no de producto)**: a diferencia de Postgres (que tiene un proyecto de test separado, `TEST_DATABASE_URL`), **Supabase Storage no tiene un bucket/proyecto de test separado** — al menos 5 archivos de test (`serverStorage`, `serverComprobantes`, `serverListaPreciosPdf`, `flujoCompletoNegocio`, `casosBordeBloque3`) suben/bajan/borran archivos reales contra el mismo bucket `documentos` que usa producción, mitigado solo por nombres claramente sintéticos y limpieza al final de cada test — no por aislamiento real.

---

## 26. Problemas actuales

### 🔴 Bugs confirmados
- **§38.1 — Doble conteo en estado de cuenta mensual** al editar una OT ya facturada en el mismo mes de facturación (ver detalle abajo). Es el hallazgo más serio de toda la auditoría porque afecta un número que se le muestra al odontólogo/clínica.

### 🟠 Problemas importantes
- 5 rutas HTTP que quedan colgadas ante query params inválidos (§23.7).
- `pagoService.ts` (Desktop) nunca registra auditoría al crear/anular un pago — inconsistente con el resto de los servicios.
- Modelo de autorización Web no diferenciado por rol en la mayoría de escrituras (§23.6).
- `CATEGORIAS_MOVER` no audita (única mutación de precios que no lo hace).

### 🟡 Problemas menores / deuda técnica
- Feature de **Backups** completamente obsoleta en ambas plataformas (9 métodos stub) — la pantalla Desktop devuelve errores fijos, la pantalla Web ni siquiera llama a nada, solo muestra un texto explicativo. Candidata a remover del todo en vez de mantenerla como stub silencioso.
- `SYSTEM_STATUS.migracionesAplicadas` hardcodeado a `[]` — campo vestigial del viejo sistema de migraciones SQLite.
- `PaginaEnConstruccion.tsx` existe pero no lo usa ninguna pantalla actual — código muerto o reservado.
- Búsqueda global: los resultados de tipo "paciente" y "comprobante" navegan a la lista general en vez de a un detalle específico (a diferencia de odontólogo/clínica/orden, que sí deep-linkean).
- `CuentaDetalle.tsx` y `ClinicaCuentaDetalle.tsx` son ~90% código duplicado en vez de un componente parametrizado.
- No se encontró `vercel.json` en el repo — la configuración de Vercel vive enteramente en su dashboard (zero-config), no versionada.

### ⚪ Limitaciones estructurales (no bugs, decisiones conscientes)
- Impresión física a impresora local: imposible desde la Web por diseño (§18).
- Sesiones HTTP en memoria: se pierden en cada redeploy de Railway (§6, §23.8).

### 🟢 Cosas que funcionan correctamente (verificado, no solo declarado)
- Numeración atómica de OT/comprobantes, segura ante condiciones de carrera.
- Todas las operaciones contables críticas (crear/editar/anular OT, generar comprobante, registrar/anular pago) están completamente envueltas en transacciones — nunca queda la base a medio escribir.
- Congelamiento de precios históricos: confirmado tanto en código como en tests dedicados.
- Auth end-to-end en producción (login → sesión cross-origin → logout) verificado en vivo en esta misma auditoría.
- CORS/cookies configurados correctamente para el escenario cross-origin real (Vercel↔Railway).

---

## 27. Diferencias Desktop vs. Web

| Funcionalidad | Desktop | Web | Diferencia | Motivo |
|---|---|---|---|---|
| Generación de PDF | `webContents.printToPDF` (Chromium embebido de Electron) | Puppeteer (Chromium headless real, proceso separado) | Mecanismo distinto, mismo HTML/plantillas de origen | Puppeteer no puede correr en el proceso Electron; `printToPDF` no existe fuera de Electron |
| Impresión física | Real, a impresora Windows seleccionada, con tamaño de página custom (110×150mm) para comprobantes | **No existe** — solo "Ver PDF"/descarga | WEB ≠ DESKTOP total | Un navegador no puede imprimir silenciosamente a una impresora específica |
| Backups | Stubs que tiran error/vacío (obsoleto desde Supabase) | Pantalla estática sin llamar a nada | Ambos "no funcionan", por diseño | Backup por archivo local (SQLite-era) no tiene sentido con Postgres/Supabase |
| Selección de impresora | Real, enumera impresoras del SO | Muestra mensaje "solo disponible en Desktop" | WEB ≠ DESKTOP | Estructural |
| Exportar (CSV/XLSX/PDF) | Diálogo nativo de guardar + abre la carpeta en el Explorador | Descarga de navegador estándar | Mismo dato exportado, UX distinta | Un navegador no tiene diálogo nativo de guardar-archivo con esas capacidades |
| Ver PDF (comprobante/lista/resumen) | Ventana Electron nativa con el visor de PDF de Chromium | Nueva pestaña del navegador con el blob | Mismo PDF, mecanismo de visualización distinto | — |
| Sesión | Global de proceso, un usuario a la vez | Cookie HTTP por navegador, multiusuario real | Estructural | Multiusuario es un requisito nuevo de la Web |
| Protección Cuentas/Estadísticas | Global de proceso (un desbloqueo para toda la app) | Por sesión de cookie (cada navegador el suyo) | El modelo Web es más correcto en un escenario multiusuario | — |
| Autorización de escrituras | Solo requiere sesión en casi todo (excepciones: Usuarios, Auditoría, Config, Cuentas, Estadísticas, Precios-editar, Eliminar OT) | **Idéntico** — misma superficie, mismas excepciones | Paridad total, deliberada | Documentado explícitamente en comentarios como decisión consciente |
| Nombre de campo "dbPath" | `"Supabase (<hostname>)"` | Mismo campo/formato | — | Vestigio de nomenclatura SQLite-era, cosmético |

---

## 28. Cosas que NO se deben tocar sin mucho cuidado

- **`numbering.ts` / `siguienteNumero`**: es la única garantía de que dos OTs nunca compartan número. Cualquier cambio que no preserve la atomicidad del `UPDATE...RETURNING` puede generar números duplicados.
- **`comprobanteService.generarComprobante`**: la transacción que une numerar+marcar facturada+registrar movimiento DEBE es la garantía de que nunca exista un comprobante sin su movimiento contable (o viceversa). Tocar el orden de esas 3 operaciones o sacarlas de la transacción rompe esa garantía.
- **`cuentaService.calcularBloquesMes`**: única fuente de verdad del saldo mensual mostrado al usuario — ver el bug de §38.1 antes de tocar nada relacionado a edición de OTs facturadas.
- **`ordenService.editarOrdenConPrestaciones`** (la parte que recalcula el movimiento DEBE): frágil, ya tiene un bug conocido (§38.1) — cualquier cambio ahí debería ir acompañado de un test que cubra específicamente "editar una OT facturada en el mismo mes de facturación".
- **Vistas `v_saldo_odontologo_moneda` / `v_saldo_clinica_moneda`**: son SQL puro en la base, no TypeScript — un cambio ahí no pasa por ningún test de la suite (que prueba el código de aplicación, no las vistas SQL directamente).
- **`session.ts` / `requireAuth.ts` / `requireProteccion.ts`** (Web): la separación deliberada entre el estado global de Desktop y el estado por-cookie de Web es lo único que hace seguro el multiusuario — no simplificar "para que se parezca más a Desktop".
- **`proteccion.ts` (Web) y `proteccionService.ts` (Desktop)**: coexisten a propósito sin compartir estado — no "unificarlos" sin entender por qué se separaron.
- **RLS de Supabase**: activarlo sin las políticas correctas rompería el acceso completo del backend (aunque `service_role` lo esquiva, cualquier código futuro con `anon key` se quedaría sin acceso a nada) — no es un cambio de una sola línea.

---

## 29. Decisiones de producto ya tomadas (reflejadas en código/README)

- **Nunca se convierte moneda.** Cada lista de precios tiene una moneda fija de por vida; los montos se guardan y muestran tal cual, sin tipo de cambio en ningún punto del sistema.
- **El pasado no cambia**: precio, moneda, lista, prestación, cantidad, piezas, subtotal y total de una OT ya creada quedan congelados para siempre, incluso si se edita la OT después (se recongela con la lógica de precios vigente en ese momento de la edición, pero nunca "flota" contra cambios futuros del catálogo).
- **Nada se borra físicamente por defecto** — se anula o se inactiva, con motivo y usuario. Las únicas excepciones explícitas (solo ADMIN, con confirmación) son "Eliminar OT" y corregir un registro cargado por error sin historial asociado, y siempre queda un snapshot completo en Auditoría.
- **El saldo nunca es un campo editable a mano** — siempre se deriva de `movimientos_cuenta` vía las vistas SQL.
- **Si un odontólogo factura a través de una clínica, la deuda es de la clínica**, no del profesional — decidido al crear la OT (congela la clínica del profesional en ese momento) y aplicado al facturar.
- **Backups por archivo local ya no aplican** — la continuidad depende del respaldo del proyecto de Supabase, no de un archivo en la PC (explícito en README).
- **Impresión física es exclusiva de Desktop** — la Web ofrece PDF + diálogo de impresión del navegador en su lugar, decisión reconocida como "pérdida real de comodidad, no un detalle técnico menor" (documentado en el propio plan de migración, `docs/ARQUITECTURA_Y_MIGRACION_WEB.md`).
- **Multi-laboratorio queda para una etapa futura separada** — hoy toda la base es de un solo laboratorio (Dental Szymek), sin columna `laboratorio_id` en ninguna tabla (confirmado — no existe esa columna en ninguna de las 22 tablas).

---

## 30. Pendientes (separados por categoría)

**A. Bugs**
- Doble conteo en estado de cuenta mensual al editar OT facturada en el mismo mes (§38.1).
- 5 rutas HTTP que cuelgan ante query params inválidos.

**B. Mejoras UX**
- Búsqueda global: deep-link real para resultados de tipo paciente/comprobante.
- Unificar `CuentaDetalle`/`ClinicaCuentaDetalle` en un solo componente parametrizado.

**C. Mejoras técnicas**
- Agregar un error-handler global de Express (evitaría la clase entera de bugs de §23.7).
- Agregar tests HTTP dedicados para `POST /auth/login` y los 6 endpoints de `odontologos.route.ts` sin cobertura.
- Un bucket de Storage separado para tests (hoy comparte el bucket de producción).

**D. Seguridad**
- Rate-limiting en `/auth/login`.
- Decidir conscientemente si activar RLS en Supabase (y con qué políticas).
- Decidir si el modelo de autorización Web debería diferenciarse más por rol que hoy.

**E. Backups**
- Definir una estrategia real ahora que se sabe que el plan gratuito de Supabase no incluye backups automáticos (ver informe de despliegue anterior) — hoy no hay ningún backup automático corriendo.

**F. Producto**
- Decidir si mantener el repo de GitHub público.
- Decidir el futuro de la feature "Backups" (removerla del todo vs. mantenerla como stub).

**G-L.** Mobile, dominio propio, multi-laboratorio, comercialización: sin decisiones tomadas en el código — fuera del alcance de lo que se puede auditar (son decisiones de negocio, no técnicas).

---

## 31. Mapa de dependencias entre módulos

```
Odontólogos/Clínicas ← Listas de precio (asignación)
Odontólogos/Clínicas + Pacientes → Trabajos (OT)
Precios (categorías/prestaciones) → Listas de precio → Trabajos (precio congelado)
Trabajos → Comprobantes → Cuentas (movimiento DEBE)
Pagos → Cuentas (movimiento HABER)
Cuentas → Estadísticas (agregación)
Todo lo anterior → Auditoría (efecto secundario de cada escritura)
Usuarios/Roles → permisos que gatean todo lo anterior
Configuración → Protección (gatea Cuentas/Estadísticas) + nombre del laboratorio (aparece en PDFs)
```

---

## 32. Flujos de negocio completos

**Flujo principal (facturación end-to-end)**:
```
Crear odontólogo (con lista de precios asignada)
  → Crear paciente (o resolverlo implícitamente en Nuevo Trabajo)
  → Crear OT: se resuelven precios desde la lista vigente (o manual), se congela clínica del odontólogo,
    se numera atómicamente (OT-XXXXXXXX), estado = pendiente_facturar
  → Generar comprobante: dentro de una única transacción — numera (CB-XXXXXXXX),
    marca la OT como facturado, registra movimiento DEBE (a nombre de clínica u odontólogo según corresponda)
  → PDF se genera después del commit (efecto secundario en disco, reintentable si falla)
  → Registrar pago: detección de duplicados → movimiento HABER
  → Ver cuenta: saldo = Σ DEBE no-anulado − Σ HABER no-anulado, por moneda
  → Generar resumen mensual: snapshot append-only, PDF a Storage
  → Ver estadísticas: agregaciones sobre lo mismo, protegido por contraseña adicional
```
Caminos alternativos: anular OT (revierte comprobante+movimiento sin borrar nada), editar OT facturada (recalcula el movimiento DEBE — ver bug §38.1), eliminar OT definitivo (solo ADMIN, borra todo en cascada con snapshot en auditoría).

---

## 33. Auditoría visual — `NO VERIFICADO` (pendiente de tu ayuda)

Pude verificar visualmente la **pantalla de login** en producción (carga correctamente, sin errores de consola, redirige bien cuando no hay sesión). No pude hacer un recorrido visual completo de las pantallas **autenticadas** (Cuentas, Estadísticas, Trabajos, etc.) porque eso requeriría que yo mismo escriba tu contraseña real en el navegador — algo que por política de seguridad de esta sesión nunca hago, ni siquiera para verificación.

Lo que sí pude documentar con certeza a nivel de código (colores, tipografía, componentes reutilizados, breakpoints declarados) está en §19/§10-20 arriba, extraído de `tokens.css`/`globals.css`/el kit de componentes `ui/*.tsx` — pero es documentación de código, no una inspección visual en vivo.

**Si querés que complete esta parte**: la forma más simple es que inicies sesión vos mismo en `https://densz.vercel.app` en el navegador que uso para estas tareas, y yo tomo el control de ahí en adelante (navegación, screenshots, sin tocar ni ver tu contraseña). Avisame si querés hacerlo en algún momento — no es urgente para el resto de este documento.

---

## 34. Resumen ejecutivo final

### Densz hoy es:
Un sistema de gestión de laboratorio dental completo, en uso real, corriendo en Desktop (Windows/Electron) y Web (Vercel+Railway) desde el mismo código de interfaz, sobre una única base Postgres/Supabase compartida.

### Arquitectura:
Sólida y bien documentada en el propio código (los comentarios explican consistentemente el "por qué", no solo el "qué"). Separación limpia entre lógica de negocio (reutilizada 100%) y las dos "envolturas" de plataforma (IPC vs. HTTP).

### Estado Web:
Funcional en producción, verificado end-to-end (login, sesión cross-origin, CORS, cookies). Modelo de autorización heredado del Desktop, no reforzado por rol para el contexto multiusuario.

### Estado Desktop:
Estable, con una suite de tests grande que lo cubre bien. Impresión física y generación de PDF resueltas con soluciones puntuales bien documentadas (incluyendo bugs de Electron/Chromium ya encontrados y sorteados en el pasado).

### Seguridad:
Fundamentos correctos (bcrypt, cookies httpOnly, CORS restringido, secretos nunca en el navegador). Puntos reales a decidir: RLS de Supabase, repo público, autorización por rol en Web, rate-limiting de login.

### Base de datos:
Modelo relacional limpio, bien normalizado, con un patrón consistente de soft-delete + historial append-only para todo lo contable/de precios.

### Producción:
Online, en un dominio gratuito, sin backups automáticos (plan free de Supabase).

### Tests:
478/478 pasando, cobertura amplia pero con gaps puntuales identificados (login HTTP, algunos endpoints de odontólogos, algunos repos aislados).

### Bugs:
Uno real y concreto con impacto en un número visible al usuario (§38.1). El resto son de robustez (requests colgados) o de deuda técnica menor.

### Limitaciones:
Impresión física imposible en Web (estructural). Sesiones Web no sobreviven un redeploy.

### Deuda técnica:
Feature de Backups completamente obsoleta y sin remover. Algunas inconsistencias menores de auditoría/reordenamiento.

### Pendientes:
Ver §30, categorizados.

### Riesgos:
Ver §23, categorizados por severidad.

### Qué está realmente terminado:
Todo el ciclo contable (OT → comprobante → cuenta → pago → resumen → estadística), autenticación y protección en ambas plataformas, exportaciones, búsqueda global, auditoría.

### Qué NO está terminado:
Backups automáticos reales, multi-laboratorio, dominio propio, endurecimiento de autorización por rol en Web.

### Qué debería revisarse primero:
1. El bug de doble conteo en estados de cuenta (§38.1) — afecta un número real mostrado al usuario.
2. Decisión consciente sobre RLS de Supabase y visibilidad del repo.
3. Rate-limiting de login antes de que el tráfico real crezca.

---

## 35. Matriz final de estado

| Área | Estado | Web | Desktop | Backend | Tests | Riesgo | Pendiente |
|---|---|---|---|---|---|---|---|
| Inicio | 🟢 Completo | ✅ | ✅ | ✅ | Indirecta | 🟢 | — |
| Odontólogos | 🟢 Completo | ✅ | ✅ | ✅ | ✅ | 🟡 (sin permiso específico en escritura Web) | — |
| Clínicas | 🟢 Completo | ✅ | ✅ | ✅ | ✅ | 🟡 (ídem) | — |
| Pacientes | 🟢 Completo | ✅ | ✅ | ✅ | ✅ | 🟡 (ídem) | — |
| Trabajos/OT | 🟡 Completo con bug conocido | ✅ | ✅ | ✅ | ✅ (extenso) | 🔴 §38.1 | Corregir doble conteo |
| Precios/Listas | 🟢 Completo | ✅ | ✅ | ✅ | ✅ | 🟢 | — |
| Comprobantes | 🟢 Completo | ✅ (sin imprimir) | ✅ | ✅ | ✅ | 🟢 | — |
| Pagos | 🟢 Completo | ✅ | ✅ | ✅ | ✅ | 🟡 (sin auditoría en Desktop) | Agregar auditoría a pagoService |
| Cuentas | 🟡 Completo con bug conocido | ✅ | ✅ | ✅ | ✅ | 🔴 §38.1 | Corregir doble conteo |
| Estadísticas | 🟢 Completo | ✅ | ✅ | ✅ | ✅ | 🟢 | — |
| Usuarios | 🟢 Completo | ✅ | ✅ | ✅ | ✅ | 🟢 | — |
| Auditoría | 🟢 Completo | ✅ | ✅ | ✅ | ✅ | 🟢 | — |
| Configuración | 🟢 Completo | ✅ | ✅ | ✅ | Parcial | 🟢 | — |
| Protección | 🟢 Completo | ✅ (por sesión) | ✅ (global proceso) | ✅ | ✅ | 🟢 | — |
| Búsqueda global | 🟢 Completo | ✅ | ✅ | ✅ | Indirecta | 🟡 (deep-link incompleto) | UX menor |
| Exportaciones | 🟢 Completo | ✅ | ✅ | ✅ | ✅ | 🟢 | — |
| PDFs | 🟢 Completo | ✅ (Puppeteer) | ✅ (printToPDF) | ✅ | ✅ | 🟢 | — |
| Storage | 🟢 Completo | ✅ | N/A (local histórico) | ✅ | ✅ (bucket compartido con tests) | 🟡 | Bucket de test separado |
| Impresión física | ⚪ N/A en Web por diseño | ❌ | ✅ | N/A | N/A | ⚪ | — |
| Backups | 🔴 Obsoleto, sin reemplazo | Stub | Stub | N/A | N/A | 🟠 | Definir estrategia real |
| Seguridad general | 🟡 Sólida con puntos a decidir | — | — | — | — | Ver §23 | Ver §23 |

---

## 36. Conclusión

Densz es un sistema serio, con una base de código consistente, bien comentada, con una suite de tests real y amplia, y con decisiones de negocio claras y documentadas (moneda fija, historial inmutable, congelamiento de precios). La migración a Web se hizo reutilizando la lógica de negocio casi sin tocarla, lo cual es la señal más fuerte de que el diseño original era sólido.

El hallazgo más importante de esta auditoría es concreto y accionable: **hay un bug real que puede inflar el saldo mostrado en un estado de cuenta mensual** cuando se edita una orden ya facturada dentro del mismo mes en que se facturó. El resto de los hallazgos son, en su mayoría, decisiones conscientes heredadas de un modelo "Desktop de un solo operador" que valen una revisión ahora que Densz vive en internet — no errores de implementación.

Este documento no modificó nada: es exclusivamente una fotografía de lectura, para que sirva de contexto en cualquier trabajo futuro sobre el sistema.

---

## 38. Apéndice — Hallazgos técnicos detallados

### 38.1 — 🔴 BUG REAL: posible doble conteo de una OT editada en el estado de cuenta mensual

**Archivos**: `src/main/db/repositories/movimientosRepo.ts` (`listarTrabajosFacturadosPorMes`, líneas ~304-338, vs. `calcularSaldoAnteriorAlPeriodo`, líneas ~371-404) + `src/main/services/ordenService.ts` (`editarOrdenConPrestaciones`, línea ~314) + `src/main/services/cuentaService.ts` (`calcularBloquesMes`).

**Causa raíz**: cuando se edita una OT que ya estaba facturada y cambia su importe/moneda/titular, `editarOrdenConPrestaciones` **anula** (nunca borra) el movimiento DEBE viejo y crea uno nuevo activo — pero la **orden** sigue con `estado: 'facturado'`, nunca pasa a `'anulado'`. El listado de trabajos facturados del mes (`listarTrabajosFacturadosPorMes`) deriva el flag "anulado" que muestra desde el **estado de la orden**, no desde el flag `anulado` del movimiento individual — así que si la edición ocurre en el mismo mes que la facturación original, **tanto el movimiento viejo (ya anulado) como el nuevo aparecen como filas activas** en el detalle del mes, y el importe se **suma dos veces** en el total mostrado.

**Impacto**: infla el saldo pendiente mostrado al odontólogo/clínica para ese mes específico, y la OT aparece duplicada visualmente en el PDF/pantalla del estado de cuenta (ninguna de las dos filas se marca como anulada). **No afecta** el saldo "actual" general (la vista SQL sí filtra correctamente por `movimiento.anulado`) ni los estados de cuenta de meses posteriores.

**No corregido** — documentado únicamente, por instrucción explícita de esta auditoría.

### 38.2 — Otros hallazgos de código (consolidado de las 5 investigaciones)
Ver el detalle completo en cada sección temática de arriba (§23 seguridad, §25 tests, §26 problemas). Los hallazgos individuales de mayor detalle técnico (líneas de código exactas, fragmentos citados) quedan en las transcripciones de las auditorías especializadas que generaron este documento — disponibles en el historial de esta conversación si se necesita el detalle línea por línea de algo puntual.
