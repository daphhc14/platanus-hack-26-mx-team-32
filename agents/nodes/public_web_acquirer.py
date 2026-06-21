"""public_web_acquirer — fetches content from allowed official sources."""
import hashlib
from datetime import datetime
import httpx
from agents.state import AgentState


def public_web_acquirer(state: AgentState) -> AgentState:
    """Fetch markdown content from official source URLs."""
    print(f"  [public_web_acquirer] {len(state.get('sources_found', []))} sources to acquire")

    artifacts = []
    for source in state.get("sources_found", []):
        url = source.get("url", "")
        if not url or not url.startswith("http"):
            continue
        try:
            resp = httpx.get(url, timeout=10, follow_redirects=True, headers={"User-Agent": "Hilo/1.0"})
            content = resp.text[:5000]
            content_hash = hashlib.sha256(content.encode()).hexdigest()[:16]
            artifacts.append({
                "url": str(resp.url),
                "title": source.get("name", url),
                "content_hash": content_hash,
                "content_preview": content[:500],
                "fetched_at": datetime.utcnow().isoformat(),
                "status_code": resp.status_code,
            })
            print(f"    ✓ {source['name']} ({resp.status_code})")
        except Exception as e:
            print(f"    ✗ {source.get('name', url)}: {e}")
            state["errors"].append(f"acquire {url}: {e}")

    state["artifacts_acquired"] = artifacts
    print(f"  [public_web_acquirer] acquired {len(artifacts)} artifacts")
    return state
