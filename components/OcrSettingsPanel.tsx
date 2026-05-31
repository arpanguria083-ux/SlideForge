/**
 * OcrSettingsPanel.tsx
 *
 * Full OCR engine management panel. Production-ready.
 * Shows device info, all backends, per-backend download/activate controls,
 * live progress, disk usage, and cache management.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Apple,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Download,
  HardDrive,
  Loader2,
  Monitor,
  RefreshCw,
  Server,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import { apiService } from '../services/apiService';
import type {
  OcrBackendId,
  OcrBackendInfo,
  OcrBackendsResponse,
  OcrDeviceCapabilities,
  OcrJobStatus,
} from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}

function pct(done: number, total: number): number {
  if (!total) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

// ── Backend static metadata ───────────────────────────────────────────────────

const BACKEND_META: Record<OcrBackendId, { icon: string; badge: string; pros: string[]; cons: string[] }> = {
  paddleocr: {
    icon: '🚀',
    badge: 'Most Accurate',
    pros: ['Best accuracy on tables, formulas, mixed layouts', '109 languages supported', 'Fast on CUDA/MPS GPU'],
    cons: ['Large download (~6 GB)', 'Best speed requires CUDA or Apple Silicon'],
  },
  got_ocr2: {
    icon: '✨',
    badge: 'Best Balance',
    pros: ['Excellent on equations and charts', 'Good on 16 GB laptops', '580M end-to-end model'],
    cons: ['Requires ≥8 GB RAM', 'Slightly slower on CPU-only'],
  },
  doctr: {
    icon: '⚡',
    badge: 'Lightest',
    pros: ['~160 MB download', 'Runs on any CPU with 2 GB RAM', 'Great for printed text, receipts, forms'],
    cons: ['Lower accuracy on complex tables / equations'],
  },
};

// ── Device info chip ──────────────────────────────────────────────────────────

function DeviceChip({ caps }: { caps: OcrDeviceCapabilities }) {
  const ramGB = (caps.ram_total_mb / 1024).toFixed(0);
  const gpuLabel = caps.cuda_available
    ? `CUDA · ${caps.cuda_device_name ?? 'GPU'}${caps.cuda_vram_mb ? ` · ${Math.round(caps.cuda_vram_mb / 1024)} GB VRAM` : ''}`
    : caps.mps_available
    ? 'Apple Silicon · Metal (MPS)'
    : 'CPU only';
  const PlatIcon = caps.platform === 'macos' ? Apple : caps.platform === 'windows' ? Monitor : Server;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
      <PlatIcon className="h-4 w-4 shrink-0 text-slate-500" />
      <span className="font-medium capitalize text-slate-700">{caps.platform}</span>
      <span className="text-slate-300">·</span>
      <Zap className="h-4 w-4 shrink-0 text-amber-500" />
      <span className="text-slate-600">{gpuLabel}</span>
      <span className="text-slate-300">·</span>
      <Cpu className="h-4 w-4 shrink-0 text-indigo-400" />
      <span className="text-slate-600">{ramGB} GB RAM</span>
    </div>
  );
}

// ── Backend card ──────────────────────────────────────────────────────────────

interface BackendCardProps {
  info: OcrBackendInfo;
  jobStatus: OcrJobStatus | null;
  onDownload: () => void;
  onActivate: () => void;
  onCancel: () => void;
  onClearCache: () => void;
  activating: boolean;
  unavailableInBuild?: boolean;
}

function BackendCard({ info, jobStatus, onDownload, onActivate, onCancel, onClearCache, activating, unavailableInBuild = false }: BackendCardProps) {
  const meta = BACKEND_META[info.id] ?? { icon: '🤖', badge: '', pros: [], cons: [] };
  const isRunning = jobStatus?.status === 'running' || jobStatus?.status === 'cancelling';
  const isCancelling = jobStatus?.status === 'cancelling';
  const downloadPct = pct(jobStatus?.bytes_done ?? jobStatus?.progress ?? 0, jobStatus?.bytes_total ?? jobStatus?.total ?? 0);
  const isActive = !!info.active;

  const borderClass = isActive
    ? 'border-emerald-300 ring-1 ring-emerald-300'
    : info.recommended
    ? 'border-indigo-200'
    : 'border-slate-200';

  return (
    <div className={`rounded-2xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${borderClass}`}>
      {/* Top badges */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {info.recommended && (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700">
            Recommended for your device
          </span>
        )}
        {meta.badge && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
            {meta.badge}
          </span>
        )}
        {isActive && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
            <CheckCircle2 className="h-3 w-3" /> Active
          </span>
        )}
        {info.ready && !isActive && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Downloaded
          </span>
        )}
      </div>

      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">{meta.icon}</span>
            <span className="text-base font-semibold text-slate-900">{info.label}</span>
          </div>
          <p className="mt-1 text-sm leading-5 text-slate-500">{info.description}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-medium text-slate-700">{fmtBytes(info.bytes_present)}</div>
          <div className="text-xs text-slate-400">of {fmtBytes(info.bytes_required)}</div>
        </div>
      </div>

      {/* Pros / cons */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {meta.pros.map((p) => (
          <div key={p} className="flex items-start gap-1 text-emerald-700">
            <span className="mt-0.5 shrink-0 text-emerald-500">✓</span>
            <span>{p}</span>
          </div>
        ))}
        {meta.cons.map((c) => (
          <div key={c} className="flex items-start gap-1 text-slate-400">
            <span className="mt-0.5 shrink-0">–</span>
            <span>{c}</span>
          </div>
        ))}
      </div>

      {/* Download progress bar */}
      {isRunning && (
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              {isCancelling ? 'Cancelling…' : (jobStatus?.message || 'Downloading…')}
            </span>
            <span className="tabular-nums">{downloadPct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${downloadPct}%` }}
            />
          </div>
          {(jobStatus?.bytes_total ?? 0) > 0 && (
            <div className="text-right text-[10px] text-slate-400">
              {fmtBytes(jobStatus?.bytes_done ?? 0)} / {fmtBytes(jobStatus?.bytes_total ?? 0)}
            </div>
          )}
        </div>
      )}

      {/* Unavailable in current build notice */}
      {unavailableInBuild && (
        <div className="mt-3 flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span>
            Not available in this build. Requires <code className="font-mono text-[10px]">{info.id === 'doctr' ? 'python-doctr' : 'paddleocr'}</code> to be installed separately.
          </span>
        </div>
      )}

      {/* Action row */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {/* Disk / cache info */}
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <HardDrive className="h-3.5 w-3.5" />
          <span>{info.ready ? 'Cache ready' : unavailableInBuild ? 'Separate install required' : `Needs ${fmtBytes(info.bytes_required - info.bytes_present)} more`}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Clear cache button (only when ready) */}
          {info.ready && !isActive && !isRunning && (
            <button
              type="button"
              onClick={onClearCache}
              title="Delete cached model files for this backend"
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
          )}

          {/* Cancel */}
          {isRunning && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isCancelling}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              {isCancelling ? 'Cancelling…' : 'Cancel'}
            </button>
          )}

          {/* Download (not ready, not running) */}
          {!info.ready && !isRunning && !unavailableInBuild && (
            <button
              type="button"
              onClick={onDownload}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-500"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
          )}

          {!info.ready && !isRunning && unavailableInBuild && (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-semibold text-amber-700">
              <AlertCircle className="h-3.5 w-3.5" />
              Unavailable
            </span>
          )}

          {/* Activate (ready but not active, not running) */}
          {info.ready && !isActive && !isRunning && (
            <button
              type="button"
              onClick={onActivate}
              disabled={activating}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-60"
            >
              {activating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              {activating ? 'Activating…' : 'Activate'}
            </button>
          )}

          {/* Active indicator */}
          {isActive && !isRunning && (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              In use
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export interface OcrSettingsPanelProps {
  /** Controlled: a running OCR download job (from App.tsx state) */
  ocrJobId: string | null;
  ocrJobStatus: OcrJobStatus | null;
  /** Called when the panel kicks off a new download */
  onStartDownload: (backendId: string) => void;
  /** Called to cancel the current job */
  onCancelDownload: () => void;
  /** Callback when active backend changes (so parent can refresh state) */
  onBackendActivated?: (backendId: string) => void;
  variant?: 'full' | 'lite' | null;
}

const OcrSettingsPanel: React.FC<OcrSettingsPanelProps> = ({
  ocrJobId,
  ocrJobStatus,
  onStartDownload,
  onCancelDownload,
  onBackendActivated,
  variant,
}) => {
  const [backendsData, setBackendsData] = useState<OcrBackendsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const pollRef = useRef<number | null>(null);

  const fetchBackends = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const data = await apiService.getOcrBackends();
      setBackendsData(data);
    } catch (err) {
      if (!quiet) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  // Initial load + auto-refresh while a download job is running
  useEffect(() => {
    void fetchBackends();
  }, [fetchBackends]);

  useEffect(() => {
    if (pollRef.current !== null) window.clearInterval(pollRef.current);
    if (ocrJobStatus?.status === 'running') {
      pollRef.current = window.setInterval(() => void fetchBackends(true), 3000);
    } else if (ocrJobStatus?.status === 'completed') {
      // Refresh once after download to show updated bytes_present
      void fetchBackends(true);
    }
    return () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
  }, [ocrJobStatus?.status, fetchBackends]);

  const totalCacheBytes = useMemo(
    () => backendsData?.backends.reduce((s, b) => s + (b.bytes_present || 0), 0) ?? 0,
    [backendsData]
  );

  const handleActivate = useCallback(async (backendId: string) => {
    setActivating(backendId);
    setFeedback(null);
    try {
      await apiService.activateOcrBackend(backendId);
      await fetchBackends(true);
      setFeedback({ kind: 'success', text: `${backendsData?.backends.find(b => b.id === backendId)?.label ?? backendId} is now active. Warmup running in background.` });
      onBackendActivated?.(backendId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ kind: 'error', text: `Activation failed: ${msg}` });
    } finally {
      setActivating(null);
    }
  }, [backendsData, fetchBackends, onBackendActivated]);

  const handleClearCache = useCallback(async (backendId: string) => {
    setConfirmClear(null);
    setFeedback(null);
    try {
      await apiService.clearOcrCache(backendId);
      await fetchBackends(true);
      setFeedback({ kind: 'success', text: `Cache cleared for ${backendId}. Re-download required.` });
    } catch (err) {
      setFeedback({ kind: 'error', text: `Failed to clear cache: ${err instanceof Error ? err.message : String(err)}` });
    }
  }, [fetchBackends]);

  const handleDownload = useCallback((backendId: string) => {
    // Don't start a new download if one is already in progress
    if (ocrJobStatus?.status === 'running' || ocrJobStatus?.status === 'cancelling') return;
    setFeedback(null);
    onStartDownload(backendId);
  }, [ocrJobStatus?.status, onStartDownload]);

  return (
    <div className="space-y-6">
      {/* Panel header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-600">OCR Engine</div>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">Manage OCR Backends</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Download one or more engines. SlideForge caches them locally and reuses them offline.
            Activate the backend you want for analysis.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchBackends()}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      {/* Error loading backends */}
      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Could not reach OCR service</p>
            <p className="text-xs">{error}</p>
            <button onClick={() => void fetchBackends()} className="mt-1 text-xs font-medium underline">
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Device info */}
      {backendsData?.device && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Your Device</p>
          <DeviceChip caps={backendsData.device} />
          {backendsData.device.recommended_reason && (
            <p className="mt-2 text-xs text-slate-500">
              <span className="font-semibold text-indigo-600">Tip: </span>
              {backendsData.device.recommended_reason}
            </p>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !backendsData && (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Detecting device and loading backend status…
        </div>
      )}

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-sm ${
            feedback.kind === 'success'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border border-red-200 bg-red-50 text-red-900'
          }`}
        >
          {feedback.kind === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          )}
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="ml-auto text-slate-400 hover:text-slate-600">✕</button>
        </div>
      )}

      {/* Backend cards */}
      {backendsData && (
        <>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Available Engines</p>
            <div className="space-y-4">
              {backendsData.backends.map((info) => {
                const jobForBackend =
                  ocrJobStatus && ocrJobStatus.backend_id === info.id ? ocrJobStatus : null;
                const isLite = variant === 'lite';
                const notAvailable = isLite && info.available_in_lite === false;
                return (
                  <BackendCard
                    key={info.id}
                    info={info}
                    jobStatus={jobForBackend}
                    onDownload={() => handleDownload(info.id)}
                    onActivate={() => void handleActivate(info.id)}
                    onCancel={onCancelDownload}
                    onClearCache={() => setConfirmClear(info.id)}
                    activating={activating === info.id}
                    unavailableInBuild={notAvailable}
                  />
                );
              })}
            </div>
          </div>

          {/* Storage summary */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <HardDrive className="h-4 w-4 text-slate-400" />
                Total cache on disk
              </div>
              <div className="text-sm font-bold text-slate-900">{fmtBytes(totalCacheBytes)}</div>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Models are cached locally and reused offline. Re-download at any time with the Download button.
            </p>
          </div>
        </>
      )}

      {/* Confirm clear dialog */}
      {confirmClear && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p className="font-semibold text-slate-900">Clear cache for {confirmClear}?</p>
                <p className="mt-1 text-sm text-slate-500">
                  This deletes the downloaded model files. You will need to re-download before using this backend again.
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmClear(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleClearCache(confirmClear)}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
              >
                Clear cache
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OcrSettingsPanel;
