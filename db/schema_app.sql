-- Hilo — application schema (Plan B). ADDITIVE: new tables only.
-- Layers on top of Paolo's `personas_desaparecidas` (the fichas / dataset side),
-- which is left completely untouched.
--
-- Design:
--  * UUID primary keys everywhere (consistency with Supabase `auth.users`,
--    enumeration-safe). gen_random_uuid() default.
--  * Real FKs WITHIN our schema (we own these tables). Seed `cuerpos` by upsert,
--    never DROP, so these FKs stay valid across reseeds.
--  * The ONLY soft (FK-less, text) reference is to `personas_desaparecidas`, via
--    its stable natural key `id_victimadirecta` (UNIQUE NOT NULL) — because
--    `db/dataset/bootstrap_db.ts` DROPs that table on reseed, so a hard FK can't
--    survive and the SERIAL id is reassigned. Natural key survives; serial doesn't.
--  * RLS ON, no policies (Approach A): the FastAPI backend uses the service_role
--    key and bypasses RLS; anon/publishable gets nothing. RBAC enforced in FastAPI.
--  * pgvector / embeddings intentionally deferred.

-- usuarios — MB (Madre Buscadora) profile, tied to Supabase Auth
create table if not exists usuarios (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  nombre      text,
  rol         text not null default 'mb',          -- 'mb' | 'readonly' | 'full'
  created_at  timestamptz not null default now()
);

-- vinculos — MB ↔ persona link (onboarding result; "your linked person")
create table if not exists vinculos (
  id                 uuid primary key default gen_random_uuid(),
  usuario_id         uuid not null references usuarios (id) on delete cascade,
  persona_victima_id text not null,                -- soft ref → personas_desaparecidas.id_victimadirecta
  parentesco         text,
  created_at         timestamptz not null default now(),
  unique (usuario_id, persona_victima_id)
);
create index if not exists idx_vinculos_persona on vinculos (persona_victima_id);

-- cuerpos — unidentified bodies (the matcher's other half; mirrors the ficha)
create table if not exists cuerpos (
  id               uuid primary key default gen_random_uuid(),
  codigo           text unique,                    -- SEMEFO / case code (stable natural key)
  sexo             text,
  edad_min         int,
  edad_max         int,
  estatura_cm      int,
  sana_particular  text,                           -- señas, same format as fichas
  media_filiacion  text,
  estado           text,
  municipio        text,
  fecha_hallazgo   text,
  estatus          text not null default 'no_identificado',
  created_at       timestamptz not null default now()
);

-- candidatos — ranked persona ↔ cuerpo pairs (matcher output)
create table if not exists candidatos (
  id                 uuid primary key default gen_random_uuid(),
  persona_victima_id text not null,                -- soft ref → personas
  cuerpo_id          uuid not null references cuerpos (id) on delete cascade,  -- hard FK (we own cuerpos)
  score              numeric(5,4) not null,
  tier               text not null check (tier in ('alta','media','baja')),
  evidencia          jsonb not null default '[]'::jsonb,
  contradicciones    jsonb not null default '[]'::jsonb,
  estado             text not null default 'candidate'
                       check (estado in ('candidate','confirmed','rejected')),
  created_at         timestamptz not null default now(),
  unique (persona_victima_id, cuerpo_id)
);
create index if not exists idx_candidatos_persona on candidatos (persona_victima_id);
create index if not exists idx_candidatos_estado  on candidatos (estado);

-- evidencia — info added by an MB about their linked person
create table if not exists evidencia (
  id                 uuid primary key default gen_random_uuid(),
  persona_victima_id text not null,                -- soft ref → personas
  usuario_id         uuid references usuarios (id) on delete set null,
  tipo               text,                          -- 'sena' | 'foto' | 'nota' | ...
  contenido          text,
  created_at         timestamptz not null default now()
);
create index if not exists idx_evidencia_persona on evidencia (persona_victima_id);

-- mensajes — MB ↔ MB chat, scoped to a case (the linked person). Anonymous:
-- store author id for auth, expose only an alias to the other party.
create table if not exists mensajes (
  id                 uuid primary key default gen_random_uuid(),
  persona_victima_id text not null,                -- the shared case / thread (soft ref)
  autor_id           uuid not null references usuarios (id) on delete cascade,
  cuerpo             text not null,
  created_at         timestamptz not null default now()
);
create index if not exists idx_mensajes_caso on mensajes (persona_victima_id, created_at);

-- notificaciones — push alerts (match / new evidence / new message)
create table if not exists notificaciones (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references usuarios (id) on delete cascade,
  tipo        text not null,                        -- 'match' | 'evidencia' | 'mensaje'
  payload     jsonb not null default '{}'::jsonb,
  leida       boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notif_usuario on notificaciones (usuario_id, leida);

-- reviews — the ONLY path to confirm/reject a candidato (human-in-the-loop)
create table if not exists reviews (
  id           uuid primary key default gen_random_uuid(),
  candidato_id uuid not null references candidatos (id) on delete cascade,
  revisor_id   uuid references usuarios (id) on delete set null,
  decision     text not null check (decision in ('confirmed','rejected')),
  nota         text,
  created_at   timestamptz not null default now()
);

-- audit_log — append-only trail (security narrative)
create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid,
  accion      text not null,
  entidad     text,
  entidad_id  text,
  detalle     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- RLS: lock every table (backend uses service_role and bypasses this).
alter table usuarios       enable row level security;
alter table vinculos       enable row level security;
alter table cuerpos        enable row level security;
alter table candidatos     enable row level security;
alter table evidencia      enable row level security;
alter table mensajes       enable row level security;
alter table notificaciones enable row level security;
alter table reviews        enable row level security;
alter table audit_log      enable row level security;
