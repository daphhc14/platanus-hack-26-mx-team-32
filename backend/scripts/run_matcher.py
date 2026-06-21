"""Batch matcher funnel: vector-retrieve top-K personas → rules score → candidatos.

Falls back to brute-force (all personas) for any cuerpo without an embedding.
Run from backend/:
    uv run python -m scripts.run_matcher
"""
import json

import psycopg
from psycopg.rows import dict_row

from src.config import settings
from src.features.matching.engine import rank_personas_for_cuerpo
from src.features.matching.tuning import CONFIG

RETRIEVE_K = CONFIG.retrieve_k  # wide net: vector top-K, then rules narrow it

_PERSONA_COLS = r"""
       p.id_victimadirecta::text as id_victimadirecta, p.sexo::text as sexo,
       nullif(regexp_replace(coalesce(p.edad_actual::text, ''), '\D', '', 'g'), '')::int as edad,
       p.sana_particular::text as sana_particular, p.media_filiacion::text as media_filiacion,
       p.estado::text as estado, p.fecha_percato::text as fecha_percato,
       p.fecha_hechos::text as fecha_hechos
"""

RETRIEVE_SQL = f"""
select {_PERSONA_COLS}
from personas_desaparecidas p
join persona_embeddings pe on pe.persona_victima_id = p.id_victimadirecta::text
where pe.embedding is not null
order by pe.embedding <=> %s::vector
limit %s
"""

ALL_PERSONAS_SQL = f"select {_PERSONA_COLS} from personas_desaparecidas p"

CUERPOS_SQL = """
select id::text as id, codigo, sexo, edad_min, edad_max, estatura_cm,
       sana_particular, media_filiacion, estado, fecha_hallazgo, embedding::text as embedding
from cuerpos
"""

UPSERT_SQL = """
insert into candidatos
  (persona_victima_id, cuerpo_id, score, tier, evidencia, contradicciones, estado)
values (%s, %s, %s, %s, %s, %s, 'candidate')
on conflict (persona_victima_id, cuerpo_id) do update set
  score = excluded.score, tier = excluded.tier,
  evidencia = excluded.evidencia, contradicciones = excluded.contradicciones
"""


def main() -> None:
    assert settings.database_url, "DATABASE_URL not set"
    with psycopg.connect(settings.database_url) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(CUERPOS_SQL)
            cuerpos = cur.fetchall()
            cur.execute(ALL_PERSONAS_SQL)
            all_personas = cur.fetchall()

        written, via_vector = 0, 0
        with conn.cursor() as cur:
            cur.execute("delete from candidatos")
            for c in cuerpos:
                if c["embedding"]:
                    with conn.cursor(row_factory=dict_row) as rcur:
                        rcur.execute(RETRIEVE_SQL, (c["embedding"], RETRIEVE_K))
                        personas = rcur.fetchall()
                    via_vector += 1
                else:
                    personas = all_personas
                for r in rank_personas_for_cuerpo(c, personas):
                    cur.execute(
                        UPSERT_SQL,
                        (
                            r["persona_victima_id"], c["id"], r["score"], r["tier"],
                            json.dumps(r["evidencia"]), json.dumps(r["contradicciones"]),
                        ),
                    )
                    written += 1
        conn.commit()
    print(
        f"wrote {written} candidatos for {len(cuerpos)} cuerpos "
        f"({via_vector} via vector retrieval, {len(cuerpos) - via_vector} brute-force) "
        f"vs {len(all_personas)} personas"
    )


if __name__ == "__main__":
    main()
