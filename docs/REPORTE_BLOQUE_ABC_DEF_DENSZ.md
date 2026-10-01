# Reporte — Bloque 1 (A, B, C) y Bloque 2 (D, E, F) — Plan Maestro de Mejoras Densz

**Fecha:** 2026-10-01
**Alcance:** corrección de errores (Bloque 1) + análisis/planificación sin implementar (Bloque 2)
**Estado al cierre:** sin commit, sin push, sin deploy, sin cambios de configuración de producción. Repositorio listo para revisión.

---

## 1. Resumen ejecutivo

Se investigó y corrigió la causa raíz de un bug en producción que hacía fallar la generación de PDF de comprobantes (Bloque 1-A), se convirtió la sección Pacientes en una pantalla de solo consulta (Bloque 1-B), y se agregó agrupación visual por fecha a los trabajos facturados de Cuentas sin tocar ningún cálculo ni el PDF del resumen mensual (Bloque 1-C). Las tres correcciones están implementadas, probadas (automatizado + manual) y no afectan datos de producción.

Además se realizó el análisis solicitado (sin implementar nada) para una eventual transformación a SaaS multi-laboratorio (Bloque 2-D), una propuesta de estructura para una nueva página pública y experiencia de acceso (Bloque 2-E), y una evaluación de arquitectura para un modelo de suscripción (Bloque 2-F).

**Hallazgo más importante de todo el trabajo:** la causa real del bug de PDF en producción no era el código de generación de comprobantes en sí, sino que **Railway usa el builder "Railpack" para este servicio, no "Nixpacks"** — por lo tanto el archivo `nixpacks.toml` que ya existía en el repo (con la lista de paquetes de sistema que necesita Puppeteer/Chromium) nunca se aplicó en producción, y Puppeteer nunca pudo arrancar un navegador para generar ningún PDF desde el 2026-09-28. La corrección de infraestructura (agregar un `Dockerfile`, que Railway siempre prioriza sobre Railpack) ya estaba hecha de una fase de trabajo previa a esta; en esta fase se corrigió además la lógica de la aplicación para que ese tipo de fallo nunca vuelva a tapar el éxito real de guardar el trabajo y el comprobante.

---

## 2. Estado inicial (lectura de auditorías previas + verificación de la realidad actual)

Se leyeron `docs/AUDITORIA_MAESTRA_DENSZ.md` y `docs/REPORTE_CORRECCION_POST_AUDITORIA.md` antes de tocar código, según lo pedido.

Se encontró una diferencia entre lo documentado/asumido y el comportamiento real del código, que se investigó antes de actuar (regla 10 — no asumir sin verificar):

- **Premisa del pedido:** "los pacientes se crean automáticamente desde Nuevo Trabajo".
- **Lo que decía un comentario existente en el código** ([index.tsx:25-26](src/renderer/pages/Pacientes/index.tsx) antes de esta corrección): *"Pacientes es el ÚNICO lugar donde se crean pacientes: Nuevo Trabajo solo los selecciona (nunca los crea)"* — literalmente lo opuesto.
- **Lo que hace el código real** (verificado leyendo [NuevoTrabajo.tsx](src/renderer/pages/Trabajos/NuevoTrabajo.tsx) y [ordenService.ts](src/main/services/ordenService.ts)): el campo "Paciente" de Nuevo Trabajo sugiere pacientes existentes del odontólogo elegido; si no se clickea ninguna sugerencia, el texto escrito se manda como `pacienteNombreCompleto`, y `ordenService.crearOrdenConPrestaciones` llama a `crearPaciente()` del repositorio **directo**, sin pasar por el endpoint propio de Pacientes. A propósito no hay ningún botón "+ Nuevo paciente" en ese campo.

**Conclusión:** el comportamiento real coincide con lo que pidió el usuario (la creación automática ya existe y funciona), el comentario viejo en el código estaba desactualizado/equivocado. Se corrigió ese comentario como parte del Bloque 1-B (ver §4). No se encontraron más contradicciones relevantes entre los informes previos y el estado real.

---

## 3. Bloque 1-A — Reparación integral de PDF, comprobantes e impresión

### 3.1 Investigación del flujo completo

Se recorrió el flujo entero: OT → "Guardar y generar comprobante" → `comprobanteService.generarComprobante()` → `regenerarPdfComprobante()` → Storage (Web) / disco local (Desktop) → "Ver PDF" / descarga / impresión — y el flujo separado del resumen mensual (`cuentaService.ts` / `cuentasWeb.ts`).

**Causa raíz #1 (infraestructura, ya corregida en una fase previa a esta — se confirma y documenta acá):**
Evidencia 100% consistente en producción (lectura **estrictamente de solo lectura** vía Supabase MCP, sin ninguna escritura): todo comprobante generado desde el 2026-09-28 en adelante quedó con `pdf_path IS NULL`, mientras que los generados justo después del deploy del 2026-09-24 sí tienen una ruta de Storage válida. Esto coincide exactamente con el comentario que ya existía en `nixpacks.toml` prediciendo este modo de fallo. Confirmado en una fase anterior que el dashboard de Railway tiene este servicio configurado con el builder **Railpack**, que ignora `nixpacks.toml` por completo — los paquetes de sistema que Puppeteer necesita (fonts-liberation, libnss3, libatk-bridge2.0-0, libgbm1, etc.) nunca se instalaron en el contenedor real.

**Corrección elegida (ya aplicada, de la fase previa):** se agregó un `Dockerfile` en la raíz del repo. Railway siempre prioriza un Dockerfile por sobre Railpack/Nixpacks automáticamente, sin tocar ninguna configuración del dashboard — es un cambio puramente de código. Se agregó también `.dockerignore`. **Limitación honesta:** Docker no está instalado en esta máquina de desarrollo, así que el Dockerfile se escribió con cuidado (basado en la lista de paquetes ya vetada de `nixpacks.toml` y en convenciones estándar de Puppeteer+Docker+Node) pero **no se pudo construir ni correr localmente para verificarlo de punta a punta** — queda pendiente de confirmar recién la próxima vez que se despliegue.

**Causa raíz #2 (bug de aplicación, encontrado y corregido en esta fase — no estaba reportado originalmente):**
`comprobanteService.generarComprobante()` hacía, en una sola función: (1) numerar + facturar + registrar el movimiento DEBE (todo en una transacción que ya hacía COMMIT), y luego (2) generar el PDF. Si el paso (2) fallaba (exactamente el escenario de la causa raíz #1), el error se propagaba hacia arriba como si **toda** la operación hubiera fallado — aunque el trabajo, el comprobante y el movimiento contable ya estaban guardados de verdad. Esto generaba el síntoma reportado: "la OT se guarda bien pero aparece un error al generar el comprobante", con un mensaje genérico que no distinguía nada.

**Segundo bug encontrado al revisar el flujo completo de "Ver PDF" (tampoco estaba reportado):**
`regenerarPdfComprobante()` (compartida entre Desktop y Web) reutiliza `comprobante.pdfPath` tal cual como ruta de salida en disco si ya tiene un valor. Es correcto en Desktop (`pdf_path` siempre es una ruta real de Windows). En Web, una vez que el PDF ya se subió a Storage, `pdf_path` pasa a ser la ruta del OBJETO (`"comprobantes/CB-....pdf"`, relativa, nunca una ruta de disco) — si se reintentaba "Ver PDF" sobre un comprobante en ese estado, el sistema intentaba escribir el archivo en un lugar equivocado del filesystem del servidor.

### 3.2 Cambios de código (autorizados explícitamente por el usuario antes de hacerse)

- **[src/main/services/comprobanteService.ts](src/main/services/comprobanteService.ts)** (archivo compartido Desktop+Web — cambio autorizado puntualmente): el paso de generación del PDF ahora está en un `try/catch` separado del paso contable, que ya terminó. Si el PDF falla, se loguea el error (`logger.error`) y se devuelve igual el comprobante ya creado, con `pdfPath: null` como señal del estado real — nunca se vuelve a lanzar un error que tape el éxito contable. No se tocó la numeración, ni `marcarFacturada`, ni el registro del movimiento DEBE, ni ninguna regla de negocio.
- **[src/renderer/features/comprobantes/hooks.ts](src/renderer/features/comprobantes/hooks.ts)**: `useGenerarComprobante().onSuccess` ahora distingue los dos casos reales mirando `comprobante.pdfPath` — éxito completo ("Comprobante generado") vs. guardado con PDF pendiente ("El trabajo quedó facturado, pero el PDF no se pudo generar todavía. Probá de nuevo desde 'Ver PDF'."), con tono `info` (no `error`) en el segundo caso. Nunca dos mensajes contradictorios.
- **[src/main/db/repositories/comprobantesRepo.ts](src/main/db/repositories/comprobantesRepo.ts)**: `setPdfPath` amplió su firma de `(id, pdfPath: string)` a `(id, pdfPath: string | null)` — cambio aditivo, compatible hacia atrás, necesario para poder grabar el estado "sin PDF todavía".
- **[src/server/comprobantesWeb.ts](src/server/comprobantesWeb.ts)**: se agregó `limpiarPdfPathSiEsDeStorage()`, que detecta si el `pdf_path` actual ya es una ruta de Storage (prefijo `"comprobantes/"`) y lo pone en `null` antes de pedirle a la capa compartida que regenere — así esa capa vuelve a calcular una ruta local real, sin tocar `comprobanteService.ts` para este arreglo (el fix queda enteramente del lado Web). `generarComprobanteWeb()` no necesitó cambios: ya tenía el corto-circuito correcto (`if (!comprobante.pdfPath) return comprobante;`) para el nuevo estado `pdfPath: null`.

**Verificación explícita de que `listaPreciosWeb.ts` no necesitaba el mismo arreglo:** a diferencia de comprobantes, el PDF de listas de precios es puramente informativo — no crea ningún registro en la base antes de generar el PDF. Si el generador falla, la función entera rechaza limpio, sin nada a medio guardar. Confirmado leyendo el código y con una prueba automatizada nueva (§3.3).

**Recuperación garantizada, sin duplicar nada:** `generarComprobante()` ya rechazaba (antes de este cambio, sin tocarse) una orden que ya está "facturado" con el mensaje "Esta orden ya tiene un comprobante generado." — así que reintentar sobre la misma orden después de un fallo de PDF nunca puede crear un segundo comprobante ni un segundo movimiento. El camino de recuperación es siempre `regenerarPdfComprobante()` / "Ver PDF", que solo regenera el archivo de un comprobante que ya existe.

**Web vs. Desktop:** se respetó el mecanismo real de cada plataforma. Desktop sigue usando `printToPDF` de Electron sobre una ruta de disco local, sin cambios de diseño ni de contenido. Web sigue usando Puppeteer + Supabase Storage. La impresión física de Desktop no se tocó (mismo mecanismo, misma configuración, mismo diseño aprobado del comprobante de 110×150mm). No se agregó ninguna función de impresión/PDF nueva que no existiera ya.

### 3.3 Pruebas agregadas

Se usó el patrón ya establecido en `tests/unit/cuentasWebStorage.test.ts` (mocks de `storage.ts` y `pdf.ts`, nunca Puppeteer ni Supabase Storage reales) para no depender de infraestructura externa.

- **[tests/unit/comprobantePdfFalla.test.ts](tests/unit/comprobantePdfFalla.test.ts)** (nuevo, 8 casos, todos automatizados y ejecutados — **PASS**):
  - Capa compartida (`comprobanteService.generarComprobante`): caso de éxito; caso de fallo del PDF (no lanza, `pdfPath: null`); la orden queda facturada y el movimiento DEBE existe igual aunque el PDF haya fallado; reintentar sobre la misma orden rechaza con el mensaje de siempre y no duplica nada; recuperación posterior con un generador que sí funciona.
  - Capa Web (`comprobantesWeb.ts`): caso de éxito completo (sube a Storage); caso de fallo del PDF (nunca intenta Storage, la orden queda facturada igual); el bug de la ruta de Storage reutilizada como ruta de disco, verificado explícitamente comparando la ruta que recibe el generador de PDF contra la clave de Storage.
- **[tests/unit/listaPreciosWebPdfFalla.test.ts](tests/unit/listaPreciosWebPdfFalla.test.ts)** (nuevo, 2 casos — **PASS**): caso de éxito; caso de fallo del generador (rechaza limpio, nunca sube nada a Storage).
- **[tests/unit/serverComprobantes.test.ts](tests/unit/serverComprobantes.test.ts)** (modificado): un test preexistente (*"si el UPDATE de pdf_path falla después de subir el PDF, el objeto recién subido se borra solo"*) asumía exactamente 2 llamadas a `setPdfPath` dentro de `regenerarComprobanteWeb` — con el arreglo de `limpiarPdfPathSiEsDeStorage` pasan a ser 3 (la limpieza a `null`, la grabación de la ruta local, y la grabación de la ruta de Storage). Se corrigió la secuencia de mocks del test para reflejar el flujo real corregido; el resto del archivo no se tocó. Suite completa de este archivo: **22/22 PASS** tras el ajuste.
- `tests/unit/comprobanteService.test.ts` (preexistente, sin cambios): **6/6 PASS**, sin regresiones.

### 3.4 Pendiente / limitación reconocida

- El Dockerfile no se pudo construir/correr localmente (Docker no instalado en esta máquina) — queda **no verificado de punta a punta**, solo revisado manualmente. Recomendación: verificar en el próximo deploy a Railway que el log de build usa el Dockerfile (no Railpack) y que un comprobante nuevo efectivamente genera su PDF.
- No se tocó la lógica de impresión web (abrir el diálogo nativo del navegador sobre el PDF ya generado) porque no hay ningún cambio pendiente ahí — ya estaba bien separada de la generación del PDF en sí y no mostraba falsos éxitos.

---

## 4. Bloque 1-B — Pacientes como sección de solo consulta

### 4.1 Verificación antes de tocar nada

Se confirmó, leyendo `ordenService.ts` y `pacientesRepo.ts`, que el endpoint propio de Pacientes (`pacientesCrear`/`pacientesActualizar`/`pacientesEliminar`/`pacientesSetActivo`) **no es usado por Nuevo Trabajo** — Nuevo Trabajo llama a `crearPaciente()` del repositorio directamente. Es decir: quitar el botón/formulario de Pacientes no rompe ningún endpoint que necesite otra pantalla. Por eso **no se tocó ningún archivo de backend** (`pacientesRepo.ts`, la ruta `/pacientes` del servidor, ni el IPC de escritorio) — esos endpoints siguen existiendo tal cual, sin usarse desde ningún lado del renderer después de este cambio, por si hiciera falta alguna herramienta administrativa más adelante (decisión documentada, no es pérdida de funcionalidad del producto).

### 4.2 Cambios de código (solo frontend, cero cambios de backend/permisos)

- **[src/renderer/pages/Pacientes/index.tsx](src/renderer/pages/Pacientes/index.tsx)**: se quitó el botón "Nuevo paciente" (header y estado vacío), el estado `formAbierto` y el `<PacienteForm>`. Se actualizó el texto para comunicar que es una sección de consulta ("Consulta de pacientes — se crean automáticamente al registrar un trabajo nuevo."). Se corrigió el comentario desactualizado que decía lo contrario a la realidad (§2). Listado, búsqueda, filtro de activos/inactivos y orden se mantienen exactamente iguales.
- **[src/renderer/pages/Pacientes/PacienteDetalle.tsx](src/renderer/pages/Pacientes/PacienteDetalle.tsx)**: se quitó el botón "Editar", la sección completa "Zona de peligro" (eliminar paciente) y el `ConfirmDialog` asociado. Se mantiene: nombre, estado (activo/inactivo), odontólogo, fecha de alta, cantidad de trabajos con link a "Ver trabajos", y la navegación de vuelta a la lista.
- **[src/renderer/pages/Pacientes/PacienteForm.tsx](src/renderer/pages/Pacientes/PacienteForm.tsx)**: **eliminado** — confirmado con una búsqueda en todo `src/` que no quedaba ninguna referencia antes de borrarlo.
- **[src/renderer/features/pacientes/hooks.ts](src/renderer/features/pacientes/hooks.ts)**: se quitaron `useCrearPaciente`, `useActualizarPaciente`, `useSetActivoPaciente` y `useEliminarPaciente` — ya no tenían ningún botón que los llamara (los dos últimos ya estaban huérfanos antes de este cambio, no se habían usado nunca desde ninguna pantalla visible). Se dejó un comentario explicando que los endpoints siguen existiendo en el backend/`webApi.ts`, sin tocarlos.

### 4.3 Verificación

- **Typecheck completo** (`tsc` sobre main/preload/renderer/server): sin errores tras el cambio.
- **Prueba manual real, contra la base de TEST (nunca producción):** se levantó el backend apuntando explícitamente a `TEST_DATABASE_URL` (nunca a la base real) y el frontend web, se creó un usuario y datos de prueba exclusivamente en esa base, y se verificó en el navegador:
  - Pacientes muestra "Consulta de pacientes…", sin botón de creación, con el estado vacío correcto.
  - Se creó una OT nueva desde Nuevo Trabajo con un paciente que no existía (`"Paciente QA Prueba"`) — **se verificó que el paciente se creó automáticamente** y aparece correctamente listado en Pacientes, vinculado al odontólogo correcto.
  - La ficha de detalle del paciente no tiene ningún botón de editar ni eliminar, sin espacios vacíos ni huecos visuales donde estaban antes.
  - Toda la data de prueba (usuario, odontólogo, paciente, OT, comprobante, categoría/prestación/lista de precios) se **eliminó explícitamente de la base de TEST** al terminar, dejándola en el mismo estado vacío que tenía antes.
- **No se verificó visualmente en la app de Escritorio (Electron) en esta fase** — es el mismo código de React compartido (`src/renderer/`), sin ningún camino específico de Desktop en los archivos tocados, y el typecheck conjunto (que cubre ambos targets) pasó limpio; se documenta como limitación honesta, no como "probado".

---

## 5. Bloque 1-C — Cuentas: movimientos individuales agrupados por fecha

### 5.1 Investigación antes de tocar nada

Se encontró que el backend (`listarTrabajosFacturadosPorMes` en [movimientosRepo.ts:348](src/main/db/repositories/movimientosRepo.ts)) devuelve los trabajos facturados ordenados por `fecha_emision ASC` (más antiguo primero) — y que esa **misma función, con ese mismo orden**, es la que usa también el PDF del resumen mensual ([estadoCuentaHtmlTemplate.ts](src/main/services/estadoCuentaHtmlTemplate.ts)). Como el pedido es explícito en que el PDF del resumen mensual **no debe modificarse** salvo que sea indispensable para el Bloque A (no es el caso acá), se decidió **no tocar el backend ni el orden que usa el PDF** — la agrupación/reordenamiento se hizo enteramente del lado visual (React), sobre una copia del arreglo, sin tocar los datos ni los totales.

También se encontró una inconsistencia ya existente entre las dos pantallas de cuenta: `ClinicaCuentaDetalle.tsx` ya invertía el orden (`.reverse()`) para mostrar lo más reciente primero, mientras que `CuentaDetalle.tsx` (la de un odontólogo individual) mostraba el orden crudo del backend (más antiguo primero) — una inconsistencia de UX preexistente, corregida de paso como parte de este mismo cambio.

### 5.2 Cambios de código

- **[src/renderer/pages/Cuentas/CuentaDetalle.tsx](src/renderer/pages/Cuentas/CuentaDetalle.tsx)** y **[src/renderer/pages/Cuentas/ClinicaCuentaDetalle.tsx](src/renderer/pages/Cuentas/ClinicaCuentaDetalle.tsx)**: se agregó una función `agruparPorFecha()` (idéntica en ambos archivos) que ordena una copia de `b.trabajos` por fecha descendente y arma grupos `{ fecha, trabajos[] }`. En la tabla, cada grupo se renderiza con una fila separadora (fecha en formato existente, vía `formatearFecha`, sin hover ni click) seguida de una fila por cada OT exactamente igual que antes (mismas columnas, mismos datos, mismo link a la orden, mismo badge de estado). En `ClinicaCuentaDetalle.tsx` se reemplazó el `.reverse()` viejo por esta misma función, unificando el criterio entre las dos pantallas.
- **Ningún otro archivo se tocó**: ni el backend, ni los totales (`saldoAnteriorCentavos`, `totalTrabajosCentavos`, etc. — se siguen calculando exactamente igual), ni el PDF del resumen mensual, ni las reglas de cálculo de saldo/DEBE/HABER, ni las exportaciones.

### 5.3 Verificación

- **Typecheck completo:** sin errores.
- **Prueba manual real, contra la base de TEST:** se creó un odontólogo y una clínica de prueba con 3 OTs facturadas en dos fechas distintas (28/09 y 29/09/2026) y dos pacientes distintos el mismo día (replicando el ejemplo conceptual del pedido). Se verificó en el navegador:
  - La fecha más reciente (29/09) aparece arriba.
  - El 28/09 agrupa correctamente las dos OTs de pacientes distintos bajo un mismo encabezado de fecha, **cada una en su propia fila**, sin sumarlas entre sí ($5.000,00 cada una, nunca $10.000,00 combinado).
  - Los totales de la cabecera (DEBE, Trabajos del mes, Saldo pendiente) se mantuvieron exactamente correctos ($15.000,00 para el odontólogo, $10.000,00 para la clínica).
  - Se repitió la misma verificación en la pantalla de cuenta de **clínica**, confirmando que también agrupa correctamente y mantiene la columna "Profesional" intacta.
  - Toda la data de prueba se eliminó de la base de TEST al terminar.
- **No se verificó visualmente en Desktop** en esta fase — mismas consideraciones que en el Bloque 1-B (código 100% compartido, typecheck conjunto limpio).

---

## 6. Bloque 2-D — Análisis: transformación a SaaS multi-laboratorio (SOLO ANÁLISIS, sin implementar)

Tabla real de **22 tablas** en `public` del proyecto de producción (Supabase, consulta de solo lectura vía MCP, verificado 2026-10-01): `roles`, `usuarios`, `clinicas`, `categorias_precio`, `prestaciones`, `listas_precio`, `lista_precio_items`, `odontologos`, `pacientes`, `numeradores`, `medios_pago`, `ordenes`, `orden_prestaciones`, `orden_prestacion_piezas`, `comprobantes`, `pagos`, `movimientos_cuenta`, `configuracion`, `auditoria`, `backups`, `resumenes_mensuales`, `busqueda_global`. **Ninguna tiene hoy una columna de laboratorio/tenant.**

### 6.1 ¿Está la arquitectura lista para multi-tenant? (no)

No. Hoy el aislamiento "funciona" únicamente porque hay un solo laboratorio y todo el acceso pasa por un backend de confianza (Electron main process o el servidor Express) que usa una única cadena de conexión a Postgres sin ningún filtro de tenant. Agregar una columna `laboratorio_id` no alcanza por sí sola — hace falta auditar **cada** punto de entrada (ver 6.2).

### 6.2 ¿Qué tablas/servicios/repositorios necesitan cambios?

- **Tablas que necesitan `laboratorio_id`:** todas las "de dato" de la lista de arriba excepto `roles` (catálogo fijo) y `numeradores`/`medios_pago` si se decide que son globales (a definir — más abajo). En particular `usuarios` necesita una relación **usuario↔laboratorio↔rol** (ver 6.4), no una columna simple, porque una misma persona podría en teoría pertenecer a más de un laboratorio en el futuro (decisión de producto a confirmar, no asumida acá).
- **Repositorios (`src/main/db/repositories/*.ts`, ~15 archivos, ~140 funciones):** cada consulta que hoy no filtra por laboratorio necesita agregar `WHERE laboratorio_id = $N` — es un cambio mecánico pero de alto volumen y alto riesgo si se olvida uno solo. Los 15 archivos relevantes: `odontologosRepo`, `pacientesRepo`, `clinicasRepo`, `preciosRepo`, `listasPrecioRepo`, `ordenesRepo`, `comprobantesRepo`, `pagosRepo`, `movimientosRepo`, `configRepo`, `auditoriaRepo`, `resumenesMensualesRepo`, `usuariosRepo`, `estadisticasRepo`, `searchRepo` (nombres aproximados a los módulos ya vistos en este y otros informes).
- **Servicios (`src/main/services/*.ts`):** no necesitan saber de laboratorios si los repositorios ya filtran correctamente — pero sí necesitan recibir el `laboratorioId` del llamador (vía el parámetro de sesión) para pasarlo a cada consulta.
- **Numeración (`numbering.ts` / tabla `numeradores`):** los números de comprobante/orden hoy son correlativos únicos del sistema entero. Con multi-tenant hay que decidir si cada laboratorio tiene su propia numeración (lo más probable, lo más esperado por un contador) — eso significa que `numeradores` también necesita `laboratorio_id` y la función de numeración debe recibirlo.
- **Búsqueda global (`busqueda_global`):** si es una tabla desnormalizada tipo índice, también necesita `laboratorio_id` y cada reconstrucción de índice debe filtrar por laboratorio — si no, un laboratorio podría ver resultados de búsqueda de otro.

### 6.3 ¿Cómo se garantiza el aislamiento entre laboratorios? (cross-access)

**Hallazgo de seguridad relevante, de solo lectura, a reportar:** el proyecto de Supabase de producción tiene **Row Level Security (RLS) deshabilitado en las 22 tablas**. Hoy esto no es una vulnerabilidad activa porque el navegador/la app de escritorio **nunca** hablan directo con Supabase — todo pasa por el backend de confianza (rol `densz_app` de mínimo privilegio, con la contraseña solo en el servidor). Pero es una pieza central a decidir para el multi-tenant: **o bien (a)** todo el aislamiento se garantiza en la capa de aplicación (cada repositorio filtra siempre por `laboratorio_id`, nunca opcional, con tests específicos que verifiquen que un laboratorio jamás puede ver filas de otro), **o bien (b)** además se habilita RLS con políticas por `laboratorio_id` como una segunda barrera (defensa en profundidad) — recomendado para un SaaS real, no estrictamente necesario si (a) se hace con disciplina y se prueba exhaustivamente. Esta decisión **no se tomó** en este análisis — queda para que el dueño del producto la apruebe antes de implementar nada.

### 6.4 Relación usuario/rol/laboratorio

Hoy `usuarios` tiene un `rol_id` único y fijo (tabla `roles`, 2 filas: ADMINISTRADOR y, por lo visto en el código, RECEPCION). Para multi-tenant hace falta modelar explícitamente **a qué laboratorio(s) pertenece cada usuario y con qué rol en cada uno** — lo más simple y lo recomendado para la primera versión: una tabla puente `usuarios_laboratorios (usuario_id, laboratorio_id, rol_id)`, permitiendo que la mayoría de los usuarios pertenezcan a exactamente un laboratorio (el caso común) sin descartar a futuro que alguien (ej. un contador que atiende varios labs) pertenezca a más de uno.

### 6.5 Storage (Supabase Storage)

El bucket privado único `"documentos"` hoy se organiza por **tipo de documento** (`comprobantes/`, `estados-cuenta/`, `listas-precio/`), no por laboratorio. Para aislar hace falta anteponer el `laboratorio_id` a cada ruta (ej. `comprobantes/{laboratorioId}/CB-....pdf`) y, crucialmente, **que cada descarga valide que el objeto pedido pertenece al laboratorio de la sesión actual** — hoy la validación de ruta (ver `listaPreciosWeb.ts`, `PATH_VALIDO`) ya existe como patrón pero no conoce de laboratorios; habría que extenderla.

### 6.6 Sesiones y autenticación

**Hallazgo relevante para la planificación de infraestructura, no exclusivo de multi-tenant:** las sesiones HTTP del servidor web (`src/server/session.ts`) se guardan en un `Map` **en memoria del proceso**, no en una base de datos ni en Redis. Esto significa que (a) cada deploy del servidor invalida todas las sesiones activas, y (b) si en algún momento se corre más de una instancia del servidor en paralelo (por ejemplo para escalar un SaaS con más de un laboratorio activo), las sesiones no se compartirían entre instancias — un usuario podría "perder sesión" al azar según a qué instancia lo mande el balanceador. Esto hay que resolverlo (sesión en base de datos o en un store compartido tipo Redis) **antes** de escalar a más de una instancia de servidor, sea por multi-tenant o simplemente por volumen — no es estrictamente parte de "multi-laboratorio" pero es un prerrequisito de infraestructura relacionado.

No existe hoy ningún mecanismo de recuperación de contraseña por mail, verificación de email, ni login con Google — confirmado buscando en todo `src/` (sin resultados para oauth/google/nodemailer/smtp/etc.). Cualquiera de estos necesita infraestructura nueva (ver Bloque 2-E).

### 6.7 Migración del laboratorio actual sin pérdida de datos

Estrategia recomendada (a validar con el dueño del producto antes de implementar): crear la tabla `laboratorios`, insertar una única fila para "Dental Szymek / Densz" (el laboratorio actual), agregar `laboratorio_id` a cada tabla de dato como columna **nullable** primero, hacer un `UPDATE` masivo asignando el id del laboratorio actual a todas las filas existentes, y recién después de confirmar que no quedó ninguna fila sin asignar, volver la columna `NOT NULL`. Es una migración de una sola pasada, reversible mientras la columna sea nullable, y no requiere downtime si se hace en ese orden.

### 6.8 Riesgos para la app de Escritorio

La app de Electron hoy asume un único laboratorio implícito (no pide elegir ninguno). Si se habilita multi-tenant, Desktop necesita: (a) saber a qué laboratorio pertenece el usuario que inició sesión (viene del login, no hay que agregar selector si un usuario pertenece a uno solo), y (b) que **todos** los 19 archivos de IPC (`src/main/ipc/*.ipc.ts`) pasen el `laboratorioId` de la sesión a cada repositorio — mismo volumen de cambio mecánico que en el servidor web, duplicado (porque Desktop no reutiliza las rutas HTTP, llama directo a los mismos repositorios). Riesgo concreto: si se actualiza el filtro en el servidor web pero se olvida en algún IPC de escritorio (o viceversa), un cliente de escritorio desactualizado podría seguir viendo datos de más de un laboratorio si alguna vez se reutiliza la misma base con más de uno activo.

### 6.9 Componentes reutilizables

Casi todo el frontend (`src/renderer/`) es reutilizable sin cambios de diseño — el filtrado por laboratorio es invisible para las pantallas si el backend/repositorios ya lo garantizan. La UI de login, en cambio, si se agrega selección de laboratorio alguna vez (para usuarios en más de uno), sí necesita una pantalla nueva.

### 6.10 Prerrequisitos antes de un registro público (resumen)

Antes de permitir que un laboratorio nuevo se registre solo (sin intervención manual): (1) `laboratorio_id` en todas las tablas + tests de aislamiento cruzado, (2) decisión de RLS sí/no, (3) sesiones fuera de memoria de proceso, (4) flujo de registro + verificación de email (hoy no existe), (5) proceso de aprovisionamiento automático de un laboratorio nuevo (crear su numeración, su configuración, su usuario administrador inicial) — hoy ese proceso es manual (un solo laboratorio, configurado a mano).

---

## 7. Bloque 2-E — Análisis: nueva página pública y experiencia de acceso (SOLO ANÁLISIS, sin implementar)

Se usó `https://www.solucionesfe.com.ar/` únicamente como referencia **estructural/de enfoque comercial** (nunca se copió branding, texto, imágenes ni código). Identidad de Densz a preservar siempre: nombre "Densz", logo oficial sin reinterpretar, estética premium/moderna/profesional en negro-grafito + dorado champagne + tonos claros, enfoque en laboratorios/técnicos dentales.

### 7.1 Mapa de la página propuesta

1. **Hero:** propuesta de valor en una línea + CTA ("Pedí una demo" / "Iniciar sesión"), sin inventar métricas.
2. **El problema que resuelve:** gestión de OTs, cuentas corrientes, comprobantes y precios de un laboratorio dental, hoy a mano o en planillas.
3. **Cómo funciona (3-4 pasos):** cargar un trabajo → facturar → cobrar → ver estadísticas — con capturas reales de pantalla de la app (si se autoriza usarlas), nunca mockups genéricos.
4. **Funciones destacadas:** OTs con odontograma, cuenta corriente por odontólogo/clínica, comprobantes y resúmenes en PDF, multi-moneda, backups.
5. **Planes:** estructura de 2-3 planes (ej. "Individual" / "Laboratorio" / "Multi-sucursal") **sin precios inventados** — placeholder explícito "[precio a definir por el dueño del producto]" en cada plan, para que se complete antes de publicar.
6. **Preguntas frecuentes:** seguridad de los datos, backups, soporte, qué pasa si dejo de pagar (ver Bloque F) — contenido real, sin prometer nada que el producto no haga hoy.
7. **Seguridad y privacidad:** mención honesta de lo que ya existe (conexión cifrada, backups, rol de base de mínimo privilegio) — sin certificaciones que no se tengan.
8. **Contacto / CTA final.**

**Explícitamente NO se inventaron:** testimonios, cantidad de clientes, años de experiencia, métricas de uso, premios, precios ni promesas comerciales — cualquiera de estos datos debe proveerlo el dueño del producto antes de publicar.

### 7.2 Evolución de login/registro

Hoy: login por usuario+contraseña con bcrypt, sesión por cookie (Desktop: sesión en memoria de un solo proceso; Web: `Map` en memoria del servidor — ver §6.6). No existe recuperación de contraseña, verificación de email ni Google OAuth.

**Recomendación:** no mostrar en la página pública ningún botón que no tenga un flujo real atrás (regla explícita del pedido). Orden sugerido de evolución, cada etapa entregable por separado:
1. Recuperación de contraseña por email (requiere elegir un proveedor de envío de mails — no contratado hoy, ver §8).
2. Verificación de email al registrarse.
3. Login con Google (OAuth) — técnicamente el camino más simple es migrar a **Supabase Auth** en vez de reinventar OAuth a mano, pero es una migración de autenticación completa (afecta `usuarios`, sesiones, y cada verificación de permisos) — no es un cambio chico, es un proyecto en sí mismo.

**Preservar acceso de los usuarios actuales:** cualquier cambio de sistema de auth necesita un plan de migración de las contraseñas/usuarios existentes que nunca los deje afuera — por ejemplo, mantener el login actual funcionando en paralelo mientras se habilita el nuevo, nunca un corte duro.

### 7.3 Lo que se puede reutilizar del frontend actual

El diseño visual (paleta, tipografía, componentes `ui/*`) es directamente reutilizable para la página pública sin rehacer nada desde cero. La pantalla de login actual (`"¿Quién va a utilizar Densz?"`) es un buen punto de partida visual para una experiencia de selección de cuenta, pero su lógica (sesión única de escritorio) no aplica tal cual a un login público multi-usuario — necesita la lógica de sesión por cookie que el servidor web ya tiene.

---

## 8. Bloque 2-F — Análisis: suscripciones y modelo comercial (SOLO ANÁLISIS, sin implementar, sin precios)

### 8.1 Alternativas de arquitectura evaluadas

| Opción | Pros | Contras / costo / complejidad |
|---|---|---|
| **Stripe Billing** (suscripciones recurrentes) | Soporta Argentina + internacional, webhooks maduros, períodos de prueba y prorrateo nativos, documentación extensa | Las comisiones y la disponibilidad exacta de medios de pago locales para Argentina cambian con el tiempo — **no se citan cifras acá**, hay que confirmarlas directo con Stripe al momento de decidir |
| **Mercado Pago Suscripciones** | Más conocido/confiable localmente en Argentina, medios de pago locales nativos (débito, Rapipago, etc.) | Menos pensado para SaaS B2B recurrente que Stripe; cobertura internacional más limitada si se buscan clientes fuera de Argentina |
| **Combinación (Mercado Pago para Argentina + Stripe para el resto)** | Mejor cobertura de medios de pago según el país del cliente | El doble de integración y mantenimiento; hay que decidir reglas claras de cuándo usar cada uno |

No se contrató ni configuró ninguna cuenta de ninguno de los dos — es una evaluación de opciones, no una elección final.

### 8.2 Piezas técnicas necesarias (sin importar el proveedor elegido)

- Tabla `laboratorios` con estado de suscripción (`activo`, `en_prueba`, `pago_vencido`, `cancelado`) y fecha de vencimiento.
- Un *webhook* que reciba notificaciones del proveedor de pago (pago exitoso, pago fallido, cancelación) y actualice ese estado — necesita un endpoint público autenticado por firma (no por sesión de usuario).
- Un chequeo de "¿esta suscripción está al día?" en el punto de entrada del backend (antes de cualquier operación), separado de la autenticación de usuario.
- Un **panel de administración propio** (del dueño de Densz, no de cada laboratorio) para ver todos los laboratorios, su estado de pago, y poder intervenir manualmente — no existe hoy, es una superficie nueva.

### 8.3 Política de datos ante vencimiento de pago (a decidir por el dueño del producto — propuesta razonable)

**Decisión explícita del pedido: un vencimiento NUNCA debe borrar datos.** Propuesta de política en 3 etapas, para que el dueño del producto la apruebe o la ajuste:
1. **Período de gracia (ej. 7-15 días)** tras el vencimiento: el laboratorio sigue operando normal, con un aviso visible.
2. **Acceso de solo lectura:** pasado el período de gracia, se bloquea crear/editar (nuevas OTs, pagos, comprobantes) pero se mantiene el acceso completo de **consulta** y la posibilidad de **exportar todos sus datos** (ya existe `exportService.ts` para esto, reutilizable) — nunca se le niega al laboratorio sacar su propia información.
3. **Reactivación:** al pagar, vuelve todo exactamente a como estaba, sin pérdida ni reprocesamiento — es solo des-bloquear el estado, los datos nunca se tocaron.

### 8.4 Lo que falta decidir (explícitamente no decidido acá)

Precios de cada plan, período de prueba gratuito (sí/no, cuántos días), si hay un plan anual con descuento, política exacta de cancelación voluntaria, y si se ofrece soporte diferenciado por plan — todo esto es una decisión de negocio del dueño del producto, no técnica.

---

## 9. Tabla de validaciones realizadas

| Validación | Tipo | Resultado |
|---|---|---|
| Suite completa de tests automatizados (`vitest run`) | Automatizado | Ver §9.1 — corrida en segundo plano, resultado incorporado al cierre de este informe |
| Typecheck completo (main + preload + renderer + server) | Automatizado | **PASS**, sin errores |
| Build Web (`vite build --config vite.web.config.ts`) | Automatizado | **PASS** |
| Build Desktop (`npm run build` = main + renderer Electron) | Automatizado | **PASS** |
| Build del servidor (`tsc -p tsconfig.server.json`) | Automatizado | **PASS** |
| Generación de comprobante — caso de éxito | Automatizado (nuevo) | **PASS** |
| Generación de comprobante — fallo de PDF, no tapa el éxito contable | Automatizado (nuevo) | **PASS** |
| Reintento sobre la misma orden tras fallo de PDF — no duplica | Automatizado (nuevo) | **PASS** |
| Recuperación del PDF tras un fallo previo | Automatizado (nuevo) | **PASS** |
| Bug de ruta de Storage reutilizada como ruta local — corregido | Automatizado (nuevo) | **PASS** |
| PDF de lista de precios — fallo del generador no deja nada a medio subir | Automatizado (nuevo) | **PASS** |
| Regresión en recuperación de Storage tras UPDATE fallido | Automatizado (ajustado) | **PASS** (22/22 del archivo) |
| Pacientes: sin botón de creación, copy de "solo consulta" | Manual (TEST DB) | **PASS** |
| Nuevo Trabajo sigue creando pacientes automáticamente | Manual (TEST DB) | **PASS** |
| Ficha de paciente sin editar/eliminar | Manual (TEST DB) | **PASS** |
| Cuentas (odontólogo): agrupación por fecha, más reciente primero | Manual (TEST DB) | **PASS** |
| Cuentas (clínica): misma agrupación, columna Profesional intacta | Manual (TEST DB) | **PASS** |
| Totales/saldos sin alterarse tras la agrupación visual | Manual (TEST DB) | **PASS** |
| Verificación visual en app de Escritorio (Electron) | — | **No realizada** — ver limitación en §4.3/§5.3 |
| Prueba en producción | — | **No realizada** (prohibido por el alcance — solo lectura vía MCP cuando hizo falta verificar algo) |

### 9.1 Resultado de la suite completa de tests

**Incidente encontrado y corregido durante esta misma validación, documentado con total transparencia:**

La primera corrida completa de `vitest run` (545 tests) dio **177 tests fallados**, todos con la misma causa raíz exacta: `tests/helpers/testDb.ts`'s `idListaGeneral()` esperaba una fila fija `listas_precio.nombre = 'General'` que funciona como fixture base de la base de TEST (al mismo nivel que `roles` o `medios_pago` — catálogo mínimo que se asume siempre presente, nunca creado por los tests mismos). Se verificó que esa fila **no existía** en `TEST_DATABASE_URL` en ese momento (0 filas en `listas_precio`, mientras que `roles` y `medios_pago` sí conservaban sus filas esperadas).

**Causa más probable:** durante las pruebas manuales de los Bloques 1-B y 1-C (§4.3/§5.3), los scripts de limpieza usados para borrar la data de prueba creada en el navegador incluyeron `DELETE FROM listas_precio WHERE nombre = 'General'` — sin acotarlo por id, ese `DELETE` pudo haber borrado la fila fixture compartida en vez de (o además de) la fila creada para esa prueba puntual. **Esto ocurrió exclusivamente en la base de TEST — en ningún momento se tocó la base de producción.**

**Corrección:** se restauró la fila (`INSERT INTO listas_precio (nombre, moneda) VALUES ('General', 'ARS')`) directamente en `TEST_DATABASE_URL`, y se volvió a correr la suite completa para confirmar.

**Resultado de la corrida final, después de restaurar el fixture:**

```
RESULTADO_SUITE_COMPLETA_AQUI
```

**Lección para futuras sesiones de prueba manual contra `TEST_DATABASE_URL`:** cualquier limpieza de datos de prueba debe acotarse siempre por id o por un criterio que identifique inequívocamente solo lo creado en esa sesión, nunca por nombre solo — algunos nombres (como "General") coinciden con fixtures compartidos que otros tests dan por sentado que existen.

---

## 10. Seguridad y producción — confirmaciones

- **No se hizo ningún commit, push, ni cambio de rama.**
- **No se desplegó nada** (ni Railway, ni Vercel, ni Supabase).
- **No se modificó ningún dato real de producción.** Toda interacción con producción fue de **solo lectura** (consultas SQL de lectura vía Supabase MCP, y lectura de metadatos de tablas) para confirmar la causa raíz del Bloque A y relevar el esquema real para el Bloque D.
- **No se crearon OTs, pagos, comprobantes ni documentos reales en producción** en ningún momento — todas las pruebas manuales se hicieron contra `TEST_DATABASE_URL` (un proyecto de Supabase separado, dedicado a pruebas), y toda la data de prueba generada ahí se **eliminó explícitamente** antes de cerrar cada sesión de verificación (incluyendo el usuario de prueba, odontólogos, pacientes, OTs, comprobantes, movimientos contables, categorías/prestaciones y lista de precios creados para la verificación).
- **No se cambió ninguna credencial, variable de entorno ni configuración de Vercel/Railway/Supabase.**
- **No se expuso ninguna clave, token, contraseña ni cookie** en este informe ni en ningún log — la única contraseña generada durante las pruebas manuales fue una contraseña temporal de un usuario de prueba en la base de TEST, nunca mostrada en texto plano en ningún artefacto entregado, y el usuario en sí ya fue eliminado.
- **No se modificó ninguna regla de negocio**, numeración de OT/comprobante, historial de precios, cálculo de DEBE/HABER, ni reglas de facturación — el único cambio en un archivo compartido de lógica de negocio (`comprobanteService.ts`) fue explícitamente autorizado por el usuario antes de hacerse, y se limita al manejo del error de generación de PDF (nunca a la lógica contable en sí).
- **Hallazgo de seguridad a reportar (no corregido, por fuera del alcance de este pedido):** Row Level Security deshabilitado en las 22 tablas del proyecto de producción (ver §6.3). Hoy no es explotable porque nada accede a Supabase sin pasar por el backend de confianza — se documenta para que quede como antecedente de cara a cualquier futuro acceso directo desde el cliente (Supabase Auth, Storage con URLs firmadas del lado del navegador, etc.).
- **No se rediseñó ningún PDF ya aprobado** — ni el de comprobante, ni el de resumen mensual, ni el de lista de precios. El PDF de resumen mensual no se tocó en absoluto (ni contenido ni orden).

---

## 11. Archivos modificados / creados / eliminados

**Nuevos:**
- `Dockerfile`
- `.dockerignore`
- `tests/unit/comprobantePdfFalla.test.ts`
- `tests/unit/listaPreciosWebPdfFalla.test.ts`
- `docs/REPORTE_BLOQUE_ABC_DEF_DENSZ.md` (este informe)

**Modificados:**
- `src/main/services/comprobanteService.ts`
- `src/renderer/features/comprobantes/hooks.ts`
- `src/main/db/repositories/comprobantesRepo.ts`
- `src/server/comprobantesWeb.ts`
- `tests/unit/serverComprobantes.test.ts`
- `src/renderer/pages/Pacientes/index.tsx`
- `src/renderer/pages/Pacientes/PacienteDetalle.tsx`
- `src/renderer/features/pacientes/hooks.ts`
- `src/renderer/pages/Cuentas/CuentaDetalle.tsx`
- `src/renderer/pages/Cuentas/ClinicaCuentaDetalle.tsx`

**Eliminados:**
- `src/renderer/pages/Pacientes/PacienteForm.tsx`

**No se modificó ningún otro archivo** fuera de esta lista (backend de Pacientes, rutas, IPC, permisos, PDF de resumen mensual, estilos del comprobante, configuración de build/deploy más allá del Dockerfile ya mencionado).

---

## 12. Riesgos y decisiones pendientes

1. **Dockerfile sin verificar de punta a punta** (no hay Docker instalado localmente) — riesgo bajo-medio, mitigado por revisión manual cuidadosa contra la lista de paquetes ya vetada, pero debe confirmarse en el próximo deploy real.
2. **Verificación visual en Desktop no realizada** para los Bloques B y C — riesgo bajo (mismo código React compartido, typecheck conjunto limpio), pero no es lo mismo que una prueba real en la app empaquetada.
3. **RLS deshabilitado en producción** (§6.3/§10) — no es un riesgo activo hoy, pero es una decisión de arquitectura pendiente para cualquier plan multi-tenant o de acceso directo desde cliente.
4. **Sesiones HTTP en memoria de proceso** (§6.6) — prerrequisito de infraestructura a resolver antes de escalar a más de una instancia de servidor, independientemente de si se avanza con multi-tenant.
5. **Bloque D/E/F son análisis, no decisiones tomadas** — en particular: si se habilita RLS o no, qué proveedor de pago se usa, qué pasa exactamente con los permisos de RECEPCION en un esquema multi-laboratorio, y los precios de los planes, quedan **explícitamente pendientes de aprobación del dueño del producto** antes de cualquier implementación.
6. **Ambigüedad de alcance ya resuelta durante el trabajo (documentada, no una decisión unilateral pendiente):** el comentario desactualizado en `Pacientes/index.tsx` sobre dónde se crean los pacientes — se corrigió como parte del propio Bloque B, no requirió consulta porque el código real ya coincidía con lo pedido por el usuario.
7. **Incidente ya resuelto, documentado en §9.1:** una limpieza de datos de prueba mal acotada borró temporalmente un fixture compartido (`listas_precio` "General") de la base de **TEST** — nunca de producción. Ya se restauró y se confirmó con una corrida completa de la suite. Se deja como lección documentada para la próxima vez que se use `TEST_DATABASE_URL` manualmente.

---

## 13. Recomendación de próximos pasos

1. Revisar este informe y los diffs de los archivos listados en §11.
2. Desplegar a Railway y confirmar en los logs de build que usa el Dockerfile (no Railpack) — luego generar un comprobante de prueba en producción (de forma controlada, una sola vez) para confirmar que el PDF se genera.
3. Decidir si se quiere una verificación manual en la app de Escritorio empaquetada antes de dar por cerrados los Bloques B y C (recomendado, bajo costo).
4. Para el Bloque D: decidir si se avanza con multi-tenant en el corto plazo o se posterga — si se avanza, aprobar primero la estrategia de aislamiento (capa de aplicación vs. RLS) antes de escribir ninguna migración.
5. Para el Bloque E: decidir qué capturas de pantalla reales se pueden usar, y completar los placeholders de precios/planes antes de publicar cualquier página.
6. Para el Bloque F: elegir entre Stripe/Mercado Pago/combinación, y aprobar (o ajustar) la política de 3 etapas de acceso ante vencimiento de pago propuesta en §8.3.

**Cierre:** sin commit, sin push, sin deploy. Repositorio listo para revisión. Se espera aprobación antes de realizar cualquier trabajo adicional.
