import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileUp,
  FolderOpen,
  KeyRound,
  Loader2,
  Save,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import ErrorCard from './ErrorCard';
import {
  apiService,
  ApiError,
  DiagnosticsResponse,
  HistoryItem,
  LlmProviderResponse,
  UpdateLlmProviderPayload,
} from '../services/apiService';
import { RuntimeAssetStatusResponse, OcrBackendsResponse, OcrJobStatus } from '../types';

interface FileUploadProps {
  onUpload: (files: File[]) => void;
  isProcessing: boolean;
  processingStatus?: RuntimeAssetStatusResponse | null;
  progressLabel?: string | null;
  onError?: (msg: string) => void;
  onOpenHistory: (fingerprint: string) => void;
  onOpenDiagnostics?: () => void;
  onOpenOcrSetup?: () => void;
  onRequestOcrDownload?: (backendId?: string) => void;
  ocrJobId?: string | null;
  ocrJobStatus?: OcrJobStatus | null;
}

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const scaled = value / 1024 ** exponent;
  return `${scaled >= 10 || exponent === 0 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[exponent]}`;
};

const providerOptions = [
  {
    value: 'api',
    label: 'Cloud AI',
    description: 'Connect to an OpenAI-compatible cloud endpoint.',
    helper: 'Use your provider base URL, for example `https://api.openai.com/v1`. Cloud AI will fail until a valid API key is saved.',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
    modelPlaceholder: 'gpt-4.1-mini',
  },
  {
    value: 'ollama',
    label: 'Ollama',
    description: 'Run a local model through your Ollama server.',
    helper: 'Start Ollama and pull the model first, for example `ollama serve` and `ollama pull llama3.1:8b`. Default base URL: `http://localhost:11434/v1`.',
    baseUrlPlaceholder: 'http://localhost:11434/v1',
    modelPlaceholder: 'llama3.1:8b',
  },
  {
    value: 'lm_studio',
    label: 'LM Studio',
    description: 'Run a local model through LM Studio\'s OpenAI-compatible server.',
    helper: 'In LM Studio, load a model and start the local server from the Developer tab. Default base URL: `http://localhost:1234/v1`.',
    baseUrlPlaceholder: 'http://localhost:1234/v1',
    modelPlaceholder: 'local-model',
  },
  {
    value: 'mlx',
    label: 'Local MLX',
    description: 'Use the backend\'s Apple silicon MLX runtime.',
    helper: 'This provider is managed on the backend and does not need a web API key or base URL.',
    baseUrlPlaceholder: '',
    modelPlaceholder: 'mlx-community/Qwen2.5-7B-Instruct-4bit',
  },
  {
    value: 'transformers',
    label: 'Local PyTorch',
    description: 'Use the backend\'s Transformers runtime.',
    helper: 'This provider is managed on the backend and does not need a web API key or base URL.',
    baseUrlPlaceholder: '',
    modelPlaceholder: 'Qwen/Qwen2.5-7B-Instruct',
  },
] as const;

const formatRelativeTime = (value: string) => {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return 'Recently updated';

  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'Updated just now';
  if (seconds < 3600) return `Updated ${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `Updated ${Math.floor(seconds / 3600)}h ago`;
  return `Updated ${Math.floor(seconds / 86400)}d ago`;
};

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, '');

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

type SettingsState =
  | 'idle'
  | 'editing'
  | 'dirty'
  | 'testing'
  | 'tested-ok'
  | 'tested-fail'
  | 'saving'
  | 'saved'
  | 'error';

type StructuredUiError = {
  title: string;
  body: string;
  hint?: string;
  context?: {
    requestId?: string | null;
    timestamp?: string | null;
    endpoint?: string | null;
    status?: number;
  };
  raw?: string;
};

const buildStructuredUiError = (error: unknown, fallbackTitle: string): StructuredUiError => {
  if (error instanceof ApiError) {
    return {
      title: error.title || fallbackTitle,
      body: error.message || fallbackTitle,
      hint: error.hint,
      context: error.context,
      raw: JSON.stringify(
        {
          message: error.message,
          code: error.code,
          title: error.title,
          hint: error.hint,
          context: error.context,
        },
        null,
        2
      ),
    };
  }

  if (error instanceof Error) {
    return {
      title: fallbackTitle,
      body: error.message || fallbackTitle,
      raw: error.stack || error.message,
    };
  }

  return {
    title: fallbackTitle,
    body: fallbackTitle,
    raw: String(error),
  };
};

const FileUpload: React.FC<FileUploadProps> = ({ onUpload, isProcessing, processingStatus, progressLabel, onError, onOpenHistory, onOpenDiagnostics, onOpenOcrSetup, onRequestOcrDownload, ocrJobId, ocrJobStatus }) => {
  const [providerConfig, setProviderConfig] = useState<LlmProviderResponse | null>(null);
  const [providerDraft, setProviderDraft] = useState<string>('api');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyTouched, setApiKeyTouched] = useState(false);
  const [localContextWindow, setLocalContextWindow] = useState<number>(8192);
  const [loadingProvider, setLoadingProvider] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [providerFeedback, setProviderFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [settingsState, setSettingsState] = useState<SettingsState>('idle');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');
  const [structuredError, setStructuredError] = useState<StructuredUiError | null>(null);
  const [lastDiagnostics, setLastDiagnostics] = useState<DiagnosticsResponse | null>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);
  const [recentHistory, setRecentHistory] = useState<HistoryItem[]>([]);

  const applyProviderConfigToDraft = useCallback((data: LlmProviderResponse, nextProvider?: string) => {
    const resolvedProvider = nextProvider || data.provider;
    const providerState = data.providers[resolvedProvider];
    setProviderConfig(data);
    setProviderDraft(resolvedProvider);
    setApiBaseUrl(providerState?.api_base_url || data.api_base_url || '');
    setModel(providerState?.model || data.model || '');
    setLocalContextWindow(data.local_context_window || 8192);
    setApiKey('');
    setApiKeyTouched(false);
  }, []);

  useEffect(() => {
    let isCancelled = false;
    setLoadingProvider(true);

    Promise.all([
      apiService.getLlmProvider(),
      apiService.getRecentHistory(),
      apiService.getDiagnostics().catch(() => null),
    ])
      .then(([providerData, historyData, diagnostics]) => {
        if (isCancelled) return;
        applyProviderConfigToDraft(providerData);
        setSettingsState('idle');
        setRecentHistory(historyData.items || []);
        if (diagnostics) {
          setLastDiagnostics(diagnostics);
        }
      })
      .catch((err: Error) => {
        if (isCancelled) return;
        console.error(err);
        onError?.(err.message || 'Failed to load workspace settings.');
      })
      .finally(() => {
        if (isCancelled) return;
        setLoadingProvider(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [applyProviderConfigToDraft, onError]);

  const handleProviderSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextProvider = e.target.value;
    setProviderFeedback(null);
    setTestStatus('idle');
    setTestMessage('');
    setStructuredError(null);
    setSettingsState('editing');

    if (providerConfig) {
      applyProviderConfigToDraft(providerConfig, nextProvider);
      return;
    }

    setProviderDraft(nextProvider);
  };

  const handleContextWindowChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number(e.target.value) || 1024;
    setLocalContextWindow(nextValue);
    setProviderFeedback(null);
    setStructuredError(null);
    setSettingsState('editing');
  };

  const isValidFile = (file: File) =>
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pptx') ||
    file.type.includes('presentation');

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (isProcessing) return;

      const droppedFiles = Array.from(e.dataTransfer.files);
      const validFiles = droppedFiles.filter(isValidFile);

      if (validFiles.length > 0) {
        onUpload(validFiles);
      } else if (droppedFiles.length > 0 && onError) {
        onError('Unsupported format. Upload a PDF or PPTX deck.');
      }
    },
    [isProcessing, onError, onUpload]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const selectedFiles = Array.from(e.target.files);
    const validFiles = selectedFiles.filter(isValidFile);

    if (validFiles.length > 0) {
      onUpload(validFiles);
    } else if (onError) {
      onError('Unsupported format. Upload a PDF or PPTX deck.');
    }
  };

  const showRuntimeInputs = providerDraft === 'api' || providerDraft === 'ollama' || providerDraft === 'lm_studio';
  const showContextSetting = providerDraft === 'ollama' || providerDraft === 'lm_studio';
  const providerMeta = useMemo(
    () => providerOptions.find((option) => option.value === providerDraft) || providerOptions[0],
    [providerDraft]
  );
  const draftProviderState = providerConfig?.providers?.[providerDraft];
  const configuredState = draftProviderState?.configured ?? providerConfig?.configured ?? false;
  const savedApiKeyConfigured = draftProviderState?.api_key_configured ?? false;
  const savedApiKeyPreview = draftProviderState?.api_key_preview ?? null;
  const apiKeyMissing =
    providerDraft === 'api' &&
    ((apiKeyTouched && apiKey.trim().length === 0) || (!apiKeyTouched && !savedApiKeyConfigured));
  const normalizedBaseUrl = normalizeBaseUrl(apiBaseUrl);
  const isProviderDirty = useMemo(() => {
    if (!providerConfig) return false;

    const activeState = providerConfig.providers[providerDraft];
    const baseUrlChanged = showRuntimeInputs && normalizedBaseUrl !== (activeState?.api_base_url || '');
    const modelChanged = showRuntimeInputs && model.trim() !== (activeState?.model || '');
    const providerChanged = providerDraft !== providerConfig.provider;
    const contextChanged = localContextWindow !== (providerConfig.local_context_window || 8192);

    return providerChanged || baseUrlChanged || modelChanged || contextChanged || apiKeyTouched;
  }, [apiKeyTouched, localContextWindow, model, normalizedBaseUrl, providerConfig, providerDraft, showRuntimeInputs]);

  useEffect(() => {
    setSettingsState((prev) => {
      if (loadingProvider || !providerConfig) {
        return prev;
      }
      if (savingProvider) {
        return 'saving';
      }
      if (testStatus === 'testing') {
        return 'testing';
      }
      if (testStatus === 'success') {
        return 'tested-ok';
      }
      if (testStatus === 'error') {
        return 'tested-fail';
      }
      if (isProviderDirty) {
        return prev === 'idle' ? 'editing' : 'dirty';
      }
      if (prev === 'saving' || prev === 'tested-ok') {
        return 'saved';
      }
      if (prev === 'error') {
        return 'error';
      }
      return 'idle';
    });
  }, [isProviderDirty, loadingProvider, providerConfig, savingProvider, testStatus]);

  const uploadHighlights = useMemo(
    () => [
      {
        icon: FileUp,
        title: 'Upload once',
        description: 'Bring in the deck and keep review, evidence, and comments in one place.',
      },
      {
        icon: Sparkles,
        title: 'Review in order',
        description: 'Start with the most important recommendations instead of scanning every slide manually.',
      },
      {
        icon: ShieldCheck,
        title: 'Package confidently',
        description: 'Move from working draft to client-ready output with clearer checkpoints.',
      },
    ],
    []
  );

  const runtimeOcrStatus = processingStatus?.ocr ?? null;
  const cachedAssetCount = runtimeOcrStatus?.files?.length ?? 0;
  const cachedModelSize = useMemo(
    () => (runtimeOcrStatus?.files || []).reduce((sum, file) => sum + (file.size_bytes || 0), 0),
    [runtimeOcrStatus?.files]
  );

  const [ocrBackendsInfo, setOcrBackendsInfo] = useState<OcrBackendsResponse | null>(null);

  // Always poll OCR backend state so the sidebar card is accurate even when idle.
  // Speed up polling to 3 s while a download job is running; slow to 12 s otherwise.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const info = await apiService.getOcrBackends();
        if (!cancelled) setOcrBackendsInfo(info);
      } catch {
        // ignore polling errors
      }
    };

    void load();
    const intervalMs = ocrJobStatus?.status === 'running' ? 3000 : 12000;
    const interval = window.setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [ocrJobStatus?.status]);

  const cacheSizeBytes = useMemo(() => {
    if (ocrBackendsInfo && Array.isArray(ocrBackendsInfo.backends)) {
      return ocrBackendsInfo.backends.reduce((s, b) => s + (b?.bytes_present || 0), 0);
    }
    return cachedModelSize;
  }, [ocrBackendsInfo, cachedModelSize]);

  const activeBackendLabel = useMemo(() => {
    if (!ocrBackendsInfo) return null;
    const activeId = ocrBackendsInfo.active_backend;
    const info = ocrBackendsInfo.backends?.find((b) => b.id === activeId);
    return info?.label || activeId;
  }, [ocrBackendsInfo]);

  const saveProviderConfig = useCallback(
    async (options?: { silentSuccess?: boolean }) => {
      if (!providerConfig) return null;

      const payload: UpdateLlmProviderPayload = { provider: providerDraft };
      const activeState = providerConfig.providers[providerDraft];

      if (showRuntimeInputs) {
        if (normalizedBaseUrl !== (activeState?.api_base_url || '')) {
          payload.api_base_url = normalizedBaseUrl;
        }
        if (model.trim() !== (activeState?.model || '')) {
          payload.model = model.trim();
        }
        if (apiKeyTouched) {
          payload.api_key = apiKey.trim();
        }
      }

      if (localContextWindow !== (providerConfig.local_context_window || 8192)) {
        payload.local_context_window = localContextWindow;
      }

      setSettingsState('saving');
      setSavingProvider(true);
      setProviderFeedback(null);
      setStructuredError(null);

      try {
        const updated = await apiService.setLlmProvider(payload);
        applyProviderConfigToDraft(updated);
        setSettingsState('saved');
        if (!options?.silentSuccess) {
          setProviderFeedback({
            tone: 'success',
            text: `Applied ${providerOptions.find((option) => option.value === updated.provider)?.label || 'provider'} settings.`,
          });
        }
        return updated;
      } catch (err: any) {
        const structured = buildStructuredUiError(err, 'Could not save provider settings');
        const message = structured.body || 'Failed to save provider settings.';
        setStructuredError(structured);
        setSettingsState('error');
        setProviderFeedback({ tone: 'error', text: message });
        throw err;
      } finally {
        setSavingProvider(false);
      }
    },
    [apiKey, apiKeyTouched, applyProviderConfigToDraft, localContextWindow, model, normalizedBaseUrl, providerConfig, providerDraft, showRuntimeInputs]
  );

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setSettingsState('testing');
    setStructuredError(null);
    setTestMessage(isProviderDirty ? 'Applying settings and testing the selected provider...' : 'Testing the selected provider...');

    try {
      if (isProviderDirty) {
        await saveProviderConfig({ silentSuccess: true });
      }

      const result = await apiService.testLlmConnection();
      setTestStatus('success');
      setSettingsState('tested-ok');
      const latencyLabel = typeof result.latency_ms === 'number' ? ` (${result.latency_ms}ms)` : '';
      setTestMessage(`Connected to ${providerOptions.find((option) => option.value === result.provider)?.label || result.provider} using ${result.model}${latencyLabel}.`);

      try {
        const diagnostics = await apiService.getDiagnostics();
        setLastDiagnostics(diagnostics);
      } catch {
        // Non-blocking diagnostics refresh
      }

      window.setTimeout(() => setTestStatus('idle'), 4000);
    } catch (err: unknown) {
      setTestStatus('error');
      setSettingsState('tested-fail');
      const structured = buildStructuredUiError(err, 'Could not reach LLM provider');
      setStructuredError(structured);
      setTestMessage(structured.body || 'Connection test failed.');
    }
  };

  const handleSaveAndTest = async () => {
    setProviderFeedback(null);
    setStructuredError(null);

    if (!providerConfig) {
      const details: StructuredUiError = {
        title: 'Provider settings are still loading',
        body: 'Wait for settings to load before saving and testing.',
      };
      setStructuredError(details);
      setSettingsState('error');
      return;
    }

    if (isProviderDirty) {
      try {
        await saveProviderConfig({ silentSuccess: true });
      } catch {
        return;
      }
    }

    await handleTestConnection();
  };

  const refreshDiagnostics = async () => {
    setLoadingDiagnostics(true);
    try {
      const diagnostics = await apiService.getDiagnostics();
      setLastDiagnostics(diagnostics);
    } catch (err) {
      const structured = buildStructuredUiError(err, 'Failed to load diagnostics');
      setStructuredError(structured);
    } finally {
      setLoadingDiagnostics(false);
    }
  };

  const copyStructuredError = async () => {
    if (!structuredError) return;
    const payload = [
      `title: ${structuredError.title}`,
      `body: ${structuredError.body}`,
      structuredError.hint ? `hint: ${structuredError.hint}` : null,
      structuredError.context?.requestId ? `requestId: ${structuredError.context.requestId}` : null,
      structuredError.context?.endpoint ? `endpoint: ${structuredError.context.endpoint}` : null,
      structuredError.context?.status ? `status: ${structuredError.context.status}` : null,
      structuredError.context?.timestamp ? `timestamp: ${structuredError.context.timestamp}` : null,
      structuredError.raw ? `raw: ${structuredError.raw}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    await copyText(payload);
  };

  return (
    <div className="min-h-screen px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-white/70 bg-white/80 px-6 py-5 shadow-[0_24px_70px_rgba(15,23,42,0.06)] backdrop-blur xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-sm font-bold tracking-[0.2em] text-white shadow-lg shadow-slate-200">
              SF
            </div>
            <div>
              <div className="sf-eyebrow">Consulting review workspace</div>
              <h1 className="mt-2 text-2xl font-bold text-slate-950">SlideForge</h1>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold text-slate-900">Client-ready upload flow</div>
              <div className="mt-1 text-sm text-slate-500">Start with one deck and keep the next steps guided.</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold text-slate-900">Provider setup from the app</div>
              <div className="mt-1 text-sm text-slate-500">Choose Cloud AI, Ollama, or LM Studio without editing env files.</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold text-slate-900">Recent workspaces</div>
              <div className="mt-1 text-sm text-slate-500">Reopen past reviews without rebuilding the session.</div>
            </div>
          </div>
        </header>

        <section className="grid gap-8 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
          <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white px-8 py-8 shadow-[0_32px_80px_rgba(15,23,42,0.08)] lg:px-10 lg:py-10">
            <div className="absolute inset-0 sf-grid opacity-40" />
            <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(15,23,42,0.08),transparent_68%)]" />
            <div className="relative space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">
                <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                Guided onboarding
              </div>

              <div className="max-w-3xl space-y-4">
                <h2 className="text-4xl font-bold tracking-tight text-slate-950 lg:text-5xl">
                  Upload a deck and move straight into a cleaner review workflow.
                </h2>
                <p className="text-lg leading-8 text-slate-600">
                  SlideForge turns one deck into a focused review workspace, so consultants can see what needs attention,
                  jump to the right slide, and deliver a more polished story faster.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {uploadHighlights.map(({ icon: Icon, title, description }) => (
                  <div key={title} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-900 shadow-sm">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="mt-4 text-sm font-semibold text-slate-900">{title}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
                  </div>
                ))}
              </div>

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className={`relative overflow-hidden rounded-[1.75rem] border p-8 transition-all duration-300 ${
                  isProcessing
                    ? 'border-indigo-200 bg-indigo-50/70'
                    : 'border-slate-300 bg-slate-950 text-white shadow-[0_24px_60px_rgba(15,23,42,0.16)] hover:border-slate-100'
                }`}
              >
                <input
                  type="file"
                  id="file-upload"
                  multiple
                  accept="application/pdf,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                  className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                  onChange={handleFileChange}
                  disabled={isProcessing}
                />

                {isProcessing ? (
                  <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
                    <Loader2 className="h-14 w-14 animate-spin text-indigo-600" />
                    <div>
                      <p className="text-lg font-semibold text-indigo-950">Preparing your review workspace</p>
                      <p className="mt-1 text-sm text-indigo-700">
                        {runtimeOcrStatus?.download_active
                          ? runtimeOcrStatus.message
                          : progressLabel || 'Uploading the file, reading the slides, and setting up recommendations.'}
                      </p>
                      {runtimeOcrStatus && (
                        <div className="mx-auto mt-5 max-w-2xl rounded-[1.5rem] border border-indigo-100 bg-white/90 p-5 text-left shadow-[0_18px_50px_rgba(79,70,229,0.12)]">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-indigo-500">
                                {runtimeOcrStatus.download_active ? 'Downloading OCR assets' : 'OCR engine status'}
                              </div>
                              <div className="mt-2 text-base font-semibold text-slate-950">
                                {runtimeOcrStatus.message}
                              </div>
                            </div>
                            <div className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold capitalize text-indigo-700">
                              {runtimeOcrStatus.phase.replace(/_/g, ' ')}
                            </div>
                          </div>
                          <div className="mt-4 grid gap-3 sm:grid-cols-4">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Setup</div>
                              <div className="mt-2 text-sm font-semibold text-slate-900">
                                {runtimeOcrStatus.download_required ? 'First-run download' : 'Already cached'}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Cached files</div>
                              <div className="mt-2 text-sm font-semibold text-slate-900">{cachedAssetCount}</div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Cache size</div>
                              <div className="mt-2 text-sm font-semibold text-slate-900">{formatBytes(cacheSizeBytes)}</div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Active OCR</div>
                              <div className="mt-2 text-sm font-semibold text-slate-900">{activeBackendLabel || 'Unknown'}</div>
                            </div>
                          </div>
                          <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                            {runtimeOcrStatus.offline_ready
                              ? 'Offline-ready: OCR assets are cached locally and future runs use local files only.'
                              : 'Online for first-run: SlideForge downloads OCR assets once, then switches to local cached reuse.'}
                          </div>
                          {/* Compact per-backend status + manage link */}
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap gap-2">
                              {ocrBackendsInfo?.backends.map((b) => {
                                const isActive = !!b.active;
                                const isDownloading = ocrJobStatus?.backend_id === b.id && ocrJobStatus?.status === 'running';
                                const pctDone = isDownloading && (ocrJobStatus?.bytes_total ?? 0) > 0
                                  ? Math.round(((ocrJobStatus?.bytes_done ?? 0) / (ocrJobStatus?.bytes_total ?? 1)) * 100)
                                  : null;
                                return (
                                  <span
                                    key={b.id}
                                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                                      isActive
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                        : isDownloading
                                        ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                        : b.ready
                                        ? 'bg-slate-100 text-slate-600 border border-slate-200'
                                        : 'bg-white text-slate-400 border border-slate-200'
                                    }`}
                                  >
                                    {isActive ? '✓ ' : isDownloading ? '⬇ ' : b.ready ? '● ' : '○ '}
                                    {b.label}
                                    {isDownloading && pctDone !== null ? ` ${pctDone}%` : ''}
                                  </span>
                                );
                              })}
                            </div>
                            <button
                              type="button"
                              onClick={() => onOpenOcrSetup?.()}
                              className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                            >
                              Manage OCR
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="relative z-10 flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="max-w-xl space-y-4">
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200">
                        PowerPoint or PDF
                      </div>
                      <div>
                        <h3 className="text-2xl font-semibold text-white">Drop a client deck here or click to browse</h3>
                        <p className="mt-2 text-sm leading-7 text-slate-300">
                          Start with a `.pptx` or `.pdf` file. SlideForge keeps the upload simple and saves the more technical
                          controls for the provider card on the right.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                          Supported: `.pptx`, `.pdf`
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2">
                          <ShieldCheck className="h-4 w-4 text-sky-300" />
                          Keeps review, evidence, and output in one workspace
                        </span>
                      </div>
                    </div>

                    <div className="min-w-[240px] rounded-[1.5rem] border border-white/10 bg-white/10 p-5 backdrop-blur-sm">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-900 shadow-lg shadow-slate-950/10">
                        <FileUp className="h-7 w-7" />
                      </div>
                      <div className="mt-5 text-sm font-semibold text-white">Start a new review</div>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        Upload the latest draft and SlideForge will prepare the dashboard automatically.
                      </p>
                      <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white">
                        Choose file
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_rgba(15,23,42,0.06)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="sf-eyebrow">Model provider</div>
                  <h3 className="mt-2 text-xl font-semibold text-slate-950">Choose where SlideForge runs analysis</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Save the runtime provider here before uploading. Cloud AI needs both an API base URL and an API key.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {onOpenDiagnostics && (
                    <button
                      type="button"
                      onClick={onOpenDiagnostics}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Server className="h-3.5 w-3.5" />
                      Open diagnostics
                    </button>
                  )}
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700">
                    <Settings2 className="h-5 w-5" />
                  </div>
                </div>
              </div>

                <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(135deg,#f8fafc_0%,#eef2ff_100%)] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Selected provider</div>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="text-lg font-semibold text-slate-950">{providerMeta.label}</div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          configuredState
                            ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border border-amber-200 bg-amber-50 text-amber-700'
                        }`}
                      >
                        {configuredState ? 'Configured' : 'Not configured'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{providerMeta.description}</p>
                  </div>

                  <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-right shadow-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current model</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{draftProviderState?.model || model || 'Not set'}</div>
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <div className="font-semibold">Offline and online usage</div>
                      <div className="mt-1">
                        Local providers keep requests on this machine when they point to local servers. Cloud AI sends prompts and uploaded deck content to the remote endpoint you configure. Some local OCR or ML features may still download model weights on first use unless those assets are already cached offline.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Settings state</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {settingsState === 'idle' && 'Idle'}
                        {settingsState === 'editing' && 'Editing'}
                        {settingsState === 'dirty' && 'Changes pending'}
                        {settingsState === 'testing' && 'Testing connection'}
                        {settingsState === 'tested-ok' && 'Connection verified'}
                        {settingsState === 'tested-fail' && 'Connection failed'}
                        {settingsState === 'saving' && 'Saving settings'}
                        {settingsState === 'saved' && 'Saved'}
                        {settingsState === 'error' && 'Error'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={refreshDiagnostics}
                      disabled={loadingDiagnostics}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      {loadingDiagnostics ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Server className="h-3.5 w-3.5" />}
                      Refresh diagnostics
                    </button>
                  </div>
                  {lastDiagnostics && (
                    <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                      <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        Backend: <span className="font-semibold text-slate-800">{lastDiagnostics.backend.status}</span>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        OCR: <span className="font-semibold text-slate-800">{lastDiagnostics.ocr.state}</span>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        Warmup: <span className="font-semibold text-slate-800">{lastDiagnostics.startup.model_warmup_state}</span>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        Last analysis: <span className="font-semibold text-slate-800">{lastDiagnostics.analysis.last_status}</span>
                      </div>
                    </div>
                  )}
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Provider</span>
                  <select
                    value={providerDraft}
                    onChange={handleProviderSelect}
                    disabled={loadingProvider || savingProvider || testStatus === 'testing'}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 disabled:opacity-60"
                  >
                    {providerOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
                  <div className="flex items-start gap-3">
                    <Server className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                    <div>{providerMeta.helper}</div>
                  </div>
                </div>

                {showRuntimeInputs ? (
                  <>
                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-slate-700">API base URL</span>
                      <input
                        type="url"
                        value={apiBaseUrl}
                        onChange={(e) => {
                          setApiBaseUrl(e.target.value);
                          setProviderFeedback(null);
                          setStructuredError(null);
                          setSettingsState('editing');
                        }}
                        placeholder={providerMeta.baseUrlPlaceholder}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-slate-700">Model</span>
                      <input
                        type="text"
                        value={model}
                        onChange={(e) => {
                          setModel(e.target.value);
                          setProviderFeedback(null);
                          setStructuredError(null);
                          setSettingsState('editing');
                        }}
                        placeholder={providerMeta.modelPlaceholder}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-slate-700">API key</span>
                      <div className="relative">
                        <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="password"
                          value={apiKey}
                        onChange={(e) => {
                          setApiKey(e.target.value);
                          setApiKeyTouched(true);
                          setProviderFeedback(null);
                          setStructuredError(null);
                          setSettingsState('editing');
                        }}
                          placeholder={providerDraft === 'api' ? 'Paste the cloud API key' : 'Optional unless your local server requires auth'}
                          className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-800 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                        />
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        {savedApiKeyConfigured && !apiKeyTouched
                          ? `Saved key preview: ${savedApiKeyPreview || 'configured'}`
                          : providerDraft === 'api'
                            ? 'Cloud AI requests are rejected when no API key is configured.'
                            : 'Leave blank if your local OpenAI-compatible server does not require authentication.'}
                      </div>
                    </label>
                  </>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
                    This provider can still be selected, but its runtime setup stays on the backend rather than in the browser.
                  </div>
                )}

                {showContextSetting && (
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-700">Local context window</span>
                    <input
                      type="number"
                      min={1024}
                      max={131072}
                      step={128}
                      value={localContextWindow}
                      onChange={handleContextWindowChange}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
                    />
                    <div className="mt-2 text-xs text-slate-500">Used for Ollama and LM Studio requests that support larger local context windows.</div>
                  </label>
                )}

                {apiKeyMissing && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        Cloud AI is selected, but no API key is configured. Save a valid key before testing the connection or starting analysis.
                      </div>
                    </div>
                  </div>
                )}

                {providerFeedback && (
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm font-medium ${
                      providerFeedback.tone === 'success'
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border border-rose-200 bg-rose-50 text-rose-700'
                    }`}
                  >
                    {providerFeedback.text}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleSaveAndTest}
                    disabled={loadingProvider || savingProvider || testStatus === 'testing' || !providerConfig}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-50"
                  >
                    {settingsState === 'saving' || settingsState === 'testing' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : settingsState === 'tested-ok' ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : settingsState === 'tested-fail' ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {settingsState === 'testing'
                      ? 'Testing...'
                      : settingsState === 'tested-ok'
                        ? 'Connected'
                        : settingsState === 'tested-fail'
                          ? 'Retry Save & test'
                          : 'Save & test'}
                  </button>
                </div>

                {testMessage && (
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm font-medium ${
                      testStatus === 'success'
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                        : testStatus === 'error'
                          ? 'border border-rose-200 bg-rose-50 text-rose-700'
                          : 'border border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                  >
                    {testMessage}
                  </div>
                )}

                {structuredError && (
                  <ErrorCard
                    title={structuredError.title}
                    body={structuredError.hint ? `${structuredError.body} ${structuredError.hint}` : structuredError.body}
                    context={structuredError.context}
                    actions={[
                      {
                        label: 'Test connection',
                        onClick: handleSaveAndTest,
                      },
                      {
                        label: 'LM Studio docs',
                        href: 'https://lmstudio.ai/docs/local-server',
                      },
                    ]}
                    onCopyError={copyStructuredError}
                  />
                )}
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_rgba(15,23,42,0.06)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="sf-eyebrow">OCR Engine</div>
                  <h3 className="mt-1 text-base font-semibold text-slate-950">
                    {activeBackendLabel ? activeBackendLabel : 'Not configured'}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {ocrBackendsInfo && (
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      ocrBackendsInfo.backends.find(b => b.id === ocrBackendsInfo.active_backend)?.ready
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {ocrBackendsInfo.backends.find(b => b.id === ocrBackendsInfo.active_backend)?.ready ? 'Ready' : 'Not ready'}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenOcrSetup?.()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    Manage
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {ocrBackendsInfo?.backends.map((b) => {
                  const isActive = !!b.active;
                  const isDownloading = ocrJobStatus?.backend_id === b.id && ocrJobStatus?.status === 'running';
                  const dlPct = isDownloading && (ocrJobStatus?.bytes_total ?? 0) > 0
                    ? Math.round(((ocrJobStatus?.bytes_done ?? 0) / (ocrJobStatus?.bytes_total ?? 1)) * 100)
                    : null;
                  return (
                    <span key={b.id} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      isActive ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : isDownloading ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                        : b.ready ? 'bg-slate-100 text-slate-500 border border-slate-200'
                        : 'bg-white text-slate-400 border border-slate-200'
                    }`}>
                      {isActive ? '✓' : isDownloading ? '⬇' : b.ready ? '●' : '○'}{' '}
                      {b.label}
                      {isDownloading && dlPct !== null ? ` ${dlPct}%` : ''}
                    </span>
                  );
                })}
                {!ocrBackendsInfo && (
                  <span className="text-xs text-slate-400">Loading…</span>
                )}
              </div>
              {ocrBackendsInfo && (
                <div className="mt-2 text-xs text-slate-400">
                  Cache: {formatBytes(cacheSizeBytes)} · {ocrBackendsInfo.backends.filter(b => b.ready).length}/{ocrBackendsInfo.backends.length} engines ready
                </div>
              )}
            </section>

            <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_rgba(15,23,42,0.06)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="sf-eyebrow">Recent workspaces</div>
                  <h3 className="mt-2 text-xl font-semibold text-slate-950">Pick up where you left off</h3>
                </div>
                <FolderOpen className="h-5 w-5 text-slate-400" />
              </div>

              {recentHistory.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
                    <Clock3 className="h-5 w-5 text-slate-500" />
                  </div>
                  <div className="mt-4 text-sm font-semibold text-slate-900">No saved reviews yet</div>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Your recent workspaces appear here after the first upload.
                  </p>
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {recentHistory.slice(0, 5).map((item) => (
                    <button
                      key={item.fingerprint}
                      onClick={() => onOpenHistory(item.fingerprint)}
                      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-slate-300 hover:bg-white"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{item.original_filename}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{item.slide_count} slides</span>
                          <span className="text-slate-300">/</span>
                          <span>Score {item.composite_score}</span>
                          <span className="text-slate-300">/</span>
                          <span>{item.warning_count + item.hard_block_count} open items</span>
                        </div>
                        <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          <Clock3 className="h-3.5 w-3.5" />
                          {formatRelativeTime(item.updated_at)}
                        </div>
                      </div>

                      <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
                        Open
                        <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </div>
  );
};

export default FileUpload;
