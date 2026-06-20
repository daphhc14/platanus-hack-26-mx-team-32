"""Gemini embeddings — the semantic RETRIEVAL layer.

gemini-embedding-001 @ 768 dims. Batched REST calls (no SDK). The text we embed
is the señas + filiación + demographics; the rules engine still does correctness.
"""
import time

import httpx

from src.config import settings

_MODEL = "gemini-embedding-001"
_BASE = "https://generativelanguage.googleapis.com/v1beta"
DIM = 768
_THROTTLE_S = 0.7   # stay under the free-tier RPM
_MAX_RETRIES = 6


def _key() -> str:
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY not set")
    return settings.gemini_api_key


def embed_one(text: str, task_type: str = "SEMANTIC_SIMILARITY") -> list[float]:
    body = {
        "content": {"parts": [{"text": text or " "}]},
        "taskType": task_type,
        "outputDimensionality": DIM,
    }
    for attempt in range(_MAX_RETRIES):
        r = httpx.post(
            f"{_BASE}/models/{_MODEL}:embedContent",
            params={"key": _key()},
            json=body,
            timeout=30,
        )
        if r.status_code == 429:
            time.sleep(2**attempt)  # exponential backoff
            continue
        r.raise_for_status()
        return r.json()["embedding"]["values"]
    r.raise_for_status()  # exhausted retries
    raise RuntimeError("unreachable")


def embed_texts(
    texts: list[str], task_type: str = "SEMANTIC_SIMILARITY", progress: bool = False
) -> list[list[float]]:
    out: list[list[float]] = []
    for i, t in enumerate(texts):
        out.append(embed_one(t, task_type))
        if progress and (i + 1) % 50 == 0:
            print(f"  embedded {i + 1}/{len(texts)}")
        time.sleep(_THROTTLE_S)
    return out


def to_vector_literal(vec: list[float]) -> str:
    return "[" + ",".join(repr(float(x)) for x in vec) + "]"


def _clean(v) -> str:
    return str(v).replace("<br>", ", ").strip() if v else ""


def record_text(rec: dict) -> str:
    """Build the embed-able text for a persona or cuerpo (same shape)."""
    parts = [
        _clean(rec.get("sana_particular")),
        _clean(rec.get("media_filiacion")),
        _clean(rec.get("sexo")),
        _clean(rec.get("estado")),
    ]
    return " | ".join(p for p in parts if p) or "sin datos"
