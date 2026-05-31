import React, { useEffect, useState, useCallback } from "react";
import {
  XCircle,
  CheckCircle2,
  Download,
  Cpu,
  Zap,
  MemoryStick,
  ChevronRight,
  AlertCircle,
  Loader2,
  Monitor,
  Apple,
  Server,
} from "lucide-react";
import { apiService } from "../services/apiService";
import type {
  OcrJobStatus,
  OcrDeviceCapabilities,
  OcrBackendInfo,
  OcrBackendId,
  OcrBackendsResponse,
} from "../types";

// ── Backend metadata (pros / cons) shown in the UI ──────────────────────────

interface BackendMeta {
  icon: string;
  pros: string[];
  cons: string[];
  badge?: string;
}

const BACKEND_META: Record<OcrBackendId, BackendMeta> = {
  paddleocr: {
    icon: "🚀",
    pros: [
      "Best accuracy on tables, formulas, mixed layouts",
      "109 languages supported",
      "Fast on CUDA / MPS GPU",
    ],
    cons: ["Needs CUDA or MPS for best speed", "Larger download (~900 MB)"],
    badge: "Most Accurate",
  },
  got_ocr2: {
    icon: "✨",
    pros: [
      "End-to-end 580 M-param model",
      "Excellent on equations and charts",
      "Good on Apple Silicon (MPS) and 16 GB laptops",
    ],
    cons: ["Requires ≥8 GB RAM", "Slightly slower on CPU-only"],
    badge: "Best Balance",
  },
  doctr: {
    icon: "⚡",
    pros: [
      "Lightest download (~200–400 MB)",
      "Works on any CPU with 2 GB RAM",
      "Great for printed text, receipts, forms",
    ],
    cons: ["Less accurate on complex tables / equations"],
    badge: "Lightest",
  },
};

// ── Helper to format byte sizes ──────────────────────────────────────────────

function fmtBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}

// ── Device chip component ────────────────────────────────────────────────────

function DeviceChip({ caps }: { caps: OcrDeviceCapabilities }) {
  const ramGB = (caps.ram_total_mb / 1024).toFixed(0);
  const gpu = caps.cuda_available
    ? `CUDA · ${caps.cuda_device_name ?? "GPU"}${caps.cuda_vram_mb ? ` · ${Math.round(caps.cuda_vram_mb / 1024)} GB VRAM` : ""}`
    : caps.mps_available
    ? "Apple Silicon · Metal (MPS)"
    : "CPU only";

  const PlatIcon =
    caps.platform === "macos"
      ? Apple
      : caps.platform === "windows"
      ? Monitor
      : Server;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
      <PlatIcon className="h-4 w-4 shrink-0 text-slate-500" />
      <span className="font-medium capitalize text-slate-700">
        {caps.platform}
      </span>
      <span className="text-slate-400">·</span>
      <Zap className="h-4 w-4 shrink-0 text-amber-500" />
      <span className="text-slate-600">{gpu}</span>
      <span className="text-slate-400">·</span>
      <MemoryStick className="h-4 w-4 shrink-0 text-indigo-400" />
      <span className="text-slate-600">{ramGB} GB RAM</span>
    </div>
  );
}

// ── Backend card ─────────────────────────────────────────────────────────────

interface BackendCardProps {
  info: OcrBackendInfo;
  meta: BackendMeta;
  selected: boolean;
  downloading: boolean;
  jobStatus: OcrJobStatus | null;
  unavailableInBuild?: boolean;
  onSelect: () => void;
  onDownload: () => void;
  onCancel: () => void;
}

function BackendCard({
  info,
  meta,
  selected,
  downloading,
  jobStatus,
  unavailableInBuild = false,
  onSelect,
  onDownload,
  onCancel,
}: BackendCardProps) {
  const progressPct =
    jobStatus?.bytes_total && jobStatus.bytes_total > 0
      ? Math.min(
          100,
          Math.round((jobStatus.bytes_done ?? 0) / jobStatus.bytes_total * 100)
        )
      : jobStatus?.total && jobStatus.total > 0
      ? Math.min(
          100,
          Math.round((jobStatus.progress ?? 0) / jobStatus.total * 100)
        )
      : 0;

  const ring = selected
    ? "ring-2 ring-indigo-500 border-indigo-300"
    : "border-slate-200 hover:border-slate-300";

  const handleCardClick = (e: React.MouseEvent) => {
    console.debug("[OcrSetupModal] Card clicked:", info.label, "Selected now:", !selected);
    onSelect();
  };

  return (
    <div
      className={`relative cursor-pointer rounded-2xl border bg-white p-4 shadow-sm transition-all ${ring}`}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardClick(e as any);
        }
      }}
    >
      {/* Badges row */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {info.recommended && (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700">
            Recommended
          </span>
        )}
        {meta.badge && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
            {meta.badge}
          </span>
        )}
        {info.ready && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
            <CheckCircle2 className="h-3 w-3" /> Ready
          </span>
        )}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">{meta.icon}</span>
            <span className="font-semibold text-slate-900">{info.label}</span>
          </div>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">
            {info.description}
          </p>
        </div>
        <span className="mt-0.5 shrink-0 text-xs font-medium text-slate-400">
          {info.size_label}
        </span>
      </div>

      {/* Pros / cons */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <ul className="space-y-1">
          {meta.pros.map((p) => (
            <li key={p} className="flex items-start gap-1 text-emerald-700">
              <span className="mt-0.5 shrink-0 text-emerald-500">✓</span>
              {p}
            </li>
          ))}
        </ul>
        <ul className="space-y-1">
          {meta.cons.map((c) => (
            <li key={c} className="flex items-start gap-1 text-slate-500">
              <span className="mt-0.5 shrink-0">–</span>
              {c}
            </li>
          ))}
        </ul>
      </div>

      {/* Unavailable in current build notice */}
      {unavailableInBuild && (
        <div className="mt-3 flex items-start gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span>
            Not available in this build. Requires <code className="font-mono text-[10px]">{info.id === 'doctr' ? 'python-doctr' : 'paddleocr'}</code> to be installed separately.
          </span>
        </div>
      )}

      {/* Download progress */}
      {downloading && jobStatus && (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {jobStatus.message || "Downloading…"}
            </span>
            {progressPct > 0 && <span>{progressPct}%</span>}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            {progressPct > 0 ? (
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            ) : (
              /* Indeterminate animated bar when no byte-level progress available */
              <div className="h-full w-full relative overflow-hidden rounded-full">
                <div className="absolute inset-0 bg-indigo-100" />
                <div
                  className="absolute inset-y-0 w-1/3 rounded-full bg-indigo-500"
                  style={{ animation: 'ocr-progress-slide 2s ease-in-out infinite' }}
                />
              </div>
            )}
          </div>
          {jobStatus.bytes_total ? (
            <div className="text-right text-[10px] text-slate-400">
              {fmtBytes(jobStatus.bytes_done ?? 0)} /{" "}
              {fmtBytes(jobStatus.bytes_total)}
            </div>
          ) : (
            <p className="text-[10px] text-slate-400">Large model (~1.4 GB) — this may take 10–20 min depending on connection speed.</p>
          )}
        </div>
      )}

      {/* Bottom action row */}
      <div className="mt-3 flex items-center justify-end gap-2">
        {downloading ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
          >
            <XCircle className="h-3.5 w-3.5" /> Cancel
          </button>
        ) : info.ready ? (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> Downloaded
          </span>
        ) : unavailableInBuild ? (
          <span className="text-xs font-medium text-slate-400">Requires separate install</span>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-500"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </button>
        )}
      </div>

      {/* Selected indicator */}
      {selected && (
        <div className="absolute right-2 top-2 rounded-full bg-indigo-500 p-0.5 text-white">
          <ChevronRight className="h-3 w-3" />
        </div>
      )}
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────

interface OcrSetupModalProps {
  open: boolean;
  variant?: "full" | "lite" | null;
  ready: boolean;
  bundleAvailable?: boolean;
  onDownload: (backendId?: OcrBackendId) => Promise<void> | void;
  onClose?: () => void;
  jobId?: string | null;
  jobStatus?: OcrJobStatus | null;
  onCancel?: () => void;
  /** Optional: pre-fetched backends list (if caller already has it) */
  backendsData?: OcrBackendsResponse | null;
}

const OcrSetupModal: React.FC<OcrSetupModalProps> = ({
  open,
  ready,
  onDownload,
  onClose,
  jobId,
  jobStatus,
  onCancel,
  backendsData: externalBackendsData,
}) => {
  const [backendsData, setBackendsData] = useState<OcrBackendsResponse | null>(
    externalBackendsData ?? null
  );
  const [loadingBackends, setLoadingBackends] = useState(false);
  const [selectedBackend, setSelectedBackend] = useState<OcrBackendId | null>(
    null
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [downloadCompleted, setDownloadCompleted] = useState(false);

  const fetchBackends = useCallback(async () => {
    setLoadingBackends(true);
    setLoadError(null);
    try {
      const data: OcrBackendsResponse = await apiService.getOcrBackends();
      setBackendsData(data);
      setSelectedBackend(data.device.recommended_backend);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingBackends(false);
    }
  }, []);

  useEffect(() => {
    if (open && !externalBackendsData) void fetchBackends();
  }, [open, externalBackendsData, fetchBackends]);

  useEffect(() => {
    if (externalBackendsData) {
      setBackendsData(externalBackendsData);
      setSelectedBackend(externalBackendsData.device.recommended_backend);
    }
  }, [externalBackendsData]);

  // Track when download completes (status = "completed")
  useEffect(() => {
    if (jobStatus && jobStatus.status === "completed" && !downloadCompleted) {
      setDownloadCompleted(true);
    }
  }, [jobStatus, downloadCompleted]);

  // Auto-close modal after successful download (with brief delay for UX feedback)
  useEffect(() => {
    if (downloadCompleted && onClose) {
      const timer = setTimeout(() => {
        onClose();
        setDownloadCompleted(false); // Reset for next use
      }, 2000); // Show success message for 2 seconds, then close
      return () => clearTimeout(timer);
    }
  }, [downloadCompleted, onClose]);

  if (!open) return null;

  const activeJob =
    jobId && jobStatus && jobStatus.status === "running" ? jobStatus : null;
  const failedJob =
    jobId && jobStatus && jobStatus.status === "failed" ? jobStatus : null;
  const completedJob =
    jobId && jobStatus && jobStatus.status === "completed" ? jobStatus : null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 px-4 py-8 backdrop-blur-sm">
      <div className="flex w-full max-w-2xl flex-col gap-4 rounded-[2rem] border border-white/10 bg-white shadow-[0_32px_100px_rgba(15,23,42,0.45)] max-h-[90vh] overflow-y-auto">

        {/* ── Active download sticky banner ─────────────────────────────── */}
        {activeJob && (
          <div className="sticky top-0 z-10 flex flex-col gap-1.5 rounded-t-[2rem] bg-indigo-600 px-6 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <Loader2 className="h-4 w-4 animate-spin shrink-0 text-white" />
                <span className="truncate text-sm font-semibold text-white">
                  {activeJob.message || "Downloading OCR engine…"}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-indigo-200">
                  {activeJob.bytes_total
                    ? `~${(activeJob.bytes_total / 1e9).toFixed(1)} GB · may take 10–20 min`
                    : "Large download — please wait…"}
                </span>
                <button
                  onClick={onCancel}
                  className="rounded-full border border-indigo-400 bg-indigo-700/60 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-600/80 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
            {/* Indeterminate progress — snapshot_download doesn't report byte-level progress */}
            <div className="h-1 w-full overflow-hidden rounded-full bg-indigo-500/50">
              <div
                className="h-full w-1/3 rounded-full bg-white/70"
                style={{ animation: "ocr-progress-slide 2s ease-in-out infinite" }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4 p-6 pt-4">
        {/* Header with close button */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-600">
              OCR Setup
            </div>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              Choose an OCR Engine
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Download one engine once. SlideForge caches it locally and reuses it
              offline.
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              title="Close"
            >
              <XCircle className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Device info */}
        {backendsData?.device && (
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-slate-400">
              Your Device
            </p>
            <DeviceChip caps={backendsData.device} />
            {backendsData.device.recommended_reason && (
              <p className="mt-1.5 text-xs text-slate-500">
                <span className="font-medium text-indigo-600">Tip: </span>
                {backendsData.device.recommended_reason}
              </p>
            )}
          </div>
        )}

        {/* Loading state */}
        {loadingBackends && (
          <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Detecting your device…
          </div>
        )}

        {/* Error state */}
        {loadError && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Could not reach the OCR service</p>
              <p className="text-xs">{loadError}</p>
              <button
                onClick={() => void fetchBackends()}
                className="mt-1 text-xs font-medium underline"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Backend cards */}
        {backendsData && !loadingBackends && (
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Available Engines
            </p>
            {backendsData.backends.map((info) => {
              const meta = BACKEND_META[info.id] ?? {
                icon: "🤖",
                pros: [],
                cons: [],
              };
              const isThisDownloading =
                !!activeJob && activeJob.backend_id === info.id;
              const notAvailable = info.available_in_lite === false;
              return (
                <BackendCard
                  key={info.id}
                  info={info}
                  meta={meta}
                  selected={selectedBackend === info.id}
                  downloading={isThisDownloading}
                  jobStatus={isThisDownloading ? jobStatus ?? null : null}
                  unavailableInBuild={notAvailable}
                  onSelect={() => setSelectedBackend(info.id)}
                  onDownload={() => void onDownload(info.id)}
                  onCancel={() => onCancel?.()}
                />
              );
            })}
          </div>
        )}

        {/* Global download status (non-running states) */}
        {failedJob && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <p className="font-medium">
              Download failed: {failedJob.error ?? "unknown error"}
            </p>
            <p className="mt-0.5 text-xs">{failedJob.message}</p>
          </div>
        )}
        {completedJob && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            OCR engine downloaded and ready. SlideForge will reuse this cache
            automatically.
          </div>
        )}

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            onClick={() => void fetchBackends()}
            className="text-xs text-slate-400 underline hover:text-slate-600"
          >
            Refresh device info
          </button>
          <div className="flex gap-2">
            {onClose && !activeJob && (
              <button
                onClick={onClose}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {ready || completedJob ? "Close" : "Skip for now"}
              </button>
            )}
            {/* Primary CTA: download selected backend if not yet ready */}
            {!activeJob && selectedBackend && (
              (() => {
                const selInfo = backendsData?.backends.find(
                  (b) => b.id === selectedBackend
                );
                console.debug("[OcrSetupModal Footer] selectedBackend:", selectedBackend, "selInfo:", selInfo, "selInfo.ready:", selInfo?.ready);
                if (!selInfo) {
                  console.warn("[OcrSetupModal Footer] Backend not found in list");
                  return null;
                }
                if (selInfo.ready) {
                  console.debug("[OcrSetupModal Footer] Showing ready button - backend is ready!");
                  return (
                    <button
                      onClick={() => {
                        console.debug("[OcrSetupModal] Ready button clicked, calling onClose");
                        onClose?.();
                      }}
                      className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-600 transition-colors cursor-pointer shadow-lg hover:shadow-emerald-500/50"
                    >
                      <CheckCircle2 className="h-5 w-5" />
                      {selInfo.label} ready
                    </button>
                  );
                }
                console.debug("[OcrSetupModal Footer] Backend not ready - showing download button");
                if (selInfo.available_in_lite === false) {
                  return (
                    <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-4 py-2 text-sm font-medium text-amber-700">
                      <AlertCircle className="h-4 w-4" />
                      Requires separate install
                    </span>
                  );
                }
                return (
                  <button
                    onClick={() => void onDownload(selectedBackend)}
                    className="flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500"
                  >
                    <Download className="h-4 w-4" />
                    Download {selInfo.label}
                  </button>
                );
              })()
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default OcrSetupModal;
