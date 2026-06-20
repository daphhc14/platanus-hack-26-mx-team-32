import * as fs from "fs";
import { Pool } from "pg";

const DATABASE_URL =
  "postgresql://postgres.xhtpgaxndonugpxfvkbk:platanus-super-secret123@aws-1-us-west-2.pooler.supabase.com:5432/postgres";
const DATA_FILE = "final_dataset.json";
const SCHEMA_FILE = "schema.sql";
const TABLE_NAME = "personas_desaparecidas";
const BATCH_SIZE = 25;

const REPEATED_IMAGE_FIELDS = new Set([
  "imagen_header",
  "imagen_icono",
  "imagen_tabla",
  "pleca_segob",
  "imagen_lista",
]);

const COLUMN_MAP: { pdfKey: string; column: string; source: "pdf" | "original" }[] = [
  { pdfKey: "IDvictimadirecta", column: "id_victimadirecta", source: "pdf" },
  { pdfKey: "IDreporte", column: "id_reporte", source: "pdf" },
  { pdfKey: "iddependenciaorigen", column: "id_dependencia_origen", source: "pdf" },
  { pdfKey: "IDvinculacion", column: "id_vinculacion", source: "original" },
  { pdfKey: "dependenciaOrigen", column: "dependencia_origen", source: "original" },
  { pdfKey: "estatusvictimadirecta", column: "estatus_victimadirecta_num", source: "original" },
  { pdfKey: "publicarficha", column: "publicar_ficha_num", source: "original" },
  { pdfKey: "nombre", column: "nombre", source: "pdf" },
  { pdfKey: "primerapellido", column: "primer_apellido", source: "pdf" },
  { pdfKey: "segundoapellido", column: "segundo_apellido", source: "pdf" },
  { pdfKey: "Sexo", column: "sexo", source: "pdf" },
  { pdfKey: "fechanacimiento", column: "fecha_nacimiento", source: "pdf" },
  { pdfKey: "edadActual", column: "edad_actual", source: "pdf" },
  { pdfKey: "edadHechos", column: "edad_hechos", source: "pdf" },
  { pdfKey: "edadanios", column: "edad_anios", source: "pdf" },
  { pdfKey: "edadmeses", column: "edad_meses", source: "pdf" },
  { pdfKey: "edaddias", column: "edad_dias", source: "pdf" },
  { pdfKey: "estadonacimiento", column: "estado_nacimiento", source: "pdf" },
  { pdfKey: "lugarnacimiento", column: "lugar_nacimiento", source: "pdf" },
  { pdfKey: "Nacionalidad", column: "nacionalidad", source: "pdf" },
  { pdfKey: "hablaespaniol", column: "habla_espaniol", source: "pdf" },
  { pdfKey: "Fotografia", column: "fotografia", source: "pdf" },
  { pdfKey: "SanaParticular", column: "sana_particular", source: "pdf" },
  { pdfKey: "PrendasDeVestir", column: "prendas_de_vestir", source: "pdf" },
  { pdfKey: "MediaFiliacion", column: "media_filiacion", source: "pdf" },
  { pdfKey: "fechahechos", column: "fecha_hechos", source: "pdf" },
  { pdfKey: "fechapercato", column: "fecha_percato", source: "pdf" },
  { pdfKey: "ffechahechos", column: "ffecha_hechos", source: "pdf" },
  { pdfKey: "ffechapercato", column: "ffecha_percato", source: "pdf" },
  { pdfKey: "estado", column: "estado", source: "pdf" },
  { pdfKey: "municipio", column: "municipio", source: "pdf" },
  { pdfKey: "nombreasentamiento", column: "nombre_asentamiento", source: "pdf" },
  { pdfKey: "calle", column: "calle", source: "pdf" },
  { pdfKey: "noexterior", column: "no_exterior", source: "pdf" },
  { pdfKey: "nointerior", column: "no_interior", source: "pdf" },
  { pdfKey: "codigopostal", column: "codigo_postal", source: "pdf" },
  { pdfKey: "estadoHecho", column: "estado_hecho", source: "pdf" },
  { pdfKey: "municipioHecho", column: "municipio_hecho", source: "pdf" },
  { pdfKey: "TieneDiscapacidad", column: "tiene_discapacidad", source: "pdf" },
  { pdfKey: "TipoDiscapacidad", column: "tipo_discapacidad", source: "pdf" },
  { pdfKey: "EstatusVictima", column: "estatus_victima", source: "pdf" },
  { pdfKey: "SoloBusqueda", column: "solo_busqueda", source: "pdf" },
  { pdfKey: "PublicarFicha", column: "publicar_ficha", source: "pdf" },
  { pdfKey: "Inicio", column: "inicio", source: "pdf" },
  { pdfKey: "archivomigracion", column: "archivo_migracion", source: "pdf" },
  { pdfKey: "fechacaptura", column: "fecha_captura", source: "pdf" },
  {
    pdfKey: "PertenenciaDependenicaOrigen",
    column: "pertenencia_dependencia_origen",
    source: "pdf",
  },
  {
    pdfKey: "PertenenciaPorCanalizacion",
    column: "pertenencia_por_canalizacion",
    source: "pdf",
  },
  { pdfKey: "cantidadRegistros", column: "cantidad_registros", source: "pdf" },
  { pdfKey: "imagen", column: "imagen", source: "pdf" },
];

const COLUMNS = COLUMN_MAP.map((c) => c.column);

function buildSchemaSQL(): string {
  const cols = [
    "id SERIAL PRIMARY KEY",
    ...COLUMNS.map((c) => {
      if (c === "id_victimadirecta") return `${c} TEXT UNIQUE NOT NULL`;
      return `${c} TEXT`;
    }),
  ];
  return [
    `DROP TABLE IF EXISTS ${TABLE_NAME};`,
    `CREATE TABLE ${TABLE_NAME} (`,
    `  ${cols.join(",\n  ")}`,
    `);`,
    "",
    `ALTER TABLE ${TABLE_NAME} ENABLE ROW LEVEL SECURITY;`,
    `CREATE POLICY "Enable read for all" ON ${TABLE_NAME} FOR SELECT USING (true);`,
  ].join("\n");
}

function extractValues(rec: any): any[] {
  return COLUMN_MAP.map((c) => {
    const source = c.source === "pdf" ? rec.pdfData : rec.original;
    let v = source?.[c.pdfKey];
    if (v === undefined || v === null) v = "";
    if (typeof v !== "string") v = String(v);
    return v;
  });
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const schemaOnly = args.has("--schema");

  const raw = fs.readFileSync(DATA_FILE, "utf8");
  const allRecords = JSON.parse(raw) as any[];
  const records = allRecords.filter((r) => !r.failed && r.pdfData);

  console.log(
    `[start] ${records.length} records to deploy (skipped ${allRecords.length - records.length} failed/empty)`
  );

  const schemaSQL = buildSchemaSQL();
  fs.writeFileSync(SCHEMA_FILE, schemaSQL, "utf8");
  console.log(`[schema] wrote ${SCHEMA_FILE} (${COLUMNS.length} columns)`);

  if (schemaOnly) {
    console.log("[schema] --schema flag set, skipping data deploy");
    return;
  }

  if (records.length === 0) {
    console.error("no records to deploy");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 4,
    ssl: { rejectUnauthorized: false },
  });
  const client = await pool.connect();

  try {
    console.log(`[ddl] creating table ${TABLE_NAME}...`);
    await client.query(buildSchemaSQL());
    console.log(`[ddl] done`);

    const placeholders = COLUMN_MAP.map((_, i) => `$${i + 1}`).join(", ");
    const insertSQL =
      `INSERT INTO ${TABLE_NAME} (${COLUMNS.join(", ")}) VALUES (${placeholders}) ` +
      `ON CONFLICT (id_victimadirecta) DO UPDATE SET ` +
      COLUMNS.filter((c) => c !== "id_victimadirecta")
        .map((c) => `${c} = EXCLUDED.${c}`)
        .join(", ");

    let inserted = 0;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      await client.query("BEGIN");
      try {
        for (const rec of batch) {
          await client.query(insertSQL, extractValues(rec));
          inserted++;
        }
        await client.query("COMMIT");
        console.log(`[insert] ${inserted}/${records.length}`);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }

    const count = await client.query(`SELECT COUNT(*) FROM ${TABLE_NAME}`);
    console.log(`[done] ${count.rows[0].count} rows in ${TABLE_NAME}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
