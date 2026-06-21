// demo.ts — Hilo end-to-end WOW demo runner.
// Sequence (the exact wow moment, in order):
//  1. Real context anchor (RNPDNO aggregates + fosas) — data is REAL
//  2. Pipeline runs: block -> score -> verify over synthetic individuals
//  3. Live drop: a staged new `unidentified` record -> ranked candidate surfaces w/ evidence
//  4. Near-miss correctly flagged (laterality contradiction) — NOT auto-matched
//  5. Reviewer confirms for forensic review -> audit + liaison notification
//  6. SAFETY: switch to `readonly` -> CANNOT read secure_locations (RLS-equivalent)
//  7. Answer-key verification: planted true matches in top-N, near-misses rejected

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HiloDB, AccessDeniedError } from "./lib/db.js";
import { block } from "./lib/match/block.js";
import { scorePair } from "./lib/match/score.js";
import { verify } from "./lib/match/verify.js";
import { extractFeatures } from "./lib/ingest/features.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "hilo.db");
const GEN = join(__dirname, "data", "generated");

const C = {
  dim: "\x1b[2m", reset: "\x1b[0m", bold: "\x1b[1m", green: "\x1b[32m", red: "\x1b[31m",
  yellow: "\x1b[33m", cyan: "\x1b[36m", mag: "\x1b[35m", ban: "\x1b[41;37;1m",
};
const banner = (s: string) => console.log(`\n${C.ban} ${s} ${C.reset}`);
const h = (s: string) => console.log(`\n${C.cyan}${C.bold}▸ ${s}${C.reset}`);
const ok = (s: string) => console.log(`${C.green}  ✓${C.reset} ${s}`);
const bad = (s: string) => console.log(`${C.red}  ✗${C.reset} ${s}`);
const warn = (s: string) => console.log(`${C.yellow}  ⚠${C.reset} ${s}`);

async function main() {
  banner("HILO — motor de linkage forense  |  DATOS SINTÉTICOS + contexto REAL");
  const db = new HiloDB(DB_PATH, "reviewer").init();

  // make the demo idempotent/re-runnable: clear derived tables only
  const raw = (db as any).db as import("better-sqlite3").Database;
  for (const t of ["reviews", "candidate_matches", "audit_log"]) raw.prepare(`DELETE FROM ${t}`).run();

  // ─────────────────────────── 1. REAL CONTEXT ───────────────────────────
  h("Capa de contexto — datos REALES (RNPDNO / fosas)");
  const nat = JSON.parse(readFileSync(join(GEN, "context_national.json"), "utf-8"));
  const fos = JSON.parse(readFileSync(join(GEN, "fosas.geojson"), "utf-8"));
  console.log(`${C.dim}  Fuente:${C.reset} RNPDNO (CC0) + Mapa de fosas (Quinto Elemento/CNB)`);
  ok(`${nat.total_desaparecidos_no_loc.toLocaleString("es-MX")} personas desaparecidas/no localizadas (RNPDNO)`);
  ok(`Año pico: ${nat.peak_year}  |  Hombres: ${nat.by_sex.HOMBRE?.toLocaleString("es-MX")} · Mujeres: ${nat.by_sex.MUJER?.toLocaleString("es-MX")}`);
  ok(`${fos.num_sitios} sitios de fosas reales georreferenciados — ${fos.total_fosas.toLocaleString()} fosas, ${fos.total_cuerpos_osamentas.toLocaleString()} cuerpos/osamentas`);
  console.log(`${C.dim}  Top estados:${C.reset} ${JSON.stringify(nat.by_status)}`);

  // ─────────────────────────── 2. PIPELINE ───────────────────────────
  h("Pipeline: block → score → verify (individuos sintéticos)");
  const records = db.allRecords();
  const allFeats = records.flatMap(r => db.featuresFor(r.id));
  const featsBy = (id: string) => allFeats.filter(f => f.record_id === id);

  const pairs = block(records);
  ok(`${pairs.length} pares candidatos tras blocking (de ${records.filter(r=>r.record_type==="missing").length}×${records.filter(r=>r.record_type==="unidentified").length})`);

  const scored = pairs.map(p => scorePair(p, allFeats, allFeats)).sort((a, b) => b.overall_score - a.overall_score);
  const top = scored.slice(0, 6);
  for (const p of top) {
    const v = await verify(p, featsBy(p.missing.id), featsBy(p.unidentified.id));
    const mid = randomUUID();
    db.insertMatch({
      id: mid, missing_record_id: p.missing.id, unidentified_record_id: p.unidentified.id,
      overall_score: p.overall_score, field_scores: p.field_scores, status: "proposed",
    });
    db.updateMatchStatus(mid, "in_review", v.evidence, v.contradictions, v.tier);
  }

  // ─────────────────────────── 3. LIVE DROP ───────────────────────────
  h("Cae un cuerpo nuevo en vivo (ancla, antebrazo derecho, Jalisco)");
  const stagedRaw = "tato ancla antebrazo der; hombre, aprox 1.74m, 25-30 años";
  const stagedFeats = await extractFeatures(stagedRaw, "STAGED");
  console.log(`${C.dim}  raw:${C.reset} "${stagedRaw}"`);
  console.log(`${C.dim}  extraídas ${stagedFeats.length} señas normalizadas:${C.reset} ${stagedFeats.map(f => `${f.feature_type}/${f.body_region}/${f.laterality}/${f.motif_category ?? "—"}`).join(", ")}`);

  // find best ficha match against staged
  const missingRecs = records.filter(r => r.record_type === "missing");
  let bestDrop: any = null;
  for (const m of missingRecs) {
    const p = scorePair({ missing: m, unidentified: { ...m, id: "STAGED", record_type: "unidentified", raw_description: stagedRaw, height_cm: 174, age_min: 25, age_max: 30 } as any, }, allFeats, [...allFeats, ...stagedFeats]);
    if (!bestDrop || p.overall_score > bestDrop.overall_score) bestDrop = { ...p, stagedFeats };
  }
  if (bestDrop) {
    const v = await verify(bestDrop, featsBy(bestDrop.missing.id), stagedFeats);
    ok(`CANDIDATO surfaceado (score ${bestDrop.overall_score}, tier ${C.green}${v.tier}${C.reset}):`);
    console.log(`     ficha : ${bestDrop.missing.raw_description} (${bestDrop.missing.estado}, ${bestDrop.missing.event_date})`);
    console.log(`     cuerpo: ${stagedRaw}`);
    console.log(`     ${C.green}evidencia:${C.reset} ${v.evidence}`);
    if (v.contradictions) console.log(`     ${C.red}contradicción:${C.reset} ${v.contradictions}`);
  }

  // ─────────────────────────── 4. NEAR-MISS REJECTED ───────────────────────────
  h("Near-miss correctamente RECHAZADO (lateralidad opuesta)");
  const withContradiction = scored.find(p => p.contradictions.some(c => /lateralidad/i.test(c)));
  if (withContradiction) {
    bad(`Score castigado a ${withContradiction.overall_score} — ${withContradiction.contradictions.find(c => /lateralidad/i.test(c))}`);
    ok("El sistema NO auto-vincula: requiere revisión humana.");
  } else warn("(no había near-miss de lateralidad en este run)");

  // ─────────────────────────── 5. CONFIRM ───────────────────────────
  h("Revisora humana confirma para revisión forense (única vía a 'confirmed')");
  const reviewer = db.getUserByPseudonym("reviewer-luna")!;
  const best = db.matchesByStatus("in_review")[0] ?? db.matchesByStatus("proposed")[0];
  if (best) {
    db.confirmMatch(best.id, reviewer.id, "coincidencia de señas + estatura + temporal coherente");
    ok(`Match ${best.id.slice(0,8)} → 'confirmed'. ` + `${C.mag}Notificación a enlace (lista cerrada, nunca a familia/público).${C.reset}`);
  }

  // ─────────────────────────── 6. SAFETY / RBAC ───────────────────────────
  h("SEGURIDAD: cuenta 'readonly' intenta leer fosas (secure_locations)");
  const ro = db.as("readonly");
  try {
    ro.listSecureLocations();
    bad("¡FALLO DE SEGURIDAD! readonly leyó secure_locations");
  } catch (e) {
    if (e instanceof AccessDeniedError) ok(`DENEGADO — ${e.message}. Las coordenadas de fosas NO son accesibles para readonly.`);
    else throw e;
  }
  const reviewerLocations = db.as("reviewer").listSecureLocations();
  ok(`Revisora SÍ ve ${reviewerLocations.length} sitios de fosas (control por rol, como RLS).`);

  // ─────────────────────────── 7. ANSWER-KEY VERIFICATION ───────────────────────────
  h("Verificación contra answer-key (matches planteados)");
  const key = JSON.parse(readFileSync(join(GEN, "answer-key.json"), "utf-8"));
  let hit = 0;
  for (const t of key.trueMatches) {
    const found = scored.some(p => p.missing.id === t.missing && p.unidentified.id === t.unidentified && p.overall_score >= 0.5);
    if (found) { hit++; ok(`TRUE match encontrado (score ≥ 0.5)`); } else warn(`TRUE match NO surfaced: ${t.person}`);
  }
  console.log(`\n${C.bold}Resultado answer-key:${C.reset} ${hit}/${key.trueMatches.length} true matches surfaced.`);
  let rejCount = 0;
  for (const nm of key.nearMisses) {
    const p = scored.find(x => x.missing.id === nm.missing && x.unidentified.id === nm.unidentified);
    if (!p) { ok(`NEAR-MISS rechazado por blocking (${nm.reason}: descartado antes de puntuar)`); rejCount++; }
    else if (p.overall_score < 0.3) { ok(`NEAR-MISS rechazado por contradicción (score ${p.overall_score}, ${nm.reason})`); rejCount++; }
    else bad(`NEAR-MISS no rechazado: ${nm.reason} (score ${p.overall_score})`);
  }
  console.log(`${C.bold}Near-misses rechazados:${C.reset} ${rejCount}/${key.nearMisses.length}`);

  banner("FIN — el algoritmo es conocido; lo que faltaba era la capa conectiva. Hilo la demuestra, de forma segura.");
  console.log(`${C.dim}  Audit log:${C.reset} ${db.auditLog().length} eventos registrados (append-only).`);
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
