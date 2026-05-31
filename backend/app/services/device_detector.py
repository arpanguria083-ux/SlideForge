"""
device_detector.py — Single-call device capability probe used to recommend
and configure the best OCR backend.

Detected capabilities:
  - platform: windows | macos | linux
  - python_arch: x86_64 | arm64 | ...
  - cuda_available: bool
  - cuda_device_name: str | None
  - cuda_vram_mb: int | None        (VRAM of device 0)
  - mps_available: bool             (Apple Metal Performance Shaders)
  - ram_total_mb: int               (total system RAM)
  - ram_available_mb: int           (currently free/available RAM)
  - recommended_backend: str        (doctr | got_ocr2 | paddleocr)
  - recommended_reason: str
  - all_supported_backends: list[str]
"""
from __future__ import annotations

import logging
import os
import platform
import sys
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("slideforge.device_detector")


@dataclass
class DeviceCapabilities:
    platform: str                       # windows / macos / linux
    python_arch: str                    # x86_64 / arm64
    cuda_available: bool
    cuda_device_name: Optional[str]
    cuda_vram_mb: Optional[int]
    mps_available: bool
    ram_total_mb: int
    ram_available_mb: int
    recommended_backend: str            # doctr | got_ocr2 | paddleocr
    recommended_reason: str
    all_supported_backends: list[str] = field(default_factory=list)


def detect() -> DeviceCapabilities:
    """
    Detect hardware capabilities and return a DeviceCapabilities dataclass.
    Pure-Python; zero heavy imports; safe to call at startup.
    """
    plat = platform.system().lower()   # windows / darwin / linux
    arch = platform.machine().lower()  # x86_64 / arm64 / amd64

    # Normalize
    if "darwin" in plat:
        plat = "macos"
    elif "win" in plat:
        plat = "windows"
    else:
        plat = "linux"

    if arch in ("amd64", "x86_64"):
        arch = "x86_64"
    elif arch in ("arm64", "aarch64"):
        arch = "arm64"

    # --- RAM ---
    ram_total_mb = 0
    ram_available_mb = 0
    try:
        import psutil
        vm = psutil.virtual_memory()
        ram_total_mb = int(vm.total / (1024 ** 2))
        ram_available_mb = int(vm.available / (1024 ** 2))
    except ImportError:
        try:
            # fallback: /proc/meminfo on Linux
            if plat == "linux":
                with open("/proc/meminfo") as f:
                    for line in f:
                        k, *rest = line.split()
                        if k == "MemTotal:":
                            ram_total_mb = int(rest[0]) // 1024
                        elif k == "MemAvailable:":
                            ram_available_mb = int(rest[0]) // 1024
            elif plat == "windows":
                # Windows fallback without psutil: use GlobalMemoryStatusEx via ctypes
                try:
                    import ctypes

                    class MEMORYSTATUSEX(ctypes.Structure):
                        _fields_ = [
                            ("dwLength", ctypes.c_uint32),
                            ("dwMemoryLoad", ctypes.c_uint32),
                            ("ullTotalPhys", ctypes.c_uint64),
                            ("ullAvailPhys", ctypes.c_uint64),
                            ("ullTotalPageFile", ctypes.c_uint64),
                            ("ullAvailPageFile", ctypes.c_uint64),
                            ("ullTotalVirtual", ctypes.c_uint64),
                            ("ullAvailVirtual", ctypes.c_uint64),
                            ("ullAvailExtendedVirtual", ctypes.c_uint64),
                        ]

                    stat = MEMORYSTATUSEX()
                    stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
                    ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
                    ram_total_mb = int(stat.ullTotalPhys // (1024 ** 2))
                    ram_available_mb = int(stat.ullAvailPhys // (1024 ** 2))
                except Exception:
                    # leave as 0 if anything fails
                    pass
        except Exception:
            pass

    # --- CUDA ---
    cuda_available = False
    cuda_device_name: Optional[str] = None
    cuda_vram_mb: Optional[int] = None
    try:
        import torch  # noqa: F401 — only if available
        cuda_available = torch.cuda.is_available()
        if cuda_available:
            cuda_device_name = torch.cuda.get_device_name(0)
            cuda_vram_mb = int(torch.cuda.get_device_properties(0).total_memory / (1024 ** 2))
    except ImportError:
        pass
    except Exception:
        logger.debug("CUDA probe failed", exc_info=True)

    # --- Apple MPS ---
    mps_available = False
    if plat == "macos":
        try:
            import torch
            mps_available = torch.backends.mps.is_available()
        except ImportError:
            pass
        except Exception:
            logger.debug("MPS probe failed", exc_info=True)

    # --- Recommendation logic ---
    supported: list[str] = []

    # docTR is always supported (pure CPU works fine, smallest size)
    supported.append("doctr")

    # GOT-OCR2 needs ~6 GB RAM and ideally GPU/MPS, but tolerable on 16 GB CPU
    if ram_total_mb >= 8_000 or cuda_available or mps_available:
        supported.append("got_ocr2")

    # PaddleOCR 0.9B needs GPU (CUDA/MPS) for reasonable speed OR 8-bit CPU mode
    # on high RAM machines
    if cuda_available or mps_available or ram_total_mb >= 16_000:
        supported.append("paddleocr")

    # Recommend best fit
    if cuda_available and cuda_vram_mb and cuda_vram_mb >= 4_000:
        # Discrete CUDA GPU with enough VRAM → PaddleOCR best accuracy
        recommended = "paddleocr"
        reason = (
            f"CUDA GPU detected ({cuda_device_name}, {cuda_vram_mb} MB VRAM). "
            "PaddleOCR 0.9B delivers the highest accuracy on complex documents with GPU acceleration."
        )
    elif mps_available:
        # Apple Silicon → GOT-OCR2 uses Metal, good balance
        recommended = "got_ocr2"
        reason = (
            "Apple Silicon with Metal (MPS) detected. "
            "GOT-OCR 2.0 (580 M params) offers excellent accuracy + Metal acceleration "
            "while using less RAM than PaddleOCR 0.9B."
        )
    elif ram_total_mb >= 16_000:
        # Large RAM Windows/Linux CPU system → GOT-OCR2 feasible
        recommended = "got_ocr2"
        reason = (
            f"No discrete GPU but {ram_total_mb} MB RAM available. "
            "GOT-OCR 2.0 runs well on CPU with sufficient RAM and handles structured documents."
        )
    else:
        # Low-resource or unknown → docTR is lightest and always works
        recommended = "doctr"
        reason = (
            f"Low-resource system ({ram_total_mb} MB RAM, no GPU). "
            "docTR (~200–400 MB) is the lightest option and performs excellently on most document types."
        )

    # Override from env — lets users force a specific backend
    env_override = os.environ.get("SLIDEFORGE_OCR_BACKEND")
    if env_override and env_override in ("doctr", "got_ocr2", "paddleocr"):
        recommended = env_override
        reason = f"Backend overridden via SLIDEFORGE_OCR_BACKEND environment variable: {env_override}."

    return DeviceCapabilities(
        platform=plat,
        python_arch=arch,
        cuda_available=cuda_available,
        cuda_device_name=cuda_device_name,
        cuda_vram_mb=cuda_vram_mb,
        mps_available=mps_available,
        ram_total_mb=ram_total_mb,
        ram_available_mb=ram_available_mb,
        recommended_backend=recommended,
        recommended_reason=reason,
        all_supported_backends=supported,
    )


# Singleton — probe once per process, cache result
_cached: Optional[DeviceCapabilities] = None


def get() -> DeviceCapabilities:
    global _cached
    if _cached is None:
        _cached = detect()
    return _cached
