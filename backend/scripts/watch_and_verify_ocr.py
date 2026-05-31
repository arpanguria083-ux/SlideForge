#!/usr/bin/env python3
import time, json, urllib.request, sys

status_uri = "http://127.0.0.1:8002/api/ocr/status"
verify_uri = "http://127.0.0.1:8002/api/ocr/verify"

def req(u, timeout=60):
    req = urllib.request.Request(u, headers={"Accept":"application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)

print("watcher: starting", flush=True)
while True:
    try:
        s = req(status_uri, timeout=60)
    except Exception as e:
        print("status_request_failed", repr(e), flush=True)
        time.sleep(10)
        continue
    if isinstance(s, dict) and s.get("status") == "running":
        print("running:", s.get("job_id"), s.get("phase"), s.get("message"), flush=True)
        time.sleep(10)
        continue
    else:
        print("job_finished:", json.dumps(s, indent=2), flush=True)
        # run verify
        try:
            v = req(verify_uri, timeout=300)
            print("verify_result:", json.dumps(v, indent=2), flush=True)
        except Exception as e:
            print("verify_failed:", repr(e), flush=True)
        break
