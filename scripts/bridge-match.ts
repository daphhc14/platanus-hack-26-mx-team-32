/**
 * bridge-match.ts — Supabase persona → lib/match/ → match_results
 *
 * Reads a persona by id_victimadirecta from Supabase, loads unidentified
 * records from local hilo.db, scores them with the TS matching engine,
 * and writes the top candidates to the match_results Supabase table.
 *
 * Usage: tsx scripts/bridge-match.ts <persona_victima_id>
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import { createClient } from "@supabase/supabase-js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { block, type BlockPair } from "../lib/match/block.js";
import { scorePair, type ScoredPair } from "../lib/match/score.js";
import type { HiloRecord } from "../lib/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "..", "hilo.db");

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_KEY =
  process.env.SUPABASE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_KEY in environment");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── helpers ──────────────────────────────────────────────────────────────────

function sexMap(raw: string | null): "M" | "F" | "X" | undefined {
  if (!raw) return undefined;
  if (/hombre|masculino/i.test(raw)) return "M";
  if (/mujer|femenino/i.test(raw)) return "F";
  return "X";
}

function parseHeight(filiacion: string | null): number | undefined {
  if (!filiacion) return undefined;
  const m = filiacion.match(/[Ee]statura[:\s]*(\d{3})\s*cm/);
  return m ? parseInt(m[1], 10) : undefined;
}

// ── Supabase fetch ────────────────────────────────────────────────────────────

export async function fetchPersona(
  victima_id: string,
): Promise<HiloRecord | null> {
  const { data, error } = await sb
    .from("personas_desaparecidas")
    .select(
      "id_victimadirecta,nombre,primer_apellido,sexo,edad_actual,estado,municipio,fecha_hechos,fecha_percato,sana_particular,media_filiacion",
    )
    .eq("id_victimadirecta", victima_id)
    .limit(1)
    .single();

  if (error || !data) {
    console.error("Persona not found:", error?.message);
    return null;
  }

  const row = data as Record<string, unknown>;
  return {
    id: row.id_victimadirecta as string,
    source_id: "supabase_rnpdno",
    record_type: "missing",
    sex: sexMap((row.sexo as string) ?? null),
    age_min: (row.edad_actual as number) ?? undefined,
    age_max: (row.edad_actual as number) ?? undefined,
    height_cm: parseHeight((row.media_filiacion as string) ?? null),
    estado: (row.estado as string) ?? undefined,
    municipio: (row.municipio as string) ?? undefined,
    event_date:
      ((row.fecha_hechos as string) ?? (row.fecha_percato as string)) ||
      undefined,
    raw_description: (row.sana_particular as string) ?? "",
    pii_minimized: true,
    synthetic: false,
    created_at: new Date().toISOString(),
  };
}

// ── SQLite load ───────────────────────────────────────────────────────────────

export function loadCuerpos(): HiloRecord[] {
  if (!existsSync(DB_PATH)) {
    console.warn("hilo.db not found — run npm run seed first");
    return [];
  }
  const db = new Database(DB_PATH, { readonly: true });
  const rows = db
    .prepare("SELECT * FROM records WHERE record_type='unidentified'")
    .all() as Record<string, unknown>[];
  db.close();
  return rows.map((r) => ({
    ...(r as unknown as HiloRecord),
    pii_minimized: !!r.pii_minimized,
    synthetic: !!r.synthetic,
  }));
}

export function loadFeatures(dbPath: string = DB_PATH) {
  if (!existsSync(dbPath)) return [];
  const db = new Database(dbPath, { readonly: true });
  const rows = db.prepare("SELECT * FROM features").all() as Record<
    string,
    unknown
  >[];
  db.close();
  return rows.map((f) => ({
    ...f,
    tokens: f.tokens ? JSON.parse(f.tokens as string) : [],
  }));
}

// ── matching ──────────────────────────────────────────────────────────────────

/**
 * Run the block + score pipeline for a single missing persona against a list
 * of unidentified cuerpos.  Exported so unit tests can call it directly.
 */
export function runMatch(
  persona: HiloRecord,
  cuerpos: HiloRecord[],
  allFeats: ReturnType<typeof loadFeatures>,
): ScoredPair[] {
  // block() expects a flat array of HiloRecords and pairs them internally.
  // We pass the persona + all cuerpos together; the function filters by
  // record_type === "missing" and record_type === "unidentified".
  const allRecords: HiloRecord[] = [persona, ...cuerpos];
  const pairs: BlockPair[] = block(allRecords);

  return pairs
    .map((p) => scorePair(p, allFeats as any, allFeats as any))
    .sort((a, b) => b.overall_score - a.overall_score);
}

// ── Supabase write ────────────────────────────────────────────────────────────

async function writeResults(personaId: string, scored: ScoredPair[]) {
  for (const s of scored.slice(0, 10)) {
    const { error } = await sb.from("match_results").insert({
      persona_victima_id: personaId,
      cuerpo_id: s.unidentified.id,
      score: s.overall_score,
      tier:
        s.overall_score >= 0.8
          ? "alta"
          : s.overall_score >= 0.6
            ? "media"
            : "baja",
      evidencia: s.evidences ?? [],
      contradicciones: s.contradictions ?? [],
      razonamiento: null,
      source: "bridge_ts",
    });
    if (error) console.error("Insert error:", error.message);
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const personaId = process.argv[2];
  if (!personaId) {
    console.error(
      "Usage: tsx scripts/bridge-match.ts <persona_victima_id>",
    );
    process.exit(1);
  }

  console.log(`Fetching persona ${personaId} from Supabase...`);
  const persona = await fetchPersona(personaId);
  if (!persona) process.exit(1);

  console.log("Loading cuerpos from hilo.db...");
  const cuerpos = loadCuerpos();
  console.log(`${cuerpos.length} unidentified records loaded`);

  if (cuerpos.length === 0) {
    console.log("No cuerpos to match against. Run: npm run seed");
    process.exit(0);
  }

  const allFeats = loadFeatures();
  console.log("Scoring...");
  const scored = runMatch(persona, cuerpos, allFeats);

  const top = scored.slice(0, 5);
  console.log("\nTop 5 candidates:");
  for (const s of top) {
    console.log(
      `  ${s.unidentified.id} — score=${(s.overall_score * 100).toFixed(1)}%  estado=${s.unidentified.estado}`,
    );
  }

  console.log("\nWriting to Supabase match_results...");
  await writeResults(personaId, scored);
  console.log("Done.");
}

// Only run when executed directly (not when imported by tests)
const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url).replace(/\\/g, "/").endsWith(
    process.argv[1].replace(/\\/g, "/"),
  );

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
