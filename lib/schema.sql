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
