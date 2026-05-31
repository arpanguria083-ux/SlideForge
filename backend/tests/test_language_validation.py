"""Tests for guardrail language rule validation and weight auto-tuning."""

import pytest
import json
import tempfile
import os
from pathlib import Path

# ---- Language rule validation tests ----


def _validate_language_rule_on_slide(
    rule_key: str,
    rule_value: object,
    slide: dict,
) -> tuple[bool, str]:
    """Inline copy of the function from main.py for isolated testing."""
    import re
    full_text = (slide.get("full_text") or "")
    title = (slide.get("title") or "")
    combined = f"{title} {full_text}"
    text_lower = combined.lower().strip()
    word_count = len(re.findall(r"\w+", text_lower))
    key_lower = rule_key.lower()

    hedging_words = {
        "might", "may", "could", "would", "should", "perhaps", "maybe",
        "possibly", "probably", "generally", "typically", "often",
        "somewhat", "relatively", "seems", "appears", "suggests",
        "virtually", "nearly", "almost", "essentially",
    }
    informal_terms = {
        "guys", "awesome", "basically", "actually", "literally",
        "stuff", "things", "really", "very", "quite",
    }
    buzzwords = {
        "synergy", "leverage", "utilize", "paradigm", "disruptive",
        "holistic", "scalable", "robust", "best-in-class", "game-changer",
        "innovative", "world-class", "cutting-edge",
    }
    sentences = re.split(r"[.!?]+", combined)
    long_sentences = sum(1 for s in sentences if len(s.split()) > 30)

    if "hedging" in key_lower or "hedge" in key_lower:
        found = [w for w in hedging_words if w in text_lower]
        if found:
            return False, f"Hedging language detected: {', '.join(sorted(found)[:4])}"
        return True, "No hedging language detected."

    if "informal" in key_lower or "casual" in key_lower or "tone" in key_lower:
        found = [w for w in informal_terms if w in text_lower]
        if found:
            return False, f"Informal language detected: {', '.join(sorted(found)[:4])}"
        return True, "Tone is appropriately formal."

    if "jargon" in key_lower or "buzzword" in key_lower:
        found = [w for w in buzzwords if w in text_lower]
        if found:
            return False, f"Buzzwords / jargon detected: {', '.join(sorted(found)[:4])}"
        return True, "No unnecessary jargon detected."

    if "passive" in key_lower:
        passive_pattern = r"\b(is|are|was|were|been|being)\s+\w+ed\b"
        matches = re.findall(passive_pattern, text_lower)
        if matches:
            return False, f"Passive voice detected ({len(matches)} instance(s)). Consider active voice."
        return True, "No passive voice issues detected."

    if "sentence" in key_lower or "readability" in key_lower:
        if long_sentences >= 1:
            return False, f"{long_sentences} sentence(s) exceed 30 words. Consider splitting."
        return True, "Sentence length is within recommended limits."

    if "word" in key_lower or "terse" in key_lower or "concise" in key_lower:
        if word_count > 100:
            return False, f"Slide has {word_count} words. Consider being more concise (aim for under 100)."
        return True, f"Word count ({word_count}) is within guidelines."

    if "structure" in key_lower:
        has_title = bool(title.strip())
        has_body = bool(full_text.strip())
        if not has_title and has_body:
            return False, "Slide has body text but no clear title."
        if has_title and not has_body:
            return True, "Title-only slide (acceptable for section dividers)."
        return True, "Slide structure is appropriate."

    return True, f"Rule '{rule_key}' passed validation."


class TestLanguageRuleValidation:
    """Tests for per-slide language rule validation."""

    def test_hedging_detected(self):
        slide = {"title": "Analysis", "full_text": "This might perhaps suggest a possible improvement."}
        passed, detail = _validate_language_rule_on_slide("hedging", None, slide)
        assert not passed
        assert "hedging" in detail.lower() or "Hedging" in detail

    def test_hedging_clean(self):
        slide = {"title": "Revenue Growth", "full_text": "Revenue increased by 15% in Q3."}
        passed, detail = _validate_language_rule_on_slide("hedging", None, slide)
        assert passed
        assert "No hedging" in detail

    def test_informal_tone_detected(self):
        slide = {"title": "Overview", "full_text": "This is basically really awesome stuff."}
        passed, detail = _validate_language_rule_on_slide("informal_tone", None, slide)
        assert not passed
        assert "Informal" in detail or "informal" in detail

    def test_informal_tone_clean(self):
        slide = {"title": "Market Analysis", "full_text": "The market demonstrated significant growth."}
        passed, detail = _validate_language_rule_on_slide("tone", None, slide)
        assert passed

    def test_jargon_detected(self):
        slide = {"title": "Strategy", "full_text": "Our synergistic leverage of this paradigm is a game-changer."}
        passed, detail = _validate_language_rule_on_slide("jargon", None, slide)
        assert not passed
        assert "Buzzwords" in detail or "jargon" in detail

    def test_jargon_clean(self):
        slide = {"title": "Results", "full_text": "Revenue grew 12% year over year driven by increased market share."}
        passed, detail = _validate_language_rule_on_slide("buzzword", None, slide)
        assert passed

    def test_passive_voice_detected(self):
        slide = {"title": "Findings", "full_text": "The report was reviewed by the committee. The data was analyzed."}
        passed, detail = _validate_language_rule_on_slide("passive_voice", None, slide)
        assert not passed
        assert "Passive" in detail

    def test_passive_voice_clean(self):
        slide = {"title": "Recommendations", "full_text": "The committee reviewed the report and approved the recommendations."}
        passed, detail = _validate_language_rule_on_slide("passive", None, slide)
        assert passed

    def test_long_sentences_detected(self):
        slide = {"title": "Complex Analysis", "full_text": "This is a very long sentence that goes on and on without any clear stopping point and it just keeps going with more and more words that eventually exceed the recommended thirty word threshold by quite a significant margin indeed."}
        passed, detail = _validate_language_rule_on_slide("sentence_length", None, slide)
        assert not passed
        assert "exceed" in detail

    def test_conciseness_violation(self):
        slide = {"title": "Verbose Slide", "full_text": " ".join(["word"] * 120)}
        passed, detail = _validate_language_rule_on_slide("word_count", None, slide)
        assert not passed
        assert "concise" in detail.lower() or "120" in detail

    def test_conciseness_ok(self):
        slide = {"title": "Brief", "full_text": " ".join(["word"] * 30)}
        passed, detail = _validate_language_rule_on_slide("concise", None, slide)
        assert passed

    def test_structure_title_only(self):
        slide = {"title": "Executive Summary", "full_text": ""}
        passed, detail = _validate_language_rule_on_slide("structure", None, slide)
        assert passed

    def test_structure_body_no_title(self):
        slide = {"title": "", "full_text": "Important content without a proper heading."}
        passed, detail = _validate_language_rule_on_slide("structure", None, slide)
        assert not passed
        assert "title" in detail.lower()

    def test_unknown_rule_passes(self):
        slide = {"title": "Foo", "full_text": "Bar"}
        passed, detail = _validate_language_rule_on_slide("some_unknown_rule", "value", slide)
        assert passed


def _compute_coverage_dimension_penalties(
    guardrail_coverage: list[dict],
) -> dict[str, float]:
    """Inline copy for isolated testing."""
    dimension_map: dict[str, set[str]] = {
        "structure": {"structure", "layout", "framework"},
        "claim_grounding": {"claim_grounding", "claim_extraction"},
        "data_accuracy": {"data_accuracy", "benchmarking", "excel-lineage"},
        "visual": {"visual"},
        "language": {"language", "grammar", "tone", "hedging"},
        "framework": {"framework"},
        "so_what": {"so_what"},
        "benchmarking": {"benchmarking", "data_accuracy"},
    }

    total_per_dim: dict[str, int] = {}
    failed_per_dim: dict[str, int] = {}

    for item in guardrail_coverage:
        source = (item.get("source") or "").lower()
        status = item.get("status", "")
        for dim, keywords in dimension_map.items():
            if any(kw in source for kw in keywords):
                total_per_dim[dim] = total_per_dim.get(dim, 0) + 1
                if status == "failed":
                    failed_per_dim[dim] = failed_per_dim.get(dim, 0) + 1
                break

    penalties: dict[str, float] = {}
    for dim in dimension_map:
        total = total_per_dim.get(dim, 0)
        failed = failed_per_dim.get(dim, 0)
        if total > 0:
            penalties[dim] = min(1.0, failed / total)
        else:
            penalties[dim] = 0.0

    return penalties


class TestCoverageDimensionPenalties:
    """Tests for coverage-based dimension penalty computation."""

    def test_no_failures_no_penalty(self):
        coverage = [
            {"source": "language", "status": "checked"},
            {"source": "visual", "status": "checked"},
        ]
        penalties = _compute_coverage_dimension_penalties(coverage)
        assert penalties.get("language") == 0.0
        assert penalties.get("visual") == 0.0

    def test_all_failed_max_penalty(self):
        coverage = [
            {"source": "language", "status": "failed"},
            {"source": "language", "status": "failed"},
        ]
        penalties = _compute_coverage_dimension_penalties(coverage)
        assert penalties.get("language") == 1.0

    def test_mixed_penalty_ratio(self):
        coverage = [
            {"source": "language", "status": "failed"},
            {"source": "language", "status": "checked"},
            {"source": "language", "status": "checked"},
        ]
        penalties = _compute_coverage_dimension_penalties(coverage)
        assert penalties.get("language") == pytest.approx(1.0 / 3.0)
        assert penalties.get("visual") == 0.0

    def test_multiple_dimensions(self):
        coverage = [
            {"source": "language", "status": "failed"},
            {"source": "visual", "status": "checked"},
            {"source": "claim_grounding", "status": "failed"},
            {"source": "claim_grounding", "status": "failed"},
        ]
        penalties = _compute_coverage_dimension_penalties(coverage)
        assert penalties.get("language") == 1.0
        assert penalties.get("visual") == 0.0
        assert penalties.get("claim_grounding") == 1.0


class TestWeightAutoTuning:
    """Tests for guardrail weight auto-tuning logic."""

    def test_track_and_adjust(self):
        """Integration test: track scores then compute adjusted weights."""
        from app.services.adaptation_loop import adaptation_agent

        # Use a temp db to avoid polluting production data
        tmp_db = tempfile.mktemp(suffix=".db")

        old_db_path = adaptation_agent.db.db_path
        try:
            from app.services.adaptation_loop import AdaptationDatabase
            adaptation_agent.db = AdaptationDatabase(tmp_db)

            engagement = "strategy"
            scores = {
                "structure": 85.0,
                "claim_grounding": 60.0,
                "data_accuracy": 55.0,
                "visual": 90.0,
                "language": 70.0,
                "framework": 80.0,
                "so_what": 45.0,
                "benchmarking": 65.0,
            }
            weights = {
                "structure": 0.15,
                "claim_grounding": 0.15,
                "data_accuracy": 0.10,
                "visual": 0.10,
                "language": 0.10,
                "framework": 0.15,
                "so_what": 0.15,
                "benchmarking": 0.10,
            }

            # Track the same scores multiple times for statistical significance
            for _ in range(10):
                adaptation_agent.track_dimension_scores(engagement, scores, weights)

            adjusted = adaptation_agent.compute_adjusted_weights(engagement, weights, lookback=50)

            # Adjusted weights should still sum to ~1.0
            assert abs(sum(adjusted.values()) - 1.0) < 0.01

            # Low-scoring dimensions (so_what=45, data_accuracy=55) should have increased weight
            assert adjusted.get("so_what", 0) > weights.get("so_what", 0), (
                f"Expected so_what weight to increase: {weights.get('so_what')} -> {adjusted.get('so_what')}"
            )
            assert adjusted.get("data_accuracy", 0) > weights.get("data_accuracy", 0), (
                f"Expected data_accuracy weight to increase: {weights.get('data_accuracy')} -> {adjusted.get('data_accuracy')}"
            )

            # High-scoring dimensions (visual=90, structure=85) should have decreased or stable weight
            assert adjusted.get("visual", 1) <= weights.get("visual", 1) + 0.01

        finally:
            # Clean up temp db
            if os.path.exists(tmp_db):
                os.unlink(tmp_db)
            adaptation_agent.db = AdaptationDatabase(old_db_path)

    def test_no_history_returns_original(self):
        """When no history exists, adjusted weights should match original."""
        from app.services.adaptation_loop import adaptation_agent

        old_db_path = adaptation_agent.db.db_path
        tmp_db = tempfile.mktemp(suffix=".db")
        try:
            from app.services.adaptation_loop import AdaptationDatabase
            adaptation_agent.db = AdaptationDatabase(tmp_db)

            weights = {"a": 0.5, "b": 0.5}
            adjusted = adaptation_agent.compute_adjusted_weights("unknown_type", weights)
            assert adjusted == weights

        finally:
            if os.path.exists(tmp_db):
                os.unlink(tmp_db)
            adaptation_agent.db = AdaptationDatabase(old_db_path)
