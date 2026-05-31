"""
Quick API test to trigger analysis and check detection method.
"""
import httpx
import asyncio
import json
from pathlib import Path

BASE_URL = "http://127.0.0.1:8000"
TEST_FILE = Path.home() / "Downloads" / "Consulting services.pptx"


async def test_analysis():
    """Create session, upload file, and run analysis."""
    async with httpx.AsyncClient(timeout=120) as client:
        # 1. Create session
        print("Creating session...")
        resp = await client.post(f"{BASE_URL}/api/session/create")
        session = resp.json()
        session_id = session["session_id"]
        print(f"✓ Session created: {session_id}")
        
        # 2. Upload file
        print(f"\nUploading {TEST_FILE.name}...")
        with open(TEST_FILE, "rb") as f:
            files = {"file": (TEST_FILE.name, f, "application/vnd.openxmlformats-officedocument.presentationml.presentation")}
            resp = await client.post(f"{BASE_URL}/api/session/{session_id}/upload", files=files)
        result = resp.json()
        print(f"✓ Upload complete: {result.get('status', 'unknown')}")
        
        # 3. Parse slides
        print("\nParsing slides...")
        resp = await client.post(f"{BASE_URL}/api/session/{session_id}/analyze")
        result = resp.json()
        print(f"✓ Parsing complete: {result.get('slide_count', 0)} slides")
        
        # 4. Run full analysis
        print("\nRunning analysis...")
        resp = await client.post(f"{BASE_URL}/api/session/{session_id}/run-analysis")
        print(f"✓ Analysis started")
        
        # 5. Poll status
        import time
        for i in range(60):  # Poll for up to 60 seconds
            await asyncio.sleep(1)
            resp = await client.get(f"{BASE_URL}/api/session/{session_id}/run-analysis-status")
            status_data = resp.json()
            # Status endpoint returns a list with one dict
            if isinstance(status_data, list) and len(status_data) > 0:
                status = status_data[0]
            else:
                status = status_data if isinstance(status_data, dict) else {}
            
            if status.get("status") == "completed":
                print(f"✓ Analysis completed in {status.get('elapsed_seconds', '?')}s")
                break
            elif status.get("status") == "failed":
                print(f"✗ Analysis failed: {status.get('error', 'unknown')}")
                return
            else:
                print(f"  Status: {status.get('status', 'unknown')} ({i+1}s)...", end="\r")
        
        # 6. Get results
        print("\nFetching results...")
        resp = await client.get(f"{BASE_URL}/api/session/{session_id}/analysis")
        analysis = resp.json()
        
        scorecard = analysis.get("scorecard", {})
        metadata = scorecard.get("metadata", {})
        
        print("\n" + "="*70)
        print("ANALYSIS RESULTS")
        print("="*70)
        print(f"Detection Method: {metadata.get('detection_method', 'unknown')}")
        print(f"Recommended Backend: {metadata.get('recommended_ocr_backend', 'unknown')}")
        print(f"Supported Backends: {metadata.get('supported_ocr_backends', [])}")
        # Surya backend removed; replaced by PaddleOCR
        print(f"Vision Backend: {metadata.get('vision_backend', 'unknown')}")
        print(f"Score: {scorecard.get('composite_score', '?')}")
        print(f"Hard Blocks: {scorecard.get('hard_blocks', 0)}")
        
        # Check per-slide detection methods
        slides_analysis = metadata.get("slides_analysis", {})
        print(f"\nPer-Slide Detection Methods:")
        for slide_idx in sorted(slides_analysis.keys()):
            analysis_info = slides_analysis[slide_idx]
            method = analysis_info.get("detection_method", "unknown")
            visuals = len(analysis_info.get("visuals", []))
            print(f"  Slide {slide_idx}: {method} ({visuals} visuals)")
        
        print("\n" + "="*70)


if __name__ == "__main__":
    asyncio.run(test_analysis())
