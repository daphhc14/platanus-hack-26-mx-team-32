#!/usr/bin/env tsx
// scripts/seed-facebook-patterns.ts
// Scrapes the target Facebook group for scam-report posts, extracts patterns
// via LLM, and stores them in the facebook_patterns table.
//
// Usage:
//   npx tsx scripts/seed-facebook-patterns.ts
//
// Environment:
//   FB_C_USER, FB_XS     — Required. Facebook session cookies from DevTools.
//   FACEBOOK_GROUP_URL   — Optional. Defaults to the known scam-report group.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HiloDB } from "../lib/db.js";
import { scrapeGroupAndSeed } from "../lib/acquisition/providers/facebook.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "..", "hilo.db");

async function main() {
  const db = new HiloDB(DB_PATH, "admin").init();

  console.log("Scraping Facebook group...");
  const summary = await scrapeGroupAndSeed(db);

  console.log(`\nDone!`);
  console.log(`  Posts seen:    ${summary.totalPostsSeen}`);
  console.log(`  Inserted:      ${summary.inserted}`);
  console.log(`  Skipped:       ${summary.skipped}`);
  console.log(`  Failed:        ${summary.failed}`);

  if (summary.errors.length > 0) {
    console.log(`\nErrors (${summary.errors.length}):`);
    for (const err of summary.errors) {
      console.log(`  • ${err}`);
    }
  }

  db.close();
  process.exit(summary.failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
