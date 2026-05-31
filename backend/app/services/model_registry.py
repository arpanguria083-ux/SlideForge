import gc
import json
import logging
import os
import time
from pathlib import Path


logger = logging.getLogger("slideforge.models")


def _bootstrap_ocr_env() -> None:
    """
    Set HF/OCR env vars at module import time, BEFORE any transformers/paddleocr
    import runs anywhere in the process.

    Pins HF cache paths to SlideForge data dir.
    Forces offline mode if any OCR backend cache already exists.
    """
    explicit_ocr = os.environ.get("SLIDEFORGE_OCR_DIR")
    configured = os.environ.get("SLIDEFORGE_DATA_DIR") or os.environ.get("DATA_DIR")
    data_root = Path(configured).expanduser().resolve() if configured else Path.home() / ".slideforge" / "data"
    # OCR models live under ocr_models/<backend>/<model_id>
    cache_dir = Path(explicit_ocr).expanduser().resolve() if explicit_ocr else data_root / "ocr_models"
    tmp_dir = data_root / "tmp"
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
        tmp_dir.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass

    os.environ.setdefault("MODEL_CACHE_DIR", str(cache_dir))
    os.environ.setdefault("HF_HOME", str(cache_dir / "hf_home"))
    os.environ.setdefault("HUGGINGFACE_HUB_CACHE", str(cache_dir / "hf_home" / "hub"))
    os.environ.setdefault("HF_HUB_CACHE", str(cache_dir / "hf_home" / "hub"))
    os.environ.setdefault("TRANSFORMERS_CACHE", str(cache_dir / "hf_home" / "transformers"))
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    os.environ.setdefault("TMPDIR", str(tmp_dir))
    os.environ.setdefault("TEMP", str(tmp_dir))
    os.environ.setdefault("TMP", str(tmp_dir))

    # Flip offline mode if any backend's model directory exists
    any_backend_ready = any(
        (cache_dir / backend).exists()
        for backend in ("paddleocr", "got_ocr2", "doctr")
    )
    if any_backend_ready:
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
        os.environ["HF_DATASETS_OFFLINE"] = "1"


_bootstrap_ocr_env()


class ModelRegistry:
    _instance = None

    _device = None
    _ocr_status_path = None
    _ocr_cache_scan_ts = 0.0
    _ocr_cached_files: list[dict[str, object]] = []
    _ocr_runtime_status = {
        "phase": "idle",
        "message": "OCR assets not checked yet.",
        "download_active": False,
        "download_required": True,
        "bundled_seeded": False,
        "cache_dir": None,
        "tmp_dir": None,
        "files": [],
        "updated_at": None,
    }

    @classmethod
    def _data_root(cls) -> Path:
        configured = os.environ.get("SLIDEFORGE_DATA_DIR") or os.environ.get("DATA_DIR")
        if configured:
            return Path(configured).expanduser().resolve()
        return Path.home() / ".slideforge" / "data"

    @classmethod
    def _ocr_cache_dir(cls) -> Path:
        configured = os.environ.get("MODEL_CACHE_DIR")
        if configured:
            return Path(configured).expanduser().resolve()
        return cls._data_root() / "ocr_models"

    @classmethod
    def _ocr_tmp_dir(cls) -> Path:
        configured = os.environ.get("TMPDIR")
        if configured:
            return Path(configured).expanduser().resolve()
        return cls._data_root() / "tmp"

    @classmethod
    def _ocr_status_file(cls) -> Path:
        if cls._ocr_status_path is None:
            status_dir = cls._data_root() / "runtime"
            status_dir.mkdir(parents=True, exist_ok=True)
            cls._ocr_status_path = status_dir / "ocr_status.json"
        return cls._ocr_status_path

    @classmethod
    def _persist_ocr_status(cls) -> None:
        try:
            status_path = cls._ocr_status_file()
            status_path.write_text(
                json.dumps(cls._ocr_runtime_status, indent=2),
                encoding="utf-8",
            )
        except Exception:
            logger.debug("Failed to persist OCR status", exc_info=True)

    @classmethod
    def _scan_ocr_cache_files(cls) -> list[dict[str, object]]:
        now = time.time()
        if now - cls._ocr_cache_scan_ts < 2 and cls._ocr_cached_files:
            return cls._ocr_cached_files
        cache_dir = cls._ocr_cache_dir()
        if not cache_dir.exists():
            cls._ocr_cache_scan_ts = now
            cls._ocr_cached_files = []
            return []
        files: list[dict[str, object]] = []
        for file_path in cache_dir.rglob("*"):
            if not file_path.is_file():
                continue
            try:
                stat = file_path.stat()
            except OSError:
                continue
            files.append(
                {
                    "name": file_path.name,
                    "relative_path": str(file_path.relative_to(cache_dir)),
                    "size_bytes": stat.st_size,
                    "modified_at": stat.st_mtime,
                }
            )
        files.sort(key=lambda item: str(item.get("relative_path", "")))
        cls._ocr_cache_scan_ts = now
        cls._ocr_cached_files = files
        return files

    @classmethod
    def _ocr_assets_ready(cls) -> bool:
        try:
            from app.services.ocr_asset_manager import OcrAssetManager
            mgr = OcrAssetManager.get()
            status = mgr.get_status(verify_hashes=False)
            return bool(status.ready)
        except Exception:
            return False

    @classmethod
    def _force_offline_mode(cls, enabled: bool) -> None:
        value = "1" if enabled else "0"
        os.environ["HF_HUB_OFFLINE"] = value
        os.environ["TRANSFORMERS_OFFLINE"] = value
        os.environ["HF_DATASETS_OFFLINE"] = value
        os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"

    @classmethod
    def _set_ocr_runtime_status(
        cls,
        *,
        phase: str,
        message: str,
        download_active: bool,
    ) -> None:
        files = cls._scan_ocr_cache_files()
        bundled_marker = cls._ocr_cache_dir() / ".bundled"
        cls._ocr_runtime_status = {
            **cls._ocr_runtime_status,
            "phase": phase,
            "message": message,
            "download_active": download_active,
            "download_required": not cls._ocr_assets_ready(),
            "offline_ready": cls._ocr_assets_ready(),
            "bundled_seeded": bundled_marker.exists(),
            "cache_dir": str(cls._ocr_cache_dir()),
            "tmp_dir": str(cls._ocr_tmp_dir()),
            "files": files,
            "updated_at": time.time(),
        }
        if phase != cls._ocr_runtime_status.get("phase"):
            cls._persist_ocr_status()

    @classmethod
    def get_runtime_status(cls) -> dict[str, object]:
        try:
            if cls._ocr_status_file().exists():
                persisted = json.loads(cls._ocr_status_file().read_text(encoding="utf-8"))
                if isinstance(persisted, dict):
                    cls._ocr_runtime_status = {**cls._ocr_runtime_status, **persisted}
        except Exception:
            logger.debug("Failed to read OCR runtime status", exc_info=True)

        files = cls._scan_ocr_cache_files()
        status = {
            **cls._ocr_runtime_status,
            "cache_dir": str(cls._ocr_cache_dir()),
            "tmp_dir": str(cls._ocr_tmp_dir()),
            "files": files,
            "download_required": not cls._ocr_assets_ready(),
            "offline_ready": cls._ocr_assets_ready(),
            "bundled_seeded": (cls._ocr_cache_dir() / ".bundled").exists(),
        }
        cls._ocr_runtime_status = status
        cls._persist_ocr_status()
        return status

    @classmethod
    def get_ocr_variant_state(cls) -> dict[str, object]:
        bundled_root = cls._ocr_cache_dir()
        bundle_available = False
        is_lite_backend = False
        try:
            import paddleocr
            import doctr
        except ImportError:
            is_lite_backend = True

        try:
            from app.services.ocr_asset_manager import OcrAssetManager
            mgr = OcrAssetManager.get()
            bundle_available = mgr.bundle_is_seeded()
        except Exception:
            pass
        
        ready = cls._ocr_assets_ready()
        return {
            "variant": "lite" if is_lite_backend else "full",
            "ready": ready,
            "bundleAvailable": bundle_available,
            "runtimeCacheReady": ready,
            "cacheDir": str(bundled_root),
        }

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ModelRegistry, cls).__new__(cls)
            cls._device = None  # Lazy init
        return cls._instance

    @classmethod
    def get_device(cls):
        if cls._device is None:
            try:
                import torch

                cls._device = "cuda" if torch.cuda.is_available() else "cpu"
            except ImportError:
                cls._device = "cpu"
        return cls._device

    @classmethod
    def _ensure_ocr_env(cls):
        """
        Force OCR temp/cache locations to project-local writable directories.
        Always runs (idempotent) — env vars overwritten each call to recover from
        downstream code that might mutate them (e.g. transformers internals).
        """
        cache_dir = cls._ocr_cache_dir()
        tmp_dir = cls._ocr_tmp_dir()
        cache_dir.mkdir(parents=True, exist_ok=True)
        tmp_dir.mkdir(parents=True, exist_ok=True)

        os.environ["MODEL_CACHE_DIR"] = str(cache_dir)
        os.environ["HF_HOME"] = str(cache_dir / "hf_home")
        os.environ["HUGGINGFACE_HUB_CACHE"] = str(cache_dir / "hf_home" / "hub")
        os.environ["HF_HUB_CACHE"] = str(cache_dir / "hf_home" / "hub")
        os.environ["TRANSFORMERS_CACHE"] = str(cache_dir / "hf_home" / "transformers")
        os.environ["TMPDIR"] = str(tmp_dir)
        os.environ["TEMP"] = str(tmp_dir)
        os.environ["TMP"] = str(tmp_dir)
        cls._force_offline_mode(cls._ocr_assets_ready())

    @classmethod
    def warmup_ocr_backend(cls) -> dict[str, object]:
        """
        Warmup the active OCR backend.
        Returns status dict. Safe to call from asyncio.to_thread.
        """
        try:
            from app.services.ocr_asset_manager import OcrAssetManager
            mgr = OcrAssetManager.get()
            active_backend = mgr.active_backend_id()
            
            logger.info("Active OCR backend for warmup: %s", active_backend)
            
            status = mgr.get_status(verify_hashes=False)
            if status.ready:
                logger.info("OCR models ready for %s", active_backend)
                return {
                    "warmed": True,
                    "backend": active_backend,
                    "message": f"{active_backend} backend ready (models available).",
                }
            else:
                return {
                    "warmed": False,
                    "backend": active_backend,
                    "reason": "models_not_ready",
                    "message": f"{active_backend} models not yet ready. Skipping warmup.",
                }
        except Exception as exc:
            logger.error("OCR backend warmup failed: %s", exc)
            return {"warmed": False, "reason": "exception", "message": str(exc)}

    @classmethod
    def get_diagnostics(cls) -> dict[str, object]:
        """
        Structured diagnostics for /diagnostics endpoint.
        Reports paths, asset presence, env config.
        """
        cache_dir = cls._ocr_cache_dir()
        return {
            "cache_dir": str(cache_dir),
            "tmp_dir": str(cls._ocr_tmp_dir()),
            "data_root": str(cls._data_root()),
            "assets_ready": cls._ocr_assets_ready(),
            "bundled_seeded": (cache_dir / ".bundled").exists(),
            "env": {
                "HF_HUB_OFFLINE": os.environ.get("HF_HUB_OFFLINE"),
                "TRANSFORMERS_OFFLINE": os.environ.get("TRANSFORMERS_OFFLINE"),
                "HF_HOME": os.environ.get("HF_HOME"),
                "HF_HUB_CACHE": os.environ.get("HF_HUB_CACHE"),
                "MODEL_CACHE_DIR": os.environ.get("MODEL_CACHE_DIR"),
            },
            "device": cls.get_device(),
        }

    # -------------------------------------------------------------------------
    #  Multi-backend OCR support
    # -------------------------------------------------------------------------

    # Active OCR backend id selected at runtime
    _active_ocr_backend: str = ""
    _ocr_backend_ready: bool = False

    @classmethod
    def initialize_ocr_backend(cls, backend_id: str) -> dict:
        """
        Called after a download completes to initialize the chosen OCR backend.
        Returns a status dict. Safe to call from asyncio.to_thread.
        """
        cls._active_ocr_backend = backend_id
        logger.info("Initializing OCR backend: %s", backend_id)

        try:
            from app.services.ocr_asset_manager import OcrAssetManager
            mgr = OcrAssetManager.get()
            status = mgr.get_status(verify_hashes=False, backend_id=backend_id)
            cls._ocr_backend_ready = status.ready
            return {
                "backend_id": backend_id,
                "ready": status.ready,
                "cache_dir": status.cache_dir,
            }
        except Exception as exc:
            logger.exception("Failed to initialize OCR backend %s", backend_id)
            return {"backend_id": backend_id, "ready": False, "error": str(exc)}

    @classmethod
    def ocr_backend_state(cls) -> dict:
        """
        Return current OCR backend state for the /ocr/health endpoint.
        """
        try:
            from app.services.ocr_asset_manager import OcrAssetManager
            from app.services.device_detector import get as get_device
            mgr = OcrAssetManager.get()
            active = mgr.active_backend_id()
            status = mgr.get_status(verify_hashes=False)
            caps = get_device()
            return {
                "active_backend": active,
                "recommended_backend": caps.recommended_backend,
                "ready": status.ready,
                "cache_dir": status.cache_dir,
            }
        except Exception as exc:
            return {"error": str(exc)}

    @classmethod
    def release_ocr(cls) -> None:
        """Release all OCR predictors and free memory."""
        try:
            from app.services.ocr_detectors import PaddleOCRDetector, DocTRDetector, GOTOCRDetector
            if PaddleOCRDetector._instance:
                PaddleOCRDetector._instance.release()
                PaddleOCRDetector._instance = None
            if DocTRDetector._instance:
                DocTRDetector._instance.release()
                DocTRDetector._instance = None
            if GOTOCRDetector._instance:
                GOTOCRDetector._instance.release()
                GOTOCRDetector._instance = None
        except Exception:
            logger.exception("Failed to release detector singletons")
        cls._active_ocr_backend = ""
        cls._ocr_backend_ready = False
        cls.optimize_memory()

    @classmethod
    def optimize_memory(cls):
        """Aggressive memory cleanup."""
        gc.collect()
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.synchronize()
        except ImportError:
            pass
        logger.info("Memory optimization complete. Device: %s", cls.get_device())


model_registry = ModelRegistry()
