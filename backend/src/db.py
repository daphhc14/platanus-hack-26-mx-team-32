"""Direct Postgres access for the API (bypasses RLS, reads the locked app tables).

A small connection pool opened in the app lifespan. Use as a FastAPI dependency.
"""
from fastapi import Request


def get_db(request: Request):
    with request.app.state.pool.connection() as conn:
        yield conn
