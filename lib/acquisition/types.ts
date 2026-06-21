export type AccessType =
  | "official_public"
  | "public_web"
  | "authorized_group"
  | "submitted_by_family"
  | "submitted_by_partner"
  | "private_denied"
  | "unknown";

export type ProviderAction = "search" | "scrape" | "map" | "crawl" | "monitor";
export type AcquisitionRunMode = ProviderAction | "discovery_search" | "manual_import";
export type AcquisitionRunStatus = "queued" | "running" | "succeeded" | "failed" | "blocked_by_policy";
export type PrivacyLevel = "public_aggregate" | "internal" | "restricted";
export type RedactionStatus = "pending" | "not_required" | "applied" | "failed";
export type ConsentGrantRole = "family_member" | "collective_admin" | "partner_org" | "public_authority" | "unknown";
export type ExtractionJobStatus = "queued" | "running" | "succeeded" | "failed" | "needs_review";
export type ReviewStatus = "pending" | "approved" | "rejected" | "hidden";
export type SocialRiskEventType =
  | "oferta_laboral_sospechosa"
  | "secuestro_levanton"
  | "balacera_enfrentamiento"
  | "trata_enganche"
  | "narcomenudeo_contexto"
  | "control_territorial_contexto"
  | "otro";

export interface SourcePolicyDecision {
  allowed: boolean;
  reason: string;
  allowed_actions: AcquisitionRunMode[];
  pii_allowed: boolean;
  privacy_level: PrivacyLevel;
  retention_days: number;
  requires_human_approval: boolean;
}

export interface SourcePolicyInput {
  access_type: AccessType;
  mode: AcquisitionRunMode;
  allowed_actions: AcquisitionRunMode[];
  pii_requested?: boolean;
  pii_allowed?: boolean;
  has_active_consent?: boolean;
  legal_basis?: string;
  terms_basis?: string;
  retention_days?: number;
  requires_human_approval?: boolean;
}

export interface SourcePermission {
  id: string;
  source_id: string;
  policy_version: string;
  access_type: AccessType;
  allowed_actions: AcquisitionRunMode[];
  legal_basis: string;
  terms_basis?: string;
  pii_allowed: boolean;
  raw_retention_days: number;
  requires_human_approval: boolean;
  policy_notes?: string;
  effective_from: string;
  effective_to?: string;
  created_at: string;
  updated_at: string;
}

export interface Consent {
  id: string;
  source_id?: string;
  granted_by_role: ConsentGrantRole;
  scope: Record<string, unknown>;
  legal_basis: string;
  privacy_notice_version?: string;
  granted_at: string;
  expires_at?: string;
  revoked_at?: string;
  revocation_reason?: string;
  evidence_uri?: string;
  created_at: string;
  updated_at: string;
}

export interface AcquisitionRun {
  id: string;
  idempotency_key: string;
  source_id?: string;
  source_permission_id?: string;
  provider: string;
  mode: AcquisitionRunMode;
  status: AcquisitionRunStatus;
  seed_query?: string;
  seed_url?: string;
  policy_snapshot: SourcePolicyDecision;
  started_at?: string;
  finished_at?: string;
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface RawArtifact {
  id: string;
  run_id: string;
  source_id?: string;
  source_permission_id?: string;
  consent_id?: string;
  url?: string;
  content_hash: string;
  storage_uri?: string;
  content_type?: string;
  title?: string;
  fetched_at: string;
  expires_at: string;
  purged_at?: string;
  provider_metadata?: Record<string, unknown>;
  redaction_status: RedactionStatus;
  privacy_level: PrivacyLevel;
  created_at: string;
  updated_at: string;
}

export interface ExtractionJob {
  id: string;
  raw_artifact_id: string;
  extractor_name: string;
  extractor_version: string;
  schema_name: string;
  status: ExtractionJobStatus;
  confidence?: number;
  output?: Record<string, unknown>;
  error?: string;
  created_at: string;
  updated_at: string;
  finished_at?: string;
}

export interface SocialRiskEvent {
  id: string;
  source_id?: string;
  raw_artifact_id?: string;
  event_type: SocialRiskEventType;
  mechanism_type?: string;
  estado?: string;
  municipio?: string;
  locality_approx?: string;
  occurred_at?: string;
  reported_at?: string;
  confidence: number;
  severity: 1 | 2 | 3 | 4 | 5;
  privacy_level: PrivacyLevel;
  review_status: ReviewStatus;
  summary_public?: string;
  evidence?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type LineageRole = "primary" | "supporting" | "duplicate" | "contradicting";

export interface SocialEventLineage {
  id: string;
  event_id: string;
  raw_artifact_id: string;
  role: LineageRole;
  created_at: string;
}

export interface RevocationPropagationResult {
  consent_id: string;
  revoked_at: string;
  artifacts_purged: number;
  extraction_jobs_affected: number;
  events_hidden: number;
  event_ids_hidden: string[];
}

// ── Facebook Patterns ──

export const TONE_KEYWORDS = [
  "urgency", "job_offer", "payment_request", "data_harvest",
  "off_platform_contact", "high_salary", "vague_company", "immediate_start",
  "uniform_fee", "investment_return", "crypto", "delivery_job",
] as const;

export type ToneKeyword = (typeof TONE_KEYWORDS)[number];

export interface FacebookPattern {
  id: string;
  post_url: string;
  post_content: string;
  tone_description: string | null;
  tone_keywords: string[];
  image_urls: string[];
  image_descriptions: string[];
  location_text: string | null;
  location_latitude: number | null;
  location_longitude: number | null;
  location_region: string | null;
  scraped_at: string;
  created_at: string;
}

export interface ScrapedPost {
  url: string;
  content: string;
  imageUrls: string[];
}

export interface ScrapeSummary {
  inserted: number;
  skipped: number;
  failed: number;
  errors: string[];
  totalPostsSeen: number;
}

