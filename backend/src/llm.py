"""Provider-agnostic LLM client (OpenAI-compatible chat completions).

Only LLM_API_KEY is required; base_url + model are config defaults. Returns None
when no key is set, so callers fall back to deterministic logic (the demo must
run with zero external dependencies).
"""
import httpx

from src.config import settings


def chat(messages: list[dict], temperature: float = 0.2, max_tokens: int = 700) -> str | None:
    if not settings.llm_api_key:
        return None
    r = httpx.post(
        f"{settings.llm_base_url}/chat/completions",
        headers={
            "Authorization": f"Bearer {settings.llm_api_key}",
            "X-Title": "Hilo",
        },
        json={
            "model": settings.llm_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        },
        timeout=45,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]
