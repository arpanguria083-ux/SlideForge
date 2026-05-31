#!/usr/bin/env python3
"""
Comprehensive QA test suite for SlideForge backend API endpoints.
Tests all critical endpoints to ensure proper functionality and consistency.
"""

import asyncio
import json
import sys
from typing import Any, Dict
import httpx

BASE_URL = "http://127.0.0.1:8000"

# Test results tracking
test_results = {
    "passed": [],
    "failed": [],
    "errors": [],
}


async def test_endpoint(
    method: str, path: str, expected_status: int = 200, payload: Dict[str, Any] = None
) -> bool:
    """Test a single endpoint and return success status."""
    url = f"{BASE_URL}{path}"
    test_name = f"{method} {path}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if method == "GET":
                response = await client.get(url)
            elif method == "POST":
                response = await client.post(url, json=payload or {})
            else:
                test_results["errors"].append(f"{test_name}: Unknown method {method}")
                return False

            if response.status_code == expected_status:
                test_results["passed"].append(test_name)
                print(f"✓ {test_name} ({response.status_code})")
                return True
            else:
                test_results["failed"].append(
                    f"{test_name} - Expected {expected_status}, got {response.status_code}"
                )
                print(f"✗ {test_name} - Expected {expected_status}, got {response.status_code}")
                return False
    except Exception as e:
        test_results["errors"].append(f"{test_name}: {str(e)}")
        print(f"✗ {test_name} - Error: {str(e)}")
        return False


async def run_all_tests():
    """Run comprehensive backend QA tests."""
    print("\n" + "=" * 70)
    print("SlideForge Backend QA Test Suite")
    print("=" * 70 + "\n")

    print("Testing Health & Diagnostics Endpoints...")
    await test_endpoint("GET", "/api/health")
    await test_endpoint("GET", "/api/diagnostics")

    print("\nTesting Settings Endpoints...")
    await test_endpoint("GET", "/api/settings/ocr-variant")
    await test_endpoint("GET", "/api/settings/local-llm")
    await test_endpoint("GET", "/api/settings/runtime-assets")

    print("\nTesting History Endpoints...")
    await test_endpoint("GET", "/api/history/recent")

    print("\nTesting OCR Endpoints...")
    await test_endpoint("GET", "/api/ocr/backends")
    await test_endpoint("GET", "/api/ocr/detect-device")

    print("\n" + "=" * 70)
    print("Test Summary")
    print("=" * 70)
    print(f"✓ Passed: {len(test_results['passed'])}")
    print(f"✗ Failed: {len(test_results['failed'])}")
    print(f"⚠ Errors: {len(test_results['errors'])}")

    if test_results["failed"]:
        print("\nFailed Tests:")
        for test in test_results["failed"]:
            print(f"  - {test}")

    if test_results["errors"]:
        print("\nErrors:")
        for error in test_results["errors"]:
            print(f"  - {error}")

    # Return exit code based on results
    if test_results["failed"] or test_results["errors"]:
        print("\n❌ Some tests failed. Backend may have issues.")
        return 1
    else:
        print("\n✅ All tests passed. Backend is functioning correctly.")
        return 0


if __name__ == "__main__":
    exit_code = asyncio.run(run_all_tests())
    sys.exit(exit_code)
