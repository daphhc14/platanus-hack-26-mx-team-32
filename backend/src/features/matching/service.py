"""Match service — reads stored candidatos and runs the live preview funnel."""
from src.config import settings

from .embeddings import embed_one, record_text, to_vector_literal
from .engine import rank_personas_for_cuerpo
from .verify import verify_pair

_PERSONA_COLS = r"""
       p.id_victimadirecta::text as id_victimadirecta, p.nombre::text as nombre,
       p.sexo::text as sexo,
       nullif(regexp_replace(coalesce(p.edad_actual::text, ''), '\D', '', 'g'), '')::int as edad,
       p.sana_particular::text as sana_particular, p.media_filiacion::text as media_filiacion,
       p.estado::text as estado, p.fecha_percato::text as fecha_percato,
       p.fecha_hechos::text as fecha_hechos
"""

_RETRIEVE_SQL = f"""
select {_PERSONA_COLS}
from personas_desaparecidas p
join persona_embeddings pe on pe.persona_victima_id = p.id_victimadirecta::text
where pe.embedding is not null
order by pe.embedding <=> %s::vector
limit %s
"""

_ALL_PERSONAS_SQL = f"select {_PERSONA_COLS} from personas_desaparecidas p"

_CANDIDATOS_SQL = """
select ca.cuerpo_id::text as cuerpo_id, c.codigo as cuerpo_codigo,
       ca.score::float as score, ca.tier, ca.evidencia, ca.contradicciones,
       ca.razonamiento, ca.estado,
       c.sexo as cuerpo_sexo, c.estado as cuerpo_estado, c.sana_particular as cuerpo_senas
from candidatos ca
join cuerpos c on c.id = ca.cuerpo_id
where ca.persona_victima_id = %s
order by ca.score desc
"""


def persona_uuid(conn, persona_id: int) -> str | None:
    with conn.cursor() as cur:
        cur.execute(
            "select id_victimadirecta::text as u from personas_desaparecidas where id = %s",
            (persona_id,),
        )
        row = cur.fetchone()
    return row["u"] if row else None


def candidatos_for_persona(conn, persona_victima_id: str) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(_CANDIDATOS_SQL, (persona_victima_id,))
        return cur.fetchall()


def _senas_text(senas) -> str | None:
    if isinstance(senas, list):
        return "<br>".join(str(s) for s in senas)
    return senas


def preview_match(conn, query: dict, k_retrieve: int = 30, top_n: int = 5) -> tuple[int, str, list[dict]]:
    cuerpo = {
        "sexo": query.get("sexo"),
        "edad_min": query.get("edad_min"),
        "edad_max": query.get("edad_max"),
        "estatura_cm": query.get("estatura_cm"),
        "sana_particular": _senas_text(query.get("senas")),
        "media_filiacion": query.get("media_filiacion"),
        "estado": query.get("estado"),
        "fecha_hallazgo": query.get("fecha_hallazgo"),
    }

    if settings.gemini_api_key:
        vec = embed_one(record_text(cuerpo))
        with conn.cursor() as cur:
            cur.execute(_RETRIEVE_SQL, (to_vector_literal(vec), k_retrieve))
            personas = cur.fetchall()
        via = "vector"
    else:
        with conn.cursor() as cur:
            cur.execute(_ALL_PERSONAS_SQL)
            personas = cur.fetchall()
        via = "brute"

    by_uuid = {p["id_victimadirecta"]: p for p in personas}
    out = []
    for r in rank_personas_for_cuerpo(cuerpo, personas, top_k=top_n):
        persona = by_uuid[r["persona_victima_id"]]
        v = verify_pair(persona, cuerpo, r)
        out.append({
            "persona_victima_id": r["persona_victima_id"],
            "nombre": persona.get("nombre"),
            "score": r["score"],
            "tier": v["tier"],
            "evidencia": v["evidencia"],
            "contradicciones": v["contradicciones"],
            "razonamiento": v["razonamiento"],
        })
    return len(personas), via, out
