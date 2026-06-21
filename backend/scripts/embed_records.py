"""Backfill embeddings. Incremental by default (only records missing one);
pass --all to re-embed everything (e.g. after the source text changed).

    uv run python -m scripts.embed_records          # only the missing ones
    uv run python -m scripts.embed_records --all     # force full re-embed
"""
import sys

import psycopg

from src.config import settings
from src.features.matching.service import backfill_embeddings


def main() -> None:
    assert settings.database_url, "DATABASE_URL not set"
    force = "--all" in sys.argv or "--force" in sys.argv
    with psycopg.connect(settings.database_url) as conn:
        n = backfill_embeddings(conn, force=force)
        conn.commit()
    print(f"embedded {n} record(s) ({'all' if force else 'missing only'})")


if __name__ == "__main__":
    main()
