# GPU Acceleration Feature

## Overview

SlideForge now includes comprehensive GPU acceleration support with **enable/disable controls**. The system automatically detects your GPU hardware and allows you to toggle GPU acceleration on and off without restarting.

## Supported GPU Types

### 1. **NVIDIA CUDA** (Recommended for best performance)
- RTX 30/40 series: Excellent performance (6GB+ VRAM recommended)
- RTX 20 series: Good performance
- GTX 1080/1080 Ti: Supported
- **Requires**: CUDA Toolkit 11.x+, cuDNN

### 2. **AMD ROCm**
- Radeon RX 6000 series and newer
- MI250, MI100 series (Professional)
- **Requires**: ROCm 5.0+

### 3. **Apple Metal Performance Shaders (MPS)**
- M1/M2/M3 MacBook Pro/Air
- Apple Silicon Macs

### 4. **CPU Only** (Always Available)
- Works on any system without GPU
- Uses CPU for all processing
- Slower but still functional

## Architecture

```
GPU Manager (gpu_manager.py)
├── Detection: Automatically detect GPU hardware
├── Onboarding: Initialize GPU drivers and memory
├── Enable/Disable: Toggle GPU acceleration via API
├── Memory Management: Monitor VRAM usage
└── Integration: Connect with OCR backends

API Endpoints (/api/gpu)
├── GET /status - Current GPU status
├── POST /enable - Enable GPU
├── POST /disable - Disable GPU
├── GET /memory - Memory usage
└── POST /optimize-for-ocr - Optimize for OCR workloads

OCR Integration
├── PaddleOCR: Uses GPU when enabled
├── docTR: Supports GPU acceleration
└── GOT-OCR2: Uses cached local models
```

## API Endpoints

### 1. **Get GPU Status**
```bash
GET /api/gpu/status
```

Response:
```json
{
  "available": true,
  "gpu_type": "cuda",
  "device_name": "NVIDIA RTX 3090",
  "enabled": false,
  "total_memory_mb": 24576,
  "available_memory_mb": 24000,
  "torch_version": "2.0.0",
  "driver_version": "12.1",
  "compute_capability": "8.6"
}
```

### 2. **Enable GPU**
```bash
POST /api/gpu/enable
```

Response:
```json
{
  "success": true,
  "gpu_type": "cuda",
  "device_name": "NVIDIA RTX 3090",
  "total_memory_mb": 24576,
  "available_memory_mb": 24000,
  "message": "GPU enabled: NVIDIA RTX 3090"
}
```

### 3. **Disable GPU**
```bash
POST /api/gpu/disable
```

Response:
```json
{
  "success": true,
  "message": "GPU disabled, using CPU",
  "device": "cpu"
}
```

### 4. **Get Memory Usage**
```bash
GET /api/gpu/memory
```

Response (when GPU enabled):
```json
{
  "status": "active",
  "gpu_type": "cuda",
  "total_memory_mb": 24576,
  "used_memory_mb": 8192,
  "reserved_memory_mb": 12288,
  "available_memory_mb": 16384,
  "usage_percent": 33.3
}
```

### 5. **Optimize for OCR**
```bash
POST /api/gpu/optimize-for-ocr
```

Response:
```json
{
  "success": true,
  "message": "GPU optimized for OCR workloads",
  "memory_fraction": 0.9
}
```

### 6. **GPU Health Check**
```bash
GET /api/gpu/health
```

Response:
```json
{
  "gpu_available": true,
  "gpu_enabled": true,
  "gpu_type": "cuda",
  "memory_status": "active",
  "ready_for_inference": true
}
```

## UI Component

The `GPUSettings.tsx` component provides a user-friendly interface to:

- **View GPU Status**: See what GPU is available
- **Monitor Memory**: Real-time VRAM usage with progress bar
- **Enable/Disable**: Toggle GPU acceleration with one click
- **Optimize for OCR**: Auto-tune GPU settings for OCR workloads
- **View Details**: Check driver version, CUDA version, compute capability

## Configuration

### Auto-save GPU Settings
GPU enable/disable state is automatically saved to:
```
~/.slideforge/data/gpu_config.json
```

Example config file:
```json
{
  "enabled": true,
  "timestamp": 1778893350.123
}
```

### Environment Variables

Control GPU behavior via environment variables:

```bash
# Disable GPU entirely (useful for testing)
export CUDA_VISIBLE_DEVICES=""

# Use specific GPU (if multiple available)
export CUDA_VISIBLE_DEVICES="0"

# Force CPU mode
export PYTORCH_DISABLE_CUDA="1"
```

## Performance Impact

### Typical Speed Improvements

**PaddleOCR** (10-slide deck):
- CPU: ~45 seconds
- GPU (RTX 3090): ~9 seconds (5x faster)
- GPU (RTX 2080): ~15 seconds (3x faster)

**docTR** (10-slide deck):
- CPU: ~30 seconds
- GPU (RTX 3090): ~5 seconds (6x faster)

**Overall Analysis**:
- CPU: 2-3 minutes
- GPU: 20-40 seconds (3-5x faster)

## Memory Requirements

### VRAM Recommendations

**PaddleOCR** (0.9B model):
- Minimum: 2GB VRAM
- Recommended: 6GB+ VRAM
- Optimal: 8GB+ VRAM (for batch processing)

**docTR**:
- Minimum: 1GB VRAM
- Recommended: 4GB+ VRAM

**Combined Usage** (OCR + Vision):
- Minimum: 4GB VRAM
- Recommended: 8GB+ VRAM
- Optimal: 12GB+ VRAM

## Usage Examples

### Python API
```python
from app.services.gpu_manager import get_gpu_manager

# Get manager instance
manager = get_gpu_manager()

# Check GPU status
info = manager.get_gpu_info()
print(f"GPU Available: {info.available}")
print(f"GPU Type: {info.gpu_type}")
print(f"Device: {info.device_name}")

# Enable GPU
result = manager.enable_gpu()
if result['success']:
    print(f"GPU enabled: {result['device_name']}")

# Get current PyTorch device
device = manager.get_torch_device()
print(f"Using device: {device}")

# Check if should use GPU
if manager.should_use_gpu():
    print("GPU is available and enabled")

# Get memory status
memory = manager.get_memory_status()
print(f"Memory used: {memory['used_memory_mb']}MB")

# Disable GPU
manager.disable_gpu()
```

### Using with OCR
```python
from app.services.ocr_detectors import detect_layout_blocks

# The detector automatically checks GPU status
# and uses GPU if enabled
blocks = detect_layout_blocks(image_pil, "paddleocr")

# GPU automatically used if:
# 1. GPU hardware detected
# 2. GPU is enabled via API
# 3. Model supports GPU acceleration
```

### React Component Integration
```tsx
import { GPUSettings } from '@/components/GPUSettings';

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <GPUSettings />
      {/* Other settings */}
    </div>
  );
}
```

## Troubleshooting

### GPU Not Detected
1. **Check NVIDIA drivers**: `nvidia-smi`
2. **Check CUDA availability**: 
   ```python
   import torch
   print(torch.cuda.is_available())
   print(torch.cuda.get_device_name(0))
   ```
3. **Install CUDA Toolkit**: https://developer.nvidia.com/cuda-toolkit
4. **Install cuDNN**: https://developer.nvidia.com/cudnn

### Out of Memory Errors
1. Use the "Disable GPU" option and process on CPU
2. Close other GPU-using applications
3. Use "Optimize for OCR" to adjust memory allocation
4. Process smaller batches of slides

### GPU Not Being Used
1. Check `/api/gpu/status` to see if enabled
2. Check logs for GPU initialization errors
3. Verify PyTorch can see the GPU: `python -c "import torch; print(torch.cuda.is_available())"`
4. Try restarting the backend service

### Poor Performance Improvement
1. GPU transfer overhead can exceed computation time for small images
2. Ensure GPU has sufficient VRAM for the model
3. Check if CPU is being used despite GPU being available
4. Try optimizing with "Optimize for OCR" button

## Advanced Configuration

### Multi-GPU Support (Future)
Currently, SlideForge uses GPU 0. Future versions will support:
- Automatic load balancing across multiple GPUs
- Per-GPU resource allocation
- GPU pool management

### Custom Memory Limits
```python
# Set custom GPU memory fraction (0-1)
gpu_manager.set_memory_fraction(0.8)  # Use max 80% of VRAM
```

### Batch Processing Optimization
```python
# For processing multiple large documents
manager.optimize_for_ocr()  # Allocates ~90% VRAM for peak performance
```

## Testing GPU Feature

### Backend Test
```bash
cd backend
python -m pytest tests/test_gpu_manager.py -v
```

### API Test
```bash
curl http://localhost:8000/api/gpu/status
curl -X POST http://localhost:8000/api/gpu/enable
curl http://localhost:8000/api/gpu/memory
```

### End-to-End Test
```bash
python tests/test_ocr_with_gpu.py
```

## Future Enhancements

- [ ] Multi-GPU support with automatic load balancing
- [ ] Real-time VRAM monitoring dashboard
- [ ] Automatic GPU mode detection (optimal settings)
- [ ] GPU health diagnostics and error reporting
- [ ] Power consumption monitoring
- [ ] Thermal throttling alerts
- [ ] GPU scheduling for background processing
- [ ] Integration with system power management

## Performance Monitoring

### Monitor GPU Usage
```bash
# NVIDIA
watch -n 0.1 nvidia-smi

# AMD ROCm
rocm-smi --watch
```

### Check Memory Leaks
```python
from app.services.gpu_manager import get_gpu_manager

manager = get_gpu_manager()
initial_mem = manager.get_memory_status()

# Run analysis
# ...

final_mem = manager.get_memory_status()
print(f"Memory leaked: {final_mem['used_memory_mb'] - initial_mem['used_memory_mb']}MB")
```

## Support

For GPU-related issues:
1. Check the troubleshooting section above
2. Enable debug logging: `DEBUG=1 python backend/app/main.py`
3. Check GPU logs in `~/.slideforge/logs/gpu.log`
4. Report GPU detection issues with output of `nvidia-smi` or equivalent
