/**
 * Hilo — Ejecuta schema.sql en Supabase via DATABASE_URL
 * =======================================================
 * Uso: npx tsx scripts/fb-scraper/run-schema.ts
 * Requiere DATABASE_URL en .env
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    console.error("DATABASE_URL requerido en .env");
    process.exit(1);
  }

  const schemaPath = join(__dirname, "schema.sql");
  const sql = readFileSync(schemaPath, "utf-8");

  console.log("━━━ Hilo Schema Runner ━━━");
  console.log(`Leyendo: ${schemaPath} (${sql.length} chars)`);

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log("Conectado a Supabase\n");

    // Ejecutar statement por statement
    // pg no soporta multi-statement en un solo query()
    // pero query() sí puede ejecutar múltiples statements separados por ;
    await client.query(sql);
    console.log("✓ Schema ejecutado correctamente");

    // Verificar
    const { rows } = await client.query(
      "select column_name, data_type from information_schema.columns where table_name = 'fichas' order by ordinal_position limit 10"
    );
    console.log(`\nTabla fichas tiene ${rows.length}+ columnas:`);
    rows.forEach((r) => console.log(`  ${r.column_name}: ${r.data_type}`));

    const { rows: idxRows } = await client.query(
      "select indexname from pg_indexes where tablename = 'fichas'"
    );
    console.log(`\nIndexes (${idxRows.length}):`);
    idxRows.forEach((r) => console.log(`  ${r.indexname}`));
  } catch (err) {
    console.error("✗ Error:", err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
