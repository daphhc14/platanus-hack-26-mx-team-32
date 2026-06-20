-- Hilo — LEAN seed for `cuerpos` (the answer-key).
-- Derives synthetic bodies from real personas so the matcher has a known-correct
-- target set. Idempotent: re-running replaces only the seeded rows (TM-/NM-),
-- and uses UPSERT-style delete+insert so candidatos FKs stay consistent.
--
-- codigo prefix encodes ground truth:
--   TM-<id_victimadirecta>  = TRUE MATCH  → matcher SHOULD surface this for that persona
--   NM-<id_victimadirecta>  = NEAR MISS   → laterality flipped → matcher SHOULD reject

begin;

-- clean any prior seed (and dependent candidatos), keep non-seeded cuerpos intact
delete from candidatos
  where cuerpo_id in (select id from cuerpos where codigo like 'TM-%' or codigo like 'NM-%');
delete from cuerpos where codigo like 'TM-%' or codigo like 'NM-%';

with base as (
  select
    id_victimadirecta,
    sexo,
    sana_particular,
    media_filiacion,
    estado,
    municipio,
    nullif(regexp_replace(coalesce(edad_actual, ''), '\D', '', 'g'), '')::int as edad,
    (regexp_match(coalesce(media_filiacion, ''), 'ESTATURA:\s*(\d+)'))[1]::int  as estatura
  from personas_desaparecidas
  where sana_particular ~ '(IZQUIERDO|DERECHO)'   -- only personas whose señas carry laterality
  order by id_victimadirecta
),
tm as (select * from base limit 10),
nm as (select * from base offset 10 limit 3)
insert into cuerpos
  (codigo, sexo, edad_min, edad_max, estatura_cm,
   sana_particular, media_filiacion, estado, municipio, fecha_hallazgo, estatus)
-- TRUE MATCHES: same señas (same laterality)
select
  'TM-' || id_victimadirecta, sexo,
  greatest(edad - 2, 0), edad + 2, estatura,
  sana_particular, media_filiacion, estado, municipio, '2026-06-30', 'no_identificado'
from tm
union all
-- NEAR MISSES: identical except laterality flipped (IZQUIERDO <-> DERECHO)
select
  'NM-' || id_victimadirecta, sexo,
  greatest(edad - 2, 0), edad + 2, estatura,
  replace(replace(replace(sana_particular, 'IZQUIERDO', '__T__'), 'DERECHO', 'IZQUIERDO'), '__T__', 'DERECHO'),
  media_filiacion, estado, municipio, '2026-06-30', 'no_identificado'
from nm;

commit;
