"""
api/gpu.py — GPU management API endpoints.

Provides:
- GET /api/gpu/status - Current GPU status
- POST /api/gpu/enable - Enable GPU
- POST /api/gpu/disable - Disable GPU
- GET /api/gpu/memory - GPU memory info
"""
from fastapi import APIRouter, HTTPException
from ..services.gpu_manager import get_gpu_manager

router = APIRouter(prefix="/api/gpu", tags=["gpu"])


@router.get("/status")
async def get_gpu_status():
    """Get current GPU status and capabilities."""
    manager = get_gpu_manager()
    info = manager.get_gpu_info()
    
    return {
        "available": info.available,
        "gpu_type": info.gpu_type,
        "device_name": info.device_name,
        "enabled": info.enabled,
        "total_memory_mb": info.total_memory_mb,
        "available_memory_mb": info.available_memory_mb,
        "torch_version": info.torch_version,
        "driver_version": info.driver_version,
        "compute_capability": info.compute_capability,
        "metadata": info.metadata,
    }


@router.post("/enable")
async def enable_gpu():
    """Enable GPU acceleration."""
    manager = get_gpu_manager()
    result = manager.enable_gpu()
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Unknown error"))
    
    return result


@router.post("/disable")
async def disable_gpu():
    """Disable GPU and use CPU."""
    manager = get_gpu_manager()
    result = manager.disable_gpu()
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Unknown error"))
    
    return result


@router.get("/memory")
async def get_gpu_memory():
    """Get GPU memory usage."""
    manager = get_gpu_manager()
    return manager.get_memory_status()


@router.post("/optimize-for-ocr")
async def optimize_for_ocr():
    """Optimize GPU settings for OCR workloads."""
    manager = get_gpu_manager()
    result = manager.optimize_for_ocr()
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Unknown error"))
    
    return result


@router.get("/health")
async def gpu_health():
    """Check GPU health and readiness."""
    manager = get_gpu_manager()
    info = manager.get_gpu_info()
    memory = manager.get_memory_status()
    
    return {
        "gpu_available": info.available,
        "gpu_enabled": info.enabled,
        "gpu_type": info.gpu_type,
        "memory_status": memory.get("status", "unknown"),
        "ready_for_inference": info.available and info.enabled,
    }
