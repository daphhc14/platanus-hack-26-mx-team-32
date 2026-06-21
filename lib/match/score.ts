// lib/match/score.ts — Per-field scoring for a candidate pair.
// Tattoo/marks score on: (a) controlled overlap (feature_type + body_region + motif),
// (b) lexical Jaccard over normalized tokens, (c) LATERALITY is a DISQUALIFIER
// (izquierda vs derecha ⇒ hard penalty). Other fields: height ±tolerance, age band,
// temporal gate, geographic plausibility. Produces field_scores + overall_score.

import type { Feature, HiloRecord as Rec } from "../types.js";
import type { BlockPair } from "./block.js";

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a), sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (new Set([...a, ...b]).size);
}

// related body regions (brazo ~ antebrazo) so terse "brazo" matches "antebrazo"
const REGION_CLUSTERS: Record<string, string> = {
  brazo: "ARM", antebrazo: "ARM", mano: "ARM", dedo: "ARM", hombro: "ARM",
  pierna: "LEG", muslo: "LEG", rodilla: "LEG", tobillo: "LEG", pie: "LEG",
  pecho: "TORSO", espalda: "TORSO", abdomen: "TORSO", cadera: "TORSO", gluteo: "TORSO",
  cabeza: "HEAD", cara: "HEAD", cuello: "HEAD",
};

function regionCompatible(a?: string, b?: string): boolean {
  if (!a || !b || a === "generico" || b === "generico") return true;
  if (a === b) return true;
  return REGION_CLUSTERS[a] === REGION_CLUSTERS[b];
}

export interface FeatureMatchResult {
  score: number;
  lateralityConflict: boolean;
  detail: { matched: boolean; reason: string };
}

/** Best-match a feature from A against all features of B. */
function bestFeatureScore(aF: Feature, bFeats: Feature[]): FeatureMatchResult {
  let best = 0, conflict = false;
  for (const bF of bFeats) {
    if (aF.feature_type !== bF.feature_type) continue;
    // LATERALITY disqualifier
    const latA = aF.laterality, latB = bF.laterality;
    const latConflict =
      (latA === "izquierda" && latB === "derecha") ||
      (latA === "derecha" && latB === "izquierda");
    if (latConflict) { conflict = true; continue; }
    if (!regionCompatible(aF.body_region, bF.body_region)) continue;
    let s = 0.4; // base for same type
    if (aF.body_region && bF.body_region && aF.body_region === bF.body_region) s += 0.15;
    if (aF.motif_category && aF.motif_category === bF.motif_category) s += 0.25;
    const lex = jaccard(aF.tokens ?? [], bF.tokens ?? []);
    s += 0.2 * lex;
    best = Math.max(best, Math.min(s, 0.99));
  }
  return {
    score: best,
    lateralityConflict: conflict && best === 0, // only a hard fail if nothing else matched
    detail: { matched: best > 0.4, reason: best > 0.4 ? "señas coinciden (tipo/región/motivo léxico)" : "sin coincidencia de señas" },
  };
}

export interface ScoredPair extends BlockPair {
  overall_score: number;
  field_scores: Record<string, number>;
  contradictions: string[];
  evidences: string[];
}

export function scorePair(pair: BlockPair, aFeats: Feature[], bFeats: Feature[]): ScoredPair {
  const { missing: m, unidentified: u } = pair;
  const fs: Record<string, number> = {};
  const contradictions: string[] = [];
  const evidences: string[] = [];

  // --- señas (hero) ---
  const mainA = aFeats.filter(f => f.record_id === m.id);
  const mainB = bFeats.filter(f => f.record_id === u.id);
  let maxFeature = 0, anyLatConflict = false;
  for (const af of mainA) {
    const res = bestFeatureScore(af, mainB);
    maxFeature = Math.max(maxFeature, res.score);
    if (res.lateralityConflict) anyLatConflict = true;
  }
  if (anyLatConflict) {
    fs["señas"] = 0.05;
    contradictions.push("CONTRADICCIÓN: lateralidad opuesta en seña (izquierda vs derecha) — incompatible");
  } else {
    fs["señas"] = round(maxFeature);
    if (maxFeature > 0.5) evidences.push(`Señas coinciden (score ${round(maxFeature)}): tipo + región + motivo léxico`);
  }

  // --- height (±tolerance) ---
  if (m.height_cm && u.height_cm) {
    const diff = Math.abs(m.height_cm - u.height_cm);
    fs["estatura"] = round(diff <= 2 ? 1 : diff <= 5 ? 0.7 : diff <= 8 ? 0.4 : 0.1);
    evidences.push(`Estatura: ficha ${m.height_cm}cm vs cuerpo ${u.height_cm}cm (Δ ${diff}cm)`);
  }

  // --- age band ---
  if (m.age_min != null && u.age_min != null) {
    const mA = (m.age_min + (m.age_max ?? m.age_min)) / 2;
    const uA = (u.age_min + (u.age_max ?? u.age_min)) / 2;
    const diff = Math.abs(mA - uA);
    fs["edad"] = round(diff <= 3 ? 1 : diff <= 8 ? 0.7 : diff <= 15 ? 0.35 : 0.05);
    if (diff > 12) contradictions.push(`CONTRADICCIÓN: edad incompatible (Δ ${Math.round(diff)} años)`);
  }

  // --- temporal gate ---
  if (m.event_date && u.event_date) {
    const ok = new Date(m.event_date) <= new Date(u.event_date);
    fs["temporal"] = ok ? 1 : 0;
    if (!ok) contradictions.push("CONTRADICCIÓN temporal: cuerpo hallado ANTES de la desaparición");
    else evidences.push(`Temporal coherente: desaparición ${m.event_date} ≤ hallazgo ${u.event_date}`);
  }

  // --- geography ---
  fs["geografico"] = m.estado && u.estado && m.estado === u.estado ? 1 : m.estado && u.estado ? 0.5 : 0.3;
  if (m.estado && m.estado === u.estado) evidences.push(`Mismo estado: ${m.estado}`);

  // --- weighted overall (señas is the dominant signal) ---
  const weights: [string, number][] = [
    ["señas", 0.45], ["estatura", 0.12], ["edad", 0.13], ["temporal", 0.15], ["geografico", 0.15],
  ];
  let overall = 0, wsum = 0;
  for (const [k, w] of weights) if (k in fs) { overall += fs[k] * w; wsum += w; }
  let overall_score = wsum ? round(overall / wsum) : 0;

  // HARD DISQUALIFIER: a single structural contradiction (lateralidad opuesta,
  // temporal imposible, edad incompatible) means this is NOT a match, regardless
  // of how well the other fields line up. Cap low so a human sees it as a reject.
  const hardContradiction = contradictions.some(c =>
    /lateralidad|temporal.*ANTES|edad incompatible/i.test(c));
  if (hardContradiction) {
    overall_score = Math.min(overall_score, 0.2);
  }

  return { ...pair, overall_score, field_scores: fs, contradictions, evidences };
}

function round(n: number): number { return Math.round(n * 100) / 100; }
