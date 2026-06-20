"""Verify pass: enrich the notable candidatos (top match per cuerpo + any
rejected/contradicted pair) with LLM evidence + reasoning. Cheap — a handful of
calls. Run after the matcher:
    uv run python -m scripts.run_verifier
"""
import json

import psycopg
from psycopg.rows import dict_row

from src.config import settings
from src.features.matching.verify import verify_pair

# top-scoring candidate per cuerpo, plus every contradicted (rejected) pair
SELECT_SQL = r"""
with ranked as (
  select ca.id, ca.cuerpo_id, ca.persona_victima_id, ca.score, ca.tier,
         ca.evidencia, ca.contradicciones,
         row_number() over (partition by ca.cuerpo_id order by ca.score desc) as rnk
  from candidatos ca
)
select r.id, r.cuerpo_id, r.persona_victima_id, r.score, r.tier,
       r.evidencia, r.contradicciones,
       p.sexo::text as p_sexo,
       nullif(regexp_replace(coalesce(p.edad_actual::text,''),'\D','','g'),'')::int as p_edad,
       p.sana_particular::text as p_sana, p.media_filiacion::text as p_fil,
       p.estado::text as p_estado, p.fecha_percato::text as p_fecha,
       c.sexo as c_sexo, c.edad_min, c.edad_max, c.estatura_cm,
       c.sana_particular as c_sana, c.media_filiacion as c_fil,
       c.estado as c_estado, c.fecha_hallazgo as c_fecha
from ranked r
join personas_desaparecidas p on p.id_victimadirecta::text = r.persona_victima_id
join cuerpos c on c.id = r.cuerpo_id
where r.rnk = 1 or jsonb_array_length(r.contradicciones) > 0
"""


def main() -> None:
    assert settings.database_url, "DATABASE_URL not set"
    mode = "LLM" if settings.llm_api_key else "deterministico"
    with psycopg.connect(settings.database_url) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(SELECT_SQL)
            rows = cur.fetchall()

        with conn.cursor() as cur:
            for r in rows:
                persona = {
                    "sexo": r["p_sexo"], "edad": r["p_edad"], "sana_particular": r["p_sana"],
                    "media_filiacion": r["p_fil"], "estado": r["p_estado"], "fecha_percato": r["p_fecha"],
                }
                cuerpo = {
                    "sexo": r["c_sexo"], "edad_min": r["edad_min"], "edad_max": r["edad_max"],
                    "estatura_cm": r["estatura_cm"], "sana_particular": r["c_sana"],
                    "media_filiacion": r["c_fil"], "estado": r["c_estado"], "fecha_hallazgo": r["c_fecha"],
                }
                score_result = {
                    "score": float(r["score"]), "tier": r["tier"],
                    "evidencia": r["evidencia"], "contradicciones": r["contradicciones"],
                    "subscores": None,
                }
                v = verify_pair(persona, cuerpo, score_result)
                cur.execute(
                    """update candidatos set evidencia=%s, contradicciones=%s, razonamiento=%s
                       where id=%s""",
                    (json.dumps(v["evidencia"]), json.dumps(v["contradicciones"]),
                     v["razonamiento"], r["id"]),
                )
        conn.commit()
    print(f"verified {len(rows)} candidatos ({mode})")


if __name__ == "__main__":
    main()
