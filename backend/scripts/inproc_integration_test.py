#!/usr/bin/env python3
"""In-process integration test for OCR API endpoints using FastAPI TestClient.

This test runs entirely in-process (no uvicorn) so it's suitable for CI and
local dev. It exercises:
 - /api/ocr/health
 - /api/ocr/detect-device
 - /api/ocr/status
 - /api/ocr/download (start a fake-download)
 - /api/ocr/job/{job_id} (poll until completion)

Set SLIDEFORGE_OCR_FAKE_DOWNLOAD=1 in the environment to avoid network fetches.
"""

import os
import time
import json
from fastapi.testclient import TestClient


def run():
    os.environ.setdefault("SLIDEFORGE_OCR_FAKE_DOWNLOAD", "1")
    import sys
    from pathlib import Path
    # Ensure repo root is on sys.path (so `import app` works when run from scripts dir)
    repo_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(repo_root))
    from app.main import app

    client = TestClient(app)

    print("Checking /api/ocr/health")
    r = client.get("/api/ocr/health")
    print(r.status_code, r.text)
    assert r.status_code == 200

    print("Detect device")
    r = client.get("/api/ocr/detect-device")
    print(r.status_code, r.text)
    assert r.status_code == 200

    print("Get status")
    r = client.get("/api/ocr/status")
    print(r.status_code)
    assert r.status_code == 200

    print("Starting fake download for 'doctr'")
    r = client.post("/api/ocr/download?backend=doctr", json={})
    print(r.status_code, r.json())
    assert r.status_code == 200
    job_id = r.json().get("job_id")
    assert job_id

    # poll job
    final = None
    for i in range(60):
        r = client.get(f"/api/ocr/job/{job_id}")
        assert r.status_code == 200
        data = r.json()
        print(f"[poll {i+1}] status={data.get('status')} phase={data.get('phase')}")
        # Consider 'already_ready' a successful short-circuit (assets already present)
        if data.get("status") in ("completed", "failed", "cancelled") or data.get("phase") == "already_ready":
            final = data
            break
        time.sleep(1)

    print("Final job state:", json.dumps(final or data, indent=2))
    assert final is not None and final.get("phase") in ("already_ready", "ready") or (final and final.get("status") == "completed")


if __name__ == "__main__":
    run()
