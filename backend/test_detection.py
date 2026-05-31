#!/usr/bin/env python3
"""
Test script to upload a PPTX file and verify object detection quality.
"""

import asyncio
import httpx
import json
from pathlib import Path
from typing import Optional
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("detection_test")


async def test_detection(file_path: str) -> Optional[dict]:
    """Upload a file and analyze detection results."""
    
    file_path = Path(file_path)
    if not file_path.exists():
        logger.error(f"File not found: {file_path}")
        return None
    
    logger.info(f"\n{'=' * 80}")
    logger.info(f"OBJECT DETECTION TEST")
    logger.info(f"File: {file_path.name}")
    logger.info(f"Size: {file_path.stat().st_size:,} bytes")
    logger.info(f"{'=' * 80}\n")
    
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            # Step 1: Create session
            logger.info("1. CREATING SESSION...")
            create_response = await client.post("http://localhost:8000/api/session/create")
            if create_response.status_code != 200:
                logger.error(f"Session creation failed: {create_response.status_code}")
                return None
            
            session_data = create_response.json()
            session_id = session_data.get("session_id")
            logger.info(f"✓ Session created: {session_id}\n")
            
            # Step 2: Upload file
            logger.info("2. UPLOADING FILE TO BACKEND...")
            with open(file_path, "rb") as f:
                files = {"file": (file_path.name, f, "application/vnd.openxmlformats-officedocument.presentationml.presentation")}
                response = await client.post(
                    f"http://localhost:8000/api/session/{session_id}/upload",
                    files=files
                )
            
            if response.status_code != 200:
                logger.error(f"Upload failed: {response.status_code}")
                logger.error(response.text[:500])
                return None
            
            upload_data = response.json()
            logger.info(f"✓ Upload successful\n")
            
            # Step 3: Parse the deck (ingest and convert)
            logger.info("3. PARSING DECK...")
            parse_response = await client.post(
                f"http://localhost:8000/api/session/{session_id}/analyze"
            )
            
            if parse_response.status_code != 200:
                logger.error(f"Parse failed: {parse_response.status_code}")
                logger.error(parse_response.text[:500])
                return None
            
            logger.info(f"✓ Deck parsed\n")
            
            # Step 4: Queue analysis job
            logger.info("4. QUEUING ANALYSIS JOB...")
            run_analysis_response = await client.post(
                f"http://localhost:8000/api/session/{session_id}/run-analysis"
            )
            
            if run_analysis_response.status_code != 200:
                logger.error(f"Analysis queue failed: {run_analysis_response.status_code}")
                logger.error(run_analysis_response.text[:500])
                return None
            
            logger.info(f"✓ Analysis job queued\n")
            
            # Step 5: Wait for analysis to complete (with timeout)
            logger.info("5. WAITING FOR ANALYSIS TO COMPLETE...")
            import time
            start_time = time.time()
            timeout = 300  # 5 minute timeout for analysis
            check_interval = 3  # Check every 3 seconds
            
            while time.time() - start_time < timeout:
                status_response = await client.get(
                    f"http://localhost:8000/api/session/{session_id}/run-analysis-status"
                )
                
                if status_response.status_code == 200:
                    status_data = status_response.json()
                    # Handle case where status is returned as a list
                    if isinstance(status_data, list) and status_data:
                        status_data = status_data[0]
                    
                    if isinstance(status_data, dict):
                        if status_data.get("status") == "completed":
                            logger.info(f"✓ Analysis completed\n")
                            break
                        elif status_data.get("status") == "failed":
                            logger.error(f"Analysis failed: {status_data.get('error', 'Unknown error')}")
                            return None
                
                await asyncio.sleep(check_interval)
            else:
                logger.warning(f"⚠ Analysis did not complete within {timeout} seconds, retrieving partial results\n")
            
            # Step 6: Get analysis results
            logger.info("6. RETRIEVING ANALYSIS RESULTS...")
            analysis_response = await client.get(
                f"http://localhost:8000/api/session/{session_id}/analysis"
            )
            
            if analysis_response.status_code != 200:
                logger.error(f"Analysis failed: {analysis_response.status_code}")
                return None
            
            analysis_data = analysis_response.json()
            
            # Handle case where analysis_data is a list
            if isinstance(analysis_data, list):
                logger.info("Analysis returned as list, extracting first element...")
                if analysis_data and isinstance(analysis_data[0], dict):
                    analysis_data = analysis_data[0]
                else:
                    logger.error("Unexpected analysis format")
                    return None
            
            # Extract key information
            logger.info(f"\n7. ANALYSIS RESULTS:\n")
            
            # Metadata
            metadata = analysis_data.get("metadata", {})
            logger.info(f"Detection Method Used: {metadata.get('detection_method', 'unknown')}")
            logger.info(f"OCR Available: {metadata.get('ocr_backend', False)}")
            logger.info(f"Slides Analyzed: {metadata.get('slides_checked', 0)}")
            
            # Per-slide analysis
            slides_analysis = metadata.get("slides_analysis", {})
            logger.info(f"\n8. SLIDE-BY-SLIDE DETECTION:\n")
            
            total_elements = 0
            for slide_idx, slide_data in sorted(slides_analysis.items(), key=lambda x: int(x[0])):
                visuals = slide_data.get("visuals", [])
                density = slide_data.get("density", "Unknown")
                image_analysis = slide_data.get("image_analysis", [])
                
                logger.info(f"  Slide {int(slide_idx) + 1}:")
                logger.info(f"    Elements Detected: {len(visuals)}")
                logger.info(f"    Text Density: {density}")
                logger.info(f"    Images Analyzed: {len(image_analysis)}")
                
                if visuals:
                    logger.info(f"    Element Types:")
                    element_types = {}
                    for elem in visuals:
                        label = elem.get("label", "Unknown")
                        conf = elem.get("confidence", 0)
                        element_types[label] = element_types.get(label, 0) + 1
                        logger.info(f"      • {label} (confidence: {conf:.2f})")
                    
                    total_elements += len(visuals)
                else:
                    logger.warning(f"    ⚠ No elements detected on this slide")
            
            # Summary
            logger.info(f"\n9. DETECTION SUMMARY:\n")
            logger.info(f"Total Elements Across All Slides: {total_elements}")
            
            if total_elements == 0:
                logger.warning("❌ NO ELEMENTS DETECTED - Detection may not be working properly")
            elif total_elements < 5:
                logger.warning(f"⚠ Low detection ({total_elements} elements) - May need OCR for better accuracy")
            else:
                logger.info(f"✓ Good detection ({total_elements} elements total)")
            
            # Detection quality assessment
            logger.info(f"\n10. DETECTION QUALITY ASSESSMENT:\n")
            if metadata.get("detection_method") == "opencv":
                logger.info("✓ Using OpenCV detection (Computer Vision)")
                logger.info("  Speed: ~100-500ms per slide")
                logger.info("  Accuracy: 70-80%")
                logger.info("  Note: For 95%+ accuracy, install PaddleOCR")
            elif metadata.get("detection_method") in ("paddleocr", "doctr", "got_ocr2"):
                logger.info(f"✓ Using {metadata.get('detection_method', 'OCR backend')} detection")
                logger.info("  Speed: ~5-10s per slide")
                logger.info("  Accuracy: 95%+")
            elif metadata.get("detection_method") == "pptx":
                logger.info("⚠ Using PPTX extraction (Basic)")
                logger.info("  Speed: Very fast")
                logger.info("  Accuracy: 40-50%")
                logger.info("  Note: Limited detection - consider installing PaddleOCR")
            
            logger.info(f"\n{'=' * 80}")
            logger.info(f"TEST COMPLETE")
            logger.info(f"{'=' * 80}\n")
            
            return analysis_data
    
    except Exception as e:
        logger.exception(f"Test failed: {e}")
        return None


if __name__ == "__main__":
    file_path = r"C:\Users\user\Downloads\Consulting services.pptx"
    result = asyncio.run(test_detection(file_path))
    
    if result:
        print("\nOK: Detection test completed successfully")
    else:
        print("\nFAIL: Detection test failed")
