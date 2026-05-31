import json
import sys
from pathlib import Path
# Ensure the backend package root is on sys.path when run as a script from anywhere
root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
from app.services.ocr_asset_manager import OcrAssetManager
m = OcrAssetManager.get()
out = {}
for bid, spec in m.backends.items():
    out[bid] = {
        'label': spec.label,
        'models': [{ 'id': ms.id, 'hf_repo': ms.hf_repo, 'local_dir': ms.local_dir } for ms in spec.models]
    }
print(json.dumps(out, indent=2))
