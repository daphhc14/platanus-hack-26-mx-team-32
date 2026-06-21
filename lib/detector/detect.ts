// lib/detector/detect.ts — Orquestador del detector de oferta laboral falsa / reclutamiento forzado.
// Corre todas las señales del catálogo (CRUCE/Iteso) sobre el texto de la oferta
// y produce un score de riesgo ponderado + nivel + recomendación.

import { SIGNALS, SEVERITY_WEIGHT, type SignalHit, type PostingMeta } from "./signals.js";

export interface DetectionResult {
  score: number;            // 0..100
  level: "CRÍTICO" | "ALTO" | "MEDIO" | "BAJO";
  hits: SignalHit[];
  recommendation: string;
}

export function detectOffer(text: string, meta: PostingMeta = {}): DetectionResult {
  const hits: SignalHit[] = [];
  for (const s of SIGNALS) {
    // diseno_generico is image-only; surface as info when image present
    if (s.id === "diseno_generico" && meta.hasImage) {
      hits.push({ id: s.id, label: s.label, severity: s.severity, evidence: "(imagen presente — requiere revisión)", rationale: s.rationale, category: s.category });
      continue;
    }
    const ev = s.match(text, meta);
    if (ev) hits.push({ id: s.id, label: s.label, severity: s.severity, evidence: ev, rationale: s.rationale, category: s.category });
  }

  const raw = hits.reduce((sum, h) => sum + SEVERITY_WEIGHT[h.severity], 0);
  const score = Math.min(100, Math.round(raw));

  const hasCritical = hits.some(h => h.severity === "critical");
  let level: DetectionResult["level"];
  let recommendation: string;
  if (hasCritical || score >= 70) {
    level = "CRÍTICO";
    recommendation = "ALTO riesgo de reclutamiento forzado/fraude. No acudas sin verificar a la empresa en fuentes oficiales ni entregues documentos/dinero. Reporta a autoridades de búsqueda.";
  } else if (score >= 45) {
    level = "ALTO";
    recommendation = "Múltiples señales de alerta. Verifica la empresa (Google Maps, RFC), desconfía de entrevistas en terminales/hoteles, ve acompañado y comparte tu ubicación.";
  } else if (score >= 20) {
    level = "MEDIO";
    recommendation = "Algunas señales presentes. Confirma los datos de la empresa antes de aceptar.";
  } else {
    level = "BAJO";
    recommendation = "Pocas o ninguna señal. Aplica las precauciones habituales al buscar empleo.";
  }

  return { score, level, hits, recommendation };
}
