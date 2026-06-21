from typing import TypedDict


class AgentTaskState(TypedDict):
    """Base state shared by all agents."""
    task_id: str
    error: str | None
