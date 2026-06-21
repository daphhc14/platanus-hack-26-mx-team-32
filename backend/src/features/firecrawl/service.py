import httpx

from src.config import settings
from .schemas import FirecrawlSearchRequest

FIRECRAWL_URL = "https://api.firecrawl.dev/v2/search"


async def search(req: FirecrawlSearchRequest) -> dict:
    payload = {
        "query": req.query,
        "sources": req.sources,
        "categories": [],
        "tbs": req.tbs,
        "limit": req.limit,
        "location": req.location,
        "scrapeOptions": {
            "onlyMainContent": False,
            "maxAge": 172800000,
            "proxy": "stealth",
            "parsers": ["pdf"],
            "formats": [
                {
                    "type": "json",
                    "schema": {
                        "type": "object",
                        "required": [],
                        "properties": {
                            "relevant_information": {"type": "string"},
                            "additional_notes": {"type": "string"},
                            "source": {"type": "string"},
                        },
                    },
                    "prompt": "extract relevant case information of the victim",
                }
            ],
        },
    }
    async with httpx.AsyncClient() as client:
        r = await client.post(
            FIRECRAWL_URL,
            json=payload,
            headers={
                "Authorization": f"Bearer {settings.firecrawl_api_key}",
                "Content-Type": "application/json",
            },
            timeout=120,
        )
        r.raise_for_status()
        return r.json()
