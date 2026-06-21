"""AgentState — shared typed dict for the LangGraph StateGraph."""
from typing import TypedDict


class AgentState(TypedDict):
    run_id: str
    sources_found: list[dict]
    artifacts_acquired: list[dict]
    social_events: list[dict]
    fichas_to_match: list[dict]
    match_results: list[dict]
    review_tasks: list[dict]
    errors: list[str]
