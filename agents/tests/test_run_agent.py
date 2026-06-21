"""Tests for run_agent.py CLI."""
from unittest.mock import patch


def test_run_agent_researchers_invokes_with_query(capsys):
    """Test researcher agent CLI invokes app with query and outputs JSON."""
    from agents.run_agent import main

    with patch("agents.run_agent.sys.argv", ["run_agent.py", "researcher", "--query", "test"]), \
         patch("agents.run_agent.create_task", return_value="task-123"), \
         patch("agents.run_agent.researcher_app") as mock_app:
        mock_app.invoke.return_value = {"candidate_sources": [{"name": "FGR", "url": "https://gob.mx"}], "error": None}

        main()

        captured = capsys.readouterr()
        assert "FGR" in captured.out
        mock_app.invoke.assert_called_once()


def test_run_agent_acquirer_invokes_with_url(capsys):
    """Test acquirer agent CLI invokes app with URL and outputs markdown."""
    from agents.run_agent import main

    with patch("agents.run_agent.sys.argv", ["run_agent.py", "acquirer", "--url", "https://example.com"]), \
         patch("agents.run_agent.create_task", return_value="task-456"), \
         patch("agents.run_agent.acquirer_app") as mock_app:
        mock_app.invoke.return_value = {"markdown": "# Test Content", "title": "Test", "error": None}

        main()

        captured = capsys.readouterr()
        assert "Test Content" in captured.out
        mock_app.invoke.assert_called_once()


def test_run_agent_extractor_invokes_with_text(capsys):
    """Test extractor agent CLI invokes app with text and outputs extracted event."""
    from agents.run_agent import main

    with patch("agents.run_agent.sys.argv", ["run_agent.py", "extractor", "--text", "some post text"]), \
         patch("agents.run_agent.create_task", return_value="task-789"), \
         patch("agents.run_agent.extractor_app") as mock_app:
        mock_app.invoke.return_value = {"extracted_event": {"location": "Mexico City", "date": "2024-01-15"}, "error": None}

        main()

        captured = capsys.readouterr()
        assert "Mexico City" in captured.out
        mock_app.invoke.assert_called_once()


def test_run_agent_case_invokes_with_persona_id(capsys):
    """Test case agent CLI invokes app with persona ID and outputs hilo record."""
    from agents.run_agent import main

    with patch("agents.run_agent.sys.argv", ["run_agent.py", "case", "--persona-id", "persona-123"]), \
         patch("agents.run_agent.create_task", return_value="task-101"), \
         patch("agents.run_agent.case_extractor_app") as mock_app:
        mock_app.invoke.return_value = {"hilo_record": {"id": "hilo-001", "status": "active"}, "error": None}

        main()

        captured = capsys.readouterr()
        assert "hilo-001" in captured.out
        mock_app.invoke.assert_called_once()


def test_run_agent_error_handling(capsys):
    """Test CLI handles agent errors gracefully."""
    from agents.run_agent import main

    with patch("agents.run_agent.sys.argv", ["run_agent.py", "recommender"]), \
         patch("agents.run_agent.create_task", return_value="task-err"), \
         patch("agents.run_agent.recommender_app") as mock_app, \
         patch("agents.run_agent.sys.exit") as mock_exit:
        mock_app.invoke.return_value = {"recommendations": [], "error": "Database error"}

        main()

        captured = capsys.readouterr()
        assert "[ERROR] Database error" in captured.err
        mock_exit.assert_called_with(1)
