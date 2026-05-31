import importlib
import json
import time
import asyncio

import pytest


@pytest.fixture
def main_module(tmp_path, monkeypatch):
    import app.main as main

    mod = importlib.reload(main)

    mod.data_dir = tmp_path / "data"
    mod.data_dir.mkdir(parents=True, exist_ok=True)

    from app.services.guardrail import GuardrailManager
    from app.services.audit_log import AuditLogService
    from app.agents.template_discovery import template_discovery_agent

    mod.guardrail_manager = GuardrailManager(str(mod.data_dir / "guardrails"))
    mod.audit_log_service = AuditLogService(str(mod.data_dir / "audit_logs"))
    mod.template_discovery_agent = template_discovery_agent

    def _noop_loader():
        return None

    monkeypatch.setattr(mod, "ensure_services_loaded", _noop_loader)
    return mod


def test_template_discovery_produces_guardrail_and_coverage(main_module):
    mod = main_module
    agent = mod.template_discovery_agent

    # Create simple slides with consistent text box positions to trigger visual pattern
    slides = []
    for i in range(2):
        slides.append(
            {
                "index": i,
                "title": f"Recommendation {i}",
                "full_text": "This slide recommends doing X.",
                "text_boxes": [
                    {"x": 10.0, "y": 5.0, "text": "Title", "runs": []},
                    {"x": 10.0, "y": 20.0, "text": "Bullet", "runs": []},
                ],
            }
        )

    # Run async discovery_from_gold_slides using asyncio.run
    guardrail = asyncio.run(agent.discover_from_gold_slides(slides, existing_rules=[]))
    assert hasattr(guardrail, "discovered_patterns"), "Guardrail missing discovered_patterns"
    assert isinstance(guardrail.discovered_patterns, dict), f"discovered_patterns not a dict: {type(guardrail.discovered_patterns)}"
    
    # Debug: print discovered patterns
    visual_patterns = (guardrail.discovered_patterns or {}).get("visual")
    print(f"DEBUG: discovered_patterns = {guardrail.discovered_patterns}")
    print(f"DEBUG: visual_patterns = {visual_patterns}")
    
    # Expect visual patterns discovered due to consistent positions
    assert visual_patterns is not None, f"No visual patterns found in: {guardrail.discovered_patterns}"

    # Verify human_confirmed_rules were created from patterns
    assert guardrail.human_confirmed_rules, f"No human_confirmed_rules created: {guardrail.human_confirmed_rules}"
    
    # Seed a session and attach the discovered guardrail
    session_id = "session-template"
    now_ts = time.time()
    mod.active_sessions[session_id] = {
        "client_namespace": "acme",
        "deck_path": str(mod.data_dir / "uploads" / session_id / "deck.pptx"),
        "slides_data": slides,
        "scorecard": {"composite_score": 60, "annotations": []},
        "annotations_by_slide": {"0": []},
        "deep_analysis_by_slide": {"0": {"agents": [], "judge": {"findings": []}}},
        "agent_metadata": {},
        "history_restored": True,
        "status": "analyzed",
        "created_at_ts": now_ts,
        "last_access_ts": now_ts,
    }

    session = mod.active_sessions[session_id]
    session["guardrail"] = guardrail

    # Simulate a visual failing annotation on slide 0
    slide = slides[0]
    annotations = [
        {
            "slide_index": 0,
            "text": "Figure unclear",
            "category": "visual",
            "severity": "warning",
            "message": "Visual lacks clear label",
        }
    ]

    coverage = mod._build_guardrail_coverage(session, slide, annotations, slide_score=60)
    
    # Debug: print coverage entries
    print(f"DEBUG: coverage entries = {[c.get('id') for c in coverage]}")
    print(f"DEBUG: full coverage = {coverage}")
    
    # Find discovered visual patterns coverage entry
    discovered = [c for c in coverage if c.get("id") == "discovered-visual-patterns"]
    assert discovered, f"Expected discovered-visual-patterns in coverage, got: {coverage}"
    assert discovered[0]["status"] == "failed", f"Expected failed status, got: {discovered[0]}"
    
    print("Test passed: guardrail discovery and coverage working correctly")
