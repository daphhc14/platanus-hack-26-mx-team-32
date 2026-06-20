// scripts/seed.ts — Seed the DB with synthetic individuals (calibrated to real RNPDNO
// distributions) + REAL clandestine-grave sites into secure_locations, and write the
// answer-key so we can verify the matcher finds the planted matches and rejects near-misses.

import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HiloDB } from "../lib/db.js";
import { generateSeed } from "../lib/seedgen.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "..", "hilo.db");
const GEN = join(__dirname, "..", "data", "generated");

async function main() {
  const db = new HiloDB(DB_PATH, "admin").init();

  // wipe for re-seed
  (db as any).exec?.("");
  const raw = (db as any).db as import("better-sqlite3").Database;
  for (const t of ["reviews","candidate_matches","features","records","audit_log","secure_locations","tips","app_users","sources"]) {
    raw.prepare(`DELETE FROM ${t}`).run();
  }

  const seed = generateSeed({ rngSeed: 424242, nMissing: 100, nUnidentified: 100, nTrueMatches: 10, nNearMisses: 3 });

  for (const s of seed.sources) db.insertSource(s);
  for (const r of seed.records) db.insertRecord(r);
  for (const f of seed.features) db.insertFeature(f);

  // ---- REAL fosas -> secure_locations (role-gated, RBAC-protected) ----
  const fosas = JSON.parse(readFileSync(join(GEN, "fosas.geojson"), "utf-8"));
  let loaded = 0;
  for (const ft of fosas.features) {
    const [lng, lat] = ft.geometry.coordinates;
    db.insertSecureLocation({
      id: randomUUID(), kind: "reporte_fosa", estado: ft.properties.estado,
      municipio: ft.properties.municipio, lat, lng, fosas: ft.properties.fosas, cuerpos: ft.properties.cuerpos_osamentas ?? ft.properties.cuerpos,
    });
    loaded++;
  }

  // ---- users ----
  db.insertUser({ id: randomUUID(), pseudonym: "reviewer-luna", role: "reviewer" });
  db.insertUser({ id: randomUUID(), pseudonym: "enlace-veta", role: "liaison" });
  db.insertUser({ id: randomUUID(), pseudonym: "publico", role: "readonly" });

  // ---- answer key ----
  writeFileSync(join(GEN, "answer-key.json"), JSON.stringify(seed.answerKey, null, 2));

  const miss = seed.records.filter(r => r.record_type === "missing").length;
  const unk = seed.records.filter(r => r.record_type === "unidentified").length;
  console.log(`✓ Seeded ${seed.sources.length} sources, ${miss} missing, ${unk} unidentified, ${seed.features.length} features`);
  console.log(`✓ Planted ${seed.answerKey.trueMatches.length} TRUE matches + ${seed.answerKey.nearMisses.length} NEAR-MISSES (must reject)`);
  console.log(`✓ Loaded ${loaded} REAL clandestine-grave sites (Quinto Elemento / CNB) into secure_locations`);
  console.log(`✓ Answer key written to data/generated/answer-key.json`);
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
