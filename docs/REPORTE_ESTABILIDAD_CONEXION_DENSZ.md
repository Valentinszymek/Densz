# DENSZ — REPORTE DE ESTABILIDAD DE CONEXIÓN CON LA BASE DE DATOS

## 1. Fecha

2026-11-19

## 2. Motivo

Esta semana volvió a aparecer, por segunda vez, el error "No se pudo conectar con la base de datos. Verificá tu conexión a internet. Reintentando..." en `https://densz.vercel.app` — dos días después de un incidente parecido ya investigado y, se pensaba, corregido el 2026-11-16 (commit `52d1130`). Se pidió una investigación completa de la cadena Navegador → Vercel → Backend Railway → Supabase/PostgreSQL, encontrar la causa raíz real (no un parche temporal) y corregirla.

## 3. Causa raíz identificada

**El arreglo del 2026-11-16 era correcto, pero se aplicó en dos de los tres lugares del código que abren una conexión propia contra el pool de Postgres — el tercero, `POST /auth/usuarios-del-laboratorio`, quedó con el bug original.**

Ese endpoint es el que el frontend llama **cada vez que alguien entra con Google desde un navegador** (`CallbackGoogle.tsx` → `authUsuariosDelLaboratorio`) — exactamente el escenario descripto: "ingreso desde otra computadora, a través del navegador".

### Mecanismo del bug (el mismo que el del 16/11, en un lugar distinto)

Cuando la conexión TCP entre Railway y el pooler de Supabase se corta a mitad de una consulta (algo que pasa de vez en cuando — ver evidencia abajo), `pg` no tiene forma de saber por sí solo que esa conexión ya no sirve. Si el código la libera al pool con `client.release()` **sin avisarle que algo salió mal**, el pool la recicla como si estuviera sana — y el próximo pedido que la agarre también va a fallar. Conexión por conexión, así se pueden agotar las 10 del pool sin que nada se autorecupere, hasta que un reinicio del proceso (pool nuevo de cero) lo soluciona solo — que es exactamente lo que se había observado el 16/11.

El arreglo correcto es pasarle el error a `release(err)` **solo** cuando el propio `COMMIT`/`ROLLBACK` falla (ahí sí la conexión está rota de verdad) — nunca por un error de negocio común (una validación, un 400). El 16/11 esto se corrigió en `withTransaction.ts` y en `tenantDb.ts`, pero `auth.route.ts` tenía su **propia** copia de este mismo patrón (`db.connect()` → `BEGIN` → `COMMIT`/`ROLLBACK` → `release()`), escrita antes y nunca actualizada — con el bug original intacto: `client.release()` sin argumento, siempre, pase lo que pase.

### Segundo bug encontrado, en el propio arreglo del 16/11

Revisando `withTransaction.ts` a fondo para esta investigación apareció algo que no se había notado: ese archivo (a diferencia de `tenantDb.ts`) pasaba el error a `release()` **siempre que `fn()` fallara**, no solo cuando el `ROLLBACK` en sí fallaba. Es decir, descartaba la conexión del pool ante **cualquier error de validación o de negocio** (ej. "Hay una prestación sin precio", cualquier 400 normal) — no solo las veces raras que la red se corta de verdad. Esto generaba una apertura/cierre de conexión innecesaria contra el pooler de Supabase en cada error común de la app, mucho más seguido que el caso real que el arreglo buscaba cubrir. Se corrigió para que coincida exactamente con el criterio de `tenantDb.ts`: solo descarta si el propio `ROLLBACK` falla.

## 4. Evidencia técnica

Se revisaron los logs reales de Postgres (Supabase, proyecto de producción, solo lectura) de los últimos 3 días:

| Fecha (UTC) | Evento |
|---|---|
| 2026-11-17 11:20:13 | `could not receive data from client: Connection reset by peer` |
| 2026-11-18 11:20:22 | `could not receive data from client: Connection reset by peer` |
| 2026-11-19 11:20:13 | `could not receive data from client: Connection reset by peer` |

Un corte de conexión real, casi al segundo, los tres días — el tipo exacto de evento que el bug de `release()` sin discriminar no sabía manejar en el endpoint de login. No se encontró ningún advisory de Supabase (`get_advisors`, tipos `performance`/`health`) relacionado a límites de conexión, y el proyecto figura `ACTIVE_HEALTHY` al momento de esta investigación. No hubo acceso directo a los logs del proceso de Railway (sin CLI configurado en este entorno) — la evidencia de causa raíz se arma con los logs de Postgres + la lectura del código, no con logs de Railway.

No se encontró ningún otro `*.connect()` directo contra el pool en todo `src/` fuera de los tres ya mencionados (`withTransaction.ts`, `tenantDb.ts`, `auth.route.ts`) — búsqueda exhaustiva, confirmado que no queda ningún cuarto lugar con el mismo problema.

## 5. Archivos modificados

```
src/server/routes/auth.route.ts        — usa withTransaction (la misma lógica ya corregida y probada)
                                          en vez de reimplementar a mano connect/BEGIN/COMMIT/ROLLBACK/release
src/main/db/withTransaction.ts         — solo descarta la conexión si el propio ROLLBACK falla (no por
                                          cualquier error de negocio) + log cuando sí se descarta
src/server/middleware/tenantDb.ts      — pool.connect() en sí ahora está en su propio try/catch
                                          (nunca puede quedar como una promesa rechazada sin manejar)
src/server/index.ts                    — unhandledRejection/uncaughtException (loguean, nunca quedan
                                          en silencio), apagado prolijo (SIGTERM/SIGINT cierra el pool
                                          antes de salir en cada deploy), log de pedidos lentos (>3s)
```

## 6. Archivos nuevos

```
tests/unit/tenantDb.test.ts                        — prueba que pool.connect() fallando cae SIEMPRE en
                                                       next(err), nunca en una promesa sin manejar
tests/unit/connection.test.ts (3 tests agregados)   — withTransaction contra un Pool REAL de TEST
                                                       (no el PoolClient disfrazado que usa el resto de
                                                       la suite — ver §7), incluida una corrida de 15
                                                       transacciones seguidas (más que el máximo de 10
                                                       conexiones) sin agotar el pool
docs/REPORTE_ESTABILIDAD_CONEXION_DENSZ.md          — este archivo
```

## 7. Por qué el bug no lo agarró la suite existente

La mayoría de los tests HTTP de este proyecto le pasan a cada router un `PoolClient` ya abierto disfrazado de `Pool` (toda la request de un test corre dentro de esa misma transacción, que el test revierte solo al final) — un patrón deliberado y documentado para que los tests sean rápidos y aislados. El costado real de esto: **ese patrón nunca ejercita la rama de código que realmente abre una conexión nueva contra el pool** (`pool.connect()`), que es justo donde vivía el bug. Esto ya estaba anotado como un punto ciego conocido (memoria de sesiones anteriores). Por eso los tests nuevos de este trabajo usan un `Pool` real contra `TEST_DATABASE_URL`, no el atajo de siempre.

## 8. Qué NO se tocó (a propósito)

- El tamaño del pool (`max: 10`), los timeouts de conexión y el resto de `connection.ts`: no hay evidencia de que el tamaño en sí sea el problema — el problema era que las conexiones rotas no se reemplazaban.
- CORS, el mecanismo de sesión (cookie en memoria del proceso de Railway) y el manejo de múltiples dispositivos: se revisaron (§9) y ya distinguen correctamente una sesión vencida (401, sin relación con la base) de una caída real de conexión (`/health`, pública, sin sesión) — no se encontró ningún problema ahí.
- Los reintentos del frontend (`ConexionGate`, cada 3s) y de React Query (`retry: 1` solo en lecturas, nunca en escrituras): ya cumplen lo pedido — nunca repiten una escritura automáticamente, nunca confunden sesión vencida con base caída.
- No se armó ni se publicó ningún instalador nuevo de escritorio. El arreglo de `withTransaction.ts` vive en código compartido (`src/main/db/`) y beneficiaría también al escritorio, pero la publicación de un instalador nuevo sigue pausada por un tema aparte (certificado de firma de código, ver `project_densz_smart_app_control_unsigned_installer`) — fuera del alcance de esta investigación. No afecta al escenario reportado: según la descripción del problema, el acceso "desde otra computadora" es siempre por navegador (`densz.vercel.app`), nunca por la app instalada.

## 9. Pruebas realizadas y resultados

- **Suite completa:** `npx vitest run` — **63 archivos, 658 tests, 0 fallas** (incluye los 2 tests nuevos de `tenantDb.test.ts` y los 3 nuevos de `connection.test.ts`, todos contra `TEST_DATABASE_URL`, nunca contra producción).
- **`npm run typecheck`:** limpio en los 4 proyectos (main/preload/renderer/server).
- Prueba específica con un `Pool` real: `withTransaction` corriendo 15 transacciones seguidas (más que el máximo de 10 conexiones configurado) sin agotar el pool ni necesitar ningún reinicio.
- Prueba específica de `attachTenantDb`: simulando que `pool.connect()` rechaza de verdad (pool agotado / timeout), se confirma que **siempre** cae en `next(err)` — nunca queda como una promesa sin manejar.
- Los dos tests de `/auth/usuarios-del-laboratorio` ya existentes (HTTP, aislamiento entre laboratorios) se corrieron contra el código nuevo y siguen pasando sin cambios — confirma que el refactor no cambió ningún comportamiento observable, solo la forma en que se maneja la conexión por dentro.

No se provocaron interrupciones artificiales contra producción en ningún momento, tal como se pidió.

## 10. Estado de Railway, Vercel y Supabase (al momento de este reporte)

- **Supabase (producción, `cvplaqzlaeyhnwbrrkfi`):** `ACTIVE_HEALTHY`, sin advisories de salud o performance relacionados a conexiones.
- **Vercel / Railway:** sin acceso a CLI en este entorno — se verificó indirectamente vía `https://densz.vercel.app` y `https://densz-production.up.railway.app/health`, ambos respondiendo con normalidad antes y después del deploy de este arreglo (ver también el monitoreo de UptimeRobot activado el 16/11, que no registró ninguna caída durante esta investigación).

## 11. Verificación de acceso desde múltiples dispositivos

`requireAuth.ts` resuelve la sesión por su propio id en cada pedido HTTP (nunca una variable global compartida) — ya soporta varias sesiones conectadas a la vez por diseño, sin relación con este bug. No se encontró ningún problema de CORS ni de cookies entre dispositivos: `WEB_ORIGIN` está fijado al dominio real de Vercel y la cookie de sesión viaja con `credentials: "include"` en cada pedido del frontend.

## 12. Confirmación de que no se alteró ningún dato real

Todos los cambios de este trabajo son exclusivamente de manejo de conexiones y errores — ningún archivo de migración, ninguna sentencia `DDL`, ningún `UPDATE`/`DELETE`/`INSERT` manual. Las únicas consultas hechas contra el proyecto de producción durante esta investigación fueron de **solo lectura** (advisories, logs, y un `SELECT` puntual para ubicar los IDs de dos órdenes ya consultadas en una sesión anterior) — nunca se escribió nada. Toda la verificación automatizada (658 tests) corrió exclusivamente contra `TEST_DATABASE_URL`.

## 13. Qué esperar de acá en adelante

El escenario descripto (login desde una computadora nueva, vía navegador) ya no puede dejar una conexión rota reciclada como sana — la causa raíz identificada está corregida y probada. Si el error volviera a aparecer, los logs nuevos (pedidos lentos, conexiones descartadas, cualquier excepción no capturada) van a dejar un rastro mucho más claro en Railway de dónde vino, en vez de la caja negra de antes.
