from unittest.mock import MagicMock, patch


def test_scrape_node_firecrawl():
    """Uses Firecrawl when api key is set."""
    from agents.public_web_acquirer import scrape_node

    mock_result = {"markdown": "# Fiscalía\nInfo aquí", "metadata": {"title": "FGR"}}
    with (
        patch("agents.public_web_acquirer.settings") as mock_settings,
        patch("agents.public_web_acquirer.httpx.get") as mock_get,
    ):
        mock_settings.firecrawl_api_key = "fc-test"
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"data": mock_result}
        mock_get.return_value = mock_response

        state = {"task_id": "t1", "url": "https://gob.mx/fgr", "markdown": "", "title": "", "error": None}
        result = scrape_node(state)

    assert result["markdown"] == "# Fiscalía\nInfo aquí"
    assert result["error"] is None


def test_scrape_node_httpx_fallback():
    """Falls back to httpx when no Firecrawl key."""
    from agents.public_web_acquirer import scrape_node

    with (
        patch("agents.public_web_acquirer.settings") as mock_settings,
        patch("agents.public_web_acquirer.httpx.get") as mock_get,
    ):
        mock_settings.firecrawl_api_key = None
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "<html><body>Hello</body></html>"
        mock_get.return_value = mock_response

        state = {"task_id": "t1", "url": "https://example.com", "markdown": "", "title": "", "error": None}
        result = scrape_node(state)

    assert "Hello" in result["markdown"]
    assert result["error"] is None


def test_acquirer_graph_compiles():
    from agents.public_web_acquirer import build_acquirer_graph
    app = build_acquirer_graph()
    assert app is not None
