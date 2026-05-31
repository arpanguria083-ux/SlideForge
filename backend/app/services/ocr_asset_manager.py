"""
ocr_asset_manager.py  (v2 - multi-backend)

Single Source of Truth for all OCR backend assets.
Supports: paddleocr, got_ocr2, doctr.
Replaces the Surya-only v1 implementation.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Literal, Optional

logger = logging.getLogger("slideforge.ocr_assets")


# -- Manifest dataclasses -----------------------------------------------------

@dataclass(frozen=True)
class FileSpec:
    path: str
    bytes: int
    sha256: str  # empty string -> skip hash check (provisional manifest)


@dataclass(frozen=True)
class ModelSpec:
    id: str
    label: str
    hf_repo: str
    hf_revision: str
    hf_subfolder: str
    local_dir: str  # relative to cache_dir
    total_bytes: int
    files: tuple[FileSpec, ...]


@dataclass(frozen=True)
class BackendSpec:
    id: str
    label: str
    description: str
    recommended_for: tuple[str, ...]
    size_label: str
    pip_package: str
    pip_extras: tuple[str, ...]
    min_ram_mb: int
    models: tuple[ModelSpec, ...]
    available_in_lite: bool = True  # False = library not bundled in LITE EXE


# -- Status dataclasses -------------------------------------------------------

@dataclass
class FileStatus:
    spec: FileSpec
    present: bool
    size_match: bool
    hash_match: Optional[bool]  # None -> not checked


@dataclass
class ModelStatus:
    spec: ModelSpec
    present: bool
    valid: bool
    bytes_present: int
    files: list[FileStatus] = field(default_factory=list)


@dataclass
class BackendStatus:
    spec: BackendSpec
    ready: bool
    models: list[ModelStatus] = field(default_factory=list)
    bytes_present: int = 0
    bytes_required: int = 0


@dataclass
class AssetStatus:
    active_backend: str
    ready: bool
    cache_dir: str
    total_required_bytes: int
    total_present_bytes: int
    disk_free_bytes: int
    disk_sufficient: bool
    last_checked: float
    backends: list[BackendStatus] = field(default_factory=list)


# -- Manager ------------------------------------------------------------------

class OcrAssetManager:
    """
    Single source of truth for multi-backend OCR assets.
    Singleton - access via OcrAssetManager.get().
    """

    _instance: Optional["OcrAssetManager"] = None
    _instance_lock = threading.Lock()
    _operation_lock = threading.Lock()

    @classmethod
    def get(cls) -> "OcrAssetManager":
        with cls._instance_lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    @classmethod
    def reset(cls) -> None:
        """Force re-initialization (useful after env changes in tests)."""
        with cls._instance_lock:
            cls._instance = None

    def __init__(self) -> None:
        self.cache_dir: Path = self._resolve_cache_dir()
        self.backends: dict[str, BackendSpec] = self._load_manifest()
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    # -- Path resolution ------------------------------------------------------

    @staticmethod
    def _resolve_cache_dir() -> Path:
        explicit = os.environ.get("SLIDEFORGE_OCR_DIR")
        if explicit:
            return Path(explicit).expanduser().resolve()
        data_dir = os.environ.get("SLIDEFORGE_DATA_DIR") or os.environ.get("DATA_DIR")
        if data_dir:
            return Path(data_dir).expanduser().resolve() / "ocr_models"
        return Path.home() / ".slideforge" / "data" / "ocr_models"

    @staticmethod
    def _load_manifest() -> dict[str, BackendSpec]:
        import sys
        
        possible_paths = []
        
        # 1. Standard PyInstaller _MEIPASS folder (which might be _internal)
        if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
            possible_paths.append(Path(sys._MEIPASS) / "app" / "data" / "ocr_backends_manifest.json")
            possible_paths.append(Path(sys._MEIPASS).parent / "app" / "data" / "ocr_backends_manifest.json")
            possible_paths.append(Path(sys._MEIPASS).parent / "_internal" / "app" / "data" / "ocr_backends_manifest.json")

        # 2. Executable-relative paths (extremely useful in packaged environments)
        if getattr(sys, 'frozen', False):
            exe_dir = Path(sys.executable).parent
            possible_paths.append(exe_dir / "_internal" / "app" / "data" / "ocr_backends_manifest.json")
            possible_paths.append(exe_dir / "app" / "data" / "ocr_backends_manifest.json")
            possible_paths.append(exe_dir / "resources" / "backend" / "_internal" / "app" / "data" / "ocr_backends_manifest.json")
            possible_paths.append(exe_dir / "resources" / "backend" / "app" / "data" / "ocr_backends_manifest.json")

        # 3. Source-relative path (development fallback)
        possible_paths.append(Path(__file__).resolve().parents[1] / "data" / "ocr_backends_manifest.json")
        possible_paths.append(Path(__file__).resolve().parents[2] / "app" / "data" / "ocr_backends_manifest.json")

        # 4. Current working directory fallback
        possible_paths.append(Path.cwd() / "resources" / "backend" / "_internal" / "app" / "data" / "ocr_backends_manifest.json")
        possible_paths.append(Path.cwd() / "resources" / "backend" / "app" / "data" / "ocr_backends_manifest.json")
        possible_paths.append(Path.cwd() / "backend" / "app" / "data" / "ocr_backends_manifest.json")

        manifest_path = None
        for p in possible_paths:
            try:
                resolved = p.resolve()
                if resolved.exists():
                    manifest_path = resolved
                    break
            except Exception:
                pass

        if manifest_path is None:
            # Clean fallback to default standard path to throw the standard exception
            if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
                manifest_path = Path(sys._MEIPASS) / "app" / "data" / "ocr_backends_manifest.json"
            else:
                manifest_path = Path(__file__).resolve().parents[1] / "data" / "ocr_backends_manifest.json"

        with manifest_path.open("r", encoding="utf-8") as f:
            data = json.load(f)

        result: dict[str, BackendSpec] = {}
        for b in data.get("backends", []):
            models = tuple(
                ModelSpec(
                    id=m["id"],
                    label=m.get("label", m["id"]),
                    hf_repo=m["hf_repo"],
                    hf_revision=m.get("hf_revision", "main"),
                    hf_subfolder=m.get("hf_subfolder", ""),
                    local_dir=m["local_dir"],
                    total_bytes=int(m.get("total_bytes", 0)),
                    files=tuple(
                        FileSpec(
                            path=f["path"],
                            bytes=int(f.get("bytes", 0)),
                            sha256=f.get("sha256", ""),
                        )
                        for f in m.get("files", [])
                    ),
                )
                for m in b.get("models", [])
            )
            # Dynamically determine if the backend is actually available/importable in this environment.
            # If not frozen, all are considered available. If frozen, check if they are importable.
            import sys
            is_frozen = getattr(sys, "frozen", False)
            manifest_val = bool(b.get("available_in_lite", True))
            
            is_available = True
            if is_frozen:
                if b["id"] == "paddleocr":
                    try:
                        import paddleocr
                        is_available = True
                    except ImportError:
                        is_available = False
                elif b["id"] == "doctr":
                    try:
                        import doctr
                        is_available = True
                    except ImportError:
                        is_available = False
                else:
                    is_available = manifest_val
            else:
                is_available = True

            result[b["id"]] = BackendSpec(
                id=b["id"],
                label=b.get("label", b["id"]),
                description=b.get("description", ""),
                recommended_for=tuple(b.get("recommended_for", [])),
                size_label=b.get("size_label", ""),
                pip_package=b.get("pip_package", ""),
                pip_extras=tuple(b.get("pip_extras", [])),
                min_ram_mb=int(b.get("min_ram_mb", 0)),
                models=models,
                available_in_lite=is_available,
            )
        return result

    def _model_dir(self, model_spec: ModelSpec) -> Path:
        return self.cache_dir / model_spec.local_dir

    # -- Active backend selection ---------------------------------------------

    def _config_file(self) -> Path:
        """Path to the JSON config file that persists backend selection."""
        return self.cache_dir / ".ocr_config.json"

    def _load_config(self) -> dict:
        try:
            cfg_path = self._config_file()
            if cfg_path.exists():
                import json as _json
                return _json.loads(cfg_path.read_text(encoding="utf-8"))
        except Exception:
            pass
        return {}

    def _save_config(self, cfg: dict) -> None:
        try:
            import json as _json
            cfg_path = self._config_file()
            cfg_path.parent.mkdir(parents=True, exist_ok=True)
            cfg_path.write_text(_json.dumps(cfg, indent=2), encoding="utf-8")
        except Exception as exc:
            logger.warning("Failed to save OCR config: %s", exc)

    def active_backend_id(self) -> str:
        # 1. Runtime env override (highest priority)
        env = os.environ.get("SLIDEFORGE_OCR_BACKEND", "").strip().lower()
        if env and env in self.backends:
            return env
        # 2. Persisted user choice from config file
        cfg = self._load_config()
        persisted = cfg.get("active_backend", "").strip().lower()
        if persisted and persisted in self.backends:
            return persisted
        # 3. Device-aware recommendation
        try:
            from app.services.device_detector import get as get_device
            return get_device().recommended_backend
        except Exception:
            logger.debug("device_detector unavailable; defaulting to doctr")
            return "doctr"

    def set_active_backend(self, backend_id: str) -> None:
        """
        Persist the user's chosen OCR backend to the config file
        and update the process-level env var.
        Raises ValueError for unknown backends.
        """
        if backend_id not in self.backends:
            raise ValueError(f"Unknown OCR backend: {backend_id!r}. Valid: {list(self.backends)}")
        cfg = self._load_config()
        cfg["active_backend"] = backend_id
        self._save_config(cfg)
        os.environ["SLIDEFORGE_OCR_BACKEND"] = backend_id
        logger.info("Active OCR backend set to: %s", backend_id)

    # -- Status ---------------------------------------------------------------

    def get_status(
        self,
        *,
        verify_hashes: bool = False,
        backend_id: Optional[str] = None,
    ) -> AssetStatus:
        active = backend_id or self.active_backend_id()
        target_spec = self.backends.get(active)

        if target_spec is None:
            active = "doctr"
            target_spec = self.backends.get("doctr")
            if target_spec is None:
                return AssetStatus(
                    active_backend=active,
                    ready=False,
                    cache_dir=str(self.cache_dir),
                    total_required_bytes=0,
                    total_present_bytes=0,
                    disk_free_bytes=0,
                    disk_sufficient=False,
                    last_checked=time.time(),
                )

        model_statuses: list[ModelStatus] = []
        total_required = 0
        total_present = 0

        for mspec in target_spec.models:
            mdir = self._model_dir(mspec)
            fstatuses: list[FileStatus] = []
            bpresent = 0
            all_ok = True

            for fspec in mspec.files:
                fpath = mdir / fspec.path
                present = fpath.exists()
                size_ok = False
                hash_ok: Optional[bool] = None
                if present:
                    actual_size = fpath.stat().st_size
                    size_ok = (fspec.bytes == 0) or (actual_size == fspec.bytes)
                    bpresent += actual_size
                    if verify_hashes and size_ok and fspec.sha256:
                        hash_ok = self._sha256(fpath) == fspec.sha256
                if not present or not size_ok or hash_ok is False:
                    all_ok = False

                fstatuses.append(
                    FileStatus(
                        spec=fspec,
                        present=present,
                        size_match=size_ok,
                        hash_match=hash_ok,
                    )
                )

            if not mspec.files:
                all_ok = mdir.exists()
                bpresent = (
                    sum(f.stat().st_size for f in mdir.rglob("*") if f.is_file())
                    if all_ok
                    else 0
                )

            model_statuses.append(
                ModelStatus(
                    spec=mspec,
                    present=mdir.exists(),
                    valid=all_ok,
                    bytes_present=bpresent,
                    files=fstatuses,
                )
            )
            total_required += mspec.total_bytes or 0
            total_present += bpresent

        backend_ready = all(m.valid for m in model_statuses)

        try:
            disk_free = shutil.disk_usage(str(self.cache_dir)).free
        except Exception:
            disk_free = 0

        backend_status = BackendStatus(
            spec=target_spec,
            ready=backend_ready,
            models=model_statuses,
            bytes_present=total_present,
            bytes_required=total_required,
        )

        return AssetStatus(
            active_backend=active,
            ready=backend_ready,
            cache_dir=str(self.cache_dir),
            total_required_bytes=total_required,
            total_present_bytes=total_present,
            disk_free_bytes=disk_free,
            disk_sufficient=disk_free >= max(total_required - total_present, 0) * 1.1,
            last_checked=time.time(),
            backends=[backend_status],
        )

    def get_all_backends_status(self, *, verify_hashes: bool = False) -> dict[str, AssetStatus]:
        return {
            bid: self.get_status(verify_hashes=verify_hashes, backend_id=bid)
            for bid in self.backends
        }

    # -- Download -------------------------------------------------------------

    def download(
        self,
        progress_cb: Callable[[dict], None],
        cancel_flag: Callable[[], bool],
        *,
        backend_id: Optional[str] = None,
        force: bool = False,
    ) -> Literal["completed", "cancelled", "failed"]:
        if not self._operation_lock.acquire(blocking=False):
            raise RuntimeError("Another OCR download is already in progress")

        try:
            active = backend_id or self.active_backend_id()
            spec = self.backends.get(active)
            if spec is None:
                raise ValueError(f"Unknown OCR backend: {active!r}")

            import sys
            if getattr(sys, 'frozen', False) and not spec.available_in_lite:
                raise RuntimeError(
                    f"{spec.label} is not available in this build. "
                    f"It requires the '{spec.pip_package}' package which is not bundled "
                    f"in the LITE installation. Please use the full SlideForge installer "
                    f"or install '{spec.pip_package}' separately."
                )

            status = self.get_status(backend_id=active, verify_hashes=False)
            if status.ready and not force:
                progress_cb({"phase": "already_ready", "message": f"{spec.label} assets already valid"})
                return "completed"

            needed = status.total_required_bytes - status.total_present_bytes
            if status.disk_free_bytes < needed * 1.1 and needed > 0:
                raise RuntimeError(
                    f"Insufficient disk space: need ~{needed / 1e9:.1f} GB, "
                    f"have {status.disk_free_bytes / 1e9:.1f} GB free"
                )

            from huggingface_hub import snapshot_download

            for model_status in status.backends[0].models:
                if cancel_flag():
                    return "cancelled"
                if model_status.valid and not force:
                    continue

                mspec = model_status.spec
                tmp_dir = self.cache_dir / f".tmp.{active}.{mspec.id}"
                final_dir = self._model_dir(mspec)

                progress_cb({
                    "phase": "downloading",
                    "backend_id": active,
                    "model_id": mspec.id,
                    "model_label": mspec.label,
                    "message": f"Downloading {mspec.label}",
                    "bytes_total": mspec.total_bytes,
                    "bytes_done": 0,
                })

                if tmp_dir.exists():
                    shutil.rmtree(tmp_dir, ignore_errors=True)

                dl_kwargs: dict = dict(
                    repo_id=mspec.hf_repo,
                    revision=mspec.hf_revision,
                    local_dir=str(tmp_dir),
                    local_dir_use_symlinks=False,
                )
                if mspec.hf_subfolder:
                    dl_kwargs["allow_patterns"] = [f"{mspec.hf_subfolder}/*"]

                # Support a fake local download mode for offline testing / CI.
                # When SLIDEFORGE_OCR_FAKE_DOWNLOAD=1 is set, create placeholder
                # files locally that match the declared sizes so the rest of the
                # pipeline (verification, atomic rename) can be exercised without
                # needing real HF repos or network access.
                if os.environ.get("SLIDEFORGE_OCR_FAKE_DOWNLOAD") == "1":
                    tmp_dir.mkdir(parents=True, exist_ok=True)
                    for f in mspec.files:
                        if mspec.hf_subfolder:
                            fpath = tmp_dir / mspec.hf_subfolder / f.path
                        else:
                            fpath = tmp_dir / f.path
                        fpath.parent.mkdir(parents=True, exist_ok=True)
                        # Create a file of the expected size by writing zeros in chunks
                        try:
                            size = int(f.bytes or 0)
                        except Exception:
                            size = 0
                        if size <= 0:
                            # small placeholder
                            fpath.write_bytes(b"\n")
                        else:
                            chunk = 1 << 20
                            written = 0
                            with fpath.open("wb") as fh:
                                while written < size:
                                    towrite = min(chunk, size - written)
                                    fh.write(b"\0" * towrite)
                                    written += towrite
                                    # allow cancellation during heavy writes
                                    if cancel_flag():
                                        break
                    # brief pause so filesystem settles
                    time.sleep(0.1)
                else:
                    if mspec.hf_repo == "mindee/doctr":
                        # Direct HTTP download from Mindee static models CDN
                        tmp_dir.mkdir(parents=True, exist_ok=True)
                        url = ""
                        if mspec.id == "doctr_det":
                            url = "https://doctr-static.mindee.com/models?id=v0.7.0/db_resnet50-79bd7d70.pt&src=0"
                        elif mspec.id == "doctr_rec":
                            url = "https://doctr-static.mindee.com/models?id=v0.12.0/crnn_vgg16_bn-0417f351.pt&src=0"
                        
                        if not url:
                            raise ValueError(f"Unknown doctr model spec: {mspec.id}")
                        
                        dest_path = tmp_dir / mspec.files[0].path
                        
                        logger.info("Direct HTTP download from docTR CDN: %s -> %s", url, dest_path)
                        import httpx
                        with httpx.stream("GET", url, follow_redirects=True, timeout=30.0) as response:
                            response.raise_for_status()
                            total = int(response.headers.get("content-length", 0))
                            written = 0
                            with dest_path.open("wb") as f_out:
                                for chunk in response.iter_bytes(chunk_size=16384):
                                    if cancel_flag():
                                        break
                                    f_out.write(chunk)
                                    written += len(chunk)
                                    # Progress callback
                                    progress_cb({
                                        "phase": "downloading",
                                        "backend_id": active,
                                        "model_id": mspec.id,
                                        "model_label": mspec.label,
                                        "message": f"Downloading {mspec.label}",
                                        "bytes_total": total or mspec.total_bytes,
                                        "bytes_done": written,
                                    })
                    elif active == "paddleocr":
                        # Direct HTTP download from Baidu Bos CDN for PaddleOCR models
                        tmp_dir.mkdir(parents=True, exist_ok=True)
                        tar_filename = ""
                        url = ""
                        if mspec.id == "paddleocr_det":
                            tar_filename = "ch_PP-OCRv4_det_infer.tar"
                            url = f"https://paddleocr.bj.bcebos.com/PP-OCRv4/chinese/{tar_filename}"
                        elif mspec.id == "paddleocr_rec":
                            tar_filename = "ch_PP-OCRv4_rec_infer.tar"
                            url = f"https://paddleocr.bj.bcebos.com/PP-OCRv4/chinese/{tar_filename}"
                        elif mspec.id == "paddleocr_cls":
                            tar_filename = "ch_ppocr_mobile_v2.0_cls_infer.tar"
                            url = f"https://paddleocr.bj.bcebos.com/dygraph_v2.0/ch/{tar_filename}"

                        if not url:
                            raise ValueError(f"Unknown paddleocr model spec: {mspec.id}")

                        dest_tar = tmp_dir / tar_filename
                        logger.info("Direct HTTP download from PaddleOCR Baidu CDN: %s -> %s", url, dest_tar)
                        
                        import httpx
                        with httpx.stream("GET", url, follow_redirects=True, timeout=30.0) as response:
                            response.raise_for_status()
                            total = int(response.headers.get("content-length", 0))
                            written = 0
                            with dest_tar.open("wb") as f_out:
                                for chunk in response.iter_bytes(chunk_size=16384):
                                    if cancel_flag():
                                        break
                                    f_out.write(chunk)
                                    written += len(chunk)
                                    progress_cb({
                                        "phase": "downloading",
                                        "backend_id": active,
                                        "model_id": mspec.id,
                                        "model_label": mspec.label,
                                        "message": f"Downloading {mspec.label}",
                                        "bytes_total": total or mspec.total_bytes,
                                        "bytes_done": written,
                                    })
                        
                        if cancel_flag():
                            return "cancelled"
                        
                        # Extract the tar file
                        logger.info("Extracting %s", dest_tar)
                        progress_cb({
                            "phase": "verifying",
                            "model_id": mspec.id,
                            "message": f"Extracting {mspec.label}",
                        })
                        import tarfile
                        with tarfile.open(dest_tar, "r") as tf:
                            for member in tf.getmembers():
                                if member.isfile():
                                    basename = os.path.basename(member.name)
                                    member_f = tf.extractfile(member)
                                    if member_f:
                                        dest_file = tmp_dir / basename
                                        with dest_file.open("wb") as df:
                                            df.write(member_f.read())
                        
                        # Remove the tar file
                        dest_tar.unlink(missing_ok=True)
                    else:
                        snapshot_download(**dl_kwargs)

                if cancel_flag():
                    shutil.rmtree(tmp_dir, ignore_errors=True)
                    return "cancelled"

                # Verify SHA256 (only for files that have a declared hash)
                progress_cb({"phase": "verifying", "model_id": mspec.id, "message": f"Verifying {mspec.label}"})
                for fspec in mspec.files:
                    if not fspec.sha256:
                        continue  # provisional manifest - skip hash check
                    # Account for hf_subfolder: snapshot_download places files at tmp_dir/subfolder/file
                    if mspec.hf_subfolder:
                        fpath = tmp_dir / mspec.hf_subfolder / fspec.path
                    else:
                        fpath = tmp_dir / fspec.path
                    if not fpath.exists():
                        raise RuntimeError(f"Missing file after download: {fspec.path}")
                    if fspec.bytes and fpath.stat().st_size != fspec.bytes:
                        raise RuntimeError(f"Size mismatch: {fspec.path}")
                    actual_hash = self._sha256(fpath)
                    if actual_hash != fspec.sha256:
                        raise RuntimeError(
                            f"Hash mismatch {fspec.path}: "
                            f"expected {fspec.sha256[:16]}, got {actual_hash[:16]}"
                        )

                # Atomic rename
                # When hf_subfolder is set, snapshot_download nests files under tmp_dir/subfolder/
                # We need to rename just that subfolder to final_dir (not the outer tmp_dir).
                if final_dir.exists():
                    # Merge all files from the source directory into the existing final directory
                    src_path = tmp_dir / mspec.hf_subfolder if mspec.hf_subfolder else tmp_dir
                    for item in src_path.iterdir():
                        dest_item = final_dir / item.name
                        if dest_item.exists():
                            if dest_item.is_dir():
                                shutil.rmtree(dest_item, ignore_errors=True)
                            else:
                                dest_item.unlink(missing_ok=True)
                        shutil.move(str(item), str(final_dir))
                    shutil.rmtree(tmp_dir, ignore_errors=True)
                else:
                    final_dir.parent.mkdir(parents=True, exist_ok=True)
                    if mspec.hf_subfolder:
                        src_dir = tmp_dir / mspec.hf_subfolder
                        src_dir.rename(final_dir)
                        shutil.rmtree(tmp_dir, ignore_errors=True)
                    else:
                        tmp_dir.rename(final_dir)

                progress_cb({
                    "phase": "model_complete",
                    "backend_id": active,
                    "model_id": mspec.id,
                    "message": f"Ready: {mspec.label}",
                })

            progress_cb({"phase": "complete", "message": f"All {spec.label} assets downloaded and verified"})
            return "completed"

        except Exception as exc:
            logger.exception("OCR backend download failed")
            progress_cb({"phase": "failed", "error": str(exc), "message": str(exc)})
            return "failed"
        finally:
            self._operation_lock.release()

    # -- Helpers --------------------------------------------------------------

    @staticmethod
    def _sha256(path: Path, chunk: int = 1 << 20) -> str:
        h = hashlib.sha256()
        with path.open("rb") as f:
            while True:
                buf = f.read(chunk)
                if not buf:
                    break
                h.update(buf)
        return h.hexdigest()

    # -- Legacy compat: manifest property pointing to active models -----------

    @property
    def manifest(self):
        """Backward-compat shim for code that iterates manager.manifest."""
        active = self.active_backend_id()
        spec = self.backends.get(active)
        return list(spec.models) if spec else []
