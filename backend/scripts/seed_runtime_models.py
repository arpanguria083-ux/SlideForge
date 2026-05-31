from __future__ import annotations

import os
import shutil
from pathlib import Path


REQUIRED_MODELS = [
    "got_ocr2/model.safetensors",
    "got_ocr2/config.json",
]


def _model_ready(target_dir: Path) -> bool:
    return (target_dir / "got_ocr2" / "model.safetensors").exists()


def main() -> int:
    backend_dir = Path(__file__).resolve().parents[1]
    source_root = backend_dir / "model-bundle"
    target_root = Path.home() / ".slideforge" / "data" / "ocr_models"
    target_root.mkdir(parents=True, exist_ok=True)

    os.environ["SLIDEFORGE_DATA_DIR"] = str(target_root.parent)

    if not source_root.exists():
        print(f"Model bundle not found: {source_root}")
        return 1

    for rel_path in REQUIRED_MODELS:
        src = source_root / rel_path
        dst = target_root / rel_path
        if dst.exists():
            print(f"Runtime cache already seeded: {dst}")
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        print(f"Seeded runtime cache: {dst}")

    marker = target_root / ".bundled"
    marker.write_text("seeded-from-repo-bundle", encoding="utf-8")
    print(f"Runtime model cache ready at {target_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
