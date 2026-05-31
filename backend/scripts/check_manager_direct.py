import os, json
# Force manager to use verified cache
os.environ['SLIDEFORGE_OCR_DIR'] = r'C:\Users\user\.slideforge\data\ocr_models'

# Import manager from project
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.services.ocr_asset_manager import OcrAssetManager

mgr = OcrAssetManager.get()
status = mgr.get_status(verify_hashes=False)

out = {
    'cache_dir': status.cache_dir,
    'ready': status.ready,
    'total_required_bytes': status.total_required_bytes,
    'total_present_bytes': status.total_present_bytes,
    'models': [
        {
            'id': m.spec.id,
            'version': m.spec.version,
            'present': m.present,
            'valid': m.valid,
            'bytes_present': m.bytes_present,
        }
        for m in status.models
    ]
}
print(json.dumps(out, indent=2))
