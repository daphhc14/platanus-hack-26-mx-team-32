/**
 * Hilo — Bridge: Supabase ficha → lib/match → Supabase match_results
 * ==================================================================
 * Called by the Python LangGraph missing_case_extractor node via subprocess.
 *
 * Uso:
 *   npx tsx scripts/bridge-match.ts <ficha_id>
 *
 * Output: JSON to stdout with match results.
 * Also writes match_results to Supabase.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";
import Database from "better-sqlite3";
import { block } from "../lib/match/block.js";
import { scorePair } from "../lib/match/score.js";
import { verify } from "../lib/match/verify.js";
import { tokenize } from "../lib/seedgen.js";
import type { HiloRecord, Feature, FeatureType, BodyRegion, Laterality, MotifCategory } from "../lib/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "..", "hilo.db");

function getDbConfig() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL requerido en .env");
  return { connectionString, ssl: { rejectUnauthorized: false } };
}

async function getFicha(fichaId: string): Promise<any> {
  const client = new pg.Client(getDbConfig());
  try {
    await client.connect();
    const { rows } = await client.query("SELECT * FROM fichas WHERE id = $1", [fichaId]);
    if (rows.length === 0) throw new Error(`Ficha ${fichaId} not found`);
    return rows[0];
  } finally {
    await client.end();
  }
}

async function checkExistingMatches(fichaId: string): Promise<boolean> {
  const client = new pg.Client(getDbConfig());
  try {
    await client.connect();
    const { rows } = await client.query("SELECT 1 FROM match_results WHERE ficha_id = $1 LIMIT 1", [fichaId]);
    return rows.length > 0;
  } finally {
    await client.end();
  }
}

async function writeMatchResults(results: any[]): Promise<void> {
  if (results.length === 0) return;
  const client = new pg.Client(getDbConfig());
  try {
    await client.connect();
    for (const r of results) {
      await client.query(
        `INSERT INTO match_results (id, ficha_id, missing_record_id, unidentified_record_id, overall_score, field_scores, verifier_evidence, verifier_contradictions, verifier_tier, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'proposed')
         ON CONFLICT DO NOTHING`,
        [randomUUID(), r.ficha_id, r.missing_record_id, r.unidentified_record_id, r.overall_score, JSON.stringify(r.field_scores), r.verifier_evidence, r.verifier_contradictions, r.verifier_tier]
      );
    }
  } finally {
    await client.end();
  }
}

function fichaToRecord(ficha: any): HiloRecord {
  const sexMap: Record<string, "M" | "F" | "X"> = { masculino: "M", femenino: "F" };
  const estadoNorm = (ficha.estado || "").toUpperCase().trim();

  return {
    id: ficha.id,
    source_id: "fb-vision-extractor",
    record_type: "missing",
    external_ref: ficha.fb_permalink || undefined,
    sex: sexMap[ficha.sexo] || "X",
    age_min: ficha.edad ?? undefined,
    age_max: ficha.edad ?? undefined,
    height_cm: ficha.estatura_m ? Math.round(ficha.estatura_m * 100) : undefined,
    build: ficha.complexion || undefined,
    skin_tone: ficha.tez || undefined,
    estado: estadoNorm || undefined,
    municipio: ficha.municipio || undefined,
    event_date: ficha.fecha_desaparicion || undefined,
    raw_description: Array.isArray(ficha.senas_particulares) ? ficha.senas_particulares.join("; ") : "",
    photo_url: undefined,
    pii_minimized: true,
    synthetic: false,
    created_at: ficha.created_at || new Date().toISOString(),
  };
}

const TYPE_MAP: [RegExp, FeatureType][] = [
  [/tatuaj|tato|tatu/i, "tatuaje"],
  [/cicatri|cic|herida|marca de|quemadura/i, "cicatriz"],
  [/lunar/i, "lunar"],
  [/piercing|arete|argolla/i, "piercing"],
  [/protesis|prótesis/i, "protesis"],
  [/amputac/i, "amputacion"],
  [/dental|diente|mordida/i, "dental"],
  [/vestimenta|ropa|playera|pantal/i, "vestimenta"],
];

const REGION_MAP: [RegExp, BodyRegion][] = [
  [/antebrazo|a\.?\s*brazo/i, "antebrazo"],
  [/brazo|br\.?/i, "brazo"],
  [/espalda|esp\.?/i, "espalda"],
  [/pecho|torax|tórax/i, "pecho"],
  [/pierna|pna/i, "pierna"],
  [/mano|mno/i, "mano"],
  [/cuello|cllo/i, "cuello"],
  [/cabeza/i, "cabeza"], [/cara|rostro/i, "cara"], [/cadera/i, "cadera"],
  [/muslo/i, "muslo"], [/rodilla/i, "rodilla"], [/tobillo/i, "tobillo"], [/pie/i, "pie"],
  [/gluteo|glúteo/i, "gluteo"], [/hombro/i, "hombro"], [/abdomen/i, "abdomen"], [/dedo/i, "dedo"],
];

const LAT_MAP: [RegExp, Laterality][] = [
  [/izquierd|izq/i, "izquierda"],
  [/derech|der/i, "derecha"],
  [/bilateral|bil/i, "bilateral"],
  [/central|cen/i, "central"],
];

const MOTIF_MAP: [RegExp, MotifCategory][] = [
  [/ancla|ancora|nautic/i, "nautico"],
  [/cruz|virgen|guadalupe|jesus|jesús|santo|cristo|religios/i, "religioso"],
  [/rosa|flor|rosita|girasol|tulipan/i, "floral"],
  [/leon|león|aguila|águila|perro|gato|caballo|serpiente|tigre|lobo|animal/i, "animal"],
  [/nombre|maria|maría|juan|nombre_texto/i, "nombre_texto"],
  [/fecha|\d{1,2}\/\d{1,2}\/?\d*/i, "fecha_numero"],
  [/estrella|corazon|corazón|calavera|simbolo|símbolo|trebol|trébol/i, "simbolo"],
  [/retrato|cara de|rostro de/i, "retrato"],
  [/tribal|polinesio|maori|maorí/i, "tribal"],
  [/escudo|america|américa|chivas|futbol|fútbol|deport/i, "deportivo"],
  [/marin|ejercito|ejército|militar|armad/i, "militar"],
];

function matchFirst<T>(s: string, map: [RegExp, T][]): T | undefined {
  for (const [re, v] of map) if (re.test(s)) return v;
  return undefined;
}

function fichaToFeatures(ficha: any): Feature[] {
  const senas: string[] = Array.isArray(ficha.senas_particulares) ? ficha.senas_particulares : [];
  const lateralidad: { lado: string; descripcion: string }[] = Array.isArray(ficha.senas_lateralidad) ? ficha.senas_lateralidad : [];

  return senas.map((seg) => {
    const ft = matchFirst(seg, TYPE_MAP) ?? "otra_sena";
    const region = matchFirst(seg, REGION_MAP) ?? "generico";

    let lat: Laterality = matchFirst(seg, LAT_MAP) ?? "na";
    if (lat === "na") {
      const latMatch = lateralidad.find((l) => seg.toLowerCase().includes(l.descripcion.toLowerCase().split(" ")[0]));
      if (latMatch) {
        const ladoLower = latMatch.lado.toLowerCase();
        if (ladoLower.includes("izq")) lat = "izquierda";
        else if (ladoLower.includes("der")) lat = "derecha";
        else if (ladoLower.includes("amb")) lat = "bilateral";
        else if (ladoLower.includes("cen")) lat = "central";
      }
    }

    const motif = matchFirst(seg, MOTIF_MAP);

    return {
      id: randomUUID(),
      record_id: ficha.id,
      feature_type: ft,
      body_region: region,
      laterality: lat,
      motif_category: motif,
      description_raw: seg,
      tokens: tokenize(`${seg} ${region} ${lat} ${motif ?? ""}`),
      created_at: new Date().toISOString(),
    };
  });
}

async function main() {
  const fichaId = process.argv[2];
  if (!fichaId) {
    console.error("Uso: npx tsx scripts/bridge-match.ts <ficha_id>");
    process.exit(1);
  }

  const exists = await checkExistingMatches(fichaId);
  if (exists) {
    console.log(JSON.stringify({ ficha_id: fichaId, matches: [], skipped: "already_matched" }));
    return;
  }

  const ficha = await getFicha(fichaId);
  const missingRecord = fichaToRecord(ficha);
  const missingFeats = fichaToFeatures(ficha);

  const db = new Database(DB_PATH, { readonly: true });
  db.pragma("journal_mode = WAL");
  const unkRows = db.prepare("SELECT * FROM records WHERE record_type = 'unidentified'").all() as any[];
  const unkFeatsRows = db.prepare("SELECT * FROM features").all() as any[];

  const unkRecords: HiloRecord[] = unkRows.map((r) => ({
    ...r,
    pii_minimized: !!r.pii_minimized,
    synthetic: !!r.synthetic,
  }));

  const allFeats: Feature[] = [
    ...missingFeats,
    ...unkFeatsRows.map((r) => ({
      ...r,
      laterality: (r.laterality ?? "na") as Laterality,
      tokens: r.tokens ? JSON.parse(r.tokens) : [],
    })),
  ];

  const allRecords = [missingRecord, ...unkRecords];
  const pairs = block(allRecords);

  const scored = pairs
    .filter((p) => p.missing.id === fichaId)
    .map((p) => scorePair(p, allFeats, allFeats))
    .filter((p) => p.overall_score > 0.3)
    .sort((a, b) => b.overall_score - a.overall_score);

  const results: any[] = [];
  for (const p of scored) {
    const v = await verify(p, missingFeats, allFeats.filter((f) => f.record_id === p.unidentified.id));
    results.push({
      ficha_id: fichaId,
      missing_record_id: p.missing.id,
      unidentified_record_id: p.unidentified.id,
      overall_score: p.overall_score,
      field_scores: p.field_scores,
      verifier_evidence: v.evidence,
      verifier_contradictions: v.contradictions,
      verifier_tier: v.tier,
    });
  }

  db.close();

  await writeMatchResults(results);

  console.log(JSON.stringify({ ficha_id: fichaId, matches: results }, null, 2));
}

main().catch((err) => {
  console.error("Bridge error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
