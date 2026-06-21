"""Dual-plane verifier — the reasoning layer.

The evidence and contradictions are COMPUTED by the engine (deterministic facts).
The LLM does NOT restate them — its only job is a short narrative/recommendation
for a reviewer. It never concludes an identification. Falls back to a template
when there's no LLM key or when use_llm is off (e.g. lower-ranked candidates).
"""
from src.llm import chat

SYSTEM = (
    "Eres un verificador forense. Te doy una posible coincidencia entre una ficha "
    "de persona desaparecida y un cuerpo no identificado, junto con la evidencia y "
    "contradicciones YA CALCULADAS por el sistema. NO repitas la lista de evidencia; "
    "escribe UN párrafo breve (máx 3 frases) de síntesis y recomendación para una "
    "revisora humana. NUNCA afirmes que es la misma persona; el sistema no concluye, "
    "solo prioriza para revisión. Responde solo el párrafo, sin formato."
)


def _template_reason(score_result: dict) -> str:
    if score_result["contradicciones"]:
        return (
            "Descartado a prioridad baja por contradicción: "
            + "; ".join(score_result["contradicciones"])
            + ". Requiere revisión humana; el sistema no concluye."
        )
    return (
        f"Candidato priorizado (tier {score_result['tier']}, "
        f"{round(score_result['score'] * 100)}%). El sistema no concluye; "
        "se prioriza para revisión humana."
    )


def verify_pair(persona: dict, cuerpo: dict, score_result: dict, use_llm: bool = True) -> dict:
    out = {
        "tier": score_result["tier"],
        "evidencia": list(score_result["evidencia"]),          # deterministic, kept
        "contradicciones": list(score_result["contradicciones"]),  # deterministic, kept
        "razonamiento": None,
        "fuente": "deterministico",
    }

    if not use_llm:
        out["razonamiento"] = _template_reason(score_result)
        return out

    facts = (
        f"tier={score_result['tier']}, score={round(score_result['score'] * 100)}%\n"
        f"evidencia: {score_result['evidencia']}\n"
        f"contradicciones: {score_result['contradicciones']}"
    )
    content = chat([
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": facts},
    ], max_tokens=220)

    if not content:
        out["razonamiento"] = _template_reason(score_result)
    else:
        out["razonamiento"] = content.strip()
        out["fuente"] = "llm"
    return out
