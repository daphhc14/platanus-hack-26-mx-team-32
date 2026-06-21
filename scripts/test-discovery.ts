// Local-only demo runner for the acquisition workflow.
// Not committed. Validates the discovery loop end-to-end with a synthetic
// CNB-style mock provider. Run with: npm run test:discovery

import { HiloDB } from "../lib/db.js";
import type Database from "better-sqlite3";
import { AcquisitionRepository } from "../lib/acquisition/repo.js";
import { createMockCNBProvider } from "../lib/acquisition/providers/mock-cnb.js";
import { AcquisitionWorkflow, type WorkflowEvent } from "../lib/acquisition/workflow.js";

const db = new HiloDB(":memory:", "admin").init();
const raw = (db as any).db as Database.Database;
const repo = new AcquisitionRepository(raw);
const provider = createMockCNBProvider();

db.insertSource({
  id: "src-cnb-mock",
  name: "CNB mock",
  kind: "registro_oficial",
  trust_tier: "oficial",
  notes: "[DEMO] mock CNB source for local discovery validation only",
});

repo.insertSourcePermission({
  id: "perm-cnb-mock",
  source_id: "src-cnb-mock",
  policy_version: "source-policy-v1",
  access_type: "official_public",
  allowed_actions: ["discovery_search", "search", "scrape", "monitor"],
  legal_basis: "official_public_source",
  pii_allowed: false,
  raw_retention_days: 30,
  requires_human_approval: true,
  effective_from: new Date().toISOString(),
});

const colors = {
  info: "\x1b[2m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  reset: "\x1b[0m",
};

const printer = (e: WorkflowEvent) => {
  const c = colors[e.level] ?? "";
  const data = e.data ? ` \x1b[2m${JSON.stringify(e.data)}\x1b[0m` : "";
  console.log(`${c}[${e.ts}] ${e.node.padEnd(20)}${colors.reset} ${e.message}${data}`);
};

const wf = new AcquisitionWorkflow(raw, repo, printer);

console.log("\n=== Run 1: discovery_search sobre contenido agregado ===\n");
const r1 = await wf.run({
  source_id: "src-cnb-mock",
  source_permission_id: "perm-cnb-mock",
  access_type: "official_public",
  mode: "discovery_search",
  seed_query: "Comision",
  allowed_actions: ["discovery_search", "search", "scrape", "monitor"],
  legal_basis: "official_public_source",
  provider,
});
console.log(`\n→ ${r1.status}: ${r1.artifacts.length} artifacts, ${r1.events_created.length} events`);

console.log("\n=== Run 2: policy block (private_denied) ===\n");
const r2 = await wf.run({
  source_id: "src-cnb-mock",
  source_permission_id: "perm-cnb-mock",
  access_type: "private_denied",
  mode: "scrape",
  allowed_actions: ["scrape"],
  provider,
});
console.log(`\n→ ${r2.status}: ${r2.error}`);

console.log("\n=== Run 3: direct scrape of suspicious offer ===\n");
const r3 = await wf.run({
  source_id: "src-cnb-mock",
  source_permission_id: "perm-cnb-mock",
  access_type: "official_public",
  mode: "scrape",
  seed_url: "https://cncb-demo.test/aviso/empleo-guadalajara",
  allowed_actions: ["discovery_search", "search", "scrape", "monitor"],
  legal_basis: "official_public_source",
  provider,
});
console.log(`\n→ ${r3.status}: ${r3.artifacts.length} artifacts, ${r3.events_created.length} events`);

console.log("\n=== Run 4: idempotency (repeat of Run 1) ===\n");
const r4 = await wf.run({
  source_id: "src-cnb-mock",
  source_permission_id: "perm-cnb-mock",
  access_type: "official_public",
  mode: "discovery_search",
  seed_query: "Comision",
  allowed_actions: ["discovery_search", "search", "scrape", "monitor"],
  legal_basis: "official_public_source",
  provider,
});
console.log(`\n→ ${r4.status}: ${r4.error ?? "no error"}`);

console.log("\n=== Eventos guardados en la DB ===\n");
const events = repo.listSocialRiskEvents();
for (const e of events) {
  const conf = typeof e.confidence === "number" ? e.confidence.toFixed(2) : "?";
  console.log(
    `  [${e.review_status.padEnd(8)}] ${e.event_type.padEnd(30)} sev=${e.severity} conf=${conf} | ${(e.summary_public ?? "").slice(0, 80)}`,
  );
}

console.log("\n=== Estado de runs ===\n");
const runs = raw
  .prepare("SELECT status, COUNT(*) as n FROM acquisition_runs GROUP BY status ORDER BY status")
  .all() as { status: string; n: number }[];
for (const r of runs) {
  console.log(`  ${r.status}: ${r.n}`);
}

db.close();
console.log("\n\u2713 discovery smoke test passed");
