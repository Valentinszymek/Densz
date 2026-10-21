# Densz — Reporte de Lanzamiento Comercial

**Fecha:** 2026-10-21
**Rama:** `main` (commit `e7fa1ed`, ya desplegado en producción)
**Basado en:** [`docs/PLAN_COMERCIAL_DENSZ.md`](PLAN_COMERCIAL_DENSZ.md) (auditoría de Fase 1)

## Resumen ejecutivo

Se implementaron y desplegaron las dos etapas pedidas: una web comercial completa (landing, planes, registro propio, recuperación de contraseña, trial de 30 días) y toda la infraestructura de suscripciones y control de acceso (Mercado Pago para ARS, Stripe para USD, webhooks, estados de suscripción, bloqueo por plan/vencimiento). Todo está en producción y verificado, **excepto un punto**: el checkout de pago real todavía no se probó de punta a punta porque las credenciales de Mercado Pago/Stripe siguen pendientes de tu parte. Por eso, siguiendo tu propia regla (condición 10), **todavía no declaro a Densz "listo para vender"** — ver sección 7.

De paso, investigando un test que fallaba, se encontró y corrigió una fuga real de datos financieros entre laboratorios (no relacionada con este trabajo) — ver sección 6.

## 1. Funcionalidades implementadas

### Etapa 1 — Web comercial

- **Landing pública** (`Bienvenida.tsx`): hero, "cómo funciona", capturas reales + GIF animado (ya existían), sección de **Planes** (Essential/Professional, toggle ARS/USD con default por huso horario), **Preguntas frecuentes** (6 preguntas, todas sobre funciones reales — nada inventado), CTAs "Empezá gratis".
- **Registro propio**: además de "Continuar con Google" (ya existía), ahora también **email + contraseña** vía Supabase Auth — mismo backend sin cambios (`verificarTokenGoogle` ya era agnóstico al proveedor). Si el proyecto exige confirmar el email (como el de producción), el alta del laboratorio se completa recién en el primer login exitoso, nunca a medias.
- **Login propio**: mismo agregado — "Iniciar sesión con email y contraseña" junto a Google, en la pantalla de selección de usuario. El login tradicional por usuario/contraseña (empleados cargados por un admin) queda intacto, sin tocar.
- **Recuperación de contraseña**: nueva — "¿Olvidaste tu contraseña?" → email → link → nueva contraseña, usando el envío de email nativo de Supabase Auth (reutiliza el mismo proyecto que ya usa Google, sin agregar un proveedor de email nuevo).
- **Trial**: 30 días (antes 14), un solo cambio de constante en `registrarseConGoogle`.
- **Integración visual**: todo con la misma identidad negro/dorado que ya tenía la app.

### Etapa 2 — Suscripciones y control de acceso

- **Esquema**: 4 columnas nuevas en `laboratorios` (`moneda_facturacion`, `mercadopago_customer_id`, `mercadopago_subscription_id`, `exento_facturacion`) — aditivas, aplicadas en TEST y producción sin tocar ninguna fila existente.
- **Checkout**: `POST /billing/checkout` — Mercado Pago (Suscripciones/`PreApproval`) para ARS, Stripe (Checkout Sessions) para USD. El monto siempre lo calcula el servidor desde `shared/constants/planes.ts` (nunca se confía en un precio que mande el cliente).
- **Webhooks**: `POST /billing/webhook/mercadopago` (verificado con el `WebhookSignatureValidator` oficial del SDK) y `POST /billing/webhook/stripe` (body crudo + `constructEvent`, registrado antes de `express.json()`). Actualizan `estado_suscripcion`/`plan` según lo que reporte cada proveedor.
- **Control de acceso**: `requireActiveSubscription` bloquea con 402 toda ruta de negocio si la suscripción no está activa (ni en trial vigente, ni exenta) — aplicado a las 18 rutas de negocio del backend. `requirePlan("professional")` bloquea con 403 Auditoría, la parte de Estadísticas con importes, y Exportación para el plan Essential (un trial da acceso completo). El "resumen operativo" de Inicio queda disponible para cualquier plan.
- **Pantalla de bloqueo**: si el trial venció o la suscripción no está activa, toda la app se reemplaza por una pantalla de elegir/cambiar plan (sin sidebar) — nunca una app a medias que falla en cada clic.
- **UI de suscripción**: nueva sección en Configuración (solo ADMINISTRADOR) — plan actual, estado, días de trial restantes, elegir/cambiar plan, cancelar.
- **Dental Szymek**: marcada explícitamente como exenta (`exento_facturacion = 1`, plan `professional`) en TEST y en producción, con tu confirmación — sigue sin pasar por ningún proveedor de pago.
- **Escritorio**: implementado completo también (no solo la web) — el checkout abre el navegador del sistema en vez de embeberse. Hoy no tiene usuarios reales que lo necesiten (Dental Szymek está exenta), pero queda listo para cuando alguien se registre desde ahí.

## 2. Pruebas realizadas

- **Suite completa**: 583 tests, **583 pasando** (60 archivos). En el camino, mi middleware nuevo rompió 238 tests porque las sesiones sintéticas de los tests HTTP no declaraban información de facturación — se corrigió agregando un estado de facturación activo por defecto a las 50 sesiones de prueba afectadas (25 archivos), sin tocar la lógica de ningún test.
- **QA manual en TEST** (nunca en datos reales): registro con email+contraseña de punta a punta (confirmó que el proyecto exige confirmar el email, y que el flujo de alta diferida funciona), login con email+contraseña, recuperación de contraseña (pantallas), landing con toggle ARS/USD, suscripción en estado "trial vigente" y "trial vencido" (confirmando que el bloqueo duro responde 402 real del servidor, no solo una pantalla de adorno), vuelta del checkout con mensaje de confirmación.
- **Verificación en producción real** (`densz.vercel.app`, solo lectura/estructural, sin crear datos): landing con planes/FAQ, pantalla de registro con las dos opciones (Google y email), pantalla de recuperación de contraseña — todo carga sin errores de consola.
- **Typecheck**: limpio en los 4 proyectos (main/preload/renderer/server) en cada tanda de cambios.

**Lo único que falta probar**: un checkout real de principio a fin (pagar de verdad en modo sandbox de Mercado Pago/Stripe, confirmar que el webhook activa la suscripción). No se puede hacer sin las credenciales — ver sección 7.

## 3. Proveedor de pagos

- **Argentina (ARS)**: Mercado Pago, API de Suscripciones (`PreApproval`), SDK oficial `mercadopago` (Node).
- **Exterior (USD)**: Stripe, Checkout Sessions en modo `subscription`, SDK oficial `stripe` (Node).
- Código completo y revisado contra la documentación oficial de ambos SDKs (tipos reales, no inventados) — pendiente de una prueba real en sandbox en cuanto tengamos las credenciales.

## 4. Precios

| Plan | ARS/mes | USD/mes |
|---|---|---|
| Densz Essential | $19.900 | US$19 |
| Densz Professional | $34.900 | US$35 |

Definidos en un único lugar (`src/shared/constants/planes.ts`), usado tanto por la landing como por el checkout — nunca pueden desincronizarse.

## 5. Deploy

- **Commit `e7fa1ed`** pusheado a `main` y desplegado automáticamente: Railway (backend) y Vercel (frontend), ambos verificados en vivo contra `densz.vercel.app`.
- **Migraciones aplicadas** en TEST y producción (aditivas, sin pérdida de datos — verificado contando filas antes/después).

## 6. Hallazgo de seguridad (fuera del alcance de esta tarea, corregido con tu confirmación)

Investigando el único test que fallaba tras mis cambios, encontré que **`v_saldo_odontologo_moneda` y `v_saldo_clinica_moneda`** (las vistas que calculan el saldo de cada odontólogo/clínica, usadas en Cuentas y Estadísticas) eran propiedad del rol `postgres` (que tiene `BYPASSRLS`) y no tenían `security_invoker` activado — en la práctica, **cualquier laboratorio veía la suma de saldos de todos los laboratorios**, no solo el suyo. Confirmado con consultas directas a Postgres, no es una suposición.

Corregido en TEST y en producción (con tu confirmación explícita) con `ALTER VIEW ... SET (security_invoker = true)` en ambas vistas — aditivo, no toca ningún dato, solo corrige qué filas puede ver cada laboratorio. Verificado: el test que lo detectó ahora pasa, y los datos de Dental Szymek siguen intactos.

## 7. Lo que falta — por qué todavía no digo "Densz está listo para vender"

1. **Pagos reales sin verificar de punta a punta.** Sigo esperando el Access Token de prueba de Mercado Pago y la clave secreta de prueba de Stripe (pedidos antes, en tu `.env`, nunca en el chat). Hasta no correr un checkout real en modo sandbox y confirmar que el webhook activa la suscripción, esto no está probado — solo escrito y revisado contra la documentación oficial.
2. **Confirmación de onboarding de Stripe desde Argentina**: seguía sin confirmar en la auditoría de Fase 1; lo vamos a saber recién cuando crees la cuenta de Stripe.
3. **Webhooks sin registrar todavía** en los paneles de Mercado Pago/Stripe (necesitan la URL real del backend, que ya existe: `https://TU-BACKEND/billing/webhook/mercadopago` y `/stripe`) — paso que hacemos juntos apenas tengamos las cuentas.
4. **Recuperación de contraseña usa el envío de email por defecto de Supabase** — funciona, pero tiene límites de volumen bajos pensados para desarrollo; para un volumen de ventas real conviene configurar un SMTP propio en el panel de Supabase (no urgente para arrancar).
5. **Email + contraseña es web-only** — el escritorio sigue solo con Google o con usuario/contraseña interno (empleados cargados por un admin). No bloquea la venta (la web es la puerta de entrada), pero es una limitación real.
6. **Exportación de datos** (Professional) está bloqueada en el servidor para Essential, pero el botón de exportar sigue visible en la interfaz (no oculto) — un Essential que lo toque va a ver un error claro en vez de que el botón desaparezca. Auditoría y Estadísticas sí se ocultan del menú correctamente.
7. **Cambio de plan** (Essential↔Professional) hoy se resuelve cancelando la suscripción vieja y generando un checkout nuevo — no hay prorrateo a mitad de ciclo.

## Próximo paso

Pasame el Access Token de prueba de Mercado Pago y la clave secreta de prueba de Stripe (en tu `.env` local, nunca en el chat) y, si ya la tenés, contame si Stripe te dejó completar el alta como empresa argentina. Con eso hago el checkout real de prueba, registro los webhooks, y recién ahí Densz queda realmente listo para cobrar.
