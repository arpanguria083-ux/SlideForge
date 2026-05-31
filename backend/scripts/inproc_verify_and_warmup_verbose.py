#!/usr/bin/env python3
import json, sys, traceback

try:
    from app.services.ocr_asset_manager import OcrAssetManager
    from app.services.model_registry import model_registry
    from app.services.device_detector import get as get_device
except Exception as e:
    print('import_failed', repr(e))
    traceback.print_exc()
    sys.exit(2)


def pretty(x):
    return json.dumps(x, indent=2, default=str)

print('STEP: mgr.get()', flush=True)
mgr = OcrAssetManager.get()
print('STEP: mgr.cache_dir', str(mgr.cache_dir), flush=True)

print('STEP: get_status verify_hashes=True', flush=True)
try:
    status = mgr.get_status(verify_hashes=True, backend_id='doctr')
    print('status_verify:', pretty({
        'active_backend': status.active_backend,
        'ready': status.ready,
        'cache_dir': status.cache_dir,
        'total_required_bytes': status.total_required_bytes,
        'total_present_bytes': status.total_present_bytes,
    }), flush=True)
except Exception as e:
    print('status_failed', repr(e), flush=True)
    traceback.print_exc()

print('STEP: device detector', flush=True)
try:
    caps = get_device()
    print('device_caps:', pretty({
        'platform': caps.platform,
        'python_arch': caps.python_arch,
        'cuda_available': caps.cuda_available,
        'cuda_device_name': caps.cuda_device_name,
        'cuda_vram_mb': caps.cuda_vram_mb,
        'mps_available': caps.mps_available,
        'ram_total_mb': caps.ram_total_mb,
        'recommended_backend': caps.recommended_backend,
    }), flush=True)
except Exception as e:
    print('device_failed', repr(e), flush=True)
    traceback.print_exc()

print('STEP: initialize_ocr_backend', flush=True)
try:
    init = model_registry.initialize_ocr_backend('doctr')
    print('initialize_ocr_backend:', pretty(init), flush=True)
except Exception as e:
    print('initialize_failed', repr(e), flush=True)
    traceback.print_exc()

print('STEP: ocr_backend_state', flush=True)
try:
    state = model_registry.ocr_backend_state()
    print('ocr_backend_state:', pretty(state), flush=True)
except Exception as e:
    print('state_failed', repr(e), flush=True)
    traceback.print_exc()

print('DONE', flush=True)
