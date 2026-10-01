# DENSZ — REPORTE DE CORRECCIÓN POST AUDITORÍA

## 1. Fecha
2026-09-28

## 2. Commit analizado
`474bc288` (`main`) — el mismo commit sobre el que se hizo `docs/AUDITORIA_MAESTRA_DENSZ.md`. Todos los cambios de este bloque están hechos localmente, **sin commit ni push** (ver §33/§36).

## 3. Objetivo del trabajo
Corregir los problemas técnicos y bugs accionables encontrados en la auditoría maestra, sin tocar nada fuera del alcance explícitamente definido: sin cambiar diseño visual, PDFs, impresión, odontograma, moneda, producción, ni infraestructura externa (Railway/Vercel/Supabase Dashboard/GitHub).

## 4. Archivos modificados (25)
```
.env.example
README.md
package.json / package-lock.json                          (nueva dependencia: express-async-errors)
src/main/db/ensureBootstrapUser.ts                         (Bloque 7)
src/main/db/repositories/movimientosRepo.ts                (Bloque 1)
src/main/db/repositories/preciosRepo.ts                    (Bloque 4)
src/main/ipc/pagos.ipc.ts                                  (Bloque 3)
src/main/ipc/precios.ipc.ts                                (Bloque 4)
src/main/services/pagoService.ts                           (Bloque 3)
src/renderer/components/layout/GlobalSearch.tsx            (Bloque 12)
src/server/index.ts                                        (Bloque 2)
src/server/routes/auth.route.ts                             (Bloque 6)
src/server/routes/cuentas.route.ts                          (Bloque 2)
src/server/routes/estadisticas.route.ts                     (Bloque 2)
src/server/routes/listasPrecio.route.ts                     (Bloque 2)
src/server/routes/pagos.route.ts                            (Bloque 2 + Bloque 3)
src/server/routes/precios.route.ts                          (Bloque 2 + Bloque 4)
src/server/storage.ts                                       (Bloque 10)
tests/unit/auditoriaRepo.test.ts                            (fix de un test frágil preexistente, ver §18)
tests/unit/casosBordeBloque3.test.ts                        (Bloque 10)
tests/unit/flujoCompletoNegocio.test.ts                     (Bloque 10)
tests/unit/serverComprobantes.test.ts                       (Bloque 10)
tests/unit/serverListaPreciosPdf.test.ts                    (Bloque 10)
tests/unit/serverPrecios.test.ts                            (Bloque 4 — tests)
tests/unit/serverStorage.test.ts                            (Bloque 10)
```

## 5. Archivos nuevos (11)
```
docs/AUDITORIA_MAESTRA_DENSZ.md                    (del bloque anterior, referenciado por este trabajo)
docs/REPORTE_CORRECCION_POST_AUDITORIA.md          (este archivo)
src/server/loginRateLimit.ts                       (Bloque 6)
src/server/middleware/errorHandler.ts              (Bloque 2)
tests/helpers/testStorage.ts                       (Bloque 10)
tests/unit/cuentaMensualEdicionFacturada.test.ts   (Bloque 1)
tests/unit/ensureBootstrapUser.test.ts             (Bloque 7)
tests/unit/pagoServiceAuditoria.test.ts            (Bloque 3)
tests/unit/serverAuthLogin.test.ts                 (Bloques 6 y 8)
tests/unit/serverErrorHandlingQueryParams.test.ts  (Bloque 2)
tests/unit/serverOdontologos.test.ts               (Bloque 9)
```

## 6. Correcciones realizadas — resumen
| Bloque | Estado |
|---|---|
| 1 — Bug de doble conteo en Cuentas | ✅ CORREGIDO |
| 2 — 5 rutas que podían quedar colgadas | ✅ CORREGIDO |
| 3 — Auditoría de pagos | ✅ CORREGIDO |
| 4 — Auditoría de categorías (mover) | ✅ CORREGIDO |
| 5 — Autorización Web | 🟡 ANALIZADO, sin implementar (ver §23) |
| 6 — Rate limiting del login | ✅ CORREGIDO |
| 7 — Bootstrap admin | ✅ CORREGIDO |
| 8 — Tests HTTP de login | ✅ CORREGIDO |
| 9 — Tests de odontólogos | ✅ CORREGIDO |
| 10 — Storage de tests | ✅ CORREGIDO (código) — bucket real de test 🔴 REQUIERE DECISIÓN (infraestructura externa) |
| 11 — Cobertura adicional | Cubierta dentro de cada bloque, sin agregados sueltos |
| 12 — Búsqueda global (paciente) | ✅ CORREGIDO — comprobante 🟡 documentado como pendiente |
| 13 — Cuentas duplicadas | 🟡 SOLO DOCUMENTADO (ya estaba así en la auditoría) |
| 14 — Backups | 🟡 SOLO DOCUMENTADO |
| 15 — RLS Supabase | 🟡 SOLO ANALIZADO |
| 16 — GitHub público | 🟡 SOLO DOCUMENTADO |
| 17 — Sesiones Web | 🟡 SOLO DOCUMENTADO |
| 18 — Vistas SECURITY DEFINER | 🟡 SOLO ANALIZADO |

## 7. Bug de doble conteo — causa raíz
**Archivos**: `src/main/db/repositories/movimientosRepo.ts` (`listarTrabajosFacturadosPorMes`), `src/main/services/ordenService.ts` (`editarOrdenConPrestaciones`).

Al editar una OT ya facturada, `editarOrdenConPrestaciones` **anula** el movimiento DEBE viejo y crea uno **nuevo activo** — pero la **orden** sigue con `estado: 'facturado'` (nunca pasa a `'anulado'`, correctamente: la OT no está anulada, solo se corrigió). El detalle mensual de Cuentas (`listarTrabajosFacturadosPorMes`) puede devolver **más de una fila de movimiento para la misma OT** (la vieja anulada + la nueva activa) cuando la edición ocurre en el mismo mes de la facturación original. El bug: el flag `anulado` que se le mostraba a cada fila se derivaba de `orden.estado` (que dice "toda la OT está anulada o no"), no del flag propio de CADA movimiento (`movimientos_cuenta.anulado`, que sí se mantenía correctamente actualizado en cada mutación) — así que ambas filas aparecían como "activas" y el importe se sumaba dos veces en el total del mes.

## 8. Bug de doble conteo — solución
Se cambió la fuente de verdad de `anulado` en `mapearTrabajoFacturado` (`movimientosRepo.ts`) de `orden.estado === "anulado"` al flag propio del movimiento (`movimiento.anulado`, agregado a la consulta SQL como `m.anulado AS movimiento_anulado`), con un `OR` defensivo contra `orden.estado === "anulado"` para no perder ningún caso legítimo. No se tocó:
- La lógica de negocio de `editarOrdenConPrestaciones` (sigue anulando el viejo + creando el nuevo exactamente igual).
- El cálculo del saldo general (`v_saldo_odontologo_moneda`/`v_saldo_clinica_moneda`) — ya filtraba correctamente por `movimiento.anulado`, nunca estuvo mal.
- DEBE/HABER, ARS/USD, clínica-vs-odontólogo, congelamiento histórico, anulación de OT: todo sin cambios, verificado con tests dedicados.

**Efecto visual adicional (positivo, no buscado activamente pero correcto)**: además de corregir la suma, la fila vieja ahora se muestra tachada/"(anulado)" en el PDF y en pantalla — igual que cualquier otro movimiento anulado — en vez de aparecer como una segunda fila activa idéntica. Representa mejor la contabilidad real (qué pasó, en qué orden), tal como pedía la consigna.

## 9. Tests creados para el bug
`tests/unit/cuentaMensualEdicionFacturada.test.ts` — 7 tests, cubriendo los 18 puntos pedidos: reproducción exacta del bug, movimiento viejo anulado/nuevo activo, saldo general, saldo mensual, ARS, USD, clínica, odontólogo independiente, edición con cambio de importe, edición con mismo importe (no genera movimiento nuevo), y edición + anulación posterior de la misma OT.

## 10. Manejo de errores HTTP
**Causa**: `GET /precios/categorias`, `GET /listas-precio/`, `GET /estadisticas/saldos-pendientes-top`, `GET /pagos/ultimos` y `GET /cuentas/tiene-pagos` parseaban un query param con Zod sin `try/catch` — Express 4 no reenvía por sí solo el rechazo de una promesa de un handler `async`, así que un parámetro inválido dejaba el pedido sin respuesta.

**Solución de dos capas**:
1. Se agregó `try/catch` a esas 5 rutas específicas, con el mismo patrón (`traducirErrorPostgres` + 400) que ya usan las otras ~90 rutas del backend — no se inventó un estilo nuevo.
2. Se agregó una red de contención centralizada: `express-async-errors` (dependencia nueva, justificada — ver abajo) + `src/server/middleware/errorHandler.ts`, montado al final de `index.ts`. Protege contra cualquier handler futuro que se olvide su propio `try/catch`, y también contra JSON malformado en el body (antes tampoco tenía manejo explícito).

**Dependencia agregada**: `express-async-errors` (3.1.1). Justificación: Express 4 (la versión que usa Densz) no reenvía automáticamente el rechazo de una promesa de un handler `async` al error-handler — recién lo hace Express 5. Es el paquete estándar de facto para este problema específico en Express 4 (sin dependencias propias, un solo archivo, solo parchea `Router.prototype`), evita reescribir manualmente el manejo de errores en las ~95 rutas existentes.

**Otras rutas con el mismo patrón**: se revisaron TODAS las rutas de los 18 routers — las 5 mencionadas eran las únicas con el defecto. Todas las demás ya usaban `try/catch` consistentemente.

## 11. Tests HTTP agregados (manejo de errores)
`tests/unit/serverErrorHandlingQueryParams.test.ts` — 14 tests: cada una de las 5 rutas con parámetro válido (200) e inválido (400, nunca cuelga), sin sesión (401), y un caso de JSON malformado en el body (400, protegido por la misma red de contención).

## 12. Auditoría de pagos
**Hallazgo real vs. lo que decía la auditoría**: `pagoService.ts` en efecto no auditaba nada — pero tanto `pagos.ipc.ts` (Desktop) como `pagos.route.ts` (Web) YA llamaban a `registrarAuditoria` por su cuenta, cada uno con su propio código duplicado, DESPUÉS de que el servicio terminaba (fuera de la transacción). Documentado antes de modificar, como pide la regla de inspección.

**Corrección real**: se centralizó la auditoría DENTRO de `pagoService.ts` (misma transacción que el pago/movimiento — como hace `ordenService`/`authService`), y se sacaron las llamadas ahora redundantes de `pagos.route.ts` y `pagos.ipc.ts` para no auditar dos veces. El detalle ahora incluye: usuario, importe, moneda, medio de pago, odontólogo/clínica, y motivo cuando corresponde (anular). Nunca se registra si el pago fue detectado como posible duplicado y no se confirmó (no se llegó a crear nada). No se tocó lógica contable, detección de duplicados, cálculo de saldo, ARS/USD, ni comportamiento de anulación.

## 13. Auditoría de categorías
`moverCategoria` (`preciosRepo.ts`) ahora devuelve el detalle del intercambio (`{movida, vecino}` con posición anterior/nueva de cada una) en vez de `void`, y `null` cuando no hay nada que mover (ya está en el extremo). `precios.route.ts` y `precios.ipc.ts` auditan (`accion: "modificar"`, `entidad: "categorias_precio"`) solo cuando de verdad se movió algo. No se cambió el comportamiento del ordenamiento ni la UI.

## 14. Rate limiting
`src/server/loginRateLimit.ts` — límite en memoria (mismo patrón que `session.ts`), **por nombre de usuario** (no por IP — Railway corre detrás de un proxy sin `trust proxy` configurado; limitar por IP mal configurada podría bloquear a todos los usuarios reales por igual, lo opuesto a lo pedido). 5 intentos fallidos por usuario en una ventana de 15 minutos; un login correcto limpia el contador al instante; mensaje siempre genérico (nunca revela si el usuario existe); la auditoría de `login`/`login_fallido` sigue intacta (no se tocó `authService.ts`). No se agregó ninguna dependencia nueva — se resolvió limpio sin hacer falta una.

## 15. Bootstrap admin
`ensureBootstrapUser.ts`: ya no existe ningún valor de contraseña fijo en el código fuente. Por defecto se genera una contraseña aleatoria criptográfica distinta en cada arranque (impresa una sola vez en el log, igual que antes mostraba el valor fijo). Opcionalmente, `BOOTSTRAP_ADMIN_PASSWORD` (variable de entorno, documentada en `.env.example`, **no agregada a Railway** — producción ya tiene usuarios reales y este código nunca se ejecuta ahí, confirmado). El comportamiento de producción actual queda completamente intacto (verificado: los 5 usuarios reales siguen siendo los mismos). README.md actualizado para reflejar el cambio.

## 16. Tests HTTP agregados (login)
`tests/unit/serverAuthLogin.test.ts` — 10 tests cubriendo Bloques 6 y 8 juntos (mismo endpoint): usuario/contraseña correctos (200, cookie, sesión posterior), contraseña incorrecta, usuario inexistente, usuario inactivo (los 3 con el mismo mensaje genérico), logout, auditoría de login/login_fallido, y todo el comportamiento del límite de intentos (normal, bloqueo al 6° intento, recuperación tras un login correcto, aislamiento por usuario).

## 17. Storage de tests
Ver §10 arriba (tabla) y detalle completo en §19 más abajo — resumen: el código ya soporta aislamiento real vía `TEST_STORAGE_BUCKET`, pero crear el bucket de test en Supabase es un cambio de infraestructura externa que no se hizo (fuera de alcance, ver Bloque 19 del pedido original — "no cambies Supabase Dashboard").

## 18. Búsqueda global
`GlobalSearch.tsx`: los resultados de tipo "paciente" ahora navegan a `/pacientes/:id` (existe esa ficha real, `PacienteDetalle.tsx`) en vez del listado general. Los resultados de tipo "comprobante" siguen yendo al listado general — no existe ninguna ruta de detalle por comprobante en la app hoy, y no se inventó una (fuera de alcance del pedido). Documentado como pendiente.

**Nota adicional no pedida explícitamente pero encontrada y corregida por necesidad**: al correr la suite completa después de agregar todos los tests nuevos, apareció 1 test que empezó a fallar de forma intermitente por una causa no relacionada a ningún bloque de este trabajo — ver §31 (regresiones) para el detalle completo, ya corregido.

## 19. Problemas analizados pero NO modificados

### Bloque 5 — Autorización Web
Se comparó la matriz de permisos (`src/shared/constants/permisos.ts`), los permisos reales asignados a RECEPCION en la base (`["ordenes.crear","ordenes.ver","pacientes.crear","pacientes.ver","odontologos.ver","pagos.crear","pagos.ver","comprobantes.crear","comprobantes.ver","clinicas.crear","clinicas.ver"]`), y el comportamiento real de las rutas Web/Desktop. Se encontró evidencia directa en el propio código de tests de que la falta de permiso específico en varias rutas (más allá de exigir sesión) fue una **decisión ya tomada a propósito**, no un descuido: por ejemplo, `serverPacientes.test.ts` y `serverComprobantes.test.ts` tienen sesiones de prueba deliberadamente armadas SIN el permiso correspondiente, con comentarios explícitos del tipo *"prueba si el backend lo exige (no inventar, solo documentar lo real)"*.

Dado esto, y la instrucción explícita de no tocar nada que pueda alterar el flujo operativo real de RECEPCION sin decisión de producto, **no se implementó ningún cambio de permisos**. Propuesta de matriz para una futura decisión:

| Endpoint | Permiso ya definido y disponible | ¿RECEPCION lo tiene hoy? | Impacto de wirearlo |
|---|---|---|---|
| Lecturas de odontólogos/pacientes/clínicas/trabajos/pagos/comprobantes | `*_VER` | Sí (los 6) | Ninguno hoy (ambos roles ya califican) — cierra el hueco para un futuro 3er rol |
| `POST` crear pacientes/clínicas/trabajos/pagos/comprobantes | `*_CREAR` | Sí (los 5) | Ninguno hoy, mismo motivo |
| `POST /odontologos` (crear) | `ODONTOLOGOS_CREAR` | **No** (solo tiene `.ver`) | Bloquearía a RECEPCION de crear odontólogos — **cambia el flujo actual** |
| `PATCH /trabajos/:id/anular` | `ORDENES_ANULAR` | **No** | Bloquearía a RECEPCION de anular OTs — **cambia el flujo actual** |
| `PATCH /pagos/:id/anular` | `PAGOS_ANULAR` | **No** | Bloquearía a RECEPCION de anular pagos — **cambia el flujo actual** |
| `PUT`/`PATCH` de odontólogos, clínicas, pacientes (editar/activar) | **No existe ningún permiso `*.editar` para estas entidades** | — | Requeriría inventar un permiso nuevo — decisión de producto, no "conectar algo ya definido" |

**Riesgo que resolvería** activar la fila 3-5: acotar qué puede anular/eliminar RECEPCION sin intervención de un ADMIN. **Riesgo de no hacerlo**: hoy, en la Web, cualquier usuario autenticado puede anular cualquier OT o pago, sin distinción de rol — mitigado en parte porque toda acción queda auditada con el usuario real.

### Bloque 13 — Cuentas duplicadas
`CuentaDetalle.tsx`/`ClinicaCuentaDetalle.tsx` (~90% código idéntico). No es prioritario frente a bugs/seguridad, según la propia consigna — no tocado.

## 20. RLS — análisis y decisión pendiente

**Qué tablas requerirían RLS**: las 22 tablas de `public` (todo el esquema de negocio) — hoy ninguna tiene RLS activo (confirmado vía Supabase Advisors).

**Qué rol usaría cada acceso**: el backend (Railway) es el ÚNICO cliente que habla con la base, y lo hace con la `service_role key` (vía `src/server/storage.ts` para Storage) o con el usuario Postgres dedicado `densz_app` (vía `pg` directo, para todo el resto — nunca pasa por la API REST de Supabase ni por `anon`/`authenticated`). **El backend seguiría funcionando exactamente igual si se activa RLS**, porque:
- La conexión `pg` directa (`connection.ts`) no pasa por RLS de PostgREST en absoluto — RLS de Supabase solo se aplica a los accesos vía su API REST/Storage con roles `anon`/`authenticated`, no a una conexión Postgres directa con un rol de base de datos normal (a menos que se activen políticas RLS a nivel de Postgres puro sobre `densz_app`, que es una capa distinta y no lo que reportan los Advisors de Supabase).
- `service_role` (usado solo para Storage) **siempre esquiva RLS por diseño de Supabase**, tenga o no políticas.

**Qué políticas serían necesarias**: en rigor, ninguna es estrictamente necesaria para que Densz siga funcionando (el backend no usa `anon`/`authenticated`). Activar RLS sin ninguna política simplemente bloquearía el acceso de esos dos roles — que hoy nadie usa, pero que SÍ podrían usarse accidentalmente en el futuro si alguna vez se agrega código cliente con el SDK de Supabase. Activar RLS con políticas "deny all" explícitas (o sin ninguna política, que es equivalente) sería puramente defensivo.

**Qué cambios futuros serían necesarios**: ninguno en el código actual. Si en el futuro se agrega cualquier acceso desde el navegador usando `anon key` (hoy no existe ninguno), ahí sí haría falta diseñar políticas reales.

**No se activó RLS ni se crearon políticas** — instrucción explícita del bloque.

## 21. GitHub público — decisión pendiente
El repositorio `Valentinszymek/Densz` sigue siendo público (no se tocó ninguna configuración de GitHub). Se reconfirmó que `.env` nunca se commiteó y que el bootstrap ya no tiene una contraseña fija (§15) — el principal riesgo concreto que tenía el repo público quedó resuelto con la corrección del Bloque 7. Decisión de si mantenerlo público o pasarlo a privado: pendiente, a criterio de Valentín.

## 22. Backups — estado
Sin cambios (instrucción explícita: no implementar backups nuevos). Estado actual, documentado:
- **Desktop**: 9 canales IPC de `backups.ipc.ts` son stubs — tiran error fijo o devuelven vacío (el viejo sistema de backup local por archivo SQLite no tiene equivalente con Postgres/Supabase).
- **Web**: la pantalla "Backups" no llama a ningún método — solo muestra un texto explicativo estático.
- **Qué falta**: una estrategia real de backup para el proyecto de Supabase de producción. El plan gratuito de Supabase (el que usa Densz hoy) no incluye backups automáticos — eso es una decisión de plan/costo, no técnica, y queda pendiente para cuando Valentín quiera evaluarla.

## 23. Sesiones Web — estado
Sin cambios (instrucción explícita: no migrar a Redis/infraestructura externa). Documentado:
- **Comportamiento actual**: `src/server/session.ts` guarda las sesiones HTTP en un `Map` en memoria del propio proceso Node — se pierden todas de golpe en cada redeploy/restart de Railway.
- **Por qué es aceptable hoy**: Railway corre **una sola instancia** del backend (no hay múltiples réplicas ni balanceo de carga) — no hay problema de "una sesión creada en el servidor A es invisible para el servidor B", que sí sería un problema real con más de una instancia.
- **Qué haría falta para hacerlo persistente**: un store de sesión compartido fuera del proceso (Redis, o una tabla en la misma Postgres) — infraestructura nueva, deliberadamente no agregada en este bloque.

## 24. Permisos Web — estado y decisión pendiente
Ver §19 arriba (Bloque 5) — análisis completo, matriz propuesta, nada implementado.

## 25. Tests antes/después
| | Antes de este bloque | Después de este bloque |
|---|---|---|
| Archivos de test | 46 | 57 (+11 nuevos, +1 fix a uno preexistente) |
| Tests totales | ~478 (según el informe de despliegue anterior) | **535** |
| Resultado | 478/478 ✅ | **535/535 ✅ (0 fallos)** |

## 26. Typecheck
```
npm run typecheck
```
**Sin errores** — main, preload, renderer y server, los 4 proyectos de TypeScript.

## 27. Build Web
```
npm run build:server        → OK, sin errores
npm run build:web-frontend  → OK, sin errores (dist-renderer-web/)
```

## 28. Build Electron
```
npm run build   → OK, sin errores (dist-electron/ + dist-renderer/)
```
La app de Desktop sigue compilando exactamente igual que antes de este bloque.

## 29. Producción antes/después
Comparado por SQL de solo lectura, antes de empezar y después de terminar todo el trabajo (incluida la corrida final de tests):

| Tabla | Antes | Después |
|---|---|---|
| usuarios | 5 | 5 |
| odontologos | 64 | 64 |
| clinicas | 5 | 5 |
| pacientes | 74 | 74 |
| ordenes | 70 | 70 |
| comprobantes | 70 | 70 |
| pagos | 15 | 15 |
| movimientos_cuenta | 89 | 89 |
| configuracion | 13 | 13 |
| auditoria | 792 | 792 |

**Ni una sola fila cambió en producción.** Todo el trabajo de código y de tests corrió exclusivamente contra el proyecto de Supabase dedicado a tests (`Densz-Test`, vía `TEST_DATABASE_URL`) — nunca contra `DATABASE_URL` de producción.

## 30. Supabase antes/después
Sin cambios en el proyecto de producción (`cvplaqzlaeyhnwbrrkfi`): ninguna tabla, vista, política, ni configuración tocada. RLS sigue desactivado (§20, análisis sin implementar). No se creó ningún bucket nuevo ni se modificó el existente ("documentos").

## 31. Storage antes/después
Bucket `documentos` (producción): **2 objetos**, sin ningún objeto huérfano de test (verificado por SQL contra `storage.objects` buscando nombres con "test"/"verificacion" — cero resultados). Los tests de Storage/PDF (5 archivos) siguen corriendo contra este mismo bucket compartido — ahora con una advertencia explícita en consola cada vez que corren sin `TEST_STORAGE_BUCKET` configurado (§17), y con el código ya preparado para aislarse del todo en cuanto se cree un bucket de test dedicado.

## 32. Riesgos restantes
- 🟠 Permisos Web no diferenciados por rol en varias escrituras (§19/§24) — decisión de producto pendiente.
- 🟡 RLS de Supabase sigue desactivado (§20) — bajo riesgo práctico hoy (confirmado), pendiente de decisión.
- 🟡 Sin backups automáticos de producción (§22).
- 🟡 Sesiones Web se pierden en cada redeploy de Railway (§23) — aceptable con una sola instancia.
- 🟡 Repo de GitHub público (§21).
- 🟡 Tests de Storage siguen sin aislamiento real de infraestructura (§17) — mitigado con aviso explícito, requiere que Valentín cree un bucket de test.
- ⚪ Búsqueda global de "comprobante" sigue sin un destino específico (§18) — no hay ficha de detalle que crear sin salir del alcance.

## 33. Problemas que requieren decisión de Valentín
1. **Permisos Web para RECEPCION** (§19/§24) — ¿restringir anular OT/pagos y crear odontólogos a solo ADMIN, como sugiere la matriz propuesta, o dejarlo como está?
2. **RLS de Supabase** (§20) — ¿activarlo como capa defensiva adicional (bajo riesgo práctico hoy, pero recomendado a largo plazo) o dejarlo como está?
3. **Visibilidad del repo de GitHub** (§21) — ¿público o privado?
4. **Backups automáticos de producción** (§22) — ¿evaluar un plan pago de Supabase que los incluya?
5. **Aislar Storage de tests de verdad** (§17) — ¿crear un bucket de test dedicado en el proyecto Densz-Test?

## 34. Cosas que NO se modificaron
Diseño visual, logo, colores, tipografía, comprobantes, PDFs, impresión, odontograma, estructura de precios, moneda, lógica de Cuentas más allá del bug puntual, Estadísticas (salvo lo ya cubierto), modelo de datos (salvo el valor de retorno de `moverCategoria`, aditivo y no rompe nada), producción, Supabase Dashboard, Railway, Vercel, GitHub settings, usuarios reales, pagos reales, OTs reales, comprobantes reales. Ningún `git commit` ni `git push` — todo quedó local.

## 35. Posibles regresiones
Se encontró y corrigió **una** (`tests/unit/auditoriaRepo.test.ts`, ver §18/§7 de este informe): un test preexistente (no escrito en este bloque) que asumía que buscar el texto "42" solo podía coincidir con el `entidad_id` de una fila específica — pero la búsqueda también compara contra el `id` interno de cada fila de auditoría (a propósito, es una funcionalidad real del buscador), y ese `id` es una secuencia de Postgres que crece de forma GLOBAL durante toda la corrida de tests, nunca se resetea con el `ROLLBACK` de cada test individual. Al sumar ~57 tests nuevos que registran auditoría, el conteo global se corrió lo suficiente como para que, en esa corrida puntual, otra fila no relacionada del mismo test terminara con un `id` interno que también contenía "42" — produciendo una coincidencia legítima pero no prevista por el test. Se corrigió el test para verificar contenido específico en vez de un conteo total exacto (que era la parte frágil), sin tocar el comportamiento real del buscador. Investigado a fondo antes de tocarlo, según pide la regla del bloque — no se ocultó ni se marcó como `skip`.

Ninguna otra regresión detectada en 535 tests, 3 builds y una comparación completa de producción antes/después.

## 36. Estado final

# 🟢 LISTO — con puntos pendientes de decisión, ninguno bloqueante

Los bugs y gaps técnicos accionables (Bloques 1, 2, 3, 4, 6, 7, 9, 10, 12) están corregidos, probados y verificados sin regresiones. Los puntos que requerían una decisión de producto (Bloques 5, 13-18) quedaron analizados y documentados, sin tocar código, tal como pedía la consigna. Producción, Supabase, Railway, Vercel y GitHub quedaron exactamente como estaban. No se hizo ningún commit ni push.

## Recomendación para el próximo trabajo
En este orden de prioridad:
1. Decidir la matriz de permisos Web (§19/§33.1) — es la que tiene más impacto operativo real.
2. Crear el bucket de test dedicado (§33.5) — es la corrección más barata/rápida de las pendientes.
3. Evaluar RLS (§33.2) y backups (§33.4) juntos, ya que ambos dependen de entender mejor el plan de Supabase que se quiere usar a futuro.
4. Revisar §13 (componentes de Cuentas duplicados) solo si en algún momento se va a tocar esa pantalla por otro motivo — no vale la pena como tarea aislada.
