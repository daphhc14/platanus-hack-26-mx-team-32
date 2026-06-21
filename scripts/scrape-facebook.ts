#!/usr/bin/env node
import { config } from "dotenv";
config({ path: ".env.local" });
import { scrapeAndSeedFacebookPatterns } from "../lib/facebook-scraper.js";

async function main() {
  console.log("Starting Facebook pattern scraper...");
  console.log("Target: Supabase facebook_patterns table");

  const summary = await scrapeAndSeedFacebookPatterns();

  console.log("\n=== Scrape Summary ===");
  console.log(`Total posts seen: ${summary.totalPostsSeen}`);
  console.log(`Inserted: ${summary.inserted}`);
  console.log(`Skipped: ${summary.skipped}`);
  console.log(`Failed: ${summary.failed}`);

  if (summary.errors.length > 0) {
    console.log("\nErrors:");
    summary.errors.forEach((err) => console.log(`  - ${err}`));
  }

  process.exit(summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
