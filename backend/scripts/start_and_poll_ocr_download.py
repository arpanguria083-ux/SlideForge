#!/usr/bin/env python3
"""Start an OCR download via the backend API and poll the job status.
This posts to /api/ocr/download?backend=doctr and polls /api/ocr/job/{job_id}.
"""
import urllib.request, json, time, sys

BASE = "http://127.0.0.1:8002"


def wait_for_backend(timeout: int = 30, interval: float = 1.0) -> bool:
    """Wait for the backend health endpoint to respond within timeout seconds."""
    import urllib.request, time

    url = f"{BASE}/api/health"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=5) as r:
                if r.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(interval)
    return False


def post_download(backend: str) -> dict:
    url = f"{BASE}/api/ocr/download?backend={backend}"
    req = urllib.request.Request(url, data=b"{}", method="POST", headers={"Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def get_job(job_id: str) -> dict:
    url = f"{BASE}/api/ocr/job/{job_id}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


if __name__ == "__main__":
    backend = "doctr"
    max_polls = 40  # allow longer polling (4s sleep)

    print("Starting OCR download for backend:", backend, flush=True)

    # Ensure backend is up before starting the job; retry if not.
    ok = wait_for_backend(timeout=20, interval=1.0)
    if not ok:
        # Try a few times with backoff to give devs opportunity to start backend
        backoff = 2
        for attempt in range(3):
            print(f"Backend not responding, retrying in {backoff}s (attempt {attempt+1})...", flush=True)
            time.sleep(backoff)
            if wait_for_backend(timeout=10, interval=1.0):
                ok = True
                break
            backoff *= 2

    if not ok:
        print("Backend health endpoint not available; aborting start.", flush=True)
        sys.exit(3)

    try:
        resp = post_download(backend)
    except Exception as e:
        print("start_failed", repr(e), flush=True)
        sys.exit(2)

    print("start_response:", json.dumps(resp, indent=2), flush=True)
    job_id = resp.get("job_id")
    if not job_id:
        print("No job_id returned; exiting.", flush=True)
        sys.exit(0)

    for i in range(max_polls):
        try:
            j = get_job(job_id)
            print(f"[poll {i+1}]", json.dumps(j, indent=2), flush=True)
            status = j.get("status")
            if status in ("completed", "failed", "cancelled"):
                print("Job finished with status:", status, flush=True)
                break
        except Exception as e:
            print("job_request_failed", repr(e), flush=True)
        time.sleep(4)

    print("Done polling (exit).", flush=True)
