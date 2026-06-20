"""Batch matcher: score every cuerpo against all personas → write candidatos.

Connects via DATABASE_URL (direct Postgres, bypasses RLS). Run from backend/:
    uv run python -m scripts.run_matcher
"""
import json

import psycopg
from psycopg.rows import dict_row

from src.config import settings
from src.features.matching.engine import rank_personas_for_cuerpo

PERSONAS_SQL = r"""
select id_victimadirecta::text as id_victimadirecta,
       sexo::text as sexo,
       nullif(regexp_replace(coalesce(edad_actual::text, ''), '\D', '', 'g'), '')::int as edad,
       sana_particular::text as sana_particular,
       media_filiacion::text as media_filiacion,
       estado::text as estado,
       fecha_percato::text as fecha_percato,
       fecha_hechos::text as fecha_hechos
from personas_desaparecidas
"""

CUERPOS_SQL = """
select id::text as id, codigo, sexo, edad_min, edad_max, estatura_cm,
       sana_particular, media_filiacion, estado, fecha_hallazgo
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
            cur.execute(PERSONAS_SQL)
            personas = cur.fetchall()
            cur.execute(CUERPOS_SQL)
            cuerpos = cur.fetchall()

        with conn.cursor() as cur:
            cur.execute("delete from candidatos")  # fresh run
            written = 0
            for c in cuerpos:
                for r in rank_personas_for_cuerpo(c, personas, top_k=5):
                    cur.execute(
                        UPSERT_SQL,
                        (
                            r["persona_victima_id"], c["id"], r["score"], r["tier"],
                            json.dumps(r["evidencia"]), json.dumps(r["contradicciones"]),
                        ),
                    )
                    written += 1
        conn.commit()
    print(f"wrote {written} candidatos for {len(cuerpos)} cuerpos vs {len(personas)} personas")


if __name__ == "__main__":
    main()
