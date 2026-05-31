#!/usr/bin/env python3
import time, sys, json, urllib.request

uri = "http://127.0.0.1:8002/api/ocr/status"

def get_status():
    req = urllib.request.Request(uri, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

while True:
    try:
        j = get_status()
    except Exception as e:
        print("request_failed", e, flush=True)
        time.sleep(5)
        continue
    status = j.get("status")
    if status == "running":
        print("RUNNING", j.get("job_id"), j.get("phase"), j.get("message"), flush=True)
        time.sleep(5)
        continue
    else:
        print(json.dumps(j, indent=2), flush=True)
        break
