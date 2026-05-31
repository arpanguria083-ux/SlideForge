import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client_module(tmp_path, monkeypatch):
    import app.main as main

    mod = importlib.reload(main)
    data_dir = tmp_path / "data"
    mod.init_state(data_dir)

    async def _noop_lazy_load_models():
        return None

    monkeypatch.setattr(mod, "_lazy_load_models", _noop_lazy_load_models)

    mod.inference_service.provider_config.api.api_key = ""
    mod.inference_service.current_provider = mod.InferenceProvider.API.value
    mod.inference_service.reinitialize_provider()

    with TestClient(mod.app) as client:
        yield mod, client


def test_diagnostics_endpoint_contract(client_module):
    _mod, client = client_module

    response = client.get("/api/diagnostics")
    assert response.status_code == 200

    payload = response.json()
    assert payload["status"] in {"ok", "degraded"}
    assert payload["backend"]["status"] == "running"
    assert "startup" in payload
    assert "llm" in payload
    assert "ocr" in payload
    assert "chromadb" in payload
    assert "system" in payload
    assert "analysis" in payload


def test_llm_connection_error_payload_is_structured(client_module):
    _mod, client = client_module

    response = client.get("/api/settings/local-llm/test")
    assert response.status_code == 400

    body = response.json()
    detail = body["detail"]
    assert detail["code"] == "LLM_API_KEY_MISSING"
    assert "Cloud AI" in detail["title"]
    assert "API key" in detail["message"]
    assert "hint" in detail and detail["hint"]

    context = detail["context"]
    assert context["endpoint"] == "/api/settings/local-llm/test"
    assert context["status"] == 400
    assert context.get("requestId")
    assert context.get("timestamp")
