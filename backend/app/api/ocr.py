"""
ocr.py  (v2 - multi-backend)

API endpoints for OCR asset management and backend selection.
Backends: paddleocr | got_ocr2 | doctr
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException

from app.services.ocr_asset_manager import OcrAssetManager
import app.services.device_detector as device_detector_module

router = APIRouter(prefix="/api", tags=["ocr"])
logger = logging.getLogger("slideforge.ocr")

# -- Job tracking -------------------------------------------------------------

download_jobs: dict[str, dict] = {}
_cancel_flags: dict[str, bool] = {}


def _ensure_job(job_id: str | None = None) -> dict:
    if job_id is None:
        job_id = str(uuid.uuid4())
    job = download_jobs.get(job_id)
    if job is None:
        job = {
            "job_id": job_id,
            "status": "idle",
            "phase": "idle",
            "message": "OCR models are not downloading.",
            "progress": 0,
            "total": 0,
            "bytes_done": 0,
            "bytes_total": 0,
            "backend_id": None,
            "error": None,
            "download_active": False,
        }
        download_jobs[job_id] = job
        _cancel_flags[job_id] = False
    return job


# -- Serializers --------------------------------------------------------------

def _caps_to_dict(caps) -> dict:
    return {
        "platform": caps.platform,
        "python_arch": caps.python_arch,
        "cuda_available": caps.cuda_available,
        "cuda_device_name": caps.cuda_device_name,
        "cuda_vram_mb": caps.cuda_vram_mb,
        "mps_available": caps.mps_available,
        "ram_total_mb": caps.ram_total_mb,
        "ram_available_mb": caps.ram_available_mb,
        "recommended_backend": caps.recommended_backend,
        "recommended_reason": caps.recommended_reason,
        "all_supported_backends": caps.all_supported_backends,
    }


def _asset_status_to_dict(status) -> dict:
    backends_out = []
    for bs in status.backends:
        models_out = []
        for m in bs.models:
            files_out = [
                {
                    "path": f.spec.path,
                    "bytes": int(f.spec.bytes),
                    "present": bool(f.present),
                    "size_match": bool(f.size_match),
                    "hash_match": (None if f.hash_match is None else bool(f.hash_match)),
                }
                for f in m.files
            ]
            models_out.append({
                "id": m.spec.id,
                "label": m.spec.label,
                "hf_repo": m.spec.hf_repo,
                "total_bytes": int(m.spec.total_bytes),
                "present": bool(m.present),
                "valid": bool(m.valid),
                "bytes_present": int(m.bytes_present),
                "files": files_out,
            })
        backends_out.append({
            "id": bs.spec.id,
            "label": bs.spec.label,
            "description": bs.spec.description,
            "recommended_for": list(bs.spec.recommended_for),
            "size_label": bs.spec.size_label,
            "min_ram_mb": bs.spec.min_ram_mb,
            "ready": bool(bs.ready),
            "available_in_lite": bool(bs.spec.available_in_lite),
            "bytes_present": int(bs.bytes_present),
            "bytes_required": int(bs.bytes_required),
            "models": models_out,
        })
    return {
        "active_backend": status.active_backend,
        "ready": bool(status.ready),
        "cache_dir": status.cache_dir,
        "total_required_bytes": int(status.total_required_bytes),
        "total_present_bytes": int(status.total_present_bytes),
        "disk_free_bytes": int(status.disk_free_bytes),
        "disk_sufficient": bool(status.disk_sufficient),
        "last_checked": float(status.last_checked),
        "backends": backends_out,
    }


# -- Background download task -------------------------------------------------

async def _run_download(job_id: str, backend_id: str, *, force: bool = False) -> None:
    job = download_jobs[job_id]
    job.update({
        "status": "running",
        "phase": "downloading",
        "backend_id": backend_id,
        "message": f"Starting download for backend: {backend_id}",
        "download_active": True,
    })

    manager = OcrAssetManager.get()
    loop = asyncio.get_running_loop()

    def _on_progress(evt: dict):
        if evt is None:
            return
        update: dict = {}
        if "phase" in evt:
            update["phase"] = evt["phase"]
        if "message" in evt:
            update["message"] = evt["message"]
        if "bytes_done" in evt:
            update["bytes_done"] = int(evt["bytes_done"])
        if "bytes_total" in evt:
            update["bytes_total"] = int(evt["bytes_total"])
        if update:
            loop.call_soon_threadsafe(job.update, update)

    def _cancel_flag() -> bool:
        return _cancel_flags.get(job_id, False)

    try:
        result = await asyncio.to_thread(
            manager.download,
            _on_progress,
            _cancel_flag,
            backend_id=backend_id,
            force=force,
        )
        if result == "completed":
            job.update({
                "status": "completed",
                "phase": "ready",
                "message": f"{backend_id} assets ready.",
                "download_active": False,
            })
            await _post_download_warmup(backend_id)
        elif result == "cancelled":
            job.update({"status": "cancelled", "phase": "cancelled", "message": "Cancelled.", "download_active": False})
        else:
            job.update({"status": "failed", "phase": "error", "message": "Download failed.", "download_active": False})
    except Exception as exc:
        logger.exception("Background OCR download failed")
        job.update({"status": "failed", "phase": "error", "error": str(exc), "download_active": False})


async def _post_download_warmup(backend_id: str) -> None:
    """After download completes, reinitialize the model registry for the new backend."""
    try:
        if backend_id == "doctr":
            try:
                import shutil
                from pathlib import Path
                from app.services.ocr_asset_manager import OcrAssetManager
                mgr = OcrAssetManager.get()
                doctr_cache = Path.home() / ".cache" / "doctr" / "models"
                doctr_cache.mkdir(parents=True, exist_ok=True)
                
                # Copy detection
                src_det = mgr.cache_dir / "doctr" / "det" / "db_resnet50.pt"
                dst_det = doctr_cache / "db_resnet50-13f63412.pt"
                if src_det.exists() and not dst_det.exists():
                    shutil.copy2(src_det, dst_det)
                    logger.info("Copied docTR det model to default cache: %s", dst_det)
                
                # Copy recognition
                src_rec = mgr.cache_dir / "doctr" / "rec" / "crnn_vgg16_bn.pt"
                dst_rec = doctr_cache / "crnn_vgg16_bn-f4806a6c.pt"
                if src_rec.exists() and not dst_rec.exists():
                    shutil.copy2(src_rec, dst_rec)
                    logger.info("Copied docTR rec model to default cache: %s", dst_rec)
            except Exception as e_copy:
                logger.warning("Failed to seed doctr system cache path: %s", e_copy)

        from app.services.model_registry import model_registry
        await asyncio.to_thread(model_registry.initialize_ocr_backend, backend_id)
        logger.info("Post-download warmup complete for backend: %s", backend_id)
    except Exception:
        logger.exception("Post-download warmup failed (non-fatal)")


# ===========================================================================
#  Endpoints
# ===========================================================================


@router.get("/ocr/detect-device")
async def detect_device():
    """
    Detect hardware capabilities and return the recommended OCR backend.
    Runs device probing once per process (cached).
    """
    try:
        caps = device_detector_module.get()
        return _caps_to_dict(caps)
    except Exception as exc:
        logger.exception("Device detection failed")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/ocr/backends")
async def list_backends(verify_hashes: bool = False):
    """
    Return the full list of available OCR backends with per-backend status.
    Also includes device detection so the UI can show the recommended badge.
    """
    try:
        manager = OcrAssetManager.get()
        all_status = await asyncio.to_thread(
            manager.get_all_backends_status,
            verify_hashes=verify_hashes,
        )
        caps = device_detector_module.get()

        return {
            "device": _caps_to_dict(caps),
            "active_backend": manager.active_backend_id(),
            "backends": [
                {
                    **_asset_status_to_dict(s)["backends"][0],
                    "active": bid == manager.active_backend_id(),
                    "recommended": bid == caps.recommended_backend,
                }
                for bid, s in all_status.items()
            ],
        }
    except Exception as exc:
        logger.exception("Failed to list OCR backends")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/ocr/status")
async def get_ocr_status(backend: Optional[str] = None, verify_hashes: bool = False):
    """
    Return asset status for a specific backend (or the active backend if not specified).
    """
    try:
        manager = OcrAssetManager.get()
        status = await asyncio.to_thread(
            manager.get_status,
            verify_hashes=verify_hashes,
            backend_id=backend,
        )
        result = _asset_status_to_dict(status)
        # Add any active download job info
        active_jobs = [j for j in download_jobs.values() if j.get("backend_id") == status.active_backend and j.get("status") == "running"]
        result["active_job"] = active_jobs[0] if active_jobs else None
        return result
    except Exception as exc:
        logger.exception("Failed to get OCR status")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/ocr/download")
async def start_ocr_download(backend: Optional[str] = None, force: bool = False):
    """
    Start an OCR model download for the specified backend (or auto-detected best backend).
    Returns a job_id for polling.
    """
    manager = OcrAssetManager.get()
    active = backend or manager.active_backend_id()

    if active not in manager.backends:
        raise HTTPException(status_code=400, detail=f"Unknown backend: {active!r}. Valid: {list(manager.backends)}")

    # Reject if already running for this backend
    for job in download_jobs.values():
        if job.get("backend_id") == active and job.get("status") == "running":
            return {"job_id": job["job_id"], "status": "already_running", "backend_id": active}

    job_id = str(uuid.uuid4())
    _ensure_job(job_id)
    download_jobs[job_id]["backend_id"] = active

    asyncio.ensure_future(_run_download(job_id, active, force=force))
    return {"job_id": job_id, "status": "started", "backend_id": active}


@router.post("/ocr/force-download")
async def force_ocr_download(backend: Optional[str] = None):
    """Force re-download even if assets appear valid."""
    return await start_ocr_download(backend=backend, force=True)


@router.get("/ocr/job/{job_id}")
async def get_job_status(job_id: str):
    """Poll a download job by ID."""
    job = download_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found")
    return job


@router.post("/ocr/cancel")
async def cancel_ocr_download(job_id: Optional[str] = None):
    """Cancel a running download job."""
    if job_id:
        if job_id not in download_jobs:
            raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found")
        _cancel_flags[job_id] = True
        download_jobs[job_id].update({"status": "cancelling", "message": "Cancelling..."})
        return {"cancelled": True, "job_id": job_id}

    # Cancel all running jobs
    cancelled = []
    for jid, job in download_jobs.items():
        if job.get("status") == "running":
            _cancel_flags[jid] = True
            job.update({"status": "cancelling", "message": "Cancelling..."})
            cancelled.append(jid)
    return {"cancelled": True, "job_ids": cancelled}


@router.get("/ocr/verify")
async def verify_ocr_assets(backend: Optional[str] = None):
    """Run full SHA256 verification for the specified (or active) backend."""
    try:
        manager = OcrAssetManager.get()
        status = await asyncio.to_thread(
            manager.get_status,
            verify_hashes=True,
            backend_id=backend,
        )
        return _asset_status_to_dict(status)
    except Exception as exc:
        logger.exception("OCR verify failed")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/ocr/health")
async def ocr_health():
    """
    Quick health check: active backend + registry state.
    No disk I/O unless models are missing.
    """
    try:
        manager = OcrAssetManager.get()
        active = manager.active_backend_id()
        status = await asyncio.to_thread(manager.get_status, verify_hashes=False)

        registry_state: dict = {}
        try:
            from app.services.model_registry import model_registry
            registry_state = model_registry.ocr_backend_state()
        except Exception as exc:
            registry_state = {"error": str(exc)}

        caps = device_detector_module.get()

        return {
            "ready": status.ready,
            "active_backend": active,
            "recommended_backend": caps.recommended_backend,
            "device": {
                "platform": caps.platform,
                "cuda": caps.cuda_available,
                "mps": caps.mps_available,
                "ram_total_mb": caps.ram_total_mb,
            },
            "status": _asset_status_to_dict(status),
            "registry": registry_state,
        }
    except Exception as exc:
        logger.exception("OCR health check failed")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/ocr/activate")
async def activate_ocr_backend(backend: str):
    """
    Set the active OCR backend (persisted to config file + env).
    The backend must already be downloaded/ready.
    Triggers background warmup so the first inference call is fast.
    """
    manager = OcrAssetManager.get()
    if backend not in manager.backends:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown backend: {backend!r}. Valid choices: {list(manager.backends)}",
        )

    status = await asyncio.to_thread(manager.get_status, verify_hashes=False, backend_id=backend)
    if not status.ready:
        raise HTTPException(
            status_code=409,
            detail=f"Backend '{backend}' is not downloaded. Download it first.",
        )

    try:
        manager.set_active_backend(backend)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Kick off warmup in background — non-blocking, errors are logged but ignored
    asyncio.ensure_future(_post_download_warmup(backend))

    return {
        "activated": True,
        "backend_id": backend,
        "label": manager.backends[backend].label,
    }


@router.delete("/ocr/cache")
async def clear_ocr_cache(backend: Optional[str] = None):
    """
    Delete cached model files for a specific backend (or all backends).
    Dangerous: re-download will be required.
    """
    import shutil as _shutil
    from app.services.model_registry import model_registry
    
    # Release model singletons and free active file handles to avoid OS locking errors
    try:
        model_registry.release_ocr()
    except Exception as exc:
        logger.warning(f"Non-fatal error releasing OCR backend: {exc}")

    manager = OcrAssetManager.get()
    targets = [backend] if backend else list(manager.backends.keys())
    removed: list[str] = []
    errors: list[str] = []

    for bid in targets:
        spec = manager.backends.get(bid)
        if spec is None:
            errors.append(f"Unknown backend: {bid!r}")
            continue
        for mspec in spec.models:
            mdir = manager.cache_dir / mspec.local_dir
            if mdir.exists():
                try:
                    _shutil.rmtree(mdir)
                    removed.append(str(mdir))
                except Exception as exc:
                    errors.append(f"Failed to delete {mdir}: {exc}")

    return {"removed": removed, "errors": errors}
