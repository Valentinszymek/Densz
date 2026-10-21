# Densz — Fase 1: Auditoría Comercial y Plan de Implementación

**Fecha:** 2026-10-20
**Tipo de documento:** Auditoría + propuesta de implementación. **No se modificó código ni datos durante esta fase.** Todas las consultas a Postgres fueron `SELECT` de solo lectura contra el proyecto de **TEST**, nunca contra producción.

## 0. Decisiones comerciales ya tomadas (dadas, no se vuelven a discutir aquí)

- Mercado inicial: internacional.
- Argentina: precios/cobros en ARS. Exterior: precios/cobros en USD.
- Prueba gratuita: 30 días.
- Dos planes: **Densz Essential** y **Densz Professional**.
- Precios propuestos: Essential $19.900 ARS / US$19 por mes; Professional $34.900 ARS / US$35 por mes.
- Estética: futurista, premium, tecnológica, negro y dorado (ya es la identidad visual actual de la app — ver `tailwind` tokens `carbon`/`gold`/`cream` usados en toda la UI).
- El sitio público debe presentar/vender Densz y ser la puerta de entrada al registro y a la app.

---

## 1. Arquitectura actual (frontend / backend / base de datos)

Densz es **una sola base de código** que sirve tres superficies, todas sobre la misma capa de datos:

```
src/main/        Electron (proceso main) — única capa con acceso a Postgres en el escritorio
  db/repositories/*.ts   acceso a datos async (pg), uno por dominio
  services/              lógica de negocio transaccional (incluye googleAuthService.ts)
  ipc/                    frontera de validación (zod) hacia el renderer, en escritorio
src/server/       Backend HTTP (Express) — "sobre" nuevo alrededor de la MISMA capa de repos/servicios
  routes/*.route.ts       un router por dominio (auth, pacientes, pagos, laboratorios, ...)
  middleware/             requireAuth, requireSuperAdmin, errorHandler
src/renderer/     React + Vite — UI compartida entre escritorio (Electron) y web (Vercel)
src/shared/       tipos + contrato IPC + constantes de permisos (único lugar que main y renderer comparten)
```

- **Una sola base de producción compartida** (Postgres/Supabase, proyecto `cvplaqzlaeyhnwbrrkfi`): la app de escritorio y la web leen y escriben exactamente los mismos datos en tiempo real. No hay caché ni sincronización intermedia.
- **Multi-tenant real, ya en producción desde 2026-10-19**: aislamiento por Row-Level Security (RLS) en 19 tablas, con el laboratorio actual fijado por sesión (`app.current_laboratorio_id`). Cada laboratorio es una fila en `laboratorios` y cada usuario pertenece a uno.
- **Capa de datos reutilizada sin cambios** entre escritorio y web: los repositorios aceptan indistintamente `Pool` o `PoolClient` (`Queryable` en `src/main/db/types.ts`), así que el backend web no tuvo que reescribir ninguna consulta.

Esta base (multi-tenant + RLS + login con Google) es precisamente la que hace *posible* pensar en un alta de laboratorio self-service — ya no hace falta ninguna migración de aislamiento para vender a un laboratorio nuevo, eso ya está resuelto.

## 2. Sistema de autenticación y recuperación de contraseña

- **Login principal**: dos caminos, ambos ya en producción — usuario/contraseña (bcrypt, `src/server/routes/auth.route.ts`, `POST /auth/login`) y Google OAuth (`googleAuthService.ts`, vía Supabase Auth en la web y navegador del sistema + servidor local en el escritorio).
- **Alta de laboratorio nuevo ya existe y funciona**: `registrarseConGoogle()` (`src/main/services/googleAuthService.ts:73-131`) — si el email de Google no está asociado a ningún laboratorio, crea en una sola transacción: la fila en `laboratorios` (`plan='trial'`, `estado_suscripcion='trialing'`, `trial_termina_en = ahora + 14 días` — placeholder), un usuario ADMINISTRADOR, y el seed mínimo (lista de precios "General", numeradores en 0).
- **Recuperación de contraseña: NO EXISTE para el login principal.** Se confirmó por grep exhaustivo (`src/server/routes/auth.route.ts` y todo `src/`): los únicos resultados para "recuperar/olvidé/reset" pertenecen a una función completamente distinta — la "Protección" (clave secundaria para ver Cuentas/Estadísticas dentro de la app, no el login). Hoy, si un usuario de laboratorio olvida su contraseña, no hay ningún flujo de autoservicio — depende de que un ADMINISTRADOR de su mismo laboratorio le cambie la contraseña manualmente desde **Usuarios**, o de usar Google si tiene esa cuenta vinculada.
  - **Esto es un hueco real para un lanzamiento comercial**: un cliente nuevo sin Google que olvide su contraseña se queda sin forma de entrar por su cuenta. Se propone como parte de la Etapa de implementación (sección 7.3).

## 3. Cómo se determina hoy el acceso de un usuario

Dos capas independientes, ninguna relacionada todavía con "plan pagado":

1. **Aislamiento entre laboratorios (tenant)**: RLS + `app.current_laboratorio_id`. Un usuario solo ve filas de su propio laboratorio, sin excepción, a nivel de base de datos (no a nivel de código de aplicación — si una consulta nueva se olvida algo, Postgres devuelve cero filas, nunca filas de otro laboratorio).
2. **Permisos dentro de un mismo laboratorio**: `src/shared/constants/permisos.ts` — dos roles fijos (`ADMINISTRADOR`, `RECEPCION`), un mapa de permisos granular por módulo (`ORDENES_VER`, `PAGOS_CREAR`, `CONFIGURACION_EDITAR`, etc.), y `tienePermiso()` que cada endpoint consulta.
3. **Cross-tenant (superAdmin)**: un flag nuevo, `usuarios.super_admin`, no ligado a ningún laboratorio — hoy solo habilita el panel interno `/laboratorios` (ver sección 4). Es el único concepto de "administración comercial" que existe.

**No existe ningún concepto de "feature gateada por plan"** todavía. Ningún endpoint ni componente de UI consulta `laboratorios.plan` para decidir qué mostrar u ocultar.

## 4. Funciones comerciales/administrativas que ya existen

| Función | Dónde vive | Estado |
|---|---|---|
| Tabla `laboratorios` con columnas de facturación (`plan`, `estado_suscripcion`, `trial_termina_en`, `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`) | Esquema de Postgres (TEST y producción) | **Existen pero no se usan.** Ninguna ruta ni servicio lee/escribe los campos `stripe_*`. `estado_suscripcion` se escribe una sola vez al registrarse (`'trialing'`) y nunca se vuelve a tocar ni a verificar en ningún lado. |
| Placeholder de prueba gratis | `registrarseConGoogle()` | 14 días fijos, hardcodeado, sin ningún job ni lógica que actúe cuando vence. |
| Panel `/laboratorios` (listado de todos los laboratorios registrados) | `src/renderer/pages/Laboratorios`, `src/server/routes/laboratorios.route.ts`, solo-lectura | Funciona en producción, protegido por `requireSuperAdmin`. Hoy es solo un listado — no tiene acciones de cobro, cambio de plan, ni cancelación. |
| Descarga del instalador de escritorio + auto-actualización | `Configuración` (web) + GitHub Releases | Funciona en producción. No relacionado a planes. |

**Conclusión honesta**: hoy Densz tiene la *forma* de un sistema de suscripciones (columnas creadas, trial que se registra) pero **cero lógica de negocio de cobro**: nada bloquea, nada renueva, nada factura. Es exactamente el estado correcto para empezar esta fase sin haber improvisado nada antes.

## 5. Proceso de despliegue actual

- **Backend (Railway)**: Node + Nixpacks, build explícito por `nixpacks.toml` (`npm run build:server` / `npm run start:server`), con la lista completa de dependencias de sistema de Chromium/Puppeteer (usado para generar PDFs de comprobantes). Variables de entorno gestionadas en el dashboard de Railway; un deploy nuevo se dispara con cada push a `main`, pero las variables de entorno nuevas requieren un "Deploy" manual una vez (hallazgo real de esta sesión, documentado en el plan de SaaS).
- **Frontend (Vercel)**: sin `vercel.json` — configuración por detección automática de framework vía dashboard. Deploy automático en cada push a `main`.
- **Escritorio (GitHub Releases)**: `electron-builder` publica el instalador como Release pública del mismo repo; `electron-updater` lo detecta automáticamente en instalaciones existentes.
- **No hay entorno de staging.** Todo cambio de código llega a producción directo al mergear a `main`. Las pruebas previas se hacen contra `TEST_DATABASE_URL` (proyecto Supabase separado) o localmente, nunca contra un "staging" desplegado.

**Implicancia para esta fase**: cualquier cambio de facturación debe probarse exhaustivamente contra TEST (incluido el modo sandbox/test del proveedor de pagos elegido) antes de tocar `main`, porque no hay red de contención de staging.

## 6. Proveedores de pago para suscripciones en ARS + USD — investigación real (con lo que queda sin confirmar)

Se investigó esto vía búsqueda web real (no se asumió nada). Resultado honesto: **ningún proveedor quedó 100% confirmado para el caso exacto de Densz** (una empresa radicada en Argentina que necesita cobrar tanto en ARS localmente como en USD a clientes del exterior) — hace falta una verificación directa con cada proveedor (crear cuenta de prueba / hablar con soporte) antes de comprometerse. Esto es intencional: el usuario pidió explícitamente no inventar capacidades no verificadas.

| Proveedor | Lo que sí se confirmó | Lo que queda sin confirmar |
|---|---|---|
| **Stripe** | Desde marzo de 2026, Stripe agregó "Global Payouts" con cuentas bancarias receptoras en Argentina (formato CBU) — pero esto es para **recibir** pagos cross-border, no necesariamente para que una empresa *radicada* en Argentina abra una cuenta estándar de Stripe como vendedor/merchant. | Si Densz (como empresa argentina) puede crear una cuenta Stripe estándar para cobrar suscripciones en USD a clientes del exterior. Fuentes de terceros (no oficiales) dicen que sí desde 2022, pero no hay confirmación oficial de Stripe en esta investigación. **Se requiere verificar directamente en stripe.com/global o abriendo una cuenta de prueba.** |
| **Mercado Pago** | Tiene una API de Suscripciones (`/preapproval`) con cobro recurrente semanal/mensual/anual, manejo de reintentos automático ante rechazo, y es el método de pago más familiar para usuarios argentinos (tarjeta, Rapipago, Pago Fácil, dinero en cuenta). | Si soporta cobro en **USD** — toda la documentación revisada habla de montos sin especificar moneda más allá de ARS; lo más probable, sin confirmar, es que Mercado Pago Argentina solo cobre en ARS. |
| **Paddle** (Merchant of Record) | Su tabla de países soportados incluye Argentina con ARS como moneda de transacción — y como "Merchant of Record" se encarga de impuestos/compliance globalmente, lo cual simplificaría mucho vender a múltiples países. | Si Argentina está habilitada como país de **vendedor** (no solo de venta/comprador) — la documentación pública no distingue esto con claridad; Paddle sugiere consultar su endpoint `/countries` (`allow_sales`) o a su equipo directamente. |
| **dLocal** | Orientado a SaaS en LatAm, con métodos de pago locales y manejo de aprobación de suscripciones — posicionamiento fuerte para la región. | Es un producto de ventas enterprise (requiere contacto comercial, no autoservicio) — no hay documentación pública de API de recurrencia accesible sin ese contacto; probablemente sea sobredimensionado para el volumen inicial de Densz. |

**Hipótesis de trabajo más razonable (a confirmar antes de implementar, no a dar por hecho)**: usar **dos proveedores separados**, uno por moneda — algo como Mercado Pago (o similar) para las suscripciones en ARS de clientes argentinos, y Stripe o Paddle para las suscripciones en USD del resto del mundo. Esto además calza naturalmente con la decisión comercial ya tomada ("Argentina en ARS, exterior en USD"), en vez de forzar un solo proveedor a cubrir los dos casos. **Esta hipótesis debe verificarse con cuentas de prueba reales antes de escribir una sola línea de integración** — es exactamente el primer paso de la Etapa de implementación (sección 7, paso 0).

## 7. Diseño de trial, renovaciones, pagos fallidos y cancelaciones (sobre el papel, no implementado)

Mapeo propuesto sobre las columnas que **ya existen** en `laboratorios` (no se necesita ninguna migración para esto):

- `estado_suscripcion`: `trialing` → `active` → `past_due` → `canceled` (son los 4 valores que ya contempla el diseño original de la tabla).
- `trial_termina_en`: pasa de 14 a **30 días** (cambio de una constante en `registrarseConGoogle`, sin tocar esquema).
- `stripe_customer_id` / `stripe_subscription_id` / `stripe_price_id`: se usarían tal cual están nombradas si el proveedor elegido es Stripe; si se termina usando un proveedor dual (sección 6), estas columnas pasarían a ser más genéricas (ej. renombrar conceptualmente a "proveedor_customer_id" sin necesariamente cambiar el nombre físico de columna, para no romper nada ya escrito) — **esto es una decisión a tomar recién cuando el proveedor esté confirmado**, no ahora.
- **Webhook del proveedor** (`POST /billing/webhook`, nueva ruta): actualiza `estado_suscripcion` según los eventos del proveedor (pago exitoso → `active`; pago fallido → `past_due`; cancelación → `canceled`). Debe registrarse con el body crudo (`express.raw`) **antes** del `express.json()` global de `src/server/index.ts`, porque la verificación de firma de estos proveedores necesita el payload sin parsear — si no, la verificación falla de forma intermitente (detalle ya identificado en la auditoría de código, no asumido).
- **Middleware nuevo `requireActiveSubscription`**: se agregaría después de `requireAuth` en las rutas de negocio (no en `/auth/*` ni `/billing/*`), bloqueando el acceso si `estado_suscripcion` no es `trialing` (y no vencido) ni `active`. El comportamiento exacto ante vencimiento (bloqueo duro vs. solo lectura) es una decisión de producto pendiente — se sugiere bloqueo duro con una pantalla clara de "renovar suscripción", consistente con la decisión ya tomada para el plan de SaaS anterior.
- **Reintentos de pago fallido**: delegados al proveedor (tanto Stripe como Mercado Pago ya hacen reintento automático documentado) — Densz solo necesita reflejar el estado que el webhook le informe, no implementar lógica de reintento propia.

## 8. Mapeo honesto de funcionalidades reales a cada plan

Antes de proponer un mapeo, la base real: hoy **todas las funciones de Densz están disponibles para cualquier laboratorio**, sin ninguna diferenciación de plan en el código (sección 3). Cualquier tabla de "qué incluye cada plan" que se publique en el sitio comercial tiene que corresponder a algo que:
(a) ya existe y funciona hoy, o (b) se construye explícitamente como parte de esta implementación — nunca una promesa sin backend real detrás.

Funcionalidades reales existentes hoy, agrupables en una diferenciación honesta Essential/Professional:

| Función | Existe hoy | Plan sugerido |
|---|---|---|
| Pacientes, odontólogos, clínicas, precios, órdenes de trabajo con odontograma FDI | Sí | Essential (base) |
| Comprobantes de entrega + impresión (PDF, directa en escritorio) | Sí | Essential (base) |
| Cuentas corrientes y pagos | Sí | Essential (base) |
| Usuarios múltiples con roles (ADMINISTRADOR/RECEPCION) | Sí | Essential (base) — ya no tiene sentido venderlo como diferencial, es necesario para operar con más de una persona |
| Auditoría (registro de quién hizo qué) | Sí | Professional |
| Estadísticas / dashboard | Sí | Professional |
| App de escritorio (Electron) con impresión directa + auto-actualización | Sí | Professional (valor real: evita el paso extra de imprimir desde el navegador) |
| Exportaciones (`export.route.ts`) | Sí (a confirmar alcance exacto en el código antes de publicarlo) | Professional |

**No se incluye en ninguna tabla pública**: nada relacionado a "laboratorios ilimitados", "soporte prioritario", "límite de usuarios", etc., porque **no existe hoy ningún límite técnico real por plan** — publicar un número (ej. "hasta 3 usuarios") sin que el código lo haga cumplir sería la clase exacta de promesa no verificada que esta auditoría tiene prohibido inventar. Si se quiere vender por límites de uso, eso es trabajo de implementación adicional (un `requireLimitePlan` nuevo), no algo que ya exista para anunciar.

---

## 9. Propuesta de implementación por etapas

**Principio rector, repetido a propósito**: la página comercial (marketing + registro) y los cambios internos de la aplicación (billing, gating por plan) son dos superficies separadas, con riesgos y velocidades de iteración distintas. Se implementan y despliegan por separado.

### Etapa 0 — Verificación de proveedor de pago (antes de escribir código de integración)
- Crear cuentas de prueba/sandbox en Mercado Pago y en Stripe (o Paddle) con datos de la empresa real, **sin activar nada en producción**.
- Confirmar por escrito (capturas, respuesta de soporte, o documentación oficial encontrada) si Densz como empresa argentina puede efectivamente cobrar en USD vía el proveedor elegido para el exterior.
- **Archivos afectados**: ninguno (investigación/configuración externa a este repo).
- **Riesgo si se salta este paso**: construir toda la integración de Etapa 2 sobre un proveedor que después resulta no poder cobrar en la moneda necesaria.

### Etapa 1 — Página comercial pública (marketing + registro), sin tocar billing todavía
- Nueva landing comercial (reemplaza o se antepone a la actual `Bienvenida.tsx`, que hoy es funcional pero no tiene precios ni planes) con estética negro/dorado ya existente en el design system, sección de planes (Essential/Professional, precios ARS/USD de la sección 0), CTA "Empezá gratis" que lleva al registro ya existente (`registrarseConGoogle` / flujo de alta).
- **Archivos afectados**: `src/renderer/pages/Login/Bienvenida.tsx` (o un componente nuevo separado, `src/renderer/pages/Marketing/`, para no mezclar la landing de venta con la pantalla de login real), posibles assets nuevos (capturas, no se tocan los ya existentes).
- **Sin cambios de backend, sin cambios de esquema.**
- **Pruebas**: visual/manual en navegador (no hay lógica de negocio nueva que testear con Vitest).
- **Riesgo**: bajo — es la superficie más aislada de todo el plan, no toca datos ni usuarios existentes.

### Etapa 2 — Integración de cobro (trial de 30 días + checkout)
- Cambiar el placeholder de 14 a 30 días en `registrarseConGoogle` (`src/main/services/googleAuthService.ts`).
- Agregar ruta `POST /billing/webhook` (`src/server/routes/billing.route.ts`, nuevo) + registrar `express.raw` antes del `express.json()` global en `src/server/index.ts`.
- Nuevo servicio `src/main/services/billingService.ts`: crea la sesión de checkout tras el registro, procesa los eventos del webhook, actualiza `estado_suscripcion`/`stripe_customer_id`/etc. en `laboratoriosRepo.ts` (ya existe, solo se le agregan métodos de actualización).
- **Archivos afectados**: `src/server/index.ts`, `src/server/routes/billing.route.ts` (nuevo), `src/main/services/billingService.ts` (nuevo), `src/main/db/repositories/laboratoriosRepo.ts` (métodos nuevos, sin tocar los existentes), `src/main/services/googleAuthService.ts` (constante de días de trial), variables de entorno nuevas (clave secreta del proveedor — **nunca committeadas**, solo en `.env` local y en el dashboard de Railway, con confirmación explícita antes de agregarlas a producción).
- **Pruebas**: contra TEST y en modo sandbox del proveedor exclusivamente — nunca con claves reales hasta el final. Tests nuevos de Vitest para `billingService` (idempotencia del webhook, transición correcta de estados) siguiendo el mismo patrón de `tests/unit/` existente (Postgres real con `ROLLBACK`, no mocks).
- **Riesgo**: alto si se apura — manejar dinero real mal (doble cobro, webhook no idempotente, firma mal verificada) es el tipo de bug más caro de este plan. Requiere la mayor cantidad de pruebas antes de tocar producción.

### Etapa 3 — Enforcement (bloqueo por suscripción vencida)
- Middleware `requireActiveSubscription` (`src/server/middleware/requireActiveSubscription.ts`, nuevo), agregado a las rutas de negocio (no a `/auth/*`, `/billing/*`, ni al panel `/laboratorios` de superAdmin).
- UI de bloqueo (`src/renderer/pages/Billing/SuscripcionVencida.tsx`, nuevo) — pantalla clara con CTA de renovar.
- **Archivos afectados**: cada `*.route.ts` existente (una línea de middleware por archivo, igual patrón mecánico que el ya usado para `attachTenantDb` en la migración multi-tenant), componente nuevo de UI, posible ajuste en el router del renderer.
- **Pruebas**: un laboratorio de prueba con `estado_suscripcion='past_due'` debe perder acceso a datos pero conservar el login; uno con `'active'` o `'trialing'` (no vencido) debe funcionar sin cambios — probado contra TEST antes de producción.
- **Riesgo**: medio — el error más peligroso posible es bloquear por accidente a un laboratorio que sí está activo (o, al revés, al propio Dental Szymek, que según la decisión ya tomada en el plan de SaaS queda "activo gratis" sin pasar por el proveedor — hay que asegurarse de que el middleware lo excluya explícitamente, no por accidente).

### Etapa 4 — Recuperación de contraseña (hueco identificado en la sección 2)
- Flujo estándar: `POST /auth/forgot-password` genera un token de un solo uso con expiración corta, se envía por email (requiere un proveedor de envío de emails transaccionales, hoy inexistente en el proyecto — a decidir/confirmar, no asumir uno), `POST /auth/reset-password` lo consume.
- **Archivos afectados**: `src/server/routes/auth.route.ts`, nueva tabla o columnas para el token (migración aditiva, nullable, sin tocar filas existentes), UI nueva en el flujo de login.
- **Riesgo**: bajo técnicamente, pero depende de elegir un proveedor de email — otra verificación externa pendiente, igual que la Etapa 0 de pagos.

### Etapa 5 — Gating real por plan (opcional, puede diferirse)
- Solo si se decide que Essential/Professional difieren en algo más que "lo que dice el sitio" — ej. ocultar Auditoría/Estadísticas a Essential. Implica `tienePermiso`-like checks adicionales basados en `laboratorios.plan`, no solo en roles.
- Se deja fuera del alcance inmediato porque la sección 8 ya marca qué funciones mapean a qué plan sin necesidad de bloquear nada técnicamente desde el día 1 — se puede vender la diferenciación y enforced recién más adelante, sin bloquear el lanzamiento.

---

## 10. Riesgos generales a tener presentes durante toda la implementación

- **Nunca probar contra `DATABASE_URL`/producción** — toda esta fase de implementación debe seguir la misma disciplina que el resto del proyecto (regla permanente del repo, `CLAUDE.md`): TEST primero, producción solo tras confirmación explícita por operación puntual.
- **Dental Szymek (laboratorio #1, datos reales desde 2026-10-01) no debe verse afectado** por ningún cambio de billing — ya está decidido que queda "activo gratis" sin pasar por el proveedor de pago; cualquier migración o enforcement debe excluirlo explícitamente y verificarlo antes de desplegar.
- **Sin entorno de staging** (sección 5): cada cambio de esta fase llega a producción apenas se mergea a `main` — por eso las Etapas están ordenadas de menor a mayor riesgo, y la Etapa 2 (dinero real) es la que exige más pruebas en sandbox antes de tocar claves reales.
- **No hay confirmación aún de qué proveedor de pago puede cobrar legítimamente en USD desde Argentina** (sección 6) — este es el riesgo más grande de todo el plan si se saltea la Etapa 0.

---

## Resumen para aprobación

Esta auditoría no modificó código ni datos. Hallazgos clave:
1. La arquitectura multi-tenant (RLS + login Google) ya soporta un alta de laboratorio self-service — no hace falta rehacer nada de eso.
2. El login principal no tiene recuperación de contraseña — hueco real a resolver antes de un lanzamiento comercial amplio.
3. Las columnas de facturación en `laboratorios` existen pero no se usan — no hace falta migración para el diseño propuesto de trial/renovación/cancelación.
4. Ningún proveedor de pago quedó confirmado al 100% para el caso ARS+USD de Densz — se propone una Etapa 0 de verificación directa (Mercado Pago para ARS, Stripe o Paddle para USD como hipótesis a confirmar) antes de integrar nada.
5. El mapeo de funciones a planes (sección 8) usa solo lo que existe hoy — nada se promete sin backend real.

**Quedo a la espera de tu aprobación antes de implementar cualquier etapa.**
