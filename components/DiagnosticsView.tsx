import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  FolderOpen,
  HardDrive,
  Loader2,
  MemoryStick,
  RefreshCcw,
  Server,
  ShieldAlert,
} from 'lucide-react';
import ErrorCard from './ErrorCard';
import { apiService, DiagnosticsResponse } from '../services/apiService';

interface DiagnosticsViewProps {
  onBack: () => void;
}

const formatBytes = (value?: number): string => {
  if (!value || !Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const scaled = value / 1024 ** exponent;
  return `${scaled >= 10 || exponent === 0 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[exponent]}`;
};

const formatTime = (value?: number | null): string => {
  if (!value) return 'N/A';
  return new Date(value * 1000).toLocaleString();
};

const formatDuration = (seconds?: number): string => {
  if (!seconds || seconds <= 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
};

const statusTone = (status: string): string => {
  const normalized = status.toLowerCase();
  if (['ok', 'healthy', 'ready', 'loaded', 'configured', 'succeeded', 'initialized'].includes(normalized)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (['warning', 'degraded', 'pending', 'loading', 'running'].includes(normalized)) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border-rose-200 bg-rose-50 text-rose-700';
};

const copyText = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const el = document.createElement('textarea');
    el.value = value;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }
};

const DiagnosticsView: React.FC<DiagnosticsViewProps> = ({ onBack }) => {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDiagnostics = useCallback(async (note?: string) => {
    setLoading(true);
    setError(null);
    if (note) {
      setMessage(note);
    }
    try {
      const result = await apiService.getDiagnostics();
      setDiagnostics(result);
      setMessage('Diagnostics refreshed successfully.');
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Failed to load diagnostics';
      setError(text);
      setMessage(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics]);

  const providerRows = useMemo(() => {
    if (!diagnostics) return [];
    return Object.entries(diagnostics.llm.providers);
  }, [diagnostics]);

  const handleRunAllChecks = async () => {
    await loadDiagnostics('Running backend diagnostics checks...');
  };

  const handleCopyDiagnostics = async () => {
    if (!diagnostics) return;
    await copyText(JSON.stringify(diagnostics, null, 2));
    setMessage('Diagnostics copied to clipboard.');
  };

  const handleOpenLogs = async () => {
    if (!window.slideforge?.getLogsPath || !window.slideforge?.revealInFolder) {
      setMessage('Open logs is not available in this runtime.');
      return;
    }
    try {
      const logsPath = await window.slideforge.getLogsPath();
      if (!logsPath) {
        setMessage('Logs path is unavailable in this runtime.');
        return;
      }
      await window.slideforge.revealInFolder(logsPath);
      setMessage('Opened logs folder.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open logs folder');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="sf-eyebrow">System diagnostics</div>
              <h1 className="mt-2 text-2xl font-bold text-slate-950">SlideForge Diagnostics</h1>
              <p className="mt-2 text-sm text-slate-600">
                Single source of truth for backend, model runtime, and local resource state.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRunAllChecks}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                Run all checks
              </button>
              <button
                type="button"
                onClick={handleOpenLogs}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Open logs folder
              </button>
              <button
                type="button"
                onClick={handleCopyDiagnostics}
                disabled={!diagnostics}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy diagnostics
              </button>
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-black"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
            </div>
          </div>

          {message && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {message}
            </div>
          )}
          {error && (
            <div className="mt-4">
              <ErrorCard title="Diagnostics failed" body={error} />
            </div>
          )}
        </header>

        {diagnostics && (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-slate-500">
                  Backend
                  <Server className="h-4 w-4" />
                </div>
                <div className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(diagnostics.backend.status)}`}>
                  {diagnostics.backend.status}
                </div>
                <div className="mt-3 text-sm text-slate-600">PID {diagnostics.backend.pid}</div>
                <div className="text-sm text-slate-600">Uptime {formatDuration(diagnostics.backend.uptime_seconds)}</div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-slate-500">
                  OCR
                  <ShieldAlert className="h-4 w-4" />
                </div>
                <div className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(diagnostics.ocr.state)}`}>
                  {diagnostics.ocr.state}
                </div>
                <div className="mt-3 text-sm text-slate-600">{diagnostics.ocr.message || 'No OCR message available.'}</div>
                <div className="text-sm text-slate-600">Cached files {diagnostics.ocr.cached_files}</div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-slate-500">
                  ChromaDB
                  <Database className="h-4 w-4" />
                </div>
                <div className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(diagnostics.chromadb.state)}`}>
                  {diagnostics.chromadb.state}
                </div>
                <div className="mt-3 text-sm text-slate-600">Collections {diagnostics.chromadb.collections ?? 'N/A'}</div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-slate-500">
                  Last analysis
                  <Clock3 className="h-4 w-4" />
                </div>
                <div className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(diagnostics.analysis.last_status)}`}>
                  {diagnostics.analysis.last_status}
                </div>
                <div className="mt-3 text-sm text-slate-600">Session {diagnostics.analysis.last_session_id || 'N/A'}</div>
                <div className="text-sm text-slate-600">At {formatTime(diagnostics.analysis.last_run_at)}</div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">LLM providers</div>
                <div className="mt-4 space-y-3">
                  {providerRows.map(([name, provider]) => (
                    <div key={name} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-900">{name}</div>
                        <div className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusTone(provider.connection?.ok ? 'ok' : 'error')}`}>
                          {provider.connection?.ok ? 'reachable' : 'unreachable'}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">{provider.base_url || 'N/A'} | model {provider.model || 'N/A'}</div>
                      <div className="mt-1 text-xs text-slate-500">{provider.runtime_hint || 'No runtime hint available.'}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">System resources</div>
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                      <span className="inline-flex items-center gap-2"><HardDrive className="h-4 w-4" /> Disk</span>
                      {diagnostics.system.disk.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-rose-600" />}
                    </div>
                    {diagnostics.system.disk.ok ? (
                      <div className="mt-2 text-xs text-slate-600">
                        Free {formatBytes(diagnostics.system.disk.free_bytes)} / Total {formatBytes(diagnostics.system.disk.total_bytes)}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-rose-700">{diagnostics.system.disk.error || 'Disk status unavailable.'}</div>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                      <span className="inline-flex items-center gap-2"><MemoryStick className="h-4 w-4" /> Memory</span>
                      {diagnostics.system.memory.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-rose-600" />}
                    </div>
                    {diagnostics.system.memory.ok ? (
                      <div className="mt-2 text-xs text-slate-600">
                        Used {formatBytes(diagnostics.system.memory.used_bytes)} / Total {formatBytes(diagnostics.system.memory.total_bytes)}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-rose-700">{diagnostics.system.memory.error || 'Memory status unavailable.'}</div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Warmup and preflight</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <div className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(diagnostics.startup.model_warmup_state)}`}>
                  warmup {diagnostics.startup.model_warmup_state}
                </div>
                <div className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(diagnostics.startup.preflight.overall)}`}>
                  preflight {diagnostics.startup.preflight.overall}
                </div>
              </div>
              <div className="mt-3 text-sm text-slate-700">{diagnostics.startup.model_warmup_message || 'No warmup message available.'}</div>
              {diagnostics.startup.model_warmup_error && (
                <div className="mt-2 text-sm text-rose-700">{diagnostics.startup.model_warmup_error}</div>
              )}

              {diagnostics.startup.preflight.checks && diagnostics.startup.preflight.checks.length > 0 && (
                <div className="mt-6 border-t border-slate-100 pt-5">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mb-4">
                    Bare Minimum Prerequisite Checklist
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {diagnostics.startup.preflight.checks.map((check) => {
                      const isOk = check.status === 'OK';
                      const isWarning = ['WARNING', 'MISSING'].includes(check.status);
                      const isError = check.status === 'ERROR';
                      
                      let checkColor = 'border-slate-100 bg-slate-50/50 text-slate-700';
                      let iconBg = 'bg-slate-200 text-slate-600';
                      let iconText = '•';

                      if (isOk) {
                        checkColor = 'border-emerald-100 bg-emerald-50/30 text-slate-700';
                        iconBg = 'bg-emerald-100 text-emerald-700';
                        iconText = '✓';
                      } else if (isWarning) {
                        checkColor = 'border-amber-100 bg-amber-50/30 text-slate-700';
                        iconBg = 'bg-amber-100 text-amber-700';
                        iconText = '!';
                      } else if (isError) {
                        checkColor = 'border-rose-100 bg-rose-50/30 text-slate-700';
                        iconBg = 'bg-rose-100 text-rose-700';
                        iconText = '✕';
                      }

                      return (
                        <div
                          key={check.name}
                          className={`flex items-start gap-3 rounded-xl border p-3.5 transition-colors ${checkColor}`}
                        >
                          <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${iconBg}`}>
                            {iconText}
                          </div>
                          <div>
                            <div className="text-xs font-bold tracking-wide uppercase text-slate-900">
                              {check.name.replace(/_/g, ' ')}
                            </div>
                            <div className="text-xs text-slate-600 mt-1 leading-relaxed">
                              {check.message}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default DiagnosticsView;
