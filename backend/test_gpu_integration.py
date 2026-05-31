"""
test_gpu_integration.py — Test GPU detection and OCR integration.

Run with: python test_gpu_integration.py
"""
import asyncio
import json
from pathlib import Path

# Add backend to path
import sys
sys.path.insert(0, str(Path(__file__).parent / "backend"))

from app.services.gpu_manager import get_gpu_manager


def test_gpu_detection():
    """Test GPU detection."""
    print("\n" + "="*70)
    print("GPU DETECTION TEST")
    print("="*70)
    
    manager = get_gpu_manager()
    info = manager.get_gpu_info()
    
    print(f"GPU Available: {info.available}")
    print(f"GPU Type: {info.gpu_type}")
    print(f"Device Name: {info.device_name}")
    print(f"Total VRAM: {info.total_memory_mb}MB")
    print(f"PyTorch Version: {info.torch_version}")
    if info.driver_version:
        print(f"Driver Version: {info.driver_version}")
    if info.compute_capability:
        print(f"Compute Capability: {info.compute_capability}")
    
    assert info.torch_version is not None, "PyTorch not installed"
    print("\n✓ GPU detection successful")
    
    return manager


def test_gpu_enable_disable(manager):
    """Test GPU enable/disable."""
    print("\n" + "="*70)
    print("GPU ENABLE/DISABLE TEST")
    print("="*70)
    
    if not manager.get_gpu_info().available:
        print("⚠ GPU not available, skipping enable/disable test")
        return
    
    # Enable GPU
    print("\n1. Enabling GPU...")
    result = manager.enable_gpu()
    print(f"   Success: {result['success']}")
    print(f"   Message: {result['message']}")
    assert result['success'], f"Failed to enable GPU: {result.get('error')}"
    
    # Check status
    info = manager.get_gpu_info()
    print(f"   GPU Enabled: {info.enabled}")
    assert info.enabled, "GPU not enabled"
    
    # Get memory
    print("\n2. Checking memory...")
    memory = manager.get_memory_status()
    print(f"   Status: {memory['status']}")
    if 'used_memory_mb' in memory:
        print(f"   Used: {memory['used_memory_mb']}MB")
        print(f"   Total: {memory['total_memory_mb']}MB")
        print(f"   Usage: {memory['usage_percent']:.1f}%")
    
    # Disable GPU
    print("\n3. Disabling GPU...")
    result = manager.disable_gpu()
    print(f"   Success: {result['success']}")
    print(f"   Message: {result['message']}")
    assert result['success'], f"Failed to disable GPU: {result.get('error')}"
    
    # Check status
    info = manager.get_gpu_info()
    print(f"   GPU Enabled: {info.enabled}")
    assert not info.enabled, "GPU still enabled after disable"
    
    print("\n✓ GPU enable/disable test successful")


def test_gpu_device_access(manager):
    """Test PyTorch device access."""
    print("\n" + "="*70)
    print("PYTORCH DEVICE TEST")
    print("="*70)
    
    # Get CPU device
    device = manager.get_torch_device()
    print(f"\n1. CPU Device: {device}")
    assert str(device) == "cpu"
    
    # Enable GPU if available
    if manager.get_gpu_info().available:
        print("\n2. Enabling GPU...")
        manager.enable_gpu()
        device = manager.get_torch_device()
        print(f"   GPU Device: {device}")
        assert "cuda" in str(device) or "mps" in str(device), "GPU device not returned"
        
        # Disable GPU
        print("\n3. Disabling GPU...")
        manager.disable_gpu()
        device = manager.get_torch_device()
        print(f"   CPU Device: {device}")
        assert str(device) == "cpu"
    
    print("\n✓ PyTorch device test successful")


def test_gpu_config_persistence(manager):
    """Test GPU config persistence."""
    print("\n" + "="*70)
    print("CONFIG PERSISTENCE TEST")
    print("="*70)
    
    config_path = Path.home() / ".slideforge" / "data" / "gpu_config.json"
    
    # Check if config exists
    if config_path.exists():
        config = json.loads(config_path.read_text())
        print(f"\n1. Config file exists: {config_path}")
        print(f"   GPU Enabled: {config.get('enabled', False)}")
        print(f"   Timestamp: {config.get('timestamp', 'N/A')}")
    else:
        print(f"\n1. Config file does not exist yet: {config_path}")
    
    # Save config
    print("\n2. Saving GPU enabled state...")
    manager.enable_gpu()
    
    if config_path.exists():
        config = json.loads(config_path.read_text())
        print(f"   GPU Enabled in config: {config.get('enabled', False)}")
        assert config.get('enabled') == True, "GPU not saved as enabled"
    
    # Disable and save
    print("\n3. Disabling GPU and saving...")
    manager.disable_gpu()
    
    if config_path.exists():
        config = json.loads(config_path.read_text())
        print(f"   GPU Enabled in config: {config.get('enabled', False)}")
        assert config.get('enabled') == False, "GPU not saved as disabled"
    
    print("\n✓ Config persistence test successful")


def test_ocr_gpu_integration():
    """Test GPU integration with OCR detectors."""
    print("\n" + "="*70)
    print("OCR-GPU INTEGRATION TEST")
    print("="*70)
    
    from app.services.ocr_detectors import _should_use_gpu, _get_device_string
    
    # Test GPU check
    manager = get_gpu_manager()
    manager.disable_gpu()
    
    print("\n1. GPU Disabled:")
    should_use = _should_use_gpu()
    device = _get_device_string()
    print(f"   Should use GPU: {should_use}")
    print(f"   Device string: {device}")
    assert not should_use, "GPU should not be used when disabled"
    assert device == "cpu", "Device should be CPU"
    
    if manager.get_gpu_info().available:
        print("\n2. GPU Enabled:")
        manager.enable_gpu()
        should_use = _should_use_gpu()
        device = _get_device_string()
        print(f"   Should use GPU: {should_use}")
        print(f"   Device string: {device}")
        assert should_use, "GPU should be used when enabled"
        assert device != "cpu", "Device should not be CPU when GPU enabled"
    
    print("\n✓ OCR-GPU integration test successful")


def main():
    """Run all tests."""
    print("\n" + "="*70)
    print("GPU INTEGRATION TEST SUITE")
    print("="*70)
    
    try:
        # Test GPU detection
        manager = test_gpu_detection()
        
        # Test enable/disable
        test_gpu_enable_disable(manager)
        
        # Test device access
        test_gpu_device_access(manager)
        
        # Test config persistence
        test_gpu_config_persistence(manager)
        
        # Test OCR integration
        test_ocr_gpu_integration()
        
        print("\n" + "="*70)
        print("ALL TESTS PASSED ✓")
        print("="*70)
        print("\nGPU feature is working correctly!")
        print("You can now:")
        print("  1. Use /api/gpu endpoints to control GPU")
        print("  2. Enable GPU via GPUSettings UI component")
        print("  3. OCR backends will automatically use GPU when enabled")
        
    except AssertionError as e:
        print(f"\n✗ Test failed: {e}")
        return 1
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())
