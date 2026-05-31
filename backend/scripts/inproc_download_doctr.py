#!/usr/bin/env python3
"""Run OcrAssetManager.download for 'doctr' in-process and print progress.
This avoids HTTP/API instability by invoking the manager directly.
"""
import sys, time

try:
    from app.services.ocr_asset_manager import OcrAssetManager
except Exception as e:
    print('import_failed', repr(e))
    sys.exit(2)

mgr = OcrAssetManager.get()
backend = 'doctr'

canceled = False

def progress(evt):
    print('PROGRESS', evt, flush=True)

def cancel_flag():
    return canceled

print('Starting in-process download for backend:', backend)
try:
    result = mgr.download(progress, cancel_flag, backend_id=backend, force=False)
    print('DOWNLOAD_RESULT', result)
except Exception as e:
    print('DOWNLOAD_ERROR', repr(e))
    sys.exit(1)

print('Done')
