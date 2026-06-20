// lib/seedgen.ts — Synthetic seed generator, calibrated to REAL RNPDNO distributions.
// PLANTED matches (same person: ficha + cuerpo, differently-phrased señas) +
// PLANTED near-misses (laterality flipped / age off ~20y) that MUST be rejected.
// 100% synthetic individuals. Real data only informs demographic shape.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Source, HiloRecord, Feature, FeatureType, BodyRegion, Laterality, MotifCategory, TrustTier,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- seeded RNG (deterministic demo) ----
export function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type RNG = () => number;
const pick = <T,>(r: RNG, arr: T[]): T => arr[Math.floor(r() * arr.length)];
const rint = (r: RNG, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const sampleDist = (r: RNG, dist: Record<string, number>): string => {
  const entries = Object.entries(dist);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let t = r() * total;
  for (const [k, v] of entries) { if ((t -= v) <= 0) return k; }
  return entries[entries.length - 1][0];
};

// ---- controlled-vocabulary tattoo motifs ----
interface MotifDef { label: string[]; motif: MotifCategory; }
const MOTIFS: MotifDef[] = [
  { label: ["ancla", "ancora"], motif: "nautico" },
  { label: ["cruz", "cruz cristiana"], motif: "religioso" },
  { label: ["rosa", "rosita", "flor"], motif: "floral" },
  { label: ["leon", "león"], motif: "animal" },
  { label: ["nombre de maria", "nombre maría", "maria"], motif: "nombre_texto" },
  { label: ["fecha 13 mayo 2010", "13/05/10", "fecha trece"], motif: "fecha_numero" },
  { label: ["estrella", "estrella de cinco puntas"], motif: "simbolo" },
  { label: ["aguila", "águila"], motif: "animal" },
  { label: ["calavera"], motif: "simbolo" },
  { label: ["corazon", "corazón"], motif: "simbolo" },
  { label: ["virgen de guadalupe", "virgen"], motif: "religioso" },
  { label: ["escudo del america", "escudo"], motif: "deportivo" },
];

interface RegionDef { region: BodyRegion; ficha: string[]; cuerpo: string[]; }
const REGIONS: RegionDef[] = [
  { region: "antebrazo", ficha: ["antebrazo"], cuerpo: ["antebrazo", "brazo", "a. brazo"] },
  { region: "brazo", ficha: ["brazo"], cuerpo: ["brazo", "br."] },
  { region: "espalda", ficha: ["espalda"], cuerpo: ["espalda", "esp."] },
  { region: "pecho", ficha: ["pecho"], cuerpo: ["pecho", "tórax"] },
  { region: "pierna", ficha: ["pierna"], cuerpo: ["pierna", "pna"] },
  { region: "mano", ficha: ["mano"], cuerpo: ["mano", "mno"] },
  { region: "cuello", ficha: ["cuello"], cuerpo: ["cuello", "cllo"] },
];

const LAT_FICHA: Record<Laterality, string> = { izquierda: "izquierdo", derecha: "derecho", central: "central", bilateral: "bilateral", na: "" };
const LAT_CUERPO: Record<Laterality, string> = { izquierda: "izq", derecha: "der", central: "cen", bilateral: "bil", na: "" };

interface CanonicalFeature {
  feature_type: FeatureType; // always tatuaje for hero feature, sometimes cicatriz
  region: BodyRegion;
  laterality: Laterality;
  motif: MotifCategory;
  label: string; // canonical motif label
}

function makeFeature(r: RNG): CanonicalFeature {
  const m = pick(r, MOTIFS);
  const reg = pick(r, REGIONS);
  const lat = pick(r, ["izquierda", "derecha", "derecha", "izquierda"] as Laterality[]);
  return {
    feature_type: r() < 0.78 ? "tatuaje" : "cicatriz",
    region: reg.region, laterality: lat, motif: m.motif, label: m.label[0],
  };
}

// phrasing — ficha is verbose/formal, cuerpo is terse (semefo-style) with variants
function phraseFicha(r: RNG, cf: CanonicalFeature): string {
  const reg = REGIONS.find(x => x.region === cf.region)!;
  const lat = LAT_FICHA[cf.laterality];
  const label = pick(r, MOTIFS.find(m => m.motif === cf.motif)!.label);
  const kind = cf.feature_type === "tatuaje" ? "tatuaje de" : "cicatriz de";
  return `${kind} ${label} en ${pick(r, reg.ficha)} ${lat}`.trim();
}
function phraseCuerpo(r: RNG, cf: CanonicalFeature, flipLaterality = false): string {
  const reg = REGIONS.find(x => x.region === cf.region)!;
  const lat = LAT_CUERPO[flipLaterality ? (cf.laterality === "izquierda" ? "derecha" : "izquierda") : cf.laterality];
  const label = pick(r, MOTIFS.find(m => m.motif === cf.motif)!.label);
  const kind = cf.feature_type === "tatuaje" ? "tato" : "cic";
  return `${kind} ${label} ${pick(r, reg.cuerpo)} ${lat}`.trim();
}

export interface SeedOutput {
  sources: Source[];
  records: HiloRecord[];
  features: Feature[];
  answerKey: { trueMatches: { missing: string; unidentified: string; person: string }[]; nearMisses: { missing: string; unidentified: string; reason: string }[] };
}

export function generateSeed(opts: { rngSeed?: number; nMissing?: number; nUnidentified?: number; nTrueMatches?: number; nNearMisses?: number } = {}): SeedOutput {
  const r = mulberry32(opts.rngSeed ?? 424242);
  const dist = JSON.parse(readFileSync(join(__dirname, "..", "data", "generated", "distributions.json"), "utf-8"));
  const stateDist = dist.state_prob as Record<string, number>;
  const sexDist = dist.sex_prob as Record<string, number>;
  const ageMean = dist.age_mean as number;
  const ageStd = dist.age_std as number;

  const sources: Source[] = [
    src("oficial-rnpdno", "RNPDNO (ficha oficial)", "registro_oficial", "oficial"),
    src("fiscalia-jal", "Fiscalía Jalisco", "fiscalia", "oficial"),
    src("semefo-jal", "SEMEFO Jalisco", "semefo", "oficial"),
    src("colectivo-solecito", "Colectivo Solecito (verificado)", "red_social", "colectivo_verificado"),
    src("fb-buscadoras", "Post FB Buscadoras", "red_social", "redes_anonimo"),
    src("tip-anon", "Tip anónimo", "tip", "redes_anonimo"),
  ];

  const records: HiloRecord[] = [];
  const features: Feature[] = [];
  const trueMatches: SeedOutput["answerKey"]["trueMatches"] = [];
  const nearMisses: SeedOutput["answerKey"]["nearMisses"] = [];

  // real-ish state names mapping from dist keys
  const estados = Object.keys(stateDist);
  const municipios: Record<string, string[]> = {
    "ESTADO DE MÉXICO": ["Nezahualcóyotl", "Ecatepec", "Toluca", "San Mateo Atenco"],
    "JALISCO": ["Guadalajara", "Zapopan", "Tlajomulco", "Tlaquepaque"],
    "TAMAULIPAS": ["Reynosa", "Nuevo Laredo", "Tampico", "Matamoros"],
    "CIUDAD DE MÉXICO": ["Iztapalapa", "Gustavo A. Madero", "Tláhuac", "Coyoacán"],
    "MICHOACÁN": ["Morelia", "Uruapan", "Lázaro Cárdenas", "Apatzingán"],
    "GUERRERO": ["Acapulco", "Chilpancingo", "Iguala", "Tixtla"],
  };
  const muniFor = (e: string) => pick(r, municipios[e] ?? ["Centro"]);

  const ageAround = () => Math.max(15, Math.round(ageMean + (r() * 2 - 1) * ageStd * 1.5));

  // ---- PLANTED TRUE MATCHES ----
  const nTrue = opts.nTrueMatches ?? 10;
  for (let i = 0; i < nTrue; i++) {
    const estado = sampleDist(r, stateDist);
    const sex: "M" | "F" = sampleDist(r, sexDist) === "HOMBRE" ? "M" : "F";
    const age = ageAround();
    const height = rint(r, 155, 185);
    const cfs = [makeFeature(r), ...(r() < 0.4 ? [makeFeature(r)] : [])];
    const evDate = isoDate(2022 + Math.floor(r() * 4), r);
    const foundDate = isoAfter(evDate, rint(r, 10, 120));
    const personId = `person-${i}`;

    // missing ficha (verbose)
    const mRec = rec("missing", pick(r, [sources[0], sources[1], sources[3]]), estado, muniFor(estado), sex, age, height, evDate,
      cfs.map(cf => phraseFicha(r, cf)).join("; "));
    records.push(mRec);
    for (const cf of cfs) features.push(featOf(r, mRec.id, cf, "ficha"));

    // unidentified cuerpo (terse, same person, ±2cm height, age band coherent)
    const uRec = rec("unidentified", pick(r, [sources[2], sources[1]]), estado, muniFor(estado), sex,
      age + (r() < 0.5 ? 0 : r() < 0.5 ? -1 : 1), height + pick(r, [-2, 0, 2]), foundDate,
      cfs.map(cf => phraseCuerpo(r, cf)).join("; "));
    records.push(uRec);
    for (const cf of cfs) features.push(featOf(r, uRec.id, cf, "cuerpo"));

    trueMatches.push({ missing: mRec.id, unidentified: uRec.id, person: personId });
  }

  // ---- PLANTED NEAR-MISSES (must be REJECTED) ----
  const nNear = opts.nNearMisses ?? 3;
  for (let i = 0; i < nNear; i++) {
    const estado = sampleDist(r, stateDist);
    const sex: "M" | "F" = sampleDist(r, sexDist) === "HOMBRE" ? "M" : "F";
    const age = ageAround();
    const height = rint(r, 155, 185);
    const cfs = [makeFeature(r)];
    const evDate = isoDate(2022 + Math.floor(r() * 4), r);
    const foundDate = isoAfter(evDate, rint(r, 10, 120));

    const reason = pick(r, ["laterality_flipped", "age_off_20"]);
    const ageShift = reason === "age_off_20" ? (r() < 0.5 ? -20 : 20) : 0;

    const mRec = rec("missing", sources[0], estado, muniFor(estado), sex, age, height, evDate,
      cfs.map(cf => phraseFicha(r, cf)).join("; "));
    records.push(mRec);
    for (const cf of cfs) features.push(featOf(r, mRec.id, cf, "ficha"));

    const uRec = rec("unidentified", sources[2], estado, muniFor(estado), sex, age + ageShift, height, foundDate,
      cfs.map(cf => phraseCuerpo(r, cf, reason === "laterality_flipped")).join("; "));
    records.push(uRec);
    for (const cf of cfs) features.push(featOf(r, uRec.id, cf, "cuerpo", reason === "laterality_flipped"));

    nearMisses.push({ missing: mRec.id, unidentified: uRec.id, reason });
  }

  // ---- FILLER records (no planted pair) ----
  const nFillMissing = (opts.nMissing ?? 100) - nTrue - nNear;
  for (let i = 0; i < nFillMissing; i++) {
    const estado = sampleDist(r, stateDist);
    const cfs = [makeFeature(r)];
    const mRec = rec("missing", pick(r, sources), estado, muniFor(estado),
      sampleDist(r, sexDist) === "HOMBRE" ? "M" : "F", ageAround(), rint(r, 155, 185),
      isoDate(2020 + Math.floor(r() * 6), r), cfs.map(cf => phraseFicha(r, cf)).join("; "));
    records.push(mRec);
    for (const cf of cfs) features.push(featOf(r, mRec.id, cf, "ficha"));
  }
  const nFillUnk = (opts.nUnidentified ?? 100) - nTrue - nNear;
  for (let i = 0; i < nFillUnk; i++) {
    const estado = sampleDist(r, stateDist);
    const cfs = [makeFeature(r)];
    const uRec = rec("unidentified", pick(r, [sources[2], sources[1], sources[4]]), estado, muniFor(estado),
      sampleDist(r, sexDist) === "HOMBRE" ? "M" : "F", ageAround(), rint(r, 155, 185),
      isoDate(2021 + Math.floor(r() * 5), r), cfs.map(cf => phraseCuerpo(r, cf)).join("; "));
    records.push(uRec);
    for (const cf of cfs) features.push(featOf(r, uRec.id, cf, "cuerpo"));
  }

  return { sources, records, features, answerKey: { trueMatches, nearMisses } };
}

// ---- helpers ----
function src(id: string, name: string, kind: string, tier: TrustTier): Source {
  return { id, name, kind, trust_tier: tier, created_at: now() };
}
function rec(rt: "missing" | "unidentified", s: Source, estado: string, mun: string, sex: "M" | "F", age: number, h: number, date: string, desc: string): HiloRecord {
  return {
    id: randomUUID(), source_id: s.id, record_type: rt, sex, age_min: age - 2, age_max: age + 2,
    height_cm: h, estado, municipio: mun, event_date: date, raw_description: desc,
    pii_minimized: true, synthetic: true, created_at: now(),
  };
}
function featOf(r: RNG, recordId: string, cf: CanonicalFeature, phrasing: "ficha" | "cuerpo", flip = false): Feature {
  // when flip is true, the body record genuinely has the OPPOSITE laterality —
  // this must be reflected in the structured field + tokens (not just the text),
  // otherwise the scorer cannot detect the contradiction. This is the near-miss trap.
  const effLat: Laterality = flip
    ? (cf.laterality === "izquierda" ? "derecha" : cf.laterality === "derecha" ? "izquierda" : cf.laterality)
    : cf.laterality;
  const effCf: CanonicalFeature = flip ? { ...cf, laterality: effLat } : cf;
  const tokens = tokenize(`${effCf.label} ${effCf.region} ${effLat} ${effCf.motif} ${effCf.feature_type}`);
  return {
    id: randomUUID(), record_id: recordId, feature_type: effCf.feature_type, body_region: effCf.region,
    laterality: effLat, motif_category: effCf.motif,
    description_raw: phrasing === "ficha" ? phraseFicha(r, effCf) : phraseCuerpo(r, effCf),
    tokens, created_at: now(),
  };
}
export function tokenize(s: string): string[] {
  const stop = new Set(["de", "en", "el", "la", "los", "las", "del", "con", "y", "a", "un", "una"]);
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ ]/g, " ").split(/\s+/).filter(w => w.length > 1 && !stop.has(w));
}
function now() { return new Date().toISOString(); }
function isoDate(year: number, r: RNG): string {
  const m = 1 + Math.floor(r() * 12), d = 1 + Math.floor(r() * 28);
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function isoAfter(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
