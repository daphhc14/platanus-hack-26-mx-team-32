from fastapi import APIRouter, HTTPException, Query

from src.config import settings
from . import service
from .schemas import FirecrawlSearchRequest

router = APIRouter(prefix="/firecrawl", tags=["firecrawl"])


@router.get("/search")
async def firecrawl_search(
    fullname: str,
    sources: list[str] = Query(default=["news", "web", "images"]),
    limit: int = 10,
    location: str = "Mexico",
    tbs: str | None = "qdr:w",
):
    if not settings.firecrawl_api_key:
        raise HTTPException(status_code=503, detail="FIRECRAWL_API_KEY not configured")
    req = FirecrawlSearchRequest(
        query=fullname,
        sources=sources,
        limit=limit,
        location=location,
        tbs=tbs,
    )
    return await service.search(req)
