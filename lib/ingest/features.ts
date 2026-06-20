// lib/ingest/features.ts — Normalize raw señas text into structured features.
// This is THE step that makes cross-source matching possible: "ancla brazo der."
// (semefo) and "tatuaje de áncora en antebrazo derecho" (ficha) both normalize to
// { tatuaje, antebrazo/brazo, derecha, nautico }. Deterministic by default;
// upgrades to an LLM extractor when LLM_API_KEY is set.

import { randomUUID } from "node:crypto";
import { chatJSON, loadLLMConfig } from "../llm.js";
import { tokenize } from "../seedgen.js";
import type { Feature, FeatureType, BodyRegion, Laterality, MotifCategory } from "../types.js";

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

const TYPE_MAP: [RegExp, FeatureType][] = [
  [/tatuaj|tato|tatu/i, "tatuaje"],
  [/cicatri|cic|herida|marca de|quemadura/i, "cicatriz"],
  [/lunar/i, "lunar"],
  [/piercing|arete|argolla/i, "piercing"],
  [/protesis|prótesis|pie/i, "protesis"],
  [/amputac/i, "amputacion"],
  [/dental|diente|mordida/i, "dental"],
  [/vestimenta|ropa|playera|pantal/i, "vestimenta"],
];

function splitSenas(raw: string): string[] {
  return raw.split(/[;,\n]|\by\b/i).map(s => s.trim()).filter(Boolean);
}

export interface ExtractedFeature {
  feature_type: FeatureType;
  body_region?: BodyRegion;
  laterality: Laterality;
  motif_category?: MotifCategory;
  description_raw: string;
}

/** Deterministic extraction via controlled-vocab matching. */
export function extractDeterministic(raw: string): ExtractedFeature[] {
  return splitSenas(raw).map(seg => {
    const ft = matchFirst(seg, TYPE_MAP) ?? "otra_sena";
    const region = matchFirst(seg, REGION_MAP) ?? "generico";
    const lat = matchFirst(seg, LAT_MAP) ?? "na";
    const motif = matchFirst(seg, MOTIF_MAP);
    return { feature_type: ft, body_region: region, laterality: lat, motif_category: motif, description_raw: seg };
  });
}

function matchFirst<T>(s: string, map: [RegExp, T][]): T | undefined {
  for (const [re, v] of map) if (re.test(s)) return v;
  return undefined;
}

/** LLM extraction (OpenAI-compatible). Falls back to deterministic if no key. */
export async function extractFeatures(raw: string, recordId: string): Promise<Feature[]> {
  const cfg = loadLLMConfig();
  let extracted: ExtractedFeature[];

  if (cfg.available) {
    const sys = `You extract "señas particulares" (tattoos, scars, marks) from Spanish-language text into JSON.
Return: {"features":[{"feature_type":"tatuaje|cicatriz|lunar|...","body_region":"antebrazo|brazo|espalda|...","laterality":"izquierda|derecha|central|bilateral|na","motif_category":"nautico|religioso|floral|animal|nombre_texto|fecha_numero|simbolo|...","description_raw":"original segment"}]}
Vocabulary is controlled. Laterality is a DISQUALIFIER in scoring, so extract left/right carefully. Return ONLY JSON.`;
    extracted = await chatJSON(sys, raw, () => extractDeterministic(raw));
    if (!Array.isArray((extracted as any)?.features)) extracted = extractDeterministic(raw);
    else extracted = (extracted as any).features;
  } else {
    extracted = extractDeterministic(raw);
  }

  return extracted.map(e => ({
    id: randomUUID(), record_id: recordId, feature_type: e.feature_type,
    body_region: e.body_region, laterality: e.laterality ?? "na", motif_category: e.motif_category,
    description_raw: e.description_raw, tokens: tokenize(`${e.description_raw} ${e.body_region ?? ""} ${e.laterality ?? ""} ${e.motif_category ?? ""}`),
    created_at: new Date().toISOString(),
  }));
}
