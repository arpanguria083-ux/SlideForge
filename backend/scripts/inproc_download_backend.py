#!/usr/bin/env python3
"""Run OcrAssetManager.download for a specified backend in-process and print progress.
Usage: python scripts/inproc_download_backend.py [backend_id]
"""
import sys, time, os
from pathlib import Path

# Ensure backend package root is on sys.path when run as a script
root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))

# Force real download (unset fake-download) for this run
if os.environ.get("SLIDEFORGE_OCR_FAKE_DOWNLOAD") == "1":
    print("Overriding SLIDEFORGE_OCR_FAKE_DOWNLOAD=1 -> forcing real download by setting to '0'", flush=True)
    os.environ["SLIDEFORGE_OCR_FAKE_DOWNLOAD"] = "0"

try:
    from app.services.ocr_asset_manager import OcrAssetManager
except Exception as e:
    print('import_failed', repr(e), flush=True)
    sys.exit(2)

backend = sys.argv[1] if len(sys.argv) > 1 else 'doctr'
mgr = OcrAssetManager.get()
canceled = False

def progress(evt):
    print('PROGRESS', evt, flush=True)

def cancel_flag():
    return canceled

print('Starting in-process download for backend:', backend, flush=True)
try:
    result = mgr.download(progress, cancel_flag, backend_id=backend, force=False)
    print('DOWNLOAD_RESULT', result, flush=True)
except Exception as e:
    print('DOWNLOAD_ERROR', repr(e), flush=True)
    sys.exit(1)

print('Done', flush=True)
