from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys
import time
from pathlib import Path


REQUIRED_MODELS = [
    ("got_ocr2", ""),
]


def _hash_file(path: Path, chunk_size: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _dir_size(path: Path) -> int:
    total = 0
    for child in path.rglob("*"):
        if child.is_file():
            try:
                total += child.stat().st_size
            except OSError:
                pass
    return total


def main() -> int:
    backend_dir = Path(__file__).resolve().parents[1]
    bundle_out_env = os.environ.get("SLIDEFORGE_BUNDLE_OUT", "").strip()
    if bundle_out_env:
        bundle_root = Path(bundle_out_env).expanduser().resolve()
    else:
        bundle_root = backend_dir / "model-bundle"
    cache_candidates = [
        backend_dir / ".model-cache",
        Path.home() / "AppData" / "Roaming" / "slideforge-ai" / "data" / "ocr_models",
        Path.home() / ".slideforge" / "data" / "ocr_models",
    ]

    cache_root = next((path for path in cache_candidates if path.exists()), None)
    if cache_root is None:
        print(
            "No local OCR model cache found. Run the backend once online to populate the model cache before packaging.",
            file=sys.stderr,
        )
        return 1

    missing: list[str] = []
    for family, _version in REQUIRED_MODELS:
        model_file = cache_root / family / "model.safetensors"
        if not model_file.exists():
            missing.append(family)

    if missing:
        print(
            "Required OCR models are missing from cache: " + ", ".join(missing),
            file=sys.stderr,
        )
        return 1

    bundle_root.mkdir(parents=True, exist_ok=True)

    print(f"Source cache: {cache_root}")
    manifest_entries: list[dict[str, object]] = []
    for family, _version in REQUIRED_MODELS:
        src = cache_root / family
        dst = bundle_root / family
        dst.parent.mkdir(parents=True, exist_ok=True)
        print(f"  Copying {family} ...")
        shutil.copytree(src, dst, dirs_exist_ok=True)

        # Verify byte-for-byte: weights file size match
        weights_src = src / "model.safetensors"
        weights_dst = dst / "model.safetensors"
        if not weights_dst.exists():
            print(f"  ERROR: weights missing after copy at {weights_dst}", file=sys.stderr)
            return 2
        if weights_src.stat().st_size != weights_dst.stat().st_size:
            print(f"  ERROR: size mismatch for {family}", file=sys.stderr)
            return 2

        manifest_entries.append({
            "family": family,
            "weights_sha256": _hash_file(weights_dst),
            "weights_bytes": weights_dst.stat().st_size,
            "dir_bytes": _dir_size(dst),
        })

    manifest_path = bundle_root / "bundle_manifest.json"
    manifest = {
        "schema_version": 1,
        "generated_at": time.time(),
        "total_bytes": _dir_size(bundle_root),
        "models": manifest_entries,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    total_mb = manifest["total_bytes"] / (1024 * 1024)
    print(f"Bundle prepared: {bundle_root}")
    print(f"  Models: {len(manifest_entries)}")
    print(f"  Size:   {total_mb:.1f} MB")
    print(f"  Manifest: {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
