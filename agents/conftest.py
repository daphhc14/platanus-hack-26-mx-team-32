import os

# Provide minimal env vars so that `settings = Settings()` at module level
# does not raise a validation error during pytest collection.
os.environ.setdefault("SUPABASE_URL", "https://placeholder.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "placeholder-key")
