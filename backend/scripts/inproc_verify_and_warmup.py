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

mgr = OcrAssetManager.get()
print('cache_dir:', str(mgr.cache_dir), flush=True)

status = mgr.get_status(verify_hashes=True, backend_id='doctr')
print('status_verify:', pretty({
    'active_backend': status.active_backend,
    'ready': status.ready,
    'cache_dir': status.cache_dir,
    'total_required_bytes': status.total_required_bytes,
    'total_present_bytes': status.total_present_bytes,
    'backends': [
        {
            'id': b.spec.id,
            'ready': b.ready,
            'bytes_present': b.bytes_present,
            'bytes_required': b.bytes_required,
            'models': [
                {
                    'id': m.spec.id,
                    'valid': m.valid,
                    'bytes_present': m.bytes_present,
                    'files': [
                        {
                            'path': f.spec.path,
                            'present': f.present,
                            'size_match': f.size_match,
                            'hash_match': f.hash_match,
                        }
                        for f in m.files
                    ],
                }
                for m in b.models
            ],
        }
        for b in status.backends
    ],
}), flush=True)

caps = get_device()
print('device_caps:', pretty({
    'platform': caps.platform,
    'python_arch': caps.python_arch,
    'cuda_available': caps.cuda_available,
    'cuda_device_name': caps.cuda_device_name,
    'cuda_vram_mb': caps.cuda_vram_mb,
    'mps_available': caps.mps_available,
    'ram_total_mb': caps.ram_total_mb,
    'ram_available_mb': caps.ram_available_mb,
    'recommended_backend': caps.recommended_backend,
}), flush=True)

init = model_registry.initialize_ocr_backend('doctr')
print('initialize_ocr_backend:', pretty(init), flush=True)

print('ocr_backend_state:', pretty(model_registry.ocr_backend_state()), flush=True)
