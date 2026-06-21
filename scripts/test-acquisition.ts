import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { HiloDB } from "../lib/db.js";
import {
  AcquisitionRepository,
  MockAcquisitionProvider,
  acquisitionIdempotencyKey,
  evaluateSourcePolicy,
} from "../lib/acquisition/index.js";

const now = "2026-06-21T00:00:00.000Z";
const expires = "2026-07-21T00:00:00.000Z";

const db = new HiloDB(":memory:", "admin").init();
const raw = (db as any).db as Database.Database;
const acquisition = new AcquisitionRepository(raw);
const provider = new MockAcquisitionProvider({
  "https://example.test/ficha": {
    title: "Oferta sospechosa demo",
    markdown: "Trabajo de seguridad privada, sueldo alto, traslado inmediato, contacto por chat.",
  },
});

db.insertSource({
  id: "src-cnb-demo",
  name: "CNB demo",
  kind: "registro_oficial",
  trust_tier: "oficial",
  notes: "source used by acquisition smoke test",
});

acquisition.insertSourcePermission({
  id: "perm-cnb-demo",
  source_id: "src-cnb-demo",
  policy_version: "source-policy-v1",
  access_type: "official_public",
  allowed_actions: ["search", "scrape", "monitor"],
  legal_basis: "official_public_source",
  pii_allowed: false,
  raw_retention_days: 30,
  requires_human_approval: true,
  effective_from: now,
});

const policy = evaluateSourcePolicy({
  access_type: "official_public",
  mode: "scrape",
  allowed_actions: ["search", "scrape", "monitor"],
  legal_basis: "official_public_source",
});
assert.equal(policy.allowed, true);
assert.equal(policy.privacy_level, "internal");

const denied = evaluateSourcePolicy({
  access_type: "unknown",
  mode: "scrape",
  allowed_actions: ["discovery_search"],
});
assert.equal(denied.allowed, false);

const runId = randomUUID();
const searchResults = await provider.search({ run_id: runId, query: "seguridad privada", limit: 5 });
assert.equal(searchResults.length, 1);
assert.equal(searchResults[0].url, "https://example.test/ficha");

const scraped = await provider.scrape({
  run_id: runId,
  url: "https://example.test/ficha",
  formats: ["markdown"],
});
assert.equal(scraped.url, "https://example.test/ficha");
assert.ok(scraped.content_hash.length > 20);

acquisition.createRun({
  id: runId,
  idempotency_key: acquisitionIdempotencyKey({
    provider: "mock",
    mode: "scrape",
    source_id: "src-cnb-demo",
    seed_url: "https://example.test/ficha",
  }),
  source_id: "src-cnb-demo",
  source_permission_id: "perm-cnb-demo",
  provider: "mock",
  mode: "scrape",
  status: "queued",
  seed_url: "https://example.test/ficha",
  policy_snapshot: policy,
});

const artifactId = randomUUID();
acquisition.insertRawArtifact({
  id: artifactId,
  run_id: runId,
  source_id: "src-cnb-demo",
  source_permission_id: "perm-cnb-demo",
  url: "https://example.test/ficha",
  content_hash: scraped.content_hash,
  content_type: "text/markdown",
  title: scraped.title,
  fetched_at: scraped.fetched_at,
  expires_at: expires,
  provider_metadata: scraped.metadata,
  redaction_status: "not_required",
  privacy_level: policy.privacy_level,
});

acquisition.createExtractionJob({
  id: randomUUID(),
  raw_artifact_id: artifactId,
  extractor_name: "mock-social-event",
  extractor_version: "v1",
  schema_name: "hilo.social_risk_event.v1",
  status: "succeeded",
  confidence: 0.91,
  output: { event_type: "oferta_laboral_sospechosa" },
  finished_at: now,
});

acquisition.insertSocialRiskEvent({
  id: randomUUID(),
  source_id: "src-cnb-demo",
  raw_artifact_id: artifactId,
  event_type: "oferta_laboral_sospechosa",
  mechanism_type: "reclutamiento",
  estado: "Jalisco",
  municipio: "Guadalajara",
  reported_at: now,
  confidence: 0.91,
  severity: 4,
  privacy_level: "restricted",
  review_status: "pending",
  summary_public: "Patron contextual pendiente de revision",
  evidence: { signals: ["salary_above_market", "remote_contact"] },
});

const events = acquisition.listSocialRiskEvents();
assert.equal(events.length, 1);
assert.equal(events[0].event_type, "oferta_laboral_sospechosa");
assert.deepEqual(events[0].evidence, { signals: ["salary_above_market", "remote_contact"] });

db.close();
console.log("✓ acquisition smoke test passed");
