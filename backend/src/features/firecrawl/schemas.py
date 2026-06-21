from pydantic import BaseModel, Field


class FirecrawlSearchRequest(BaseModel):
    query: str
    sources: list[str] = Field(default=["news", "web", "images"])
    limit: int = 10
    location: str = "Mexico"
    tbs: str | None = "qdr:w"
