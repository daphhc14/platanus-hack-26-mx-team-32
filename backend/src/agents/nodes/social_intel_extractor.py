"""social_intel_extractor — extracts social risk events + loads FB fichas from Supabase."""
import json

from src.agents.state import AgentState
from src.agents.supabase_client import query as db_query
from src.llm import chat


def social_intel_extractor(state: AgentState) -> AgentState:
    """Extract social risk events from artifacts and load pending fichas from Supabase."""
    print(f"  [social_intel_extractor] processing {len(state.get('artifacts_acquired', []))} artifacts")

    # 1. Extract social events from artifacts (if LLM available)
    social_events = []
    if state.get("artifacts_acquired"):
        try:
            for artifact in state["artifacts_acquired"][:3]:
                text = chat(
                    [
                        {
                            "role": "system",
                            "content": (
                                "Extrae eventos de riesgo social del texto. Busca: fosas, balaceras, secuestros, trata. "
                                'Responde SOLO JSON: {"events": [{"event_type": "...", "estado": "...", "municipio": "...", "summary": "...", "confidence": 0.0}]}'
                            ),
                        },
                        {"role": "user", "content": f"Texto:\n{artifact.get('content_preview', '')[:1000]}"},
                    ],
                    max_tokens=1024,
                )
                if not text:  # no LLM_API_KEY → skip extraction
                    break
                start = text.find("{")
                end = text.rfind("}") + 1
                if start >= 0 and end > start:
                    parsed = json.loads(text[start:end])
                else:
                    raise ValueError("No JSON in response")
                for ev in parsed.get("events", []):
                    ev["source_url"] = artifact["url"]
                    social_events.append(ev)
        except Exception as e:
            print(f"    LLM error: {e}, skipping event extraction")
            state["errors"].append(f"social_intel LLM: {e}")

    state["social_events"] = social_events
    print(f"  [social_intel_extractor] extracted {len(social_events)} social events")

    # 2. Load pending fichas from Supabase
    try:
        fichas = db_query(
            "SELECT id, nombre_completo, edad, sexo, estado, municipio, fecha_desaparicion, "
            "senas_particulares, senas_lateralidad, confianza_extraccion "
            "FROM fichas WHERE status = 'pendiente' AND nombre_completo IS NOT NULL "
            "ORDER BY confianza_extraccion DESC LIMIT 5"
        )
        state["fichas_to_match"] = fichas
        print(f"  [social_intel_extractor] loaded {len(fichas)} fichas from Supabase")
    except Exception as e:
        print(f"  [social_intel_extractor] Supabase error: {e}")
        state["errors"].append(f"load fichas: {e}")
        state["fichas_to_match"] = []

    return state
