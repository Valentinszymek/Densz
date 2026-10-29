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

1. ~~Pagos reales sin verificar de punta a punta.~~ **Resuelto el 2026-10-29** — ver addendum abajo.
2. **Confirmación de onboarding de Stripe desde Argentina**: la cuenta de Stripe ya existe ("Nueva empresa", modo test verificado), pero el dashboard real todavía muestra el banner "Verifica tu empresa" — la verificación de negocio para poder cobrar en modo LIVE sigue sin completarse.
3. **Webhooks sin registrar todavía** en los paneles de Mercado Pago/Stripe apuntando al backend real de producción (`https://TU-BACKEND/billing/webhook/mercadopago` y `/stripe`) — esto es un cambio de configuración en cuentas live, así que lo hacemos juntos con tu confirmación explícita cuando quieras dar ese paso (no lo hice unilateralmente el 2026-10-29, ver addendum).
4. **Recuperación de contraseña usa el envío de email por defecto de Supabase** — funciona, pero tiene límites de volumen bajos pensados para desarrollo; para un volumen de ventas real conviene configurar un SMTP propio en el panel de Supabase (no urgente para arrancar).
5. **Email + contraseña es web-only** — el escritorio sigue solo con Google o con usuario/contraseña interno (empleados cargados por un admin). No bloquea la venta (la web es la puerta de entrada), pero es una limitación real.
6. **Exportación de datos** (Professional) está bloqueada en el servidor para Essential, pero el botón de exportar sigue visible en la interfaz (no oculto) — un Essential que lo toque va a ver un error claro en vez de que el botón desaparezca. Auditoría y Estadísticas sí se ocultan del menú correctamente.
7. **Cambio de plan** (Essential↔Professional) hoy se resuelve cancelando la suscripción vieja y generando un checkout nuevo — no hay prorrateo a mitad de ciclo.

## Addendum — 2026-10-29: pagos reales verificados de punta a punta en sandbox

Llegaron las credenciales (son las **live** de los dos proveedores — me lo confirmaste explícitamente). Como ejecutar un cobro real con claves live está fuera de lo que puedo hacer yo mismo (nunca ejecuto una transacción financiera real, ni con autorización), conseguí las credenciales de **modo prueba** de cada proveedor directamente desde sus paneles (ya tenías ambas cuentas de desarrollador creadas desde el 27/10) y las guardé en tu `.env` local sin mostrarlas en el chat.

**Qué se probó, con llamadas reales (nunca mockeadas) contra las cuentas de test de Stripe y Mercado Pago:**

- Se agregó `tests/unit/billingService.test.ts` — **no existía ningún test de este módulo hasta hoy**, pese a que ya estaba en producción desde el 21/10. 16 tests nuevos, todos verdes:
  - **Stripe**: crea una sesión de checkout real; `checkout.session.completed` activa la suscripción; `customer.subscription.updated/deleted` reflejan el estado; firma inválida se rechaza; **se creó y canceló una suscripción real de Stripe en modo test** (ciclo completo, no solo creación).
  - **Mercado Pago**: crea una preapproval real; firma inválida se rechaza (HMAC real, no simulado); tipo de evento desconocido se ignora; **se canceló una preapproval real**.
  - Aislamiento cruzado: un webhook de un laboratorio nunca toca el de otro.
- **Checkout completo de verdad en el navegador, en sandbox**: usé la cuenta "Buyer Test User" que ya tenías creada en el panel de Mercado Pago (sin tocar ni cerrar tu sesión real de "VALEN" — se loguea como una cuenta aparte vía "Cambiar de cuenta", confirmé que tu sesión real seguía intacta después) para autorizar de punta a punta una suscripción real con una tarjeta de prueba guardada. Mercado Pago confirmó "¡Listo! Ya te suscribiste — Pagaste $19.900". Con esa preapproval ya `authorized` de verdad (no simulada), agregué un test más que confirma que el webhook la mapea a `estado_suscripcion = 'active'` contra el estado REAL que devuelve la API — no contra un mock. Al terminar, cancelé esa preapproval de prueba (quedó en `cancelled`, no te va a cobrar el 29/11).
- **Hallazgo real en el camino** (ya corregido, no en producción — solo en el test): Mercado Pago rechaza cualquier `back_url` con host `localhost` ("Invalid value for back_url, must be a valid URL"), incluso en cuentas sandbox. No es un bug de Densz — el código real en producción usa `densz.vercel.app`, nunca localhost — pero sí es una limitación real de probar el checkout ARS desde una máquina de desarrollo sin un dominio público.

**Lo que sigue sin tocarse, a propósito:**

- Nunca usé las claves **live** para nada — ni para crear un checkout, ni para ningún llamado a la API. El `.env` local ahora tiene las claves de **test** de ambos proveedores; las live que me pasaste no se tocaron.
- No registré ningún webhook en los paneles de producción de Stripe/Mercado Pago (punto 3 arriba sigue abierto) — es un cambio de configuración de cuenta real, lo hacemos con tu confirmación explícita cuando decidas dar ese paso.
- La cuenta de Stripe sigue sin completar la verificación de negocio (punto 2 arriba) — necesario antes de poder cobrar en modo live, independientemente de que el código ya esté probado.

## Próximo paso

Con el código de pagos ya probado de punta a punta (no solo escrito), lo que falta para poder cobrar de verdad es: (a) que completes la verificación de tu empresa en el dashboard de Stripe, y (b) que registremos juntos los webhooks reales apuntando a tu backend de producción en los paneles de Mercado Pago y Stripe — avisame cuando quieras dar ese paso y lo hacemos con tu confirmación en cada uno.
