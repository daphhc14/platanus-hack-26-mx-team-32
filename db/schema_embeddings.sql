-- Hilo — pgvector layer (the wide/semantic RETRIEVAL stage).
-- Gemini gemini-embedding-001 @ 768 dims, cosine distance.
--
-- cuerpos: embedding column (we own the table, seed by upsert).
-- personas: embeddings live in a SEPARATE table keyed by the stable
--   id_victimadirecta — because db/dataset/bootstrap_db.ts DROPs
--   personas_desaparecidas on reseed; a column there would be wiped.

create extension if not exists vector;

alter table cuerpos add column if not exists embedding vector(768);

create table if not exists persona_embeddings (
  persona_victima_id text primary key,         -- → personas_desaparecidas.id_victimadirecta
  embedding          vector(768),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_cuerpos_embedding
  on cuerpos using hnsw (embedding vector_cosine_ops);
create index if not exists idx_persona_emb
  on persona_embeddings using hnsw (embedding vector_cosine_ops);

alter table persona_embeddings enable row level security;
