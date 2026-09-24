// Genera, por tabla, el SQL de INSERT para migrar los datos reales de
// densz.db (SQLite, solo lectura) a Supabase/Postgres. No se conecta a
// Postgres — solo produce archivos .sql que después se aplican a mano
// (vía la herramienta execute_sql) para poder revisar/verificar cada uno.
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const RUTA_DB = "C:/Users/szyme/AppData/Roaming/Densz/densz.db";
const OUT_DIR = path.join(__dirname, "..", "..", "migration-sql-out");
fs.mkdirSync(OUT_DIR, { recursive: true });

const TABLAS = [
  "roles", "usuarios",
  "categorias_precio", "prestaciones",
  "clinicas",
  "listas_precio", "lista_precio_items",
  "odontologos", "pacientes",
  "numeradores", "medios_pago",
  "ordenes", "orden_prestaciones", "orden_prestacion_piezas",
  "comprobantes", "pagos", "movimientos_cuenta",
  "configuracion",
  "auditoria",
  "resumenes_mensuales"
  // "backups" excluida a propósito: las filas referencian rutas de archivo local, sin sentido post-corte.
];

function literal(valor) {
  if (valor === null || valor === undefined) return "NULL";
  if (typeof valor === "number") return String(valor);
  if (typeof valor === "bigint") return valor.toString();
  // TEXT/BLOB: escapar comillas simples duplicándolas (estándar SQL).
  return `'${String(valor).replace(/'/g, "''")}'`;
}

const db = new Database(RUTA_DB, { readonly: true, fileMustExist: true });

const resumen = {};
for (const tabla of TABLAS) {
  const filas = db.prepare(`SELECT * FROM "${tabla}" ORDER BY ${tabla === "configuracion" ? "clave" : "id"}`).all();
  resumen[tabla] = filas.length;
  if (filas.length === 0) {
    fs.writeFileSync(path.join(OUT_DIR, `${tabla}.sql`), `-- ${tabla}: sin filas, nada que migrar.\n`);
    continue;
  }
  const columnas = Object.keys(filas[0]);
  const colList = columnas.map((c) => `"${c}"`).join(", ");
  const partes = [];
  partes.push(`-- ${tabla}: ${filas.length} filas`);
  // Lotes de 100 filas por INSERT para no generar una sola sentencia gigante.
  for (let i = 0; i < filas.length; i += 100) {
    const lote = filas.slice(i, i + 100);
    const valores = lote
      .map((fila) => `(${columnas.map((c) => literal(fila[c])).join(", ")})`)
      .join(",\n  ");
    partes.push(`INSERT INTO "${tabla}" (${colList}) VALUES\n  ${valores};`);
  }
  // Resincroniza la secuencia IDENTITY para que el próximo insert de la app no choque.
  if (tabla !== "configuracion") {
    partes.push(
      `SELECT setval(pg_get_serial_sequence('${tabla}', 'id'), COALESCE((SELECT MAX(id) FROM "${tabla}"), 1), true);`
    );
  }
  fs.writeFileSync(path.join(OUT_DIR, `${tabla}.sql`), partes.join("\n\n") + "\n");
}

db.close();
console.log("Filas por tabla:", JSON.stringify(resumen, null, 2));
console.log("SQL generado en:", OUT_DIR);
