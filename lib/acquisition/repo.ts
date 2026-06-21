import type Database from "better-sqlite3";
import type {
  AcquisitionRun,
  Consent,
  ExtractionJob,
  RawArtifact,
  SocialRiskEvent,
  SourcePermission,
} from "./types.js";

type NewSourcePermission = Omit<SourcePermission, "created_at" | "updated_at">;
type NewConsent = Omit<Consent, "created_at" | "updated_at">;
type NewAcquisitionRun = Omit<AcquisitionRun, "created_at" | "updated_at">;
type NewRawArtifact = Omit<RawArtifact, "created_at" | "updated_at">;
type NewExtractionJob = Omit<ExtractionJob, "created_at" | "updated_at">;
type NewSocialRiskEvent = Omit<SocialRiskEvent, "created_at" | "updated_at">;

export class AcquisitionRepository {
  constructor(private db: Database.Database) {}

  insertSourcePermission(input: NewSourcePermission): void {
    this.db.prepare(`INSERT INTO source_permissions
      (id, source_id, policy_version, access_type, allowed_actions_json, legal_basis, terms_basis,
       pii_allowed, raw_retention_days, requires_human_approval, policy_notes, effective_from, effective_to)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      input.id,
      input.source_id,
      input.policy_version,
      input.access_type,
      JSON.stringify(input.allowed_actions),
      input.legal_basis,
      input.terms_basis ?? null,
      input.pii_allowed ? 1 : 0,
      input.raw_retention_days,
      input.requires_human_approval ? 1 : 0,
      input.policy_notes ?? null,
      input.effective_from,
      input.effective_to ?? null,
    );
  }

  insertConsent(input: NewConsent): void {
    this.db.prepare(`INSERT INTO consents
      (id, source_id, granted_by_role, scope_json, legal_basis, privacy_notice_version,
       granted_at, expires_at, revoked_at, revocation_reason, evidence_uri)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      input.id,
      input.source_id ?? null,
      input.granted_by_role,
      JSON.stringify(input.scope),
      input.legal_basis,
      input.privacy_notice_version ?? null,
      input.granted_at,
      input.expires_at ?? null,
      input.revoked_at ?? null,
      input.revocation_reason ?? null,
      input.evidence_uri ?? null,
    );
  }

  createRun(input: NewAcquisitionRun): void {
    this.db.prepare(`INSERT INTO acquisition_runs
      (id, idempotency_key, source_id, source_permission_id, provider, mode, status,
       seed_query, seed_url, policy_snapshot_json, started_at, finished_at, error)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      input.id,
      input.idempotency_key,
      input.source_id ?? null,
      input.source_permission_id ?? null,
      input.provider,
      input.mode,
      input.status,
      input.seed_query ?? null,
      input.seed_url ?? null,
      JSON.stringify(input.policy_snapshot),
      input.started_at ?? null,
      input.finished_at ?? null,
      input.error ?? null,
    );
  }

  insertRawArtifact(input: NewRawArtifact): void {
    this.db.prepare(`INSERT INTO raw_artifacts
      (id, run_id, source_id, source_permission_id, consent_id, url, content_hash, storage_uri,
       content_type, title, fetched_at, expires_at, purged_at, provider_metadata_json,
       redaction_status, privacy_level)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      input.id,
      input.run_id,
      input.source_id ?? null,
      input.source_permission_id ?? null,
      input.consent_id ?? null,
      input.url ?? null,
      input.content_hash,
      input.storage_uri ?? null,
      input.content_type ?? null,
      input.title ?? null,
      input.fetched_at,
      input.expires_at,
      input.purged_at ?? null,
      input.provider_metadata ? JSON.stringify(input.provider_metadata) : null,
      input.redaction_status,
      input.privacy_level,
    );
  }

  createExtractionJob(input: NewExtractionJob): void {
    this.db.prepare(`INSERT INTO extraction_jobs
      (id, raw_artifact_id, extractor_name, extractor_version, schema_name, status,
       confidence, output_json, error, finished_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      input.id,
      input.raw_artifact_id,
      input.extractor_name,
      input.extractor_version,
      input.schema_name,
      input.status,
      input.confidence ?? null,
      input.output ? JSON.stringify(input.output) : null,
      input.error ?? null,
      input.finished_at ?? null,
    );
  }

  insertSocialRiskEvent(input: NewSocialRiskEvent): void {
    this.db.prepare(`INSERT INTO social_risk_events
      (id, source_id, raw_artifact_id, event_type, mechanism_type, estado, municipio,
       locality_approx, occurred_at, reported_at, confidence, severity, privacy_level,
       review_status, summary_public, evidence_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      input.id,
      input.source_id ?? null,
      input.raw_artifact_id ?? null,
      input.event_type,
      input.mechanism_type ?? null,
      input.estado ?? null,
      input.municipio ?? null,
      input.locality_approx ?? null,
      input.occurred_at ?? null,
      input.reported_at ?? null,
      input.confidence,
      input.severity,
      input.privacy_level,
      input.review_status,
      input.summary_public ?? null,
      input.evidence ? JSON.stringify(input.evidence) : null,
    );
  }

  listSocialRiskEvents(): SocialRiskEvent[] {
    const rows = this.db.prepare("SELECT * FROM social_risk_events ORDER BY created_at DESC").all() as any[];
    return rows.map(normalizeRiskEvent);
  }
}

function normalizeRiskEvent(row: any): SocialRiskEvent {
  return {
    ...row,
    evidence: row.evidence_json ? JSON.parse(row.evidence_json) : undefined,
  };
}

