import React, { useState, useEffect } from 'react';
import { AlertCircle, Zap, Cpu, Activity } from 'lucide-react';

interface GPUStatus {
  available: boolean;
  gpu_type: 'cuda' | 'rocm' | 'mps' | 'none';
  device_name?: string;
  enabled: boolean;
  total_memory_mb?: number;
  available_memory_mb?: number;
  torch_version?: string;
  driver_version?: string;
  compute_capability?: string;
}

interface MemoryStatus {
  status: 'active' | 'disabled' | 'enabled' | 'error';
  gpu_type?: string;
  total_memory_mb?: number;
  used_memory_mb?: number;
  reserved_memory_mb?: number;
  available_memory_mb?: number;
  usage_percent?: number;
  error?: string;
}

export const GPUSettings: React.FC = () => {
  const [gpuStatus, setGpuStatus] = useState<GPUStatus | null>(null);
  const [memoryStatus, setMemoryStatus] = useState<MemoryStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGPUStatus();
    const interval = setInterval(fetchGPUStatus, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchGPUStatus = async () => {
    try {
      const [statusRes, memoryRes] = await Promise.all([
        fetch('/api/gpu/status'),
        fetch('/api/gpu/memory'),
      ]);
      
      if (statusRes.ok) {
        const status = await statusRes.json();
        setGpuStatus(status);
      }
      
      if (memoryRes.ok) {
        const memory = await memoryRes.json();
        setMemoryStatus(memory);
      }
    } catch (err) {
      console.error('Failed to fetch GPU status:', err);
    }
  };

  const handleEnableGPU = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/gpu/enable', { method: 'POST' });
      if (res.ok) {
        await fetchGPUStatus();
      } else {
        const data = await res.json();
        setError(data.detail || 'Failed to enable GPU');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleDisableGPU = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/gpu/disable', { method: 'POST' });
      if (res.ok) {
        await fetchGPUStatus();
      } else {
        const data = await res.json();
        setError(data.detail || 'Failed to disable GPU');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleOptimizeForOCR = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/gpu/optimize-for-ocr', { method: 'POST' });
      if (res.ok) {
        await fetchGPUStatus();
      } else {
        const data = await res.json();
        setError(data.detail || 'Failed to optimize GPU');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (!gpuStatus) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg">
        <div className="animate-pulse">Loading GPU information...</div>
      </div>
    );
  }

  const getGPUTypeLabel = (type: string) => {
    switch (type) {
      case 'cuda': return 'NVIDIA CUDA';
      case 'rocm': return 'AMD ROCm';
      case 'mps': return 'Apple Metal Performance Shaders';
      default: return 'No GPU';
    }
  };

  const getStatusColor = (enabled: boolean) => {
    return enabled ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200';
  };

  const getStatusBadgeColor = (enabled: boolean) => {
    return enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-4">
      {/* GPU Status Card */}
      <div className={`p-4 border rounded-lg ${getStatusColor(gpuStatus.enabled)}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {gpuStatus.available ? <Zap className="w-5 h-5 text-yellow-600" /> : <Cpu className="w-5 h-5 text-gray-600" />}
            <h3 className="font-semibold text-lg">GPU Acceleration</h3>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeColor(gpuStatus.enabled)}`}>
            {gpuStatus.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        {gpuStatus.available ? (
          <>
            <div className="space-y-2 mb-4 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">GPU Type:</span>
                <span className="font-medium">{getGPUTypeLabel(gpuStatus.gpu_type)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Device:</span>
                <span className="font-medium">{gpuStatus.device_name || 'Unknown'}</span>
              </div>
              {gpuStatus.total_memory_mb && (
                <div className="flex justify-between">
                  <span className="text-gray-600">VRAM:</span>
                  <span className="font-medium">{gpuStatus.total_memory_mb} MB</span>
                </div>
              )}
              {gpuStatus.driver_version && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Driver:</span>
                  <span className="font-medium">{gpuStatus.driver_version}</span>
                </div>
              )}
              {gpuStatus.compute_capability && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Compute Capability:</span>
                  <span className="font-medium">SM {gpuStatus.compute_capability}</span>
                </div>
              )}
            </div>

            {/* Memory Status */}
            {memoryStatus && memoryStatus.status === 'active' && (
              <div className="mb-4 p-3 bg-white rounded border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-semibold">Memory Usage</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Used:</span>
                    <span>{memoryStatus.used_memory_mb} MB / {memoryStatus.total_memory_mb} MB</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${memoryStatus.usage_percent || 0}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-600 text-right">
                    {Math.round(memoryStatus.usage_percent || 0)}% usage
                  </div>
                </div>
              </div>
            )}

            {/* Control Buttons */}
            <div className="flex gap-2 flex-wrap">
              {!gpuStatus.enabled ? (
                <button
                  onClick={handleEnableGPU}
                  disabled={loading}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 transition"
                >
                  {loading ? 'Enabling...' : 'Enable GPU'}
                </button>
              ) : (
                <>
                  <button
                    onClick={handleDisableGPU}
                    disabled={loading}
                    className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-gray-400 transition"
                  >
                    {loading ? 'Disabling...' : 'Disable GPU'}
                  </button>
                  <button
                    onClick={handleOptimizeForOCR}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 transition"
                  >
                    {loading ? 'Optimizing...' : 'Optimize for OCR'}
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded flex gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-700 flex-shrink-0" />
            <p className="text-sm text-yellow-700">
              No GPU detected. The system will use CPU for all processing. For better performance, ensure your NVIDIA/AMD drivers are installed.
            </p>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded flex gap-2">
          <AlertCircle className="w-5 h-5 text-red-700 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Info Box */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
        <p className="font-semibold mb-1">GPU Acceleration Benefits:</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>PaddleOCR: ~3-5x faster with GPU</li>
          <li>Reduced analysis time per slide</li>
          <li>Better handling of large documents</li>
          <li>Can be disabled anytime to save power/reduce noise</li>
        </ul>
      </div>
    </div>
  );
};

export default GPUSettings;
