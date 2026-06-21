import json
from unittest.mock import MagicMock, patch


def test_generate_candidates_node_with_llm():
    """Node returns a list of source dicts when Claude responds correctly."""
    from agents.official_source_researcher import generate_candidates_node

    mock_message = MagicMock()
    mock_message.content = [MagicMock(text=json.dumps([
        {"name": "FGR", "url": "https://www.gob.mx/fgr", "type": "fiscalia"},
    ]))]

    with patch("agents.official_source_researcher.settings") as mock_settings, \
         patch("agents.official_source_researcher.Anthropic") as MockClaude:
        mock_settings.anthropic_api_key = "test-key"
        MockClaude.return_value.messages.create.return_value = mock_message
        state = {"task_id": "t1", "query": "fiscalía jalisco desaparecidos", "candidate_sources": [], "error": None}
        result = generate_candidates_node(state)

    assert result["error"] is None
    assert len(result["candidate_sources"]) == 1
    assert result["candidate_sources"][0]["type"] == "fiscalia"


def test_generate_candidates_node_no_key():
    """Node returns empty list (not an error) when no API key is set."""
    from agents.official_source_researcher import generate_candidates_node

    with patch("agents.official_source_researcher.settings") as mock_settings:
        mock_settings.anthropic_api_key = None
        state = {"task_id": "t1", "query": "fiscalía jalisco", "candidate_sources": [], "error": None}
        result = generate_candidates_node(state)

    assert result["candidate_sources"] == []
    assert result["error"] is None  # graceful degradation


def test_researcher_graph_compiles():
    from agents.official_source_researcher import build_researcher_graph
    app = build_researcher_graph()
    assert app is not None
