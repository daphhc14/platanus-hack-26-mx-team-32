-- agent_tasks: tracks every LangGraph agent run
CREATE TABLE IF NOT EXISTS agent_tasks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name  TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','running','completed','failed')),
  input       JSONB,
  output      JSONB,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent_status
  ON agent_tasks (agent_name, status, created_at DESC);

-- match_results: scored persona↔cuerpo pairs (written by bridge-match.ts and Python engine)
CREATE TABLE IF NOT EXISTS match_results (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_victima_id  TEXT        NOT NULL,
  cuerpo_id           TEXT,
  score               FLOAT       NOT NULL,
  tier                TEXT        NOT NULL CHECK (tier IN ('alta','media','baja')),
  evidencia           JSONB       NOT NULL DEFAULT '[]',
  contradicciones     JSONB       NOT NULL DEFAULT '[]',
  razonamiento        TEXT,
  source              TEXT        NOT NULL DEFAULT 'bridge_ts',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_results_persona
  ON match_results (persona_victima_id, score DESC);

CREATE INDEX IF NOT EXISTS idx_match_results_tier
  ON match_results (tier, score DESC, created_at DESC);

-- review_queue: prioritized work items for human reviewers
CREATE TABLE IF NOT EXISTS review_queue (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_result_id  UUID        REFERENCES match_results(id) ON DELETE CASCADE,
  priority         INT         NOT NULL DEFAULT 0,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','assigned','done','skipped')),
  assigned_to      TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_queue_priority
  ON review_queue (status, priority DESC, created_at ASC);
