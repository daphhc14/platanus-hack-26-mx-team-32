-- lib/schema.sql — Hilo canonical schema, SQLite-adapted from schema-bndf.md
-- Faithful to the original Postgres model. Adaptations (no external deps):
--   - UUIDs as TEXT (crypto.randomUUID() in app)
--   - enums as TEXT + CHECK (enforced in app types)
--   - no pgvector -> lexical tokens (JSON array) replace embeddings
--   - no Postgres RLS -> access control enforced in lib/db.ts adapter (RBAC)
-- PRAGMA journal_mode=WAL for concurrency.

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- PROVENANCE
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  trust_tier TEXT NOT NULL CHECK (trust_tier IN ('oficial','colectivo_verificado','redes_anonimo')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- RECORDS (a ficha OR a cuerpo — unified)
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  record_type TEXT NOT NULL CHECK (record_type IN ('missing','unidentified')),
  external_ref TEXT,
  sex TEXT CHECK (sex IN ('M','F','X') OR sex IS NULL),
  age_min INTEGER,
  age_max INTEGER,
  height_cm INTEGER,
  build TEXT,
  skin_tone TEXT,
  estado TEXT,
  municipio TEXT,
  event_date TEXT,
  raw_description TEXT,
  photo_url TEXT,
  canonical_entity_id TEXT,
  pii_minimized INTEGER NOT NULL DEFAULT 1,
  synthetic INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_records_block ON records (record_type, estado, sex);
CREATE INDEX IF NOT EXISTS idx_records_date ON records (event_date);
CREATE INDEX IF NOT EXISTS idx_records_entity ON records (canonical_entity_id);

-- FEATURES (señas particulares normalized — one record -> many)
CREATE TABLE IF NOT EXISTS features (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  feature_type TEXT NOT NULL,
  body_region TEXT,
  laterality TEXT DEFAULT 'na',
  motif_category TEXT,
  description_raw TEXT NOT NULL,
  tokens TEXT,            -- JSON array of normalized tokens (lexical fallback)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_features_record ON features (record_id);
CREATE INDEX IF NOT EXISTS idx_features_type ON features (feature_type, body_region, laterality);

-- CANDIDATE MATCHES (scored pairs — NEVER auto-confirmed)
CREATE TABLE IF NOT EXISTS candidate_matches (
  id TEXT PRIMARY KEY,
  missing_record_id TEXT NOT NULL REFERENCES records(id),
  unidentified_record_id TEXT NOT NULL REFERENCES records(id),
  overall_score REAL NOT NULL,
  field_scores TEXT NOT NULL,          -- JSON
  verifier_evidence TEXT,
  verifier_contradictions TEXT,
  verifier_tier TEXT,                  -- alta | media | baja
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','in_review','confirmed','rejected','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (missing_record_id, unidentified_record_id)
);
CREATE INDEX IF NOT EXISTS idx_matches_status ON candidate_matches (status, overall_score DESC);

-- USERS (pseudonymous)
CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  pseudonym TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'reviewer' CHECK (role IN ('reviewer','liaison','admin','readonly')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- HUMAN REVIEW (the only path to 'confirmed')
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES candidate_matches(id),
  reviewer_id TEXT NOT NULL REFERENCES app_users(id),
  decision TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reviews_match ON reviews (match_id);

-- TIPS (metadata-stripped on intake)
CREATE TABLE IF NOT EXISTS tips (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  extracted TEXT,                      -- JSON
  trust_tier TEXT NOT NULL DEFAULT 'redes_anonimo',
  sender_metadata_stripped INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'nuevo',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- SECURE LOCATIONS (RLS-locked conceptually; RBAC in adapter)
CREATE TABLE IF NOT EXISTS secure_locations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                  -- punto_busqueda | reporte_fosa | posicion_buscadora
  estado TEXT,
  municipio TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  fosas INTEGER,
  cuerpos INTEGER,
  related_tip_id TEXT REFERENCES tips(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- AUDIT (append-only)
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  detail TEXT,                         -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ACQUISITION + SOCIAL INTELLIGENCE
-- Keeps web/social ingestion separate from the forensic matching core.

CREATE TABLE IF NOT EXISTS source_permissions (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  policy_version TEXT NOT NULL DEFAULT 'source-policy-v1',
  access_type TEXT NOT NULL CHECK (access_type IN (
    'official_public',
    'public_web',
    'authorized_group',
    'submitted_by_family',
    'submitted_by_partner',
    'private_denied',
    'unknown'
  )),
  allowed_actions_json TEXT NOT NULL,
  legal_basis TEXT NOT NULL DEFAULT 'not_assessed',
  terms_basis TEXT,
  pii_allowed INTEGER NOT NULL DEFAULT 0,
  raw_retention_days INTEGER NOT NULL DEFAULT 30,
  requires_human_approval INTEGER NOT NULL DEFAULT 1,
  policy_notes TEXT,
  effective_from TEXT NOT NULL DEFAULT (datetime('now')),
  effective_to TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS consents (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES sources(id),
  granted_by_role TEXT NOT NULL CHECK (granted_by_role IN (
    'family_member',
    'collective_admin',
    'partner_org',
    'public_authority',
    'unknown'
  )),
  scope_json TEXT NOT NULL,
  legal_basis TEXT NOT NULL,
  privacy_notice_version TEXT,
  granted_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  revocation_reason TEXT,
  evidence_uri TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS acquisition_runs (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  source_id TEXT REFERENCES sources(id),
  source_permission_id TEXT REFERENCES source_permissions(id),
  provider TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN (
    'discovery_search',
    'search',
    'scrape',
    'map',
    'crawl',
    'monitor',
    'manual_import'
  )),
  status TEXT NOT NULL CHECK (status IN (
    'queued',
    'running',
    'succeeded',
    'failed',
    'blocked_by_policy'
  )),
  seed_query TEXT,
  seed_url TEXT,
  policy_snapshot_json TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS raw_artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES acquisition_runs(id),
  source_id TEXT REFERENCES sources(id),
  source_permission_id TEXT REFERENCES source_permissions(id),
  consent_id TEXT REFERENCES consents(id),
  url TEXT,
  content_hash TEXT NOT NULL,
  storage_uri TEXT,
  content_type TEXT,
  title TEXT,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  purged_at TEXT,
  provider_metadata_json TEXT,
  redaction_status TEXT NOT NULL DEFAULT 'pending' CHECK (redaction_status IN (
    'pending',
    'not_required',
    'applied',
    'failed'
  )),
  privacy_level TEXT NOT NULL DEFAULT 'restricted' CHECK (privacy_level IN (
    'public_aggregate',
    'internal',
    'restricted'
  )),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (run_id, url, content_hash)
);

CREATE TABLE IF NOT EXISTS extraction_jobs (
  id TEXT PRIMARY KEY,
  raw_artifact_id TEXT NOT NULL REFERENCES raw_artifacts(id),
  extractor_name TEXT NOT NULL,
  extractor_version TEXT NOT NULL,
  schema_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'queued',
    'running',
    'succeeded',
    'failed',
    'needs_review'
  )),
  confidence REAL,
  output_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  UNIQUE (raw_artifact_id, extractor_version, schema_name)
);

CREATE TABLE IF NOT EXISTS social_risk_events (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES sources(id),
  raw_artifact_id TEXT REFERENCES raw_artifacts(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'oferta_laboral_sospechosa',
    'secuestro_levanton',
    'balacera_enfrentamiento',
    'trata_enganche',
    'narcomenudeo_contexto',
    'control_territorial_contexto',
    'otro'
  )),
  mechanism_type TEXT,
  estado TEXT,
  municipio TEXT,
  locality_approx TEXT,
  occurred_at TEXT,
  reported_at TEXT,
  confidence REAL NOT NULL,
  severity INTEGER NOT NULL DEFAULT 1 CHECK (severity BETWEEN 1 AND 5),
  privacy_level TEXT NOT NULL DEFAULT 'restricted' CHECK (privacy_level IN (
    'public_aggregate',
    'internal',
    'restricted'
  )),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN (
    'pending',
    'approved',
    'rejected',
    'hidden'
  )),
  summary_public TEXT,
  evidence_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_review_decisions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES social_risk_events(id),
  reviewer_id TEXT REFERENCES app_users(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS risk_event_links (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES social_risk_events(id),
  record_id TEXT REFERENCES records(id),
  link_type TEXT NOT NULL CHECK (link_type IN (
    'temporal_context',
    'geo_context',
    'source_duplicate'
  )),
  score REAL NOT NULL,
  evidence_json TEXT,
  review_required INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Multi-artifact lineage: a single social_risk_event can be derived from
-- multiple raw_artifacts (e.g. cross-source corroboration). The direct
-- social_risk_events.raw_artifact_id column keeps the "primary" link cheap;
-- this table captures the rest so consent revocation can propagate fully.
CREATE TABLE IF NOT EXISTS social_event_artifact_lineage (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES social_risk_events(id) ON DELETE CASCADE,
  raw_artifact_id TEXT NOT NULL REFERENCES raw_artifacts(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'supporting' CHECK (role IN (
    'primary',
    'supporting',
    'duplicate',
    'contradicting'
  )),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (event_id, raw_artifact_id)
);

CREATE INDEX IF NOT EXISTS idx_permissions_source
  ON source_permissions (source_id, access_type, effective_from);
CREATE INDEX IF NOT EXISTS idx_consents_source
  ON consents (source_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_runs_status
  ON acquisition_runs (status, provider, created_at);
CREATE INDEX IF NOT EXISTS idx_artifacts_source
  ON raw_artifacts (source_id, fetched_at);
CREATE INDEX IF NOT EXISTS idx_artifacts_hash
  ON raw_artifacts (content_hash);
CREATE INDEX IF NOT EXISTS idx_artifacts_expiry
  ON raw_artifacts (expires_at, purged_at);
CREATE INDEX IF NOT EXISTS idx_extract_artifact
  ON extraction_jobs (raw_artifact_id, schema_name);
CREATE INDEX IF NOT EXISTS idx_social_geo_time
  ON social_risk_events (estado, municipio, occurred_at);
CREATE INDEX IF NOT EXISTS idx_social_type_review
  ON social_risk_events (event_type, review_status, confidence);
CREATE INDEX IF NOT EXISTS idx_event_lineage_event
  ON social_event_artifact_lineage (event_id);
CREATE INDEX IF NOT EXISTS idx_event_lineage_artifact
  ON social_event_artifact_lineage (raw_artifact_id);
