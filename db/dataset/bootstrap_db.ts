import * as fs from "fs";
import { Pool } from "pg";

const DATABASE_URL =
  "postgresql://postgres.xhtpgaxndonugpxfvkbk:platanus-super-secret123@aws-1-us-west-2.pooler.supabase.com:5432/postgres";
const DATA_FILE = "final_dataset.json";
const SCHEMA_FILE = "schema.sql";
const TABLE_NAME = "personas_desaparecidas";
const BATCH_SIZE = 25;

// D/M/YYYY -> ISO date string, or null
function parseDmy(s: string): string | null {
  if (!s || s === "SIN DATO") return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// any sentinel -> null
function clean(s: any): string | null {
  if (s === undefined || s === null) return null;
  const str = String(s).trim();
  if (str === "" || str === "SIN DATO") return null;
  return str;
}

// SI/NO -> boolean, else null
function toBool(s: any): boolean | null {
  const c = clean(s);
  if (c === null) return null;
  if (c.toUpperCase() === "SI") return true;
  if (c.toUpperCase() === "NO") return false;
  return null;
}

// numeric string -> int, else null
function toInt(s: any): number | null {
  const c = clean(s);
  if (c === null) return null;
  const n = Number(c);
  return Number.isInteger(n) ? n : null;
}

type ColType =
  | "TEXT"
  | "BOOLEAN"
  | "INTEGER"
  | "DATE"
  | "TIMESTAMPTZ"
  | "UUID";

type Column = {
  column: string;
  type: ColType;
  source: "pdf" | "original";
  pdfKey: string;
  convert?: (v: any, rec: any) => any;
};

const COLUMNS: Column[] = [
  { column: "id_victimadirecta", type: "UUID", source: "pdf", pdfKey: "IDvictimadirecta", convert: clean },
  { column: "id_reporte", type: "INTEGER", source: "pdf", pdfKey: "IDreporte", convert: toInt },
  { column: "id_dependencia_origen", type: "INTEGER", source: "pdf", pdfKey: "iddependenciaorigen", convert: toInt },
  { column: "id_vinculacion", type: "UUID", source: "original", pdfKey: "IDvinculacion", convert: clean },
  { column: "dependencia_origen", type: "TEXT", source: "original", pdfKey: "dependenciaOrigen", convert: clean },
  { column: "estatus_victimadirecta_num", type: "INTEGER", source: "original", pdfKey: "estatusvictimadirecta", convert: toInt },
  { column: "publicar_ficha_num", type: "INTEGER", source: "original", pdfKey: "publicarficha", convert: toInt },
  { column: "nombre", type: "TEXT", source: "pdf", pdfKey: "nombre", convert: clean },
  { column: "primer_apellido", type: "TEXT", source: "pdf", pdfKey: "primerapellido", convert: clean },
  { column: "segundo_apellido", type: "TEXT", source: "pdf", pdfKey: "segundoapellido", convert: clean },
  { column: "sexo", type: "TEXT", source: "pdf", pdfKey: "Sexo", convert: clean },
  { column: "fecha_nacimiento", type: "DATE", source: "original", pdfKey: "fechanacimiento", convert: (v) => clean(v)?.slice(0, 10) ?? null },
  { column: "edad_actual", type: "INTEGER", source: "pdf", pdfKey: "edadActual", convert: toInt },
  { column: "edad_hechos", type: "INTEGER", source: "pdf", pdfKey: "edadHechos", convert: toInt },
  { column: "edad_anios", type: "INTEGER", source: "pdf", pdfKey: "edadanios", convert: toInt },
  { column: "edad_meses", type: "INTEGER", source: "pdf", pdfKey: "edadmeses", convert: toInt },
  { column: "edad_dias", type: "INTEGER", source: "pdf", pdfKey: "edaddias", convert: toInt },
  { column: "estado_nacimiento", type: "TEXT", source: "pdf", pdfKey: "estadonacimiento", convert: clean },
  { column: "lugar_nacimiento", type: "TEXT", source: "pdf", pdfKey: "lugarnacimiento", convert: clean },
  { column: "nacionalidad", type: "TEXT", source: "pdf", pdfKey: "Nacionalidad", convert: clean },
  { column: "habla_espaniol", type: "BOOLEAN", source: "pdf", pdfKey: "hablaespaniol", convert: toBool },
  { column: "fotografia", type: "BOOLEAN", source: "pdf", pdfKey: "Fotografia", convert: toBool },
  { column: "sana_particular", type: "TEXT", source: "pdf", pdfKey: "SanaParticular", convert: clean },
  { column: "prendas_de_vestir", type: "TEXT", source: "pdf", pdfKey: "PrendasDeVestir", convert: clean },
  { column: "media_filiacion", type: "TEXT", source: "pdf", pdfKey: "MediaFiliacion", convert: clean },
  { column: "fecha_hechos", type: "TIMESTAMPTZ", source: "original", pdfKey: "fechahechos", convert: clean },
  { column: "fecha_percato", type: "TIMESTAMPTZ", source: "original", pdfKey: "fechapercato", convert: clean },
  { column: "ffecha_hechos", type: "DATE", source: "pdf", pdfKey: "ffechahechos", convert: parseDmy },
  { column: "ffecha_percato", type: "DATE", source: "pdf", pdfKey: "ffechapercato", convert: parseDmy },
  { column: "estado", type: "TEXT", source: "pdf", pdfKey: "estado", convert: clean },
  { column: "municipio", type: "TEXT", source: "pdf", pdfKey: "municipio", convert: clean },
  { column: "nombre_asentamiento", type: "TEXT", source: "pdf", pdfKey: "nombreasentamiento", convert: clean },
  { column: "calle", type: "TEXT", source: "pdf", pdfKey: "calle", convert: clean },
  { column: "no_exterior", type: "TEXT", source: "pdf", pdfKey: "noexterior", convert: clean },
  { column: "no_interior", type: "TEXT", source: "pdf", pdfKey: "nointerior", convert: clean },
  { column: "codigo_postal", type: "TEXT", source: "pdf", pdfKey: "codigopostal", convert: clean },
  { column: "estado_hecho", type: "TEXT", source: "pdf", pdfKey: "estadoHecho", convert: clean },
  { column: "municipio_hecho", type: "TEXT", source: "pdf", pdfKey: "municipioHecho", convert: clean },
  { column: "tiene_discapacidad", type: "BOOLEAN", source: "pdf", pdfKey: "TieneDiscapacidad", convert: toBool },
  { column: "tipo_discapacidad", type: "TEXT", source: "pdf", pdfKey: "TipoDiscapacidad", convert: clean },
  { column: "estatus_victima", type: "TEXT", source: "pdf", pdfKey: "EstatusVictima", convert: clean },
  { column: "solo_busqueda", type: "BOOLEAN", source: "pdf", pdfKey: "SoloBusqueda", convert: toBool },
  { column: "publicar_ficha", type: "BOOLEAN", source: "pdf", pdfKey: "PublicarFicha", convert: toBool },
  { column: "inicio", type: "TEXT", source: "pdf", pdfKey: "Inicio", convert: clean },
  { column: "archivo_migracion", type: "TEXT", source: "pdf", pdfKey: "archivomigracion", convert: clean },
  { column: "fecha_captura", type: "TIMESTAMPTZ", source: "original", pdfKey: "fechacaptura", convert: clean },
  { column: "pertenencia_dependencia_origen", type: "TEXT", source: "pdf", pdfKey: "PertenenciaDependenicaOrigen", convert: clean },
  { column: "pertenencia_por_canalizacion", type: "TEXT", source: "pdf", pdfKey: "PertenenciaPorCanalizacion", convert: clean },
  { column: "cantidad_registros", type: "INTEGER", source: "pdf", pdfKey: "cantidadRegistros", convert: toInt },
  { column: "imagen", type: "TEXT", source: "pdf", pdfKey: "imagen", convert: clean },
];

function buildSchemaSQL(): string {
  const cols = [
    "id SERIAL PRIMARY KEY",
    ...COLUMNS.map((c) => {
      let def = `${c.column} ${c.type}`;
      if (c.column === "id_victimadirecta") def += " UNIQUE NOT NULL";
      return def;
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
    "",
    SAMPLE_COMMENT,
  ].join("\n");
}

const SAMPLE_COMMENT = `-- ─────────────────────────────────────────────────────────────────────────────
-- Example row (all non-TEXT fields shown with their actual typed values):
--
--   id                       | 1
--   id_victimadirecta        | 056acbbc-475f-4b3a-a015-5b0414da8153        (UUID)
--   id_reporte               | 1                                            (INTEGER)
--   id_dependencia_origen    | 28                                           (INTEGER)
--   id_vinculacion           | 50260b41-5548-4ef8-aee0-1d9aeee2360e        (UUID)
--   dependencia_origen       | FISCALÍA GENERAL DE JUSTICIA DEL ESTADO DE TAMAULIPAS  (TEXT)
--   estatus_victimadirecta_num | 4                                          (INTEGER)
--   publicar_ficha_num       | 1                                            (INTEGER)
--   nombre                   | VALENTIN                                     (TEXT)
--   primer_apellido          | MARTINEZ                                     (TEXT)
--   segundo_apellido         | LOPEZ                                        (TEXT)
--   sexo                     | HOMBRE                                       (TEXT)
--   fecha_nacimiento         | 2008-06-02                                   (DATE)
--   edad_actual              | 18                                           (INTEGER)
--   edad_hechos              | 18                                           (INTEGER)
--   edad_anios               | 18                                           (INTEGER)
--   edad_meses               | 0                                            (INTEGER)
--   edad_dias                | 14                                           (INTEGER)
--   estado_nacimiento        | TAMAULIPAS                                   (TEXT)
--   lugar_nacimiento         | NULL                                         (TEXT, "SIN DATO" -> NULL)
--   nacionalidad             | MEXICANA                                     (TEXT)
--   habla_espaniol           | true                                         (BOOLEAN, "SI" -> true)
--   fotografia               | true                                         (BOOLEAN, "SI" -> true)
--   sana_particular          | TATUAJE LADO IZQUIERDO                       (TEXT)
--   prendas_de_vestir        | PRENDA DE VESTIR: PANTALÓN, COLOR: AZUL<br>PRENDA DE VESTIR: PLAYERA, COLOR: NEGRO<br>PRENDA DE VESTIR: TENIS, COLOR: NEGRO  (TEXT, <br>-delimited)
--   media_filiacion          | COMPLEXION: DELGADA<br>CARA: RECTANGULAR<br>COLOR DE LA PIEL: MORENO<br>CABELLO: NEGRO CORTO LISO<br>OJOS: CAFÉS PEQUEÑOS<br>NARIZ: RECTA<br>BOCA: MEDIANA<br>LABIOS: MEDIANOS<br>ESTATURA: 165cm<br>PESO: 65kg  (TEXT, <br>-delimited)
--   fecha_hechos             | 2026-06-16 23:00:00+00                       (TIMESTAMPTZ)
--   fecha_percato            | 2026-06-16 23:00:00+00                       (TIMESTAMPTZ)
--   ffecha_hechos            | 2026-06-16                                   (DATE, parsed from DD/MM/YYYY)
--   ffecha_percato           | 2026-06-16                                   (DATE, parsed from DD/MM/YYYY)
--   estado                   | TAMAULIPAS                                   (TEXT)
--   municipio                | REYNOSA                                      (TEXT)
--   nombre_asentamiento      | NULL                                         (TEXT, "SIN DATO" -> NULL)
--   calle                    | JUSTICIA                                     (TEXT)
--   no_exterior              | 305                                          (TEXT)
--   no_interior              | B                                            (TEXT)
--   codigo_postal            | NULL                                         (TEXT, empty -> NULL)
--   estado_hecho             | TAMAULIPAS                                   (TEXT)
--   municipio_hecho          | REYNOSA                                      (TEXT)
--   tiene_discapacidad       | false                                        (BOOLEAN, "NO" -> false)
--   tipo_discapacidad        | NULL                                         (TEXT, "SIN DATO" -> NULL)
--   estatus_victima          | DESAPARECIDA                                 (TEXT)
--   solo_busqueda            | true                                         (BOOLEAN, "SI" -> true)
--   publicar_ficha           | true                                         (BOOLEAN, "SI" -> true)
--   inicio                   | APLICACIÓN WEB - AUTORIDAD                   (TEXT)
--   archivo_migracion        | NULL                                         (TEXT, "SIN DATO" -> NULL)
--   fecha_captura            | 2026-06-20 11:14:16.490+00                   (TIMESTAMPTZ)
--   pertenencia_dependencia_origen | FISCALÍA GENERAL DE JUSTICIA DEL ESTADO DE TAMAULIPAS  (TEXT)
--   pertenencia_por_canalizacion | NULL                                      (TEXT, "SIN DATO" -> NULL)
--   cantidad_registros       | 1                                            (INTEGER)
--   imagen                   | data:image/png;base64,/9j/4AAQSkZJRg...     (TEXT, base64 data URI, ~90k chars)
--
-- Conversion rules applied at deploy time:
--   "SIN DATO" / ""  ->  NULL
--   "SI" / "NO"      ->  true / false  (BOOLEAN)
--   D/M/YYYY         ->  YYYY-MM-DD    (DATE)
--   ISO 8601 (from original record) -> native DATE / TIMESTAMPTZ
-- ─────────────────────────────────────────────────────────────────────────────`;

function extractValues(rec: any): any[] {
  return COLUMNS.map((c) => {
    const source = c.source === "pdf" ? rec.pdfData : rec.original;
    const raw = source?.[c.pdfKey];
    return c.convert ? c.convert(raw, rec) : raw ?? null;
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

    const colNames = COLUMNS.map((c) => c.column);
    const placeholders = COLUMNS.map((_, i) => `$${i + 1}`).join(", ");
    const insertSQL =
      `INSERT INTO ${TABLE_NAME} (${colNames.join(", ")}) VALUES (${placeholders}) ` +
      `ON CONFLICT (id_victimadirecta) DO UPDATE SET ` +
      colNames
        .filter((c) => c !== "id_victimadirecta")
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
