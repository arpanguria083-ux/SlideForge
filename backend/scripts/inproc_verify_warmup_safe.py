#!/usr/bin/env python3
import json, sys, traceback, threading

try:
    from app.services.ocr_asset_manager import OcrAssetManager
    from app.services.model_registry import model_registry
    import app.services.device_detector as device_detector_module
except Exception as e:
    print('import_failed', repr(e))
    traceback.print_exc()
    sys.exit(2)


def pretty(x):
    return json.dumps(x, indent=2, default=str)

mgr = OcrAssetManager.get()
print('cache_dir:', str(mgr.cache_dir), flush=True)

try:
    status = mgr.get_status(verify_hashes=True, backend_id='doctr')
    print('status_verify ready:', status.ready, 'present_bytes:', status.total_present_bytes, flush=True)
except Exception as e:
    print('status_failed', repr(e), flush=True)

# Safe device probe in separate thread with timeout
caps_result = {}

def probe():
    try:
        caps = device_detector_module.get()
        caps_result['caps'] = caps
    except Exception as e:
        caps_result['error'] = repr(e)

th = threading.Thread(target=probe)
th.daemon = True
th.start()
th.join(5)
if 'caps' in caps_result:
    caps = caps_result['caps']
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
else:
    print('device_probe_timeout_or_error:', caps_result.get('error', 'timeout'), flush=True)

# Initialize and get registry state
try:
    init = model_registry.initialize_ocr_backend('doctr')
    print('initialize_ocr_backend:', pretty(init), flush=True)
except Exception as e:
    print('initialize_failed', repr(e), flush=True)
    traceback.print_exc()

try:
    state = model_registry.ocr_backend_state()
    print('ocr_backend_state:', pretty(state), flush=True)
except Exception as e:
    print('state_failed', repr(e), flush=True)
    traceback.print_exc()

print('DONE', flush=True)
