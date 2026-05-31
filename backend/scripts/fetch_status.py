import urllib.request, json, sys
try:
    with urllib.request.urlopen('http://127.0.0.1:8002/api/ocr/status', timeout=10) as r:
        print(r.read().decode('utf-8'))
except Exception as e:
    print('error', repr(e))
    sys.exit(1)
