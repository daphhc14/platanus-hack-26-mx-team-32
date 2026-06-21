from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")

    supabase_url: str
    supabase_key: str  # service-role key
    anthropic_api_key: str | None = None
    firecrawl_api_key: str | None = None


settings = Settings()
