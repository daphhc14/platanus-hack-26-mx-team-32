from fastapi import Request
from supabase import AsyncClient


def get_supabase(request: Request) -> AsyncClient:
    """Shared Supabase async client, created once in the app lifespan."""
    return request.app.state.supabase
