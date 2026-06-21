"""Hilo LangGraph — StateGraph with 5 agent nodes + CLI entry."""
import json
import uuid
from langgraph.graph import StateGraph, START, END
from agents.state import AgentState
from agents.nodes.official_source_researcher import official_source_researcher
from agents.nodes.public_web_acquirer import public_web_acquirer
from agents.nodes.social_intel_extractor import social_intel_extractor
from agents.nodes.missing_case_extractor import missing_case_extractor
from agents.nodes.review_recommender import review_recommender
from agents.supabase_client import execute as db_execute


def build_graph():
    """Build the LangGraph StateGraph."""
    graph = StateGraph(AgentState)

    graph.add_node("official_source_researcher", official_source_researcher)
    graph.add_node("public_web_acquirer", public_web_acquirer)
    graph.add_node("social_intel_extractor", social_intel_extractor)
    graph.add_node("missing_case_extractor", missing_case_extractor)
    graph.add_node("review_recommender", review_recommender)

    graph.add_edge(START, "official_source_researcher")
    graph.add_edge("official_source_researcher", "public_web_acquirer")
    graph.add_edge("public_web_acquirer", "social_intel_extractor")
    graph.add_edge("social_intel_extractor", "missing_case_extractor")
    graph.add_edge("missing_case_extractor", "review_recommender")
    graph.add_edge("review_recommender", END)

    return graph.compile()


def run_pipeline():
    """Run the full agent pipeline."""
    run_id = str(uuid.uuid4())[:8]
    print(f"\n━━━ Hilo Agent Pipeline (run: {run_id}) ━━━\n")

    try:
        db_execute(
            "INSERT INTO agent_tasks (run_id, agent_name, status) VALUES (%s, %s, %s)",
            (run_id, "pipeline", "running"),
        )
    except Exception:
        pass

    initial_state: AgentState = {
        "run_id": run_id,
        "sources_found": [],
        "artifacts_acquired": [],
        "social_events": [],
        "fichas_to_match": [],
        "match_results": [],
        "review_tasks": [],
        "errors": [],
    }

    app = build_graph()
    final_state = app.invoke(initial_state)

    try:
        db_execute(
            "UPDATE agent_tasks SET status = 'done', finished_at = now() WHERE run_id = %s AND agent_name = 'pipeline'",
            (run_id,),
        )
    except Exception:
        pass

    print(f"\n━━━ Resumen (run: {run_id}) ━━━")
    print(f"  Sources found:      {len(final_state.get('sources_found', []))}")
    print(f"  Artifacts acquired: {len(final_state.get('artifacts_acquired', []))}")
    print(f"  Social events:      {len(final_state.get('social_events', []))}")
    print(f"  Fichas matched:     {len(final_state.get('fichas_to_match', []))}")
    print(f"  Match results:      {len(final_state.get('match_results', []))}")
    print(f"  Review tasks:       {len(final_state.get('review_tasks', []))}")
    if final_state.get("errors"):
        print(f"  Errors:             {len(final_state['errors'])}")
        for e in final_state["errors"][:3]:
            print(f"    - {e[:80]}")

    output = {
        "run_id": run_id,
        "sources": len(final_state.get("sources_found", [])),
        "artifacts": len(final_state.get("artifacts_acquired", [])),
        "social_events": len(final_state.get("social_events", [])),
        "fichas_matched": len(final_state.get("fichas_to_match", [])),
        "matches": len(final_state.get("match_results", [])),
        "review_tasks": len(final_state.get("review_tasks", [])),
        "errors": len(final_state.get("errors", [])),
    }
    print(f"\n{json.dumps(output, indent=2)}")

    return final_state


if __name__ == "__main__":
    run_pipeline()
