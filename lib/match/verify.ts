// lib/match/verify.ts — The DUAL-PLANE VERIFIER (control plane).
// A SEPARATE reasoning pass that receives the scored pair and writes
// human-readable evidence + contradictions + a recommendation tier.
// It RANKS candidates for a human; it NEVER declares a match.
// LLM when key present, deterministic otherwise.

import { chatJSON, loadLLMConfig } from "../llm.js";
import type { Feature, HiloRecord as Rec } from "../types.js";
import type { ScoredPair } from "./score.js";

export interface VerifierResult {
  evidence: string;
  contradictions: string;
  tier: "alta" | "media" | "baja";
}

export async function verify(
  pair: ScoredPair,
  missFeats: Feature[],
  unkFeats: Feature[],
): Promise<VerifierResult> {
  const cfg = loadLLMConfig();
  if (cfg.available) {
    return verifyLLM(pair, missFeats, unkFeats);
  }
  return verifyDeterministic(pair);
}

async function verifyLLM(pair: ScoredPair, missFeats: Feature[], unkFeats: Feature[]): Promise<VerifierResult> {
  const m = pair.missing, u = pair.unidentified;
  const sys = `Eres un verificador forense para casos de desaparición. Recibes un par ya puntuado (ficha de persona desaparecida vs cuerpo no identificado) y escribes:
- "evidence": qué refuerza la coincidencia (señas, estatura, temporal, geografía).
- "contradictions": qué la descarta (lateralidad opuesta, edad incompatible, temporal imposible).
- "tier": "alta" | "media" | "baja" (recomendación de prioridad para revisión humana).
TÚ NUNCA DECLARAS UNA COINCIDENCIA. Solo priorizas para una revisora humana. Devuelve SOLO JSON: {"evidence":"...","contradictions":"...","tier":"..."}`;
  const user = JSON.stringify({
    ficha: { sexo: m.sex, edad: [m.age_min, m.age_max], estatura: m.height_cm, estado: m.estado, fecha: m.event_date, señas: m.raw_description },
    cuerpo: { sexo: u.sex, edad: [u.age_min, u.age_max], estatura: u.height_cm, estado: u.estado, fecha: u.event_date, señas: u.raw_description },
    field_scores: pair.field_scores,
    overall_score: pair.overall_score,
    scorer_contradictions: pair.contradictions,
  }, null, 2);
  const res = await chatJSON(sys, user, () => verifyDeterministic(pair));
  return {
    evidence: res.evidence ?? res.evidencia ?? "",
    contradictions: res.contradictions ?? res.contradicciones ?? "",
    tier: (["alta", "media", "baja"].includes(res.tier) ? res.tier : tierOf(pair.overall_score, pair.contradictions)) as VerifierResult["tier"],
  };
}

function verifyDeterministic(pair: ScoredPair): VerifierResult {
  const hardContradiction = pair.contradictions.some(c => /lateralidad|temporal.*ANTES|edad incompatible/i.test(c));
  const ev = pair.evidences.join(". ");
  const con = pair.contradictions.join(". ");
  return {
    evidence: ev || "Coincidencia parcial de señas y datos contextuales.",
    contradictions: con || (hardContradiction ? "" : "Sin contradicciones duras detectadas."),
    tier: tierOf(pair.overall_score, pair.contradictions),
  };
}

function tierOf(score: number, contradictions: string[]): VerifierResult["tier"] {
  const hard = contradictions.some(c => /lateralidad|temporal.*ANTES|edad incompatible/i.test(c));
  if (hard) return "baja";
  if (score >= 0.75) return "alta";
  if (score >= 0.5) return "media";
  return "baja";
}
