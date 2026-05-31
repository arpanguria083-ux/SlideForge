#!/usr/bin/env python3
"""Seed missing OCR backends.

For each backend in the manifest, attempt a real download. If the real
download fails (e.g., HF access errors), fall back to the fake-download
mode to create placeholder files so the rest of the pipeline can run.
"""
import sys
import os
import traceback
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))

try:
    from app.services.ocr_asset_manager import OcrAssetManager
except Exception as e:
    print("import_failed", e, file=sys.stderr)
    traceback.print_exc()
    sys.exit(2)


def progress(evt: dict) -> None:
    print("PROGRESS", evt, flush=True)


def cancel_flag() -> bool:
    return False


def main() -> int:
    mgr = OcrAssetManager.get()
    backends = list(mgr.backends.keys())
    print("Backends in manifest:", backends)

    for bid in backends:
        try:
            print(f"\n== Checking backend: {bid} ==")
            status = mgr.get_status(verify_hashes=False, backend_id=bid)
            if status.ready:
                print(f"{bid} already ready; skipping.")
                continue

            # Try a real download first
            if os.environ.get("SLIDEFORGE_OCR_FAKE_DOWNLOAD") == "1":
                print("Global fake-download mode enabled; creating placeholders for", bid)
                res = mgr.download(progress, cancel_flag, backend_id=bid, force=False)
                print("Result:", res)
                continue

            print("Attempting real download for", bid)
            res = mgr.download(progress, cancel_flag, backend_id=bid, force=False)
            print("Result:", res)
            if res == "completed":
                continue
            else:
                raise RuntimeError(f"Download returned: {res}")

        except Exception as exc:
            print(f"Real download failed for {bid}: {exc}", file=sys.stderr)
            print("Falling back to fake-download for", bid)
            os.environ["SLIDEFORGE_OCR_FAKE_DOWNLOAD"] = "1"
            try:
                res = mgr.download(progress, cancel_flag, backend_id=bid, force=False)
                print("Fake-seed result:", res)
            except Exception as exc2:
                print(f"Fake-seed also failed for {bid}: {exc2}", file=sys.stderr)
            finally:
                os.environ.pop("SLIDEFORGE_OCR_FAKE_DOWNLOAD", None)

    # Optionally run a warmup/initialize for the active backend
    try:
        from app.services.model_registry import model_registry
        active = OcrAssetManager.get().active_backend_id()
        print("Initializing registry for active backend:", active)
        model_registry.initialize_ocr_backend(active)
        print("Registry initialized.")
    except Exception:
        print("Registry initialization failed (non-fatal)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
