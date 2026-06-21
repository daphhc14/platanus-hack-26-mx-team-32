import json
from unittest.mock import MagicMock, patch


def test_extract_node_returns_event():
    from agents.social_intel_extractor import extract_node

    event_json = json.dumps({
        "event_type": "oferta_laboral_sospechosa",
        "estado": "Jalisco",
        "municipio": "Guadalajara",
        "summary": "Oferta de trabajo sospechosa detectada",
        "confidence": 0.85,
        "needs_human_review": True,
    })
    mock_msg = MagicMock()
    mock_msg.content = [MagicMock(text=event_json)]

    with patch("agents.social_intel_extractor.Anthropic") as MockAI:
        MockAI.return_value.messages.create.return_value = mock_msg
        state = {
            "task_id": "t1",
            "text": "Se busca trabajo en Guadalajara, muy buen sueldo sin experiencia",
            "source_url": "https://fb.com/post/123",
            "extracted_event": None,
            "error": None,
        }
        result = extract_node(state)

    assert result["extracted_event"] is not None
    assert result["extracted_event"]["event_type"] == "oferta_laboral_sospechosa"
    assert result["error"] is None


def test_extract_node_fallback_no_key():
    from agents.social_intel_extractor import extract_node

    with patch("agents.social_intel_extractor.settings") as mock_s:
        mock_s.anthropic_api_key = None
        state = {
            "task_id": "t1",
            "text": "Se busca gente para trabajar en el norte buen sueldo sin experiencia",
            "source_url": "https://fb.com/post/456",
            "extracted_event": None,
            "error": None,
        }
        result = extract_node(state)

    # Deterministic fallback: flags the text as suspicious
    assert result["extracted_event"] is not None
    assert result["extracted_event"]["event_type"] in (
        "oferta_laboral_sospechosa", "otro"
    )


def test_extractor_graph_compiles():
    from agents.social_intel_extractor import build_extractor_graph
    app = build_extractor_graph()
    assert app is not None
