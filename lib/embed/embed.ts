// lib/embed/embed.ts — Vectorización de registros REALES del RNPDNO para
// similitud / clustering / resolución de entidades. SIN API, SIN modelo:
// los datos son estructurados (edad, sexo, estado, municipio, fecha), así que
// un vector de features denso + hashing trick es más apropiado que un embedding
// de texto. Habilita dos usos reales sobre los 133K registros:
//   1) DEDUP / entity resolution: mismo individuo reportado por varias instituciones
//      (edad+sexo+municipio+fecha casi idénticos → similitud ~1.0).
//   2) CLUSTERING de firma: grupos de desapariciones con perfil similar
//      (jóvenes, mismo municipio, ventana corta) → posible evento de reclutamiento.
// Pluggable: si aparece una API de embeddings de texto (MiniMax/OpenAI), se puede
// añadir una capa semántica sobre las señas — ver embedText().

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface RNPDNORecord {
  id: string;
  sexo: string;          // HOMBRE | MUJER | INDETERMINADO
  edad?: number;         // computed at disappearance
  entidad: string;
  municipio: string;
  cveEnt: string;
  fechaDesaparicion?: string; // ISO
  year?: number;
  month?: number;
  origen: string;
}

// Vector layout:
//  [0]   edad normalizada
//  [1-3] sexo one-hot (hombre, mujer, indeterminado)
//  [4]   año normalizado (1964..2026)
//  [5-6] mes cíclico (sin, cos)
//  [7..38]  estado por hashing (32 dims con signo)  — mismo estado ⇒ solape positivo
//  [39..102] municipio por hashing (64 dims con signo)
//  TOTAL = 103 dims
const VEC_DIM = 103;

function hashSign(s: string, seed: number, mod: number): { bucket: number; sign: number } {
  // FNV-1a variante determinista
  let h = 2166136261 ^ seed;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const bucket = (h >>> 0) % mod;
  const sign = ((h >>> 1) & 1) ? 1 : -1;
  return { bucket, sign };
}

const NORM_AGE_MEAN = 31.9, NORM_AGE_STD = 14.5;

export function vectorize(r: RNPDNORecord): Float32Array {
  const v = new Float32Array(VEC_DIM);
  if (r.edad != null) v[0] = (r.edad - NORM_AGE_MEAN) / NORM_AGE_STD;
  // sex one-hot
  if (r.sexo === "HOMBRE") v[1] = 1; else if (r.sexo === "MUJER") v[2] = 1; else v[3] = 1;
  // time
  if (r.year != null) v[4] = (r.year - 1964) / (2026 - 1964);
  if (r.month != null) { v[5] = Math.sin(2 * Math.PI * r.month / 12); v[6] = Math.cos(2 * Math.PI * r.month / 12); }
  // estado hashing (offset 7, 32 dims)
  const e = hashSign("EST|" + (r.entidad || ""), 11, 32); v[7 + e.bucket] += e.sign;
  // municipio hashing (offset 39, 64 dims)
  const m = hashSign("MUN|" + (r.cveEnt || "") + "|" + (r.municipio || ""), 23, 64); v[39 + m.bucket] += m.sign;
  return v;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function normalize(v: Float32Array): Float32Array {
  let n = 0; for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n); if (n === 0) return v;
  const out = new Float32Array(v.length); for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

export interface IndexEntry { id: string; r: RNPDNORecord; v: Float32Array; vn: Float32Array; }

export function loadRNPDNO(limit?: number): RNPDNORecord[] {
  const path = join(__dirname, "..", "..", "data", "raw", "rnpdno_desaparecidos.csv");
  const text = readFileSync(path, "utf-8");
  const lines = text.split("\n");
  const header = lines[0].split(",");
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  const out: RNPDNORecord[] = [];
  const startYear = (y?: number) => (y != null && y >= 1964 && y <= 2026) ? y : undefined;
  for (let li = 1; li < lines.length && (!limit || out.length < limit); li++) {
    const line = lines[li]; if (!line.trim()) continue;
    // simple CSV split (no quoted commas with commas expected; RNPDNO fields are clean)
    const cols = line.split(",");
    const sexo = (cols[idx["SEXO"]] || "").trim();
    const ent = (cols[idx["ENTIDAD"]] || "").trim();
    const mun = (cols[idx["MUNICIPIO"]] || "").trim();
    const cveEnt = (cols[idx["CVE_ENT"]] || "").trim();
    const fb = (cols[idx["FECHA_NACIMIENTO"]] || "").trim().slice(0, 10);
    const fd = (cols[idx["FECHA_DESAPARICION"]] || "").trim();
    let edad: number | undefined, year: number | undefined, month: number | undefined;
    if (fb && fd && /^\d{4}-\d{2}-\d{2}$/.test(fb) && /^\d{4}-\d{2}-\d{2}/.test(fd)) {
      const db = new Date(fb), dd = new Date(fd.slice(0, 10));
      edad = dd.getFullYear() - db.getFullYear() - ((dd.getMonth() * 100 + dd.getDate()) < (db.getMonth() * 100 + db.getDate()) ? 1 : 0);
      if (edad < 0 || edad > 100) edad = undefined;
      year = startYear(dd.getFullYear());
      month = dd.getMonth() + 1;
    }
    out.push({ id: (cols[idx["ID_VICTIMA"]] || "").trim(), sexo, edad, entidad: ent, municipio: mun, cveEnt, fechaDesaparicion: fd.slice(0, 10), year, month, origen: (cols[idx["ORIGEN_REPORTE"]] || "").trim() });
  }
  return out;
}

export function buildIndex(records: RNPDNORecord[]): IndexEntry[] {
  return records.map(r => { const v = vectorize(r); return { id: r.id, r, v, vn: normalize(v) }; });
}

/** Top-k most similar records to a query (brute-force cosine on normalized vectors). */
export function topK(index: IndexEntry[], q: Float32Array, k: number, threshold = 0): { id: string; sim: number; r: RNPDNORecord }[] {
  const qn = normalize(q);
  const scored = index.map(e => ({ id: e.id, sim: cosine(qn, e.vn), r: e.r }));
  scored.sort((a, b) => b.sim - a.sim);
  return scored.slice(0, k).filter(s => s.sim >= threshold);
}

export interface Cluster { ids: string[]; sim: number; records: RNPDNORecord[]; }

/**
 * Greedy clustering: for each record, find others above `threshold` similarity
 * AND sharing the same municipio (identity blocking) → likely same person / linked.
 * Returns clusters of size >= minSize.
 */
export function clusterDuplicates(index: IndexEntry[], threshold = 0.97, minSize = 2): Cluster[] {
  const byMuni = new Map<string, IndexEntry[]>();
  for (const e of index) {
    const key = e.r.cveEnt + "|" + e.r.municipio;
    if (!byMuni.has(key)) byMuni.set(key, []);
    byMuni.get(key)!.push(e);
  }
  const clusters: Cluster[] = [];
  const seen = new Set<string>();
  for (const [, group] of byMuni) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      if (seen.has(group[i].id)) continue;
      const seed = group[i];
      const members: IndexEntry[] = [seed];
      for (let j = 0; j < group.length; j++) {
        if (i === j || seen.has(group[j].id)) continue;
        if (cosine(seed.vn, group[j].vn) >= threshold) members.push(group[j]);
      }
      if (members.length >= minSize) {
        members.forEach(m => seen.add(m.id));
        const sim = members.reduce((s, m, k) => k === 0 ? s : Math.min(s, cosine(seed.vn, m.vn)), 1);
        clusters.push({ ids: members.map(m => m.id), sim, records: members.map(m => m.r) });
      }
    }
  }
  return clusters.sort((a, b) => b.ids.length - a.ids.length);
}

/**
 * Recruitment-signature clusters: young adults (18-29), same municipio, within a
 * short window (±3 months), size >= minSize. These are candidate "linked events"
 * consistent with forced-recruitment campaigns (CRUCE/Iteso).
 */
export function clusterRecruitment(index: IndexEntry[], minSize = 3): Cluster[] {
  const byMuni = new Map<string, IndexEntry[]>();
  for (const e of index) {
    if (e.r.edad == null || e.r.edad < 18 || e.r.edad > 29) continue; // young adults
    if (!e.r.year) continue;
    const key = e.r.cveEnt + "|" + e.r.municipio;
    if (!byMuni.has(key)) byMuni.set(key, []);
    byMuni.get(key)!.push(e);
  }
  const clusters: Cluster[] = [];
  for (const [key, group] of byMuni) {
    if (group.length < minSize) continue;
    // window-based grouping: sort by date, slide a 6-month window
    const sorted = [...group].sort((a, b) => (a.r.fechaDesaparicion || "").localeCompare(b.r.fechaDesaparicion || ""));
    let i = 0;
    while (i < sorted.length) {
      const start = sorted[i].r;
      const win: IndexEntry[] = [];
      const startY = start.year!, startM = start.month || 6;
      for (let k = i; k < sorted.length; k++) {
        const rr = sorted[k].r;
        const dm = (rr.year! - startY) * 12 + ((rr.month || 6) - startM);
        if (dm <= 6 && dm >= 0) win.push(sorted[k]); else break;
      }
      if (win.length >= minSize) {
        clusters.push({
          ids: win.map(w => w.id),
          sim: 0, // not cosine; this is signature overlap
          records: win.map(w => w.r),
        });
        i += win.length;
      } else i++;
    }
    void key;
  }
  return clusters.sort((a, b) => b.ids.length - a.ids.length);
}

// ---- pluggable text embeddings (for señas) ----
// If a text-embedding API key is present, this embeds señas text to upgrade the
// lexical matching. No-op fallback when absent (matching stays lexical).
export async function embedText(_texts: string[]): Promise<number[][] | null> {
  const key = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || process.env.MINIMAX_API_KEY;
  if (!key) return null;
  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: key, baseURL: process.env.LLM_BASE_URL });
    const model = process.env.EMBED_MODEL || "text-embedding-3-small";
    const resp = await client.embeddings.create({ model, input: _texts });
    return resp.data.map(d => d.embedding);
  } catch {
    return null;
  }
}
