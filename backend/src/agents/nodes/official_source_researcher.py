"""official_source_researcher — searches for official sources per estado."""
import json

from src.agents.state import AgentState
from src.llm import chat


def official_source_researcher(state: AgentState) -> AgentState:
    """Find official sources (fiscalías, comisiones) for Mexican states."""
    print(f"  [official_source_researcher] run_id={state['run_id']}")

    try:
        text = chat(
            [
                {
                    "role": "system",
                    "content": (
                        "Eres un investigador de fuentes oficiales sobre personas desaparecidas en México. "
                        "Dada una lista de estados, devuelve JSON con fuentes oficiales (fiscalías, comisiones de búsqueda, CNB). "
                        'Formato: {"sources": [{"name": "...", "url": "...", "estado": "...", "trust_tier": "oficial", "notes": "..."}]}'
                    ),
                },
                {
                    "role": "user",
                    "content": "Encuentra fuentes oficiales para: Baja California, Jalisco, Guerrero, Puebla, Chiapas, Hidalgo, Michoacán. Responde SOLO JSON.",
                },
            ],
            max_tokens=2048,
        )
        if not text:  # no LLM_API_KEY → deterministic fallback
            sources = _fallback_sources()
        else:
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                sources = json.loads(text[start:end]).get("sources", [])
            else:
                raise ValueError("No JSON found in response")
    except Exception as e:
        print(f"  [official_source_researcher] LLM error: {e}, using fallback")
        sources = _fallback_sources()

    state["sources_found"] = sources
    print(f"  [official_source_researcher] found {len(sources)} sources")
    return state


def _fallback_sources() -> list[dict]:
    """Deterministic fallback when no LLM key."""
    return [
        {"name": "Comisión Nacional de Búsqueda (CNB)", "url": "https://www.gob.mx/cnb", "estado": "Nacional", "trust_tier": "oficial", "notes": "RNPDNO"},
        {"name": "Fiscalía BC", "url": "https://www.fgebc.gob.mx", "estado": "Baja California", "trust_tier": "oficial", "notes": ""},
        {"name": "Fiscalía Jalisco", "url": "https://fiscalia.jalisco.gob.mx", "estado": "Jalisco", "trust_tier": "oficial", "notes": ""},
        {"name": "Comisión de Búsqueda Guerrero", "url": "https://www.guerrero.gob.mx", "estado": "Guerrero", "trust_tier": "oficial", "notes": ""},
        {"name": "Fiscalía Puebla", "url": "https://www.fgepuebla.gob.mx", "estado": "Puebla", "trust_tier": "oficial", "notes": ""},
        {"name": "Fiscalía Chiapas", "url": "https://www.fiscaliachiapas.gob.mx", "estado": "Chiapas", "trust_tier": "oficial", "notes": ""},
        {"name": "Fiscalía Hidalgo", "url": "https://www.ssph.gob.mx", "estado": "Hidalgo", "trust_tier": "oficial", "notes": ""},
        {"name": "Fiscalía Michoacán", "url": "https://fiscalia.michoacan.gob.mx", "estado": "Michoacán", "trust_tier": "oficial", "notes": ""},
    ]
