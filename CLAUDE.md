# Densz — reglas permanentes para trabajar en este repositorio

## Protección de datos reales de producción (regla absoluta)

Desde el 2026-10-01, toda la información registrada en Densz es **información real** del laboratorio y de sus pacientes — no son datos de prueba.

**Queda terminantemente prohibido** modificar, eliminar, sobrescribir, limpiar, reiniciar, reemplazar o alterar de cualquier manera datos reales ya registrados, en particular: pacientes, trabajos/OTs e historiales, comprobantes/recibos/PDFs, pagos/movimientos/cuentas/saldos, odontólogos, clínicas, y cualquier otro dato cargado durante el uso real de la aplicación.

Esto aplica a la app de escritorio, la web, la base de datos de producción, y cualquier proceso de sincronización/migración/actualización/mantenimiento.

Reglas concretas para cualquier tarea futura sobre Densz:

1. **Nunca** modificar datos existentes de producción como efecto colateral de un cambio de código/diseño/funcionalidad. Los cambios se limitan al código.
2. **Nunca** ejecutar `DELETE`, `TRUNCATE`, `DROP`, limpiezas, resets ni migraciones que alteren o eliminen información real, salvo autorización explícita del dueño del producto para esa operación puntual (no vale una autorización genérica de hace tiempo).
3. **Nunca** usar la base de producción para pruebas manuales o automatizadas. Usar exclusivamente `TEST_DATABASE_URL` (proyecto Supabase separado, dedicado a tests — ver `.env.example`). Si hace falta probar un flujo real (login, creación de datos, QA manual en el navegador), hacerlo ahí, nunca contra `DATABASE_URL`/`SUPABASE_URL` de producción.
4. Antes de cualquier migración o cambio de estructura de base, verificar que preserve íntegramente los datos existentes.
5. Si una mejora pedida *requeriría* modificar datos reales para implementarse, **detenerse y explicar exactamente qué se modificaría y por qué**, antes de hacer nada — nunca decidir unilateralmente.
6. Después de cualquier cambio que toque la base (aunque sea de solo lectura para verificar), confirmar que los registros existentes siguen intactos.

Ante cualquier duda sobre si una operación podría afectar datos reales: **no ejecutarla**, consultar primero.

## Contexto necesario para aplicar esto correctamente

- **Una sola base de producción, compartida:** la app de Escritorio (Electron) y la Web (Vercel + Railway) leen y escriben exactamente la misma base Postgres/Supabase (proyecto `cvplaqzlaeyhnwbrrkfi`, variable `DATABASE_URL`/`SUPABASE_URL` en `.env`). No hay caché propia entre medio — un cambio en una se refleja en la otra de inmediato.
- **Base de TEST separada:** proyecto Supabase distinto (`TEST_DATABASE_URL`, usuario `densz_test`), usado por toda la suite de Vitest (cada test corre en una transacción con `ROLLBACK`, así que no deja rastro) y por cualquier verificación manual (QA en navegador, scripts puntuales). Nunca confundir ambos — verificar siempre qué URL se está usando antes de conectar.
- **Numeradores:** `OT-` y `CB-` son correlativos únicos de todo el sistema (tabla `numeradores`), nunca reiniciarlos salvo pedido explícito.
- **Si se usa Supabase MCP (`execute_sql`) contra producción:** por defecto, solo lectura. Cualquier escritura (incluida una limpieza autorizada) requiere el mismo nivel de cuidado que una migración manual: inspección previa, plan explícito presentado al usuario, confirmación explícita, transacción atómica, y verificación posterior documentada.
