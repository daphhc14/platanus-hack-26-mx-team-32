"""Supabase client — psycopg2 connection helper (the bus)."""
import psycopg2
import psycopg2.extras
from typing import Any
from agents.config import DATABASE_URL


def get_conn():
    """Get a psycopg2 connection to Supabase."""
    return psycopg2.connect(DATABASE_URL, sslmode="require")


def query(sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    """Run a SELECT and return list of dicts."""
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]


def execute(sql: str, params: tuple = ()) -> None:
    """Run an INSERT/UPDATE/DELETE."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
        conn.commit()


def insert_many(table: str, rows: list[dict]) -> None:
    """Batch insert dicts into a table."""
    if not rows:
        return
    cols = list(rows[0].keys())
    placeholders = ", ".join(["%s"] * len(cols))
    col_list = ", ".join(cols)
    values = [tuple(r.get(c) for c in cols) for r in rows]
    sql = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, values)
        conn.commit()
