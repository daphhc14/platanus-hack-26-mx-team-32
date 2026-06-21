// lib/acquisition/risk_patterns.ts
// Find past social_risk_events that resemble a new case text.
//
// Concept lifted from a now-discarded facebook.ts (matchFacebookPatterns), but
// rewritten to:
//   - work against the existing social_risk_events table (no parallel corpus),
//   - use lib/detector (CRUCE/Iteso catalog with citations) instead of a
//     parallel keyword taxonomy,
//   - respect review_status (never surface hidden events),
//   - never touch Facebook or any scraper.
//
// Useful for "find similar past events" features in the UI/agent layer.

import type Database from "better-sqlite3";
import { detectOffer } from "../detector/detect.js";
import type { SocialRiskEvent } from "./types.js";

export interface SimilarEventMatch {
  event: SocialRiskEvent;
  score: number; // 0..1
  reasons: string[];
}

export interface FindSimilarOptions {
  limit?: number;
  min_score?: number;
  event_type?: string;
  /** Restrict to events from this source only. */
  source_id?: string;
}

/**
 * Find past social_risk_events similar to a new case text.
 * Combines four signals:
 *   1. Overlap of detector risk-signals (60% weight).
 *   2. Detector score band similarity (20%).
 *   3. Shared estado (15%).
 *   4. Summary token overlap (10%).
 *
 * Hidden events are never returned. Spec 05: hidden means revoked/purged.
 */
export function findSimilarEvents(
  db: Database.Database,
  caseText: string,
  options: FindSimilarOptions = {},
): SimilarEventMatch[] {
  const limit = options.limit ?? 5;
  const minScore = options.min_score ?? 0.3;

  const params: string[] = [];
  const where: string[] = ["review_status != 'hidden'"];
  if (options.event_type) {
    where.push("event_type = ?");
    params.push(options.event_type);
  }
  if (options.source_id) {
    where.push("source_id = ?");
    params.push(options.source_id);
  }

  const rows = db
    .prepare(
      `SELECT * FROM social_risk_events
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT 500`,
    )
    .all(...params) as any[];

  const caseDetection = detectOffer(caseText);
  const caseSignalIds = new Set(caseDetection.hits.map(h => h.id));
  const caseTokens = tokenize(caseText);
  const caseEstado = extractEstadoFromText(caseText);

  const matches: SimilarEventMatch[] = [];

  for (const row of rows) {
    const evidence = parseEvidence(row.evidence_json);
    const eventSignalIds = extractSignalIds(evidence);
    const eventSummary = (row.summary_public ?? "") as string;
    const eventDetectorScore = evidence?.validator?.score ?? 0;

    let score = 0;
    const reasons: string[] = [];

    // 1. Risk-signal overlap (most weight)
    if (caseSignalIds.size > 0 && eventSignalIds.length > 0) {
      const overlap = eventSignalIds.filter(id => caseSignalIds.has(id));
      if (overlap.length > 0) {
        const overlapScore = overlap.length / Math.max(caseSignalIds.size, eventSignalIds.length);
        score += overlapScore * 0.6;
        reasons.push(`${overlap.length} señal(es) en común: ${overlap.join(", ")}`);
      }
    }

    // 2. Detector score band similarity
    if (caseDetection.score >= 20 && eventDetectorScore >= 20) {
      const delta = Math.abs(caseDetection.score - eventDetectorScore);
      if (delta <= 25) {
        score += 0.2;
        reasons.push(`score similar (caso ${caseDetection.score}, evento ${eventDetectorScore})`);
      }
    }

    // 3. Shared estado
    if (caseEstado && typeof row.estado === "string" && row.estado.toLowerCase().includes(caseEstado.toLowerCase())) {
      score += 0.15;
      reasons.push(`mismo estado: ${row.estado}`);
    }

    // 4. Summary token overlap
    if (eventSummary && caseTokens.length > 0) {
      const summaryTokens = tokenize(eventSummary);
      if (summaryTokens.length > 0) {
        const caseSet = new Set(caseTokens);
        const commonTokens = summaryTokens.filter(t => caseSet.has(t));
        if (commonTokens.length >= 3) {
          score += 0.1;
          reasons.push(`${commonTokens.length} tokens en común en resumen`);
        }
      }
    }

    if (score >= minScore) {
      matches.push({
        event: normalizeEvent(row),
        score: Math.min(1, score),
        reasons,
      });
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}

function parseEvidence(json: unknown): any {
  if (!json) return {};
  try {
    return typeof json === "string" ? JSON.parse(json) : json;
  } catch {
    return {};
  }
}

function extractSignalIds(evidence: any): string[] {
  const hits = evidence?.validator?.hits;
  return Array.isArray(hits) ? hits.filter((h: unknown) => typeof h === "string") : [];
}

const ESTADOS = [
  "Jalisco", "Nuevo León", "Tamaulipas", "Sinaloa", "Estado de México",
  "Ciudad de México", "CDMX", "Michoacán", "Guerrero", "Veracruz", "Chiapas",
  "Oaxaca", "Puebla", "Chihuahua", "Sonora", "Baja California", "Coahuila",
  "Querétaro", "San Luis Potosí", "Hidalgo", "Guanajuato", "Aguascalientes",
  "Nayarit", "Colima", "Zacatecas", "Durango", "Tlaxcala", "Morelos",
  "Campeche", "Tabasco", "Quintana Roo", "Yucatán", "Baja California Sur",
];
const ESTADO_RE = new RegExp(`\\b(${ESTADOS.join("|")})\\b`, "i");

function extractEstadoFromText(text: string): string | null {
  const m = text.match(ESTADO_RE);
  return m ? m[0] : null;
}

const STOP = new Set([
  "de", "la", "el", "en", "con", "para", "por", "una", "uno", "del", "los",
  "las", "que", "this", "with", "from", "that", "have", "been", "were",
  "they", "their", "would", "there", "what", "about", "which", "when",
  "will", "more", "than", "also", "the", "and", "for", "are", "was", "you",
]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/\b[a-záéíóúñ]{4,}\b/g) ?? [])
    .filter(t => !STOP.has(t))
    .slice(0, 200);
}

function normalizeEvent(row: any): SocialRiskEvent {
  return {
    ...row,
    evidence: row.evidence_json ? JSON.parse(row.evidence_json) : undefined,
  };
}
