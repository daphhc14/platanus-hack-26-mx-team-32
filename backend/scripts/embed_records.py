"""Backfill embeddings for all personas + cuerpos (one-time / on reseed).

    uv run python -m scripts.embed_records
"""
import psycopg
from psycopg.rows import dict_row

from src.config import settings
from src.features.matching.embeddings import embed_texts, record_text, to_vector_literal

PERSONAS_SQL = """
select id_victimadirecta::text as id, sana_particular::text as sana_particular,
       media_filiacion::text as media_filiacion, sexo::text as sexo, estado::text as estado
from personas_desaparecidas
"""
CUERPOS_SQL = "select id::text as id, sana_particular, media_filiacion, sexo, estado from cuerpos"


def main() -> None:
    assert settings.database_url, "DATABASE_URL not set"
    with psycopg.connect(settings.database_url) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(PERSONAS_SQL)
            personas = cur.fetchall()
            cur.execute(CUERPOS_SQL)
            cuerpos = cur.fetchall()

        print(f"embedding {len(personas)} personas + {len(cuerpos)} cuerpos (throttled)…")
        pvecs = embed_texts([record_text(p) for p in personas], progress=True)
        cvecs = embed_texts([record_text(c) for c in cuerpos])

        with conn.cursor() as cur:
            for p, v in zip(personas, pvecs):
                cur.execute(
                    """insert into persona_embeddings (persona_victima_id, embedding, updated_at)
                       values (%s, %s::vector, now())
                       on conflict (persona_victima_id)
                       do update set embedding = excluded.embedding, updated_at = now()""",
                    (p["id"], to_vector_literal(v)),
                )
            for c, v in zip(cuerpos, cvecs):
                cur.execute(
                    "update cuerpos set embedding = %s::vector where id = %s",
                    (to_vector_literal(v), c["id"]),
                )
        conn.commit()
    print(f"embedded {len(personas)} personas + {len(cuerpos)} cuerpos @ 768d")


if __name__ == "__main__":
    main()
