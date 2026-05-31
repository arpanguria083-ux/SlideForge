#!/usr/bin/env python3
"""
SlideForge Frontend-Backend Integration Test
Validates that frontend and backend are properly connected and all critical features work.
"""

import asyncio
import json
import sys
from typing import Any, Dict
import httpx

FRONTEND_BASE = "http://127.0.0.1:3000"
BACKEND_BASE = "http://127.0.0.1:8000"

# Test results
test_results = {
    "proxy_tests": {"passed": [], "failed": []},
    "direct_backend_tests": {"passed": [], "failed": []},
    "feature_tests": {"passed": [], "failed": []},
}


async def test_proxy_routing():
    """Test that frontend proxy correctly routes /api requests to backend."""
    print("\n📡 Testing Frontend Proxy Routing...")
    endpoints = [
        "/api/health",
        "/api/diagnostics",
        "/api/settings/ocr-variant",
        "/api/settings/local-llm",
        "/api/history/recent",
        "/api/ocr/backends",
    ]

    async with httpx.AsyncClient(timeout=10.0) as client:
        for endpoint in endpoints:
            try:
                # Test through proxy (frontend port)
                resp = await client.get(f"{FRONTEND_BASE}{endpoint}")
                if resp.status_code == 200:
                    test_results["proxy_tests"]["passed"].append(endpoint)
                    print(f"✓ Proxy routing {endpoint}")
                else:
                    test_results["proxy_tests"]["failed"].append(
                        f"{endpoint} (status: {resp.status_code})"
                    )
                    print(f"✗ Proxy routing {endpoint} - Status {resp.status_code}")
            except Exception as e:
                test_results["proxy_tests"]["failed"].append(f"{endpoint} (error: {str(e)})")
                print(f"✗ Proxy routing {endpoint} - Error: {str(e)}")


async def test_direct_backend():
    """Test direct backend connectivity."""
    print("\n🔧 Testing Direct Backend Connectivity...")
    endpoints = [
        ("/api/health", "status"),
        ("/api/settings/ocr-variant", "variant"),
    ]

    async with httpx.AsyncClient(timeout=10.0) as client:
        for endpoint, expected_key in endpoints:
            try:
                resp = await client.get(f"{BACKEND_BASE}{endpoint}")
                if resp.status_code == 200:
                    data = resp.json()
                    if expected_key in data:
                        test_results["direct_backend_tests"]["passed"].append(endpoint)
                        print(f"✓ Backend {endpoint}")
                    else:
                        test_results["direct_backend_tests"]["failed"].append(
                            f"{endpoint} (missing key: {expected_key})"
                        )
                        print(
                            f"✗ Backend {endpoint} - Missing expected key: {expected_key}"
                        )
                else:
                    test_results["direct_backend_tests"]["failed"].append(
                        f"{endpoint} (status: {resp.status_code})"
                    )
                    print(f"✗ Backend {endpoint} - Status {resp.status_code}")
            except Exception as e:
                test_results["direct_backend_tests"]["failed"].append(
                    f"{endpoint} (error: {str(e)})"
                )
                print(f"✗ Backend {endpoint} - Error: {str(e)}")


async def test_feature_health():
    """Test that critical features are healthy."""
    print("\n✨ Testing Feature Health...")

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            # Test OCR readiness
            resp = await client.get(f"{FRONTEND_BASE}/api/settings/ocr-variant")
            if resp.status_code == 200:
                data = resp.json()
                if data.get("ready"):
                    test_results["feature_tests"]["passed"].append("OCR Ready")
                    print("✓ OCR engine is ready")
                else:
                    test_results["feature_tests"]["failed"].append("OCR Not Ready")
                    print("⚠ OCR engine not fully ready (may need download)")
        except Exception as e:
            test_results["feature_tests"]["failed"].append(f"OCR test failed: {str(e)}")
            print(f"✗ OCR test failed: {str(e)}")

        try:
            # Test LLM provider
            resp = await client.get(f"{FRONTEND_BASE}/api/settings/local-llm")
            if resp.status_code == 200:
                data = resp.json()
                if data.get("provider"):
                    test_results["feature_tests"]["passed"].append("LLM Provider Configured")
                    print(f"✓ LLM provider configured: {data.get('provider')}")
                else:
                    test_results["feature_tests"]["failed"].append("No LLM Provider")
                    print("⚠ No LLM provider configured (configure in settings)")
        except Exception as e:
            test_results["feature_tests"]["failed"].append(f"LLM test failed: {str(e)}")
            print(f"✗ LLM test failed: {str(e)}")

        try:
            # Test system diagnostics
            resp = await client.get(f"{FRONTEND_BASE}/api/diagnostics")
            if resp.status_code == 200:
                data = resp.json()
                status = data.get("status")
                if status in ["ok", "degraded"]:
                    test_results["feature_tests"]["passed"].append(f"System: {status}")
                    print(f"✓ System diagnostics: {status}")
                else:
                    test_results["feature_tests"]["failed"].append(f"System: {status}")
                    print(f"✗ System diagnostics: {status}")
        except Exception as e:
            test_results["feature_tests"]["failed"].append(f"Diagnostics failed: {str(e)}")
            print(f"✗ Diagnostics failed: {str(e)}")


async def print_summary():
    """Print comprehensive test summary."""
    print("\n" + "=" * 70)
    print("Integration Test Summary")
    print("=" * 70)

    total_passed = (
        len(test_results["proxy_tests"]["passed"])
        + len(test_results["direct_backend_tests"]["passed"])
        + len(test_results["feature_tests"]["passed"])
    )
    total_failed = (
        len(test_results["proxy_tests"]["failed"])
        + len(test_results["direct_backend_tests"]["failed"])
        + len(test_results["feature_tests"]["failed"])
    )

    print(f"\n📊 Overall Results:")
    print(f"   ✓ Passed: {total_passed}")
    print(f"   ✗ Failed: {total_failed}")

    print(f"\n🌐 Frontend Proxy Tests: {len(test_results['proxy_tests']['passed'])}/{len(test_results['proxy_tests']['passed']) + len(test_results['proxy_tests']['failed'])}")
    if test_results["proxy_tests"]["failed"]:
        for test in test_results["proxy_tests"]["failed"]:
            print(f"   ✗ {test}")

    print(f"\n🔧 Direct Backend Tests: {len(test_results['direct_backend_tests']['passed'])}/{len(test_results['direct_backend_tests']['passed']) + len(test_results['direct_backend_tests']['failed'])}")
    if test_results["direct_backend_tests"]["failed"]:
        for test in test_results["direct_backend_tests"]["failed"]:
            print(f"   ✗ {test}")

    print(f"\n✨ Feature Health: {len(test_results['feature_tests']['passed'])}/{len(test_results['feature_tests']['passed']) + len(test_results['feature_tests']['failed'])}")
    if test_results["feature_tests"]["failed"]:
        for test in test_results["feature_tests"]["failed"]:
            print(f"   ⚠ {test}")

    print("\n" + "=" * 70)

    if total_failed == 0:
        print("✅ All integration tests passed! System is ready for use.")
        print("=" * 70)
        return 0
    else:
        print(f"⚠️  {total_failed} test(s) failed. Review above for details.")
        print("=" * 70)
        return 1


async def run_all_tests():
    """Run all integration tests."""
    await test_proxy_routing()
    await test_direct_backend()
    await test_feature_health()
    return await print_summary()


if __name__ == "__main__":
    exit_code = asyncio.run(run_all_tests())
    sys.exit(exit_code)
