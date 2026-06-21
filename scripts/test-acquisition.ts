import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { HiloDB } from "../lib/db.js";
import {
  AcquisitionRepository,
  MockAcquisitionProvider,
  acquisitionIdempotencyKey,
  evaluateSourcePolicy,
  extractFromArtifact,
  kAnonymityCheck,
  redactPii,
  validateCopySafety,
} from "../lib/acquisition/index.js";

const now = "2026-06-21T00:00:00.000Z";
const expires = "2026-07-21T00:00:00.000Z";

const db = new HiloDB(":memory:", "admin").init();
const raw = (db as any).db as Database.Database;
const acquisition = new AcquisitionRepository(raw);
const provider = new MockAcquisitionProvider({
  "https://example.test/oferta": {
    title: "Oferta sospechosa demo",
    markdown: "Vacante de guardia de seguridad. Contratacion inmediata sin experiencia. Sueldo $18000 semanal. Te mandamos Uber para entrevista en central de autobuses. Contacto por WhatsApp.",
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
const searchResults = await provider.search({ run_id: runId, query: "guardia de seguridad", limit: 5 });
assert.equal(searchResults.length, 1);
assert.equal(searchResults[0].url, "https://example.test/oferta");

const scraped = await provider.scrape({
  run_id: runId,
  url: "https://example.test/oferta",
  formats: ["markdown"],
});
assert.equal(scraped.url, "https://example.test/oferta");
assert.ok(scraped.content_hash.length > 20);
const fakeJobExtraction = await extractFromArtifact(scraped, "hilo.fake_job_offer.v1");
assert.equal(fakeJobExtraction.extractor_name, "deterministic-fallback");
assert.equal(fakeJobExtraction.output.is_job_offer, true);
assert.equal(fakeJobExtraction.output.privacy_level, "restricted");

const socialExtraction = await extractFromArtifact(scraped, "hilo.social_risk_event.v1");
assert.equal(socialExtraction.output.event_type, "oferta_laboral_sospechosa");

acquisition.createRun({
  id: runId,
  idempotency_key: acquisitionIdempotencyKey({
    provider: "mock",
    mode: "scrape",
    source_id: "src-cnb-demo",
    seed_url: "https://example.test/oferta",
  }),
  source_id: "src-cnb-demo",
  source_permission_id: "perm-cnb-demo",
  provider: "mock",
  mode: "scrape",
  status: "queued",
  seed_url: "https://example.test/oferta",
  policy_snapshot: policy,
});

const artifactId = randomUUID();
acquisition.insertRawArtifact({
  id: artifactId,
  run_id: runId,
  source_id: "src-cnb-demo",
  source_permission_id: "perm-cnb-demo",
  url: "https://example.test/oferta",
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
  extractor_name: fakeJobExtraction.extractor_name,
  extractor_version: fakeJobExtraction.extractor_version,
  schema_name: fakeJobExtraction.schema_name,
  status: "succeeded",
  confidence: fakeJobExtraction.confidence,
  output: fakeJobExtraction.output,
  finished_at: now,
});

const socialOutput = socialExtraction.output as any;
acquisition.insertSocialRiskEvent({
  id: randomUUID(),
  source_id: "src-cnb-demo",
  raw_artifact_id: artifactId,
  event_type: socialOutput.event_type,
  mechanism_type: "reclutamiento",
  estado: socialOutput.estado,
  municipio: socialOutput.municipio,
  reported_at: now,
  confidence: socialExtraction.confidence,
  severity: 4,
  privacy_level: socialOutput.privacy_level,
  review_status: "pending",
  summary_public: socialOutput.summary,
  evidence: { validator: socialExtraction.validator },
});

const events = acquisition.listSocialRiskEvents();
assert.equal(events.length, 1);
assert.equal(events[0].event_type, "oferta_laboral_sospechosa");
assert.deepEqual(events[0].evidence, { validator: socialExtraction.validator });

// ---------------------------------------------------------------------------
// Lineage: a second artifact corroborates the same event via lineage table.
// ---------------------------------------------------------------------------

const secondaryArtifactId = randomUUID();
acquisition.insertRawArtifact({
  id: secondaryArtifactId,
  run_id: runId,
  source_id: "src-cnb-demo",
  source_permission_id: "perm-cnb-demo",
  url: "https://example.test/oferta-copia",
  content_hash: randomUUID(),
  content_type: "text/markdown",
  title: "Copia secundaria de la oferta",
  fetched_at: scraped.fetched_at,
  expires_at: expires,
  redaction_status: "not_required",
  privacy_level: policy.privacy_level,
});

const primaryEventId = events[0].id;
acquisition.attachEventLineage({
  id: randomUUID(),
  event_id: primaryEventId,
  raw_artifact_id: secondaryArtifactId,
  role: "duplicate",
});

const lineage = acquisition.listEventLineage(primaryEventId);
assert.equal(lineage.length, 1);
assert.equal(lineage[0].raw_artifact_id, secondaryArtifactId);
assert.equal(lineage[0].role, "duplicate");

// Attach lineage twice (idempotent update of role).
acquisition.attachEventLineage({
  id: randomUUID(),
  event_id: primaryEventId,
  raw_artifact_id: secondaryArtifactId,
  role: "supporting",
});
const lineageAfterUpdate = acquisition.listEventLineage(primaryEventId);
assert.equal(lineageAfterUpdate.length, 1, "lineage row should not duplicate");
assert.equal(lineageAfterUpdate[0].role, "supporting", "role should be upserted");

// ---------------------------------------------------------------------------
// Consent revocation: should purge both artifacts and hide the event
// (primary via raw_artifact_id, secondary via lineage).
// ---------------------------------------------------------------------------

const consentId = "consent-demo";
acquisition.insertConsent({
  id: consentId,
  source_id: "src-cnb-demo",
  granted_by_role: "family_member",
  scope: { artifact_ids: [artifactId, secondaryArtifactId] },
  legal_basis: "family_consent_demo",
  privacy_notice_version: "v1",
  granted_at: now,
  expires_at: expires,
});

// Re-link both artifacts to the consent so revocation has targets.
raw.prepare("UPDATE raw_artifacts SET consent_id = ? WHERE id IN (?, ?)").run(
  consentId,
  artifactId,
  secondaryArtifactId,
);

const propagation = acquisition.propagateConsentRevocation(consentId, {
  revoked_at: now,
  reason: "family_withdrawal",
});

assert.equal(propagation.artifacts_purged, 2, "both artifacts should be purged");
assert.equal(propagation.extraction_jobs_affected, 1, "the one extraction job should fail");
assert.equal(propagation.events_hidden, 1, "the event should be hidden via direct OR lineage link");
assert.deepEqual(propagation.event_ids_hidden, [primaryEventId]);

const eventsAfter = acquisition.listSocialRiskEvents();
assert.equal(eventsAfter[0].review_status, "hidden");

const purgedRows = raw.prepare(
  "SELECT COUNT(*) AS n FROM raw_artifacts WHERE consent_id = ? AND purged_at IS NOT NULL",
).get(consentId) as { n: number };
assert.equal(purgedRows.n, 2);

const revokedConsent = raw.prepare("SELECT revoked_at, revocation_reason FROM consents WHERE id = ?").get(consentId) as {
  revoked_at: string;
  revocation_reason: string;
};
assert.equal(revokedConsent.revoked_at, now);
assert.equal(revokedConsent.revocation_reason, "family_withdrawal");

// Idempotency: a second call must not re-affect rows.
const secondCall = acquisition.propagateConsentRevocation(consentId, { revoked_at: now });
assert.equal(secondCall.artifacts_purged, 0, "no new artifacts to purge on second call");
assert.equal(secondCall.events_hidden, 0, "no new events to hide on second call");

// ---------------------------------------------------------------------------
// Safety helpers: k-anonymity, copy-safe text and redaction (spec 05).
// ---------------------------------------------------------------------------

const tooSmall = kAnonymityCheck(3, 5);
assert.equal(tooSmall.ok, false);
assert.equal(tooSmall.k, 5);

const ok = kAnonymityCheck(7, 5);
assert.equal(ok.ok, true);

const defaultK = kAnonymityCheck(4);
assert.equal(defaultK.ok, false, "default k=5 should reject count 4");

const unsafeCopy = validateCopySafety("Este caso est\u00e1 conectado y confirmado por IA.");
assert.equal(unsafeCopy.ok, false);
assert.ok(unsafeCopy.forbidden_hits.length >= 2);

const safeCopy = validateCopySafety("Posible patr\u00f3n. Se\u00f1al contextual pendiente de revisi\u00f3n.");
assert.equal(safeCopy.ok, true);
assert.equal(safeCopy.uses_recommended, true);

const redaction = redactPii("Llamar al 5551234567 o escribir a reclutador@demo.test");
assert.equal(redaction.phone_count, 1);
assert.equal(redaction.email_count, 1);
assert.equal(redaction.total_redacted, 2);
assert.ok(redaction.redacted_text.includes("[telefono_redactado]"));
assert.ok(redaction.redacted_text.includes("[email_redactado]"));

db.close();
console.log("\u2713 acquisition smoke test passed");
