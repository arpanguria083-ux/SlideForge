#!/usr/bin/env python3
# Cancels running OCR download job and prints result
import json, urllib.request, sys, subprocess

STATUS_URL = 'http://127.0.0.1:8002/api/ocr/status'
CANCEL_URL = 'http://127.0.0.1:8002/api/ocr/cancel'

try:
    resp = urllib.request.urlopen(STATUS_URL, timeout=10)
    status = json.load(resp)
except Exception as e:
    print('status_error', repr(e))
    sys.exit(2)

if status.get('status') == 'running':
    job_id = status.get('job_id')
    print('found_running_job', job_id)
    data = json.dumps(job_id).encode('utf-8')
    req = urllib.request.Request(CANCEL_URL, data=data, headers={'Content-Type':'application/json'}, method='POST')
    try:
        r = urllib.request.urlopen(req, timeout=10)
        print('cancel_response', r.read().decode('utf-8'))
    except Exception as e:
        print('cancel_error', repr(e))
        sys.exit(3)
else:
    print('no_running_job')

# Stop uvicorn (find process running app.main:app)
try:
    ps = subprocess.check_output(["powershell", "-NoProfile", "-Command", "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'uvicorn' -or $_.CommandLine -match 'app.main:app' } | Select-Object -First 1 -ExpandProperty ProcessId"], stderr=subprocess.STDOUT, text=True, timeout=10)
    ps = ps.strip()
    if ps:
        print('uvicorn_pid', ps)
        stop = subprocess.check_output(["powershell", "-NoProfile","-Command", f"Stop-Process -Id {ps} -Force; Write-Output 'stopped'"], stderr=subprocess.STDOUT, text=True, timeout=10)
        print('stop_out', stop.strip())
    else:
        print('no_uvicorn_pid')
except subprocess.CalledProcessError as e:
    print('ps_error', e.output)
except Exception as e:
    print('ps_exception', repr(e))

print('done')
