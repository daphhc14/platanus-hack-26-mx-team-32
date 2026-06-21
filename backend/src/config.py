from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_key: str
    database_url: str | None = None  # direct Postgres for batch jobs (bypasses RLS)
    gemini_api_key: str | None = None  # embeddings (semantic retrieval)
    firecrawl_api_key: str | None = None  # web/news search for victim cases
    # LLM verifier — only the key is secret; base_url + model are code defaults
    # (still env-overridable). OpenAI-compatible, so any provider works.
    llm_api_key: str | None = None
    llm_base_url: str = "https://openrouter.ai/api/v1"
    llm_model: str = "anthropic/claude-haiku-4.5"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
