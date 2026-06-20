"""Dual-plane verifier — the reasoning layer.

Receives an already-scored persona↔cuerpo pair and produces human-readable
evidence + contradictions + a narrative for a reviewer. It NEVER concludes an
identification. The deterministic RULES stay authoritative for `tier` (so the
laterality disqualifier can't be reasoned away); the LLM only enriches prose.
Falls back to a deterministic template when no LLM key is configured.
"""
import json
import re

from src.llm import chat

SYSTEM = (
    "Eres un verificador forense de coincidencias entre fichas de personas "
    "desaparecidas y cuerpos no identificados. Recibes los datos de ambos y un "
    "análisis automático previo. Tu tarea es: (1) listar evidencia a favor, "
    "(2) listar contradicciones, (3) escribir un razonamiento breve para una "
    "revisora humana. NUNCA afirmes que es la misma persona ni concluyas una "
    "identificación: solo priorizas para revisión humana. Respeta SIEMPRE las "
    "contradicciones de lateralidad (izquierda vs derecha) como descalificadoras. "
    'Responde SOLO JSON: {"evidencia":[...],"contradicciones":[...],'
    '"razonamiento":"..."}'
)


def _brief(label: str, rec: dict, fields: list[str]) -> str:
    lines = [f"{label}:"]
    for f in fields:
        v = rec.get(f)
        if v:
            lines.append(f"  - {f}: {str(v).replace('<br>', '; ')}")
    return "\n".join(lines)


def _extract_json(text: str) -> dict:
    m = re.search(r"\{.*\}", text, re.DOTALL)
    return json.loads(m.group(0)) if m else {}


def _template_reason(score_result: dict) -> str:
    if score_result["contradicciones"]:
        return (
            "Coincidencia descartada a tier bajo por contradicción: "
            + "; ".join(score_result["contradicciones"])
            + ". Requiere revisión humana; el sistema no concluye."
        )
    return (
        f"Candidato priorizado (tier {score_result['tier']}, score "
        f"{score_result['score']}). Evidencia: "
        + ("; ".join(score_result["evidencia"]) or "señales demográficas básicas")
        + ". El sistema no concluye; se prioriza para revisión humana."
    )


def verify_pair(persona: dict, cuerpo: dict, score_result: dict) -> dict:
    out = {
        "tier": score_result["tier"],  # rules authoritative
        "evidencia": list(score_result["evidencia"]),
        "contradicciones": list(score_result["contradicciones"]),
        "razonamiento": None,
        "fuente": "deterministico",
    }

    persona_brief = _brief(
        "FICHA (persona desaparecida)", persona,
        ["sexo", "edad", "sana_particular", "media_filiacion", "estado", "fecha_percato"],
    )
    cuerpo_brief = _brief(
        "CUERPO (no identificado)", cuerpo,
        ["sexo", "edad_min", "edad_max", "estatura_cm", "sana_particular",
         "media_filiacion", "estado", "fecha_hallazgo"],
    )
    analysis = (
        f"Análisis automático: score={score_result['score']}, tier={score_result['tier']}, "
        f"subscores={score_result.get('subscores')}, "
        f"contradicciones={score_result['contradicciones']}"
    )

    content = chat([
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": f"{persona_brief}\n\n{cuerpo_brief}\n\n{analysis}"},
    ])

    if not content:  # no LLM key → deterministic fallback
        out["razonamiento"] = _template_reason(score_result)
        return out

    try:
        data = _extract_json(content)
        out["evidencia"] = data.get("evidencia") or out["evidencia"]
        out["contradicciones"] = data.get("contradicciones") or out["contradicciones"]
        out["razonamiento"] = data.get("razonamiento") or _template_reason(score_result)
        out["fuente"] = "llm"
    except (json.JSONDecodeError, ValueError):
        out["razonamiento"] = content.strip()[:600]
        out["fuente"] = "llm-raw"
    return out
