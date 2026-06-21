from unittest.mock import MagicMock, patch


def _make_match(score: float, tier: str, age_seconds: int = 0) -> dict:
    from datetime import datetime, timedelta, timezone
    created = (datetime.now(timezone.utc) - timedelta(seconds=age_seconds)).isoformat()
    return {"id": f"mr-{score}", "score": score, "tier": tier, "created_at": created}


def test_score_priority_alta_higher_than_baja():
    from agents.review_recommender import score_priority

    alta = _make_match(0.9, "alta")
    baja = _make_match(0.9, "baja")
    assert score_priority(alta) > score_priority(baja)


def test_score_priority_older_match_higher():
    from agents.review_recommender import score_priority

    fresh = _make_match(0.7, "media", age_seconds=60)
    old = _make_match(0.7, "media", age_seconds=3600)
    assert score_priority(old) > score_priority(fresh)


def test_fetch_pending_node():
    from agents.review_recommender import fetch_pending_node

    matches = [_make_match(0.8, "alta"), _make_match(0.5, "baja")]
    with patch("agents.review_recommender.get_supabase") as mock_sb:
        mock_res = MagicMock()
        mock_res.data = matches
        (mock_sb.return_value.table.return_value
         .select.return_value.limit.return_value.execute.return_value) = mock_res

        state = {"task_id": "t1", "limit": 20, "pending_matches": [], "recommendations": [], "error": None}
        result = fetch_pending_node(state)

    assert len(result["pending_matches"]) == 2


def test_recommender_graph_compiles():
    from agents.review_recommender import build_recommender_graph
    app = build_recommender_graph()
    assert app is not None
