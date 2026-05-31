"""
Run once when bumping OCR model version. Computes file sizes + hashes from
local cache. Output committed to backend/app/data/ocr_manifest.json.
"""
import hashlib
import json
from pathlib import Path

CACHE = Path.home() / ".slideforge" / "data" / "ocr_models"
OUT = Path(__file__).resolve().parents[1] / "app" / "data" / "ocr_manifest.json"

REQUIRED = [
    ("text_recognition", "2025_09_23", "slideforge-ocr/slideforge_text_recognition", "text_recognition_2025_09_23"),
    ("layout", "2025_09_23", "slideforge-ocr/slideforge_layout", "main"),
]
EXPECTED_FILES = [
    "config.json", "model.safetensors", "preprocessor_config.json",
    "processor_config.json", "special_tokens_map.json", "tokenizer_config.json",
    "vocab_math.json", "manifest.json",
]

def sha256(p):
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

def main():
    models = []
    grand_total = 0
    for model_id, version, repo, rev in REQUIRED:
        d = CACHE / model_id / version
        files = []
        total = 0
        for name in EXPECTED_FILES:
            p = d / name
            if not p.exists():
                continue
            files.append({
                "path": name,
                "bytes": p.stat().st_size,
                "sha256": sha256(p),
            })
            total += p.stat().st_size
        models.append({
            "id": model_id,
            "version": version,
            "hf_repo": repo,
            "hf_revision": rev,
            "total_bytes": total,
            "files": files,
        })
        grand_total += total
    
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "schema_version": 2,
        "models": models,
        "total_bytes": grand_total,
        "minimum_disk_bytes": int(grand_total * 1.5),
    }, indent=2))
    print(f"Wrote {OUT} ({grand_total/1e9:.2f}GB)")

if __name__ == "__main__":
    main()
