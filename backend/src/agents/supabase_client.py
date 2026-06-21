"""DB helper for the agent CLI — psycopg v3, reusing the backend's DATABASE_URL.

The FastAPI app uses a pooled connection per request; the agents are a CLI, so
they open short-lived connections here. Same database, same config (settings).
"""
from typing import Any

import psycopg
from psycopg.rows import dict_row

from src.config import settings


def get_conn():
    return psycopg.connect(settings.database_url, row_factory=dict_row)


def query(sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    """Run a SELECT and return a list of dict rows."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def execute(sql: str, params: tuple = ()) -> None:
    """Run an INSERT/UPDATE/DELETE."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        conn.commit()


def insert_many(table: str, rows: list[dict]) -> None:
    """Batch insert dicts into a table (ON CONFLICT DO NOTHING)."""
    if not rows:
        return
    cols = list(rows[0].keys())
    placeholders = ", ".join(["%s"] * len(cols))
    col_list = ", ".join(cols)
    values = [tuple(r.get(c) for c in cols) for r in rows]
    sql = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"
    with get_conn() as conn, conn.cursor() as cur:
        cur.executemany(sql, values)
        conn.commit()
