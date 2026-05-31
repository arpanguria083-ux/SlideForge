#!/usr/bin/env python3
"""Compute SHA256 for OCR model files found in the local cache and update
`backend/app/data/ocr_backends_manifest.json` with the computed hashes.

Behavior:
- If a model in the manifest already lists files, compute sha256 for each existing
  file and fill the `sha256` field.
- If a model has an empty `files` array, detect the largest 3 files under
  the model directory and add them as file entries with path, bytes and sha256.

This script makes a backup of the manifest before overwriting it.
"""

import hashlib
import json
import sys
from pathlib import Path
import time
import traceback


def sha256_of_file(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            data = f.read(chunk)
            if not data:
                break
            h.update(data)
    return h.hexdigest()


def find_cache_dir() -> Path:
    explicit = sys.environ.get("SLIDEFORGE_OCR_DIR") if hasattr(sys, 'environ') else None
    if explicit:
        return Path(explicit).expanduser().resolve()
    # try reading MODEL_CACHE_DIR env var
    import os
    explicit = os.environ.get("MODEL_CACHE_DIR")
    if explicit:
        return Path(explicit).expanduser().resolve()
    data_dir = os.environ.get("SLIDEFORGE_DATA_DIR") or os.environ.get("DATA_DIR")
    if data_dir:
        return Path(data_dir).expanduser().resolve() / "ocr_models"
    return Path.home() / ".slideforge" / "data" / "ocr_models"


def main():
    try:
        repo_root = Path(__file__).resolve().parents[1]
        manifest_path = repo_root / "app" / "data" / "ocr_backends_manifest.json"
        if not manifest_path.exists():
            print("Manifest not found:", manifest_path)
            return 2

        cache_dir = find_cache_dir()
        print("Cache dir:", cache_dir)
        print("Manifest:", manifest_path)

        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        changed = False

        for b in data.get("backends", []):
            for m in b.get("models", []):
                local_dir = m.get("local_dir")
                model_dir = cache_dir / local_dir
                files = m.get("files", []) or []

                if files:
                    # compute sha256 for declared files when they exist
                    for f in files:
                        p = model_dir / f["path"]
                        if p.exists() and p.is_file():
                            print(f"Computing hash for {p}")
                            h = sha256_of_file(p)
                            size = p.stat().st_size
                            # Update bytes field when it differs from declared value
                            if int(f.get("bytes", 0)) != size:
                                print(f"Updating declared size for {p} -> {size} bytes")
                                f["bytes"] = size
                                changed = True
                            if f.get("sha256") != h:
                                f["sha256"] = h
                                changed = True
                        else:
                            print(f"Declared file not found: {p}")
                else:
                    # detect largest files and add them
                    if not model_dir.exists():
                        print(f"Model dir not present, skipping: {model_dir}")
                        continue
                    # gather candidate files
                    candidates = [p for p in model_dir.rglob("*") if p.is_file()]
                    if not candidates:
                        print(f"No files under {model_dir}")
                        continue
                    candidates.sort(key=lambda p: p.stat().st_size, reverse=True)
                    picks = candidates[:3]
                    new_files = []
                    for p in picks:
                        rel = str(p.relative_to(model_dir))
                        size = p.stat().st_size
                        print(f"Adding file entry {local_dir}/{rel} ({size} bytes)")
                        h = sha256_of_file(p)
                        new_files.append({"path": rel, "bytes": size, "sha256": h})
                        changed = True
                    m["files"] = new_files

        if changed:
            backup = manifest_path.with_suffix(f".json.bak.{int(time.time())}")
            manifest_path.rename(backup)
            manifest_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
            print("Manifest updated; backup written to:", backup)
        else:
            print("No changes to manifest required.")

        return 0

    except Exception:
        traceback.print_exc()
        return 3


if __name__ == "__main__":
    sys.exit(main())
