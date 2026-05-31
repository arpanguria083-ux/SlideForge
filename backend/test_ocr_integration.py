"""
Test OCR backend integration in detection pipeline.
"""
import sys
import asyncio
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.models.schemas import GuardrailSchema
from app.agents.parallel_analysis import VisualAnalysisAgent
from PIL import Image
import json


async def test_ocr_detection():
    """Test OCR backend detection with a sample slide."""
    
    # Get test slide
    test_file = Path.home() / ".slideforge" / "data" / "uploads" / "814a2916-c47b-48f4-89d7-4b2cc9bd7111" / "Consulting services.pptx"
    if not test_file.exists():
        print(f"Test file not found: {test_file}")
        return
    
    # Load and parse PPTX
    from pptx import Presentation
    prs = Presentation(str(test_file))
    
    # Create preview for first slide
    slide_data = []
    for idx, slide in enumerate(prs.slides[:1]):  # Test with first slide only
        from app.services.pptx_parser import extract_slide_data
        data = extract_slide_data(slide, idx)
        slide_data.append(data)
    
    # Create minimal guardrail
    guardrail = GuardrailSchema(
        template_id="test",
        deck_type="consulting",
        color_scheme="default",
        discovered_patterns={},
        language_rules={}
    )
    
    # Run visual analysis
    agent = VisualAnalysisAgent()
    result = await agent.run(slide_data, guardrail)
    
    print("\n" + "="*70)
    print("OCR BACKEND DETECTION TEST RESULTS")
    print("="*70)
    print(f"\nAgent: {result.agent_name}")
    print(f"Detection Method: {result.metadata.get('detection_method', 'unknown')}")
    print(f"Recommended Backend: {result.metadata.get('recommended_ocr_backend', 'unknown')}")
    print(f"Supported Backends: {result.metadata.get('supported_ocr_backends', [])}")
    print(f"OCR Backend: {result.metadata.get('ocr_backend', False)}")
    print(f"Vision Backend: {result.metadata.get('vision_backend', 'unknown')}")
    print(f"Score: {result.score}")
    print(f"\nFindings: {len(result.findings)}")
    for finding in result.findings[:5]:
        print(f"  - [{finding.severity}] {finding.message}")
    
    # Check slide analysis details
    slides_analysis = result.metadata.get("slides_analysis", {})
    for slide_idx, analysis in slides_analysis.items():
        print(f"\nSlide {slide_idx}:")
        print(f"  Detection Method: {analysis.get('detection_method', 'unknown')}")
        print(f"  Visuals Detected: {len(analysis.get('visuals', []))}")
        print(f"  Density: {analysis.get('density', 'Medium')}")
    
    print("\n" + "="*70)


if __name__ == "__main__":
    asyncio.run(test_ocr_detection())
