# Reporte — Limpieza total de datos de prueba (Densz)

**Fecha y hora de ejecución:** 2026-10-01, aprox. 20:10–20:20 UTC (17:10–17:20 hora Argentina).
**Base de datos:** proyecto de producción de Supabase `cvplaqzlaeyhnwbrrkfi` (la misma que usan tanto la app de Escritorio como la Web — `DATABASE_URL` y `SUPABASE_URL` en `.env` apuntan ahí; confirmado explícitamente antes de ejecutar nada).
**Autorización:** solicitada explícitamente por el dueño del producto, con alcance detallado, confirmada por escrito ("si") después de que se le presentó el plan exacto con conteos reales.

---

## 1. Resumen

Se eliminaron de forma permanente todos los datos operativos de prueba (pacientes, trabajos/OT, comprobantes, pagos, movimientos de cuenta, resúmenes mensuales, y la porción de auditoría/búsqueda asociada a ese historial), se reiniciaron los numeradores de OT y comprobante a cero, y se borraron los 4 PDF de prueba que habían quedado en Supabase Storage. Odontólogos, clínicas, usuarios, roles, configuración, listas de precios y categorías/prestaciones quedaron completamente intactos, verificado uno por uno antes y después de la operación.

## 2. Inspección previa (solo lectura, antes de borrar nada)

Se relevó contra la base real:
- Las 22 tablas de `public` y sus columnas.
- Todas las relaciones de llave foránea (`information_schema`), para determinar el orden de borrado correcto sin depender de `CASCADE` a ciegas.
- El contenido real de `numeradores` (solo 2 filas: `orden` y `comprobante`).
- La composición de `busqueda_global` por tipo (`clinica`, `odontologo`, `comprobante`, `orden`, `paciente`).
- La composición de `auditoria` por `entidad`/`accion` (49 combinaciones distintas), para separar con precisión lo que correspondía a operaciones de prueba de lo que correspondía a seguridad/configuración/catálogo.
- El contenido real del bucket de Storage `documentos` (`storage.objects`).

El plan resultante se le presentó al usuario con conteos exactos antes de ejecutar, y se obtuvo confirmación explícita.

## 3. Tablas y registros eliminados

| Tabla | Filas eliminadas | Criterio |
|---|---|---|
| `movimientos_cuenta` | 98 | Todas (tabla 100% operativa) |
| `comprobantes` | 77 | Todas |
| `resumenes_mensuales` | 22 | Todas |
| `pagos` | 16 | Todas |
| `ordenes` | 77 | Todas |
| `orden_prestaciones` | 98 | En cascada automática (FK `ON DELETE CASCADE` desde `ordenes`) |
| `orden_prestacion_piezas` | 186 | En cascada automática (FK `ON DELETE CASCADE` desde `orden_prestaciones`) |
| `pacientes` | 81 | Todas |
| `busqueda_global` | 235 | Solo `tipo IN ('comprobante','orden','paciente')` — se conservaron `clinica` (6) y `odontologo` (68) |
| `auditoria` | 284 | Solo `entidad IN ('comprobantes','ordenes','pacientes','pagos','cuenta','trabajos')` — ver detalle abajo |

**Detalle de auditoría eliminada por entidad:** comprobantes (generar: 74, imprimir: 40 = 114), ordenes (crear: 84, editar: 6, eliminar_definitivo: 7 = 97), pacientes (crear: 46, eliminar: 1, exportar: 1, modificar: 1 = 49), pagos (anular: 2, crear: 16, exportar: 2 = 20), cuenta (exportar: 2), trabajos (exportar: 2). Total: 284.

**Storage (Supabase, bucket `documentos`):** 4 archivos PDF eliminados a través de la función real de la aplicación (`eliminarDocumento()` en `src/server/storage.ts`, nunca con SQL directo sobre `storage.objects`): `comprobantes/CB-00000071.pdf`, `CB-00000073.pdf`, `CB-00000082.pdf`, `CB-00000084.pdf`. Verificado: 0 objetos restantes en el bucket.

**Orden de ejecución** (respetando las llaves foráneas reales, sin forzar `CASCADE` sobre nada que no lo tuviera ya definido en el esquema): `movimientos_cuenta` → `comprobantes` → `resumenes_mensuales` → `pagos` → `ordenes` (cascada automática a `orden_prestaciones`/`orden_prestacion_piezas`) → `pacientes` → `busqueda_global` (filtrado) → `auditoria` (filtrado) → reinicio de `numeradores`. Todo dentro de una única transacción (`BEGIN...COMMIT`) — si algo hubiera fallado, no habría quedado nada a medio borrar.

## 4. Numeradores reiniciados

| Tipo | Prefijo | Antes | Después |
|---|---|---|---|
| `orden` | `OT-` | 84 | **0** |
| `comprobante` | `CB-` | 84 | **0** |

El próximo trabajo real generará `OT-00000001`; el próximo comprobante, `CB-00000001` — verificado leyendo la tabla después del reinicio (no se creó ningún trabajo de prueba para confirmar esto, tal como se pidió explícitamente no hacer en producción).

## 5. Confirmación de lo que se conservó (verificado antes y después, sin cambios)

| Tabla | Filas | Estado |
|---|---|---|
| `odontologos` | 68 | Intacto — nombres, teléfonos, direcciones, lista de precios y clínica asociada verificados visualmente en la Web tras la limpieza |
| `clinicas` | 6 | Intacto (Clinica Estefi, Rapaniu, Dental M3, Dental M1, Woda, Juramento Onsmile) |
| `usuarios` | 2 | Intacto (`admin` = Valentin, `Nicolas`) |
| `roles` | 2 | Intacto (ADMINISTRADOR, RECEPCION/"Operador") |
| `listas_precio` | 3 | Intacto |
| `lista_precio_items` | 28 | Intacto (precios vigentes) |
| `categorias_precio` | 1 | Intacto |
| `prestaciones` | 22 | Intacto |
| `configuracion` | 13 | Intacto (logo, nombre del laboratorio, impresora "Xerox Phaser 3020", protección de Cuentas/Estadísticas activada, configuración de backups) |
| `auditoria` (resto) | 538 | Intacto — logins, cambios de usuarios, configuración, precios, odontólogos y clínicas |
| `busqueda_global` (resto) | 74 | Intacto — índice de odontólogos y clínicas |

**Decisión menor documentada (según lo pedido, se avisa en vez de decidir en silencio):** 22 eventos de auditoría de "generar resumen mensual" quedaron archivados bajo la entidad `odontologos`/`clinicas` (no bajo una entidad propia de resúmenes) — se conservaron tal cual, junto con el resto del historial de odontólogos/clínicas, en vez de intentar separarlos quirúrgicamente por el contenido del campo `detalle`.

## 6. Verificación final

**Base de datos (solo lectura, después de la limpieza):** `pacientes`, `ordenes`, `orden_prestaciones`, `orden_prestacion_piezas`, `comprobantes`, `pagos`, `movimientos_cuenta`, `resumenes_mensuales` → **0 filas cada una**. `storage.objects` del bucket `documentos` → **0**. Todas las tablas de la sección 5 → conteos idénticos a los de antes de la limpieza.

**Web (`densz.vercel.app`, sesión real del usuario):**
- Pacientes: "Consulta de pacientes…", listado vacío.
- Trabajos: "No hay trabajos que coincidan".
- Inicio: Trabajos del período 0, Pendientes 0, Facturados 0, Anulados 0, "Sin trabajos todavía", "Sin comprobantes todavía".
- Odontólogos: las 68 fichas reales, con teléfono/dirección/lista de precios/clínica, intactas.

**Escritorio (Electron):** **no se verificó abriendo la aplicación físicamente** — queda documentado como limitación honesta, no como "probado". Lo que sí se confirmó de forma concluyente: Escritorio y Web leen exactamente la misma base de Postgres/Supabase (`cvplaqzlaeyhnwbrrkfi`, mismo `DATABASE_URL`) sin ninguna capa de caché propia entre medio — el estado verificado por SQL directo y por la Web es, por construcción, el mismo que vería Escritorio. Se recomienda que el usuario abra la app de Escritorio una vez para confirmarlo visualmente, aunque no hay ninguna razón técnica para esperar un resultado distinto.

**Datos ficticios en producción:** no se creó ningún dato de prueba en producción en ningún momento de esta limpieza ni de su verificación.

## 7. Registros que quedaron sin eliminar (y por qué)

Ninguno dentro del alcance pedido. Todo lo que el usuario pidió eliminar (pacientes, trabajos/OT, piezas/prestaciones de esos trabajos, comprobantes, pagos, movimientos de cuenta DEBE/HABER, resúmenes mensuales, PDFs de prueba, y la porción de auditoría directamente asociada) quedó en cero. Lo único que se conservó deliberadamente dentro de "auditoría" fue lo explícitamente pedido: seguridad, administración y funcionamiento del sistema (logins, gestión de usuarios, configuración, precios, odontólogos, clínicas).

---

**Cierre:** base de producción limpia, lista para operar con datos reales desde el 1 de octubre de 2026. Odontólogos, clínicas, usuarios y toda la configuración quedaron exactamente como estaban. No se generó respaldo (pedido explícitamente así por el usuario, dato de prueba confirmado sin valor de conservación). No se modificó ningún archivo de código para esta limpieza — fue una operación de datos pura.
