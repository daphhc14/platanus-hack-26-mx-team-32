// scripts/test-embed.ts — Verifica los dos tipos de embeddings:
//  A) IMAGE embeddings (Gemini multimodal) — para fotos recientes (caso Ámber/reencuentro).
//  B) STRUCTURED-feature vectors sobre RNPDNO REAL — clustering dedup + firma de reclutamiento.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { embedImage, cosine } from "../lib/embed/image.js";
import { loadRNPDNO, buildIndex, clusterDuplicates, clusterRecruitment } from "../lib/embed/embed.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const C = { g: "\x1b[32m", y: "\x1b[33m", c: "\x1b[36m", d: "\x1b[2m", r: "\x1b[0m", b: "\x1b[1m" };

async function main() {
  console.log(`${C.b}${C.c}A) IMAGE EMBEDDINGS (Gemini multimodal)${C.r} — fotos recientes, NO cuerpos`);
  const imgs = ["a_red.png", "b_blue.png", "c_red.png"].map(n => join(ROOT, "data", "raw", "test-imgs", n));
  try {
    const vecs: Record<string, number[]> = {};
    for (const p of imgs) {
      const buf = readFileSync(p);
      const b64 = buf.toString("base64");
      const v = await embedImage(b64, "image/png");
      vecs[p.split("/").pop()!] = v;
      console.log(`  ${C.d}embed${C.r} ${p.split("/").pop()} → ${v.length} dims`);
    }
    const names = Object.keys(vecs);
    const same = cosine(vecs["a_red.png"], vecs["c_red.png"]);
    const diff = cosine(vecs["a_red.png"], vecs["b_blue.png"]);
    const self = cosine(vecs["a_red.png"], vecs["a_red.png"]);
    console.log(`  ${C.g}cos(a_red, a_red)  = ${self.toFixed(4)}  (debe ser ~1.0)${C.r}`);
    console.log(`  ${C.g}cos(a_red, c_red)  = ${same.toFixed(4)}  (misma imagen, debe ser ~1.0)${C.r}`);
    console.log(`  ${C.y}cos(a_red, b_blue) = ${diff.toFixed(4)}  (distinta, debe ser <1)${C.r}`);
    if (self > 0.99 && same > 0.99 && diff < 0.99) console.log(`  ${C.g}✓ image embeddings funcionan — mismo→1, distinto→<1${C.r}`);
    else console.log(`  ${C.y}⚠ comportamiento inesperado — revisa modelo/key${C.r}`);
  } catch (e) {
    console.log(`  ${C.y}⚠ image embed omitido: ${(e as Error).message}${C.r}`);
  }

  console.log(`\n${C.b}${C.c}B) STRUCTURED-FEATURE VECTORS sobre RNPDNO REAL${C.r} (sin API)`);
  console.log(`${C.d}  cargando muestra real del RNPDNO...${C.r}`);
  const recs = loadRNPDNO(15000);
  console.log(`  ${recs.length.toLocaleString()} registros cargados`);
  const idx = buildIndex(recs);
  console.log(`${C.d}  indexados ${idx.length} vectores de ${idx[0].v.length} dims${C.r}`);

  const dedup = clusterDuplicates(idx, 0.97, 2);
  console.log(`  ${C.g}DEDUP (misma persona, ≥1 reporte institucional):${C.r} ${dedup.length} clusters de ≥2 registros`);
  if (dedup[0]) {
    const c0 = dedup[0];
    console.log(`    ej: ${c0.records.length} reportes en ${c0.records[0].municipio}, ${c0.records[0].entidad} · sim ${c0.sim.toFixed(3)}`);
    console.log(`    ${C.d}fuentes: ${[...new Set(c0.records.map(r => r.origen.slice(0, 30)))].join(" | ")}${C.r}`);
  }

  const recruit = clusterRecruitment(idx, 3);
  console.log(`  ${C.y}FIRMA DE RECLUTAMIENTO (jóvenes 18-29, mismo municipio, ≤6 meses):${C.r} ${recruit.length} clusters de ≥3`);
  const top3 = recruit.slice(0, 3);
  for (const c of top3) {
    const r0 = c.records[0];
    const dates = c.records.map(r => r.fechaDesaparicion?.slice(0, 7)).filter(Boolean);
    console.log(`    ej: ${c.records.length} jóvenes · ${r0.municipio}, ${r0.entidad} · ${dates[0]}→${dates[dates.length - 1]} · sexo: ${[...new Set(c.records.map(r => r.sexo))].join("/")}`);
  }
  console.log(`\n${C.b}Listo.${C.r} Image embeddings = reencuentro (fotos recientes); structured vectors = linkage/agregados sobre data real.`);
}

main().catch(e => { console.error(e); process.exit(1); });
