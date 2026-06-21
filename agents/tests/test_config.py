import os

import pytest


def test_settings_load_from_env(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setenv("SUPABASE_KEY", "test-key")
    # Re-import so Settings picks up the monkeypatched env
    import importlib
    import agents.config as cfg_module
    importlib.reload(cfg_module)
    s = cfg_module.Settings()
    assert s.supabase_url == "https://test.supabase.co"
    assert s.supabase_key == "test-key"
    assert s.anthropic_api_key is None


def test_settings_optional_keys(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_KEY", "k")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    import agents.config as cfg_module
    import importlib
    importlib.reload(cfg_module)
    s = cfg_module.Settings()
    assert s.anthropic_api_key == "sk-ant-test"
