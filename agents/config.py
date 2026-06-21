"""Config — loads env vars from root .env."""
import os
from pathlib import Path
from dotenv import load_dotenv

_root = Path(__file__).resolve().parent.parent
load_dotenv(_root / ".env")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
DATABASE_URL = os.getenv("DATABASE_URL", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
LLM_MODEL = os.getenv("LLM_MODEL", "claude-haiku-4-5")


def llm_available() -> bool:
    return bool(ANTHROPIC_API_KEY)
