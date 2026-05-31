#!/usr/bin/env python3
import time, json, urllib.request, subprocess, os, sys

status_uri = 'http://127.0.0.1:8002/api/ocr/status'

def req(u, timeout=30):
    req = urllib.request.Request(u, headers={'Accept':'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)

print('diag: start', flush=True)
while True:
    try:
        s = req(status_uri, timeout=10)
    except Exception as e:
        print('status_request_failed', repr(e), flush=True)
        time.sleep(5)
        continue
    t = time.time()
    print('---', time.strftime('%Y-%m-%d %H:%M:%S'), '---', flush=True)
    print('status:', json.dumps(s, indent=2) if isinstance(s, dict) else s, flush=True)
    # run tmp checker
    try:
        script_path = os.path.join(os.path.dirname(__file__), 'check_cache_and_tmp.py')
        out = subprocess.check_output([sys.executable, script_path], stderr=subprocess.STDOUT, timeout=30)
        print('tmp_check:', out.decode('utf-8'), flush=True)
    except Exception as e:
        print('tmp_check_failed', repr(e), flush=True)
    # netstat
    try:
        net = subprocess.check_output(['netstat', '-ano'], stderr=subprocess.STDOUT, timeout=30)
        net = net.decode('utf-8')
        # show lines with ESTABLISHED or LISTENING only
        for line in net.splitlines()[-200:]:
            if 'ESTABLISHED' in line or 'LISTENING' in line:
                print('net:', line, flush=True)
    except Exception as e:
        print('netstat_failed', repr(e), flush=True)

    if isinstance(s, dict) and s.get('status') != 'running':
        print('job not running, exiting diag', flush=True)
        break
    time.sleep(15)
