"""
gpu_manager.py — GPU detection, initialization, and management.

Provides:
- GPU capability detection (CUDA, ROCm, MPS)
- GPU initialization and onboarding
- Enable/disable controls
- Memory management and optimization
- Integration with OCR backends
"""
import logging
import os
from dataclasses import dataclass, field
from typing import Optional, Literal
import json
from pathlib import Path

try:
    import torch
except ImportError:
    torch = None

logger = logging.getLogger("slideforge.gpu_manager")


@dataclass
class GPUInfo:
    """GPU capability information."""
    available: bool
    gpu_type: Literal["cuda", "rocm", "mps", "none"]  # NVIDIA CUDA, AMD ROCm, Apple MPS, or none
    device_name: Optional[str] = None
    device_index: int = 0
    total_memory_mb: Optional[int] = None
    available_memory_mb: Optional[int] = None
    compute_capability: Optional[str] = None  # For CUDA
    driver_version: Optional[str] = None
    torch_version: Optional[str] = None
    enabled: bool = False  # User control
    metadata: dict = field(default_factory=dict)


class GPUManager:
    """Singleton GPU manager for detection, initialization, and control."""
    
    _instance: Optional["GPUManager"] = None
    _gpu_info: Optional[GPUInfo] = None
    _torch_device = None
    _gpu_config_path: Optional[Path] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(GPUManager, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._config_path = Path.home() / ".slideforge" / "data" / "gpu_config.json"
        self._detect_gpu()
        self._load_gpu_settings()
    
    def _detect_gpu(self) -> None:
        """Detect available GPU hardware."""
        try:
            import torch
            
            gpu_type = "none"
            device_name = None
            total_mem = None
            driver_version = None
            compute_cap = None
            
            # Check CUDA (NVIDIA)
            if torch.cuda.is_available():
                gpu_type = "cuda"
                device_name = torch.cuda.get_device_name(0)
                total_mem = int(torch.cuda.get_device_properties(0).total_memory / (1024 ** 2))
                try:
                    driver_version = torch.version.cuda
                except:
                    pass
                try:
                    compute_cap = torch.cuda.get_device_properties(0).major
                except:
                    pass
                logger.info(f"CUDA GPU detected: {device_name} ({total_mem}MB)")
            
            # Check MPS (Apple Silicon)
            elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                gpu_type = "mps"
                device_name = "Apple Metal Performance Shaders"
                logger.info("Apple MPS GPU detected")
            
            # Check ROCm (AMD)
            elif hasattr(torch.version, "hip"):
                gpu_type = "rocm"
                device_name = "AMD ROCm GPU"
                logger.info("AMD ROCm GPU detected")
            
            self._gpu_info = GPUInfo(
                available=gpu_type != "none",
                gpu_type=gpu_type,  # type: ignore
                device_name=device_name,
                total_memory_mb=total_mem,
                torch_version=torch.__version__,
                driver_version=driver_version,
                compute_capability=str(compute_cap) if compute_cap else None,
                enabled=False,  # Default disabled, user must enable
                metadata={
                    "pytorch_version": torch.__version__,
                    "cuda_available": torch.cuda.is_available(),
                    "device_count": torch.cuda.device_count() if torch.cuda.is_available() else 0,
                }
            )
        except ImportError:
            logger.warning("PyTorch not installed, GPU detection unavailable")
            self._gpu_info = GPUInfo(available=False, gpu_type="none", enabled=False)
        except Exception as e:
            logger.error(f"GPU detection failed: {e}")
            self._gpu_info = GPUInfo(available=False, gpu_type="none", enabled=False)
    
    def _load_gpu_settings(self) -> None:
        """Load GPU enable/disable settings from config file."""
        try:
            if self._config_path.exists():
                config = json.loads(self._config_path.read_text())
                if self._gpu_info:
                    self._gpu_info.enabled = config.get("enabled", False)
                    logger.info(f"GPU enabled setting loaded: {self._gpu_info.enabled}")
        except Exception as e:
            logger.warning(f"Could not load GPU settings: {e}")
    
    def _save_gpu_settings(self) -> None:
        """Save GPU enable/disable settings to config file."""
        try:
            self._config_path.parent.mkdir(parents=True, exist_ok=True)
            config = {
                "enabled": self._gpu_info.enabled if self._gpu_info else False,
                "timestamp": __import__("time").time(),
            }
            self._config_path.write_text(json.dumps(config, indent=2))
            logger.info(f"GPU settings saved: enabled={config['enabled']}")
        except Exception as e:
            logger.error(f"Failed to save GPU settings: {e}")
    
    def get_gpu_info(self) -> GPUInfo:
        """Get current GPU information."""
        if self._gpu_info is None:
            self._detect_gpu()
        return self._gpu_info
    
    def enable_gpu(self) -> dict:
        """Enable GPU acceleration."""
        if not self._gpu_info or not self._gpu_info.available:
            return {"success": False, "error": "GPU not available"}
        
        try:
            import torch
            
            if self._gpu_info.gpu_type == "cuda":
                if not torch.cuda.is_available():
                    return {"success": False, "error": "CUDA not available despite detection"}
                
                # Verify CUDA functionality
                torch.cuda.empty_cache()
                torch.cuda.reset_peak_memory_stats()
                test_tensor = torch.ones(1).cuda()
                del test_tensor
                torch.cuda.empty_cache()
                
                self._torch_device = torch.device("cuda:0")
                os.environ["CUDA_VISIBLE_DEVICES"] = "0"
                logger.info("CUDA GPU enabled successfully")
                
            elif self._gpu_info.gpu_type == "mps":
                self._torch_device = torch.device("mps")
                logger.info("Apple MPS GPU enabled successfully")
            
            elif self._gpu_info.gpu_type == "rocm":
                self._torch_device = torch.device("cuda:0")  # ROCm uses CUDA-like API
                logger.info("AMD ROCm GPU enabled successfully")
            
            self._gpu_info.enabled = True
            self._save_gpu_settings()
            
            # Update available memory
            if self._gpu_info.gpu_type == "cuda" and torch.cuda.is_available():
                self._gpu_info.available_memory_mb = int(
                    torch.cuda.mem_get_info(0)[0] / (1024 ** 2)
                )
            
            return {
                "success": True,
                "gpu_type": self._gpu_info.gpu_type,
                "device_name": self._gpu_info.device_name,
                "total_memory_mb": self._gpu_info.total_memory_mb,
                "available_memory_mb": self._gpu_info.available_memory_mb,
                "message": f"GPU enabled: {self._gpu_info.device_name}"
            }
        
        except Exception as e:
            logger.error(f"Failed to enable GPU: {e}")
            return {"success": False, "error": str(e)}
    
    def disable_gpu(self) -> dict:
        """Disable GPU acceleration and fall back to CPU."""
        try:
            import torch
            torch.cuda.empty_cache() if torch.cuda.is_available() else None
            
            self._torch_device = torch.device("cpu")
            os.environ["CUDA_VISIBLE_DEVICES"] = ""
            
            if self._gpu_info:
                self._gpu_info.enabled = False
                self._save_gpu_settings()
            
            logger.info("GPU disabled, using CPU")
            return {
                "success": True,
                "message": "GPU disabled, using CPU",
                "device": "cpu"
            }
        except Exception as e:
            logger.error(f"Failed to disable GPU: {e}")
            return {"success": False, "error": str(e)}
    
    def get_torch_device(self) -> Optional["torch.device"]:
        """Get the current PyTorch device (cuda, mps, or cpu)."""
        if not torch:
            return None
        if self._gpu_info and self._gpu_info.enabled:
            if self._gpu_info.gpu_type == "cuda":
                return torch.device("cuda:0")
            elif self._gpu_info.gpu_type == "mps":
                return torch.device("mps")
            elif self._gpu_info.gpu_type == "rocm":
                return torch.device("cuda:0")
        return torch.device("cpu")
    
    def should_use_gpu(self) -> bool:
        """Check if GPU should be used (available and enabled)."""
        return bool(
            self._gpu_info 
            and self._gpu_info.available 
            and self._gpu_info.enabled
        )
    
    def get_memory_status(self) -> dict:
        """Get GPU memory usage status."""
        if not self._gpu_info or not self._gpu_info.enabled:
            return {"status": "disabled", "message": "GPU not enabled"}
        
        try:
            import torch
            
            if self._gpu_info.gpu_type == "cuda" and torch.cuda.is_available():
                used_mem = torch.cuda.memory_allocated(0) / (1024 ** 2)
                reserved_mem = torch.cuda.memory_reserved(0) / (1024 ** 2)
                total_mem = self._gpu_info.total_memory_mb or 0
                available_mem = total_mem - used_mem
                
                return {
                    "status": "active",
                    "gpu_type": self._gpu_info.gpu_type,
                    "total_memory_mb": total_mem,
                    "used_memory_mb": int(used_mem),
                    "reserved_memory_mb": int(reserved_mem),
                    "available_memory_mb": int(available_mem),
                    "usage_percent": (used_mem / total_mem * 100) if total_mem > 0 else 0,
                }
            else:
                return {
                    "status": "enabled",
                    "gpu_type": self._gpu_info.gpu_type,
                    "message": "GPU enabled but memory info unavailable"
                }
        except Exception as e:
            logger.error(f"Failed to get memory status: {e}")
            return {"status": "error", "error": str(e)}
    
    def optimize_for_ocr(self) -> dict:
        """Optimize GPU settings for OCR workloads."""
        try:
            import torch
            
            if not self._gpu_info or not self._gpu_info.enabled:
                return {"success": False, "message": "GPU not enabled"}
            
            # Clear cache and optimize memory
            if self._gpu_info.gpu_type == "cuda":
                torch.cuda.empty_cache()
                torch.cuda.reset_peak_memory_stats()
                
                # Set optimal memory fraction for OCR models
                torch.cuda.set_per_process_memory_fraction(0.9)  # Use up to 90% of VRAM
                logger.info("GPU optimized for OCR: memory fraction set to 0.9")
            
            return {
                "success": True,
                "message": "GPU optimized for OCR workloads",
                "memory_fraction": 0.9,
            }
        except Exception as e:
            logger.error(f"GPU optimization failed: {e}")
            return {"success": False, "error": str(e)}


# Singleton accessor
def get_gpu_manager() -> GPUManager:
    """Get or create GPU manager instance."""
    return GPUManager()
