/// <reference types="vite/client" />
import { ParsedSlideData, SlideAnalysis } from '../types';

const API_BASE = '/api';
const apiTrace = (event: string, detail: Record<string, unknown>): void => {
  // Only emit detailed API traces in development to avoid noisy logs in prod
  try {
    const meta = (import.meta as any)?.env;
    const isDev = !!meta && meta.MODE === 'development';
    if (isDev) {
      // Use debug so consumers can filter these messages if desired
      console.debug(`[slideforge-api] ${event}`, detail);
    }
  } catch {
    // If import.meta isn't available (non-Vite env), skip tracing
  }
};

const resolveApiBase = (): string => {
  const electronApiBase = window.slideforge?.apiBase;
  if (electronApiBase && typeof electronApiBase === 'string' && electronApiBase.trim()) {
    return `${electronApiBase.replace(/\/+$/, '')}/api`;
  }
  return API_BASE;
};

class ApiError extends Error {
  status: number;
  code?: string;
  title?: string;
  hint?: string;
  context?: ErrorContextPayload;

  constructor(
    message: string,
    status: number,
    details?: {
      code?: string;
      title?: string;
      hint?: string;
      context?: ErrorContextPayload;
    }
  ) {
    super(message);
    this.status = status;
    this.code = details?.code;
    this.title = details?.title;
    this.hint = details?.hint;
    this.context = details?.context;
  }
}

interface ErrorContextPayload {
  requestId?: string | null;
  timestamp?: string | null;
  endpoint?: string | null;
  status?: number;
  provider?: string;
  base_url?: string;
  model?: string;
  details?: Record<string, unknown>;
}

interface StructuredErrorPayload {
  code?: string;
  title?: string;
  message?: string;
  hint?: string;
  context?: ErrorContextPayload;
}

interface SessionResponse {
  session_id: string;
}

interface AnalysisResponse {
  session_id: string;
  slide_count: number;
  status: string;
  restored_from_history?: boolean;
}

interface ScorecardResponse {
  session_id: string;
  job_status?: string;
  progress_label?: string | null;
  scorecard: {
    composite_score: number;
    structure_score: number;
    claim_grounding_score: number;
    data_accuracy_score: number;
    visual_compliance_score: number;
    language_score: number;
    framework_score: number;
    so_what_score: number;
    benchmarking_score: number;
    hard_block_count: number;
    warning_count: number;
    failing_slides: number[];
    annotations: Annotation[];
    summary: string;
  };
}

interface Annotation {
  annotation_id?: string;
  slide_index: number;
  text: string;
  category: string;
  severity: string;
  message: string;
  suggestion: string | null;
}

interface SlidesResponse {
  slides: SlideData[];
}

type SlideData = ParsedSlideData;

interface GuardrailResponse {
  schema_version: string;
  engagement_type: string;
  client_namespace?: string;
  discovered_patterns?: Record<string, unknown>;
  playbook_rules: Array<Record<string, any> | string>;
  human_confirmed_rules: Array<Record<string, any> | string>;
  rubric_weights: Record<string, number>;
  language_rules: Record<string, any>;
  pass_threshold: number;
  signed_by?: string;
  signed_at?: string;
  sha256?: string;
  signature?: string;
  public_key?: string;
  signature_algorithm?: string;
}

interface DiscoveryQuestion {
  question: string;
  evidence?: string;
  context?: string;
}

interface DiscoveryResponse {
  status: string;
  question?: DiscoveryQuestion;
  schema?: GuardrailResponse | Record<string, unknown>;
}

interface PlaybookUploadDiscoveryResponse {
  status: string;
  filename: string;
  extracted_characters: number;
  schema: GuardrailResponse | Record<string, unknown>;
}

interface AuditLogEntry {
  timestamp: string;
  user_role: string;
  action: string;
  details: Record<string, unknown>;
}

interface GuardrailListResponse {
  guardrails: Array<{ filename: string; id: string }>;
}

interface GuardrailDiffResponse {
  old_version: string;
  new_version: string;
  diff: {
    added: Array<Record<string, any> | string>;
    modified: Array<{ old: Record<string, any> | string; new: Record<string, any> | string }>;
    removed: Array<Record<string, any> | string>;
  };
}

interface ApplyGuardrailResponse {
  status: string;
  guardrail: GuardrailResponse;
  analysis_invalidated?: boolean;
}

interface GuardrailTemplateSummary {
  id: string;
  filename: string;
  template_name: string;
  engagement_type: string;
  client_namespace?: string | null;
  rule_count: number;
  compatible: boolean;
  updated_at: string;
  scope: string;
}

interface GuardrailTemplateListResponse {
  templates: GuardrailTemplateSummary[];
}

interface DeliveryStatusResponse {
  senior_signed: boolean;
  senior_name?: string;
}

interface SessionMetricsResponse {
  timestamp: string;
  limits: {
    session_ttl_hours: number;
    session_cleanup_interval_minutes: number;
    max_active_sessions: number;
    max_active_sessions_per_namespace: number;
  };
  sessions: {
    active_count: number;
    expiring_within_1h_count: number;
    by_namespace: Record<string, number>;
    max_idle_seconds: number;
    max_age_seconds: number;
  };
  cleanup: {
    last_run_ts: number | null;
    last_expired_count: number;
    last_expired_ids: string[];
    total_expired_count: number;
  };
  session_rows?: Array<{
    session_id: string;
    status: string;
    client_namespace: string | null;
    namespace_key: string;
    idle_seconds: number;
    age_seconds: number;
    ttl_remaining_seconds: number;
    has_deck: boolean;
    slide_count: number;
  }>;
}

interface UploadExcelResponse {
  status: string;
  filename: string;
  sheets: string[];
  total_rows: number;
}

interface SessionEvidenceResponse {
  session_id: string;
  evidence_sources: Array<{
    filename: string;
    documents_indexed: number;
  }>;
  excel_snapshot: {
    filename: string;
    sheets: string[];
    total_rows: number;
  } | null;
  source_namespace: string | null;
}

interface RevisionLoopResponse {
  session_id: string;
  revision_count: number;
  score_history: number[];
  final_score: number;
  auto_fixes_applied: number;
}

interface AnalysisSettingsResponse {
  analysis_max_tokens: number;
}

interface GrammarStatusResponse {
  enabled: boolean;
  engine: string;
  language_tool_available: boolean;
  base_url: string;
  check_url?: string;
  last_error?: string | null;
  notes: string;
}

interface RuntimeAssetFileStatus {
  name: string;
  relative_path: string;
  size_bytes: number;
  modified_at: number;
}

interface OcrRuntimeStatus {
  phase: string;
  message: string;
  download_active: boolean;
  download_required: boolean;
  offline_ready: boolean;
  bundled_seeded: boolean;
  cache_dir: string | null;
  tmp_dir: string | null;
  files: RuntimeAssetFileStatus[];
  updated_at: number | null;
  layout_loaded: boolean;
  recognition_loaded: boolean;
  detector_loaded: boolean;
  foundation_loaded: boolean;
  cooldown_active: boolean;
  last_error: string | null;
}

interface RuntimeAssetStatusResponse {
  ocr: OcrRuntimeStatus;
  download_active: boolean;
  download_required: boolean;
}

interface OcrVariantState {
  variant: 'full' | 'lite';
  ready: boolean;
  bundleAvailable: boolean;
  runtimeCacheReady: boolean;
  cacheDir: string;
}

interface OcrDownloadJobResponse {
  job_id: string;
  status: string;
}

interface OcrJobStatus {
  job_id: string;
  // include cancelling/already_running variants that may be returned by some backends
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled' | 'cancelling' | 'already_running';
  phase: string;
  message: string;
  progress: number;
  total: number;
  error?: string | null;
}

interface AnalysisJobStatusResponse {
  session_id: string;
  job_status: 'idle' | 'queued' | 'running' | 'completed' | 'failed';
  progress_label?: string | null;
  updated_at?: number;
  error?: string;
  scorecard?: ScorecardResponse['scorecard'];
}

interface RuntimeProviderStatus {
  api_base_url: string;
  base_url: string;
  model: string;
  configured: boolean;
  requires_api_key: boolean;
  api_key_configured: boolean;
  api_key_preview: string | null;
}

interface DiagnosticsResponse {
  status: 'ok' | 'degraded' | string;
  timestamp: string;
  request_id?: string | null;
  backend: {
    status: string;
    pid: number;
    port?: string | null;
    uptime_seconds: number;
    app_ready: boolean;
    app_ready_at?: number | null;
    active_sessions: number;
    analysis_jobs: number;
  };
  startup: {
    model_warmup_state: 'idle' | 'loading' | 'ready' | 'error' | string;
    model_warmup_message?: string | null;
    model_warmup_error?: string | null;
    model_warmup_started_at?: number | null;
    model_warmup_finished_at?: number | null;
    warmup_task_running: boolean;
    preflight: {
      overall: 'OK' | 'WARNING' | 'ERROR' | 'MISSING' | 'UNKNOWN' | string;
      timestamp?: string | null;
      checks: Array<{
        name: string;
        status: string;
        message: string;
      }>;
    };
  };
  llm: {
    provider: string;
    configured: boolean;
    llm_available: boolean;
    providers: Record<
      string,
      RuntimeProviderStatus & {
        connection?: {
          ok: boolean;
          host?: string;
          port?: number;
          latency_ms?: number;
          error?: string;
        };
        runtime_hint?: string;
        is_local?: boolean;
      }
    >;
  };
  ocr: {
    state: 'loaded' | 'loading' | 'pending' | 'error' | string;
    phase: string;
    message?: string | null;
    offline_ready: boolean;
    cache_dir?: string | null;
    cached_files: number;
    last_error?: string | null;
    cooldown_active: boolean;
    loaded: {
      layout: boolean;
      recognition: boolean;
      detector: boolean;
      foundation: boolean;
    };
  };
  chromadb: {
    state: 'not_initialized' | 'initialized' | 'error' | string;
    collections: number | null;
    error?: string;
  };
  system: {
    disk: {
      ok: boolean;
      total_bytes?: number;
      used_bytes?: number;
      free_bytes?: number;
      error?: string;
    };
    memory: {
      ok: boolean;
      used_bytes?: number;
      total_bytes?: number;
      process_rss_bytes?: number;
      percent?: number;
      error?: string;
    };
  };
  analysis: {
    last_run_at: number | null;
    last_status: 'idle' | 'running' | 'succeeded' | 'failed' | string;
    last_session_id: string | null;
    last_error: string | null;
  };
}

interface LlmProviderResponse {
  enabled: boolean;
  provider: string;
  analysis_max_tokens?: number;
  api_base_url: string;
  model: string;
  local_context_window?: number;
  api_key_configured: boolean;
  api_key_preview: string | null;
  configured: boolean;
  requires_api_key: boolean;
  providers: Record<string, RuntimeProviderStatus>;
}

interface UpdateLlmProviderPayload {
  provider: string;
  api_base_url?: string;
  api_key?: string;
  model?: string;
  local_context_window?: number;
}

interface TestLlmConnectionResponse {
  ok?: boolean;
  status: string;
  response: string;
  provider: string;
  model: string;
  latency_ms?: number;
  error_message?: string | null;
}

interface HistoryItem {
  fingerprint: string;
  original_filename: string;
  archived_deck_path: string;
  slide_count: number;
  composite_score: number;
  warning_count: number;
  hard_block_count: number;
  updated_at: string;
}

class ApiService {
  private sessionId: string | null = null;

  private apiBase = resolveApiBase();
  private apiBaseResolved = this.apiBase !== API_BASE;
  private readonly defaultTimeoutMs = 60_000;

  private readonly authHeadersCache = {
    role: '',
    headers: {} as Record<string, string>,
  };

  private async buildUrl(path: string): Promise<string> {
    const base = await this.ensureApiBase();
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private async fetchWithResolvedBase(
    path: string,
    init?: RequestInit,
    options?: { retries?: number; timeoutMs?: number }
  ): Promise<Response> {
    const url = await this.buildUrl(path);
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const retries = options?.retries ?? 0;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const timeoutController = this.abortWithTimeout(timeoutMs);
      try {
        const response = await fetch(url, {
          ...init,
          signal: timeoutController.signal,
        });
        if (!response.ok) {
          const apiError = await this.parseError(response, 'Request failed');
          if (attempt < retries && this.shouldRetry(response.status)) {
            await new Promise((resolve) => window.setTimeout(resolve, 300 * (attempt + 1)));
            continue;
          }
          throw apiError;
        }
        return response;
      } catch (err) {
        lastError = err;
        const canRetry = attempt < retries && (!(err instanceof ApiError) || this.shouldRetry(err.status));
        if (canRetry) {
          await new Promise((resolve) => window.setTimeout(resolve, 300 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }

    throw (lastError instanceof Error ? lastError : new Error('Request failed'));
  }

  private abortWithTimeout(timeoutMs: number): AbortController {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    controller.signal.addEventListener('abort', () => window.clearTimeout(timer), {
      once: true,
    });
    return controller;
  }

  private shouldRetry(status: number): boolean {
    return status === 429 || status >= 500;
  }

  private  async fetchJson<T>(
    input: string,
    init?: RequestInit,
    options?: { retries?: number; timeoutMs?: number }
  ): Promise<T> {
    const retries = options?.retries ?? 1;
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const timeoutController = this.abortWithTimeout(timeoutMs);
      try {
        const mergedHeaders = {
          ...this.getAuthHeaders(),
          ...((init?.headers as Record<string, string>) || {}),
        };
        const response = await fetch(input, {
          ...init,
          headers: mergedHeaders,
          signal: timeoutController.signal,
        });
        if (!response.ok) {
          const apiError = await this.parseError(response, 'Request failed');
          if (attempt < retries && this.shouldRetry(response.status)) {
            await new Promise((resolve) => window.setTimeout(resolve, 300 * (attempt + 1)));
            continue;
          }
          throw apiError;
        }
        return (await response.json()) as T;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
        }
        lastError = err;
        const canRetry =
          attempt < retries &&
          (!(err instanceof ApiError) || this.shouldRetry(err.status));
        if (canRetry) {
          await new Promise((resolve) => window.setTimeout(resolve, 300 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }

    throw (lastError instanceof Error ? lastError : new Error('Request failed'));
  }

  setApiBase(apiBase: string): void {
    if (apiBase && apiBase.trim()) {
      this.apiBase = `${apiBase.replace(/\/+$/, '')}/api`;
      this.apiBaseResolved = true;
      apiTrace('setApiBase', { apiBase: this.apiBase });
    }
  }

  getApiBase(): string {
    return this.apiBase;
  }

  private async ensureApiBase(): Promise<string> {
    if (!this.apiBaseResolved && window.slideforge?.getApiBase) {
      const base = window.slideforge.apiBase?.trim() || (await window.slideforge.getApiBase());
      if (base && base.trim()) {
        this.setApiBase(base);
      }
    }
    apiTrace('ensureApiBase', {
      resolved: this.apiBaseResolved,
      apiBase: this.apiBase,
      electronApiBase: window.slideforge?.apiBase || null,
    });
    return this.apiBase;
  }

  private async getErrorMessage(response: Response, fallback: string): Promise<string> {
    try {
      const json = await response.json();
      const detail = json?.detail;
      if (detail && typeof detail === 'object') {
        const structured = detail as StructuredErrorPayload;
        return structured.message || structured.title || fallback;
      }
      if (typeof detail === 'string') {
        return detail;
      }
      return fallback;
    } catch {
      return fallback;
    }
  }

  private async parseError(response: Response, fallback: string): Promise<ApiError> {
    try {
      const json = await response.json();
      const detail = json?.detail;
      if (detail && typeof detail === 'object') {
        const structured = detail as StructuredErrorPayload;
        return new ApiError(structured.message || structured.title || fallback, response.status, {
          code: structured.code,
          title: structured.title,
          hint: structured.hint,
          context: structured.context,
        });
      }
      if (typeof detail === 'string') {
        return new ApiError(detail, response.status);
      }
      return new ApiError(fallback, response.status);
    } catch {
      return new ApiError(fallback, response.status);
    }
  }

  async createSession(clientNamespace?: string): Promise<string> {
    const base = await this.ensureApiBase();
    const url = clientNamespace 
      ? `${base}/session/create?client_namespace=${encodeURIComponent(clientNamespace)}`
      : `${base}/session/create`;

    apiTrace('createSession:start', { url, clientNamespace: clientNamespace || null });

    const data = await this.fetchJson<SessionResponse>(url, { method: 'POST' }, { retries: 1 });
    this.sessionId = data.session_id;
    apiTrace('createSession:success', { url, sessionId: data.session_id });
    return data.session_id;
  }

  async uploadDeck(sessionId: string, file: File): Promise<{document_fingerprint: string; history_available: boolean}> {
    const base = await this.ensureApiBase();
    const formData = new FormData();
    formData.append('file', file);
    const url = `${base}/session/${sessionId}/upload`;
    apiTrace('uploadDeck:start', {
      url,
      sessionId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    });

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const message = await this.getErrorMessage(response, 'Failed to upload deck');
      apiTrace('uploadDeck:error', { url, sessionId, status: response.status, message });
      throw new Error(message);
    }
    const payload = await response.json();
    apiTrace('uploadDeck:success', { url, sessionId, payload });
    return payload;
  }

  async parseDeck(sessionId: string): Promise<AnalysisResponse> {
    const base = await this.ensureApiBase();
    const url = `${base}/session/${sessionId}/analyze`;
    apiTrace('parseDeck:start', { url, sessionId });
    const payload = await this.fetchJson<AnalysisResponse>(url, {
      method: 'POST',
    }, { retries: 1, timeoutMs: 600_000 });
    apiTrace('parseDeck:success', { url, sessionId, payload });
    return payload;
  }

  async runAnalysis(sessionId: string): Promise<ScorecardResponse> {
    const base = await this.ensureApiBase();
    const url = `${base}/session/${sessionId}/run-analysis`;
    apiTrace('runAnalysis:start', { url, sessionId });
    // Analysis can take a long time to start (model warmup, resource contention)
    // Allow a longer timeout here so the client doesn't abort while the server
    // queues the job and returns. The endpoint is designed to queue and return
    // quickly, but in practice large uploads or lock contention can delay the
    // response — increase to 20 minutes to handle large PDFs with OCR.
    const payload = await this.fetchJson<ScorecardResponse>(url, {
      method: 'POST',
    }, { retries: 0, timeoutMs: 1200_000 });
    apiTrace('runAnalysis:success', { url, sessionId, annotationCount: payload.scorecard?.annotations?.length ?? 0 });
    return payload;
  }

  async getAnalysisStatus(sessionId: string): Promise<AnalysisJobStatusResponse> {
    return this.fetchJson<AnalysisJobStatusResponse>(await this.buildUrl(`/session/${sessionId}/run-analysis/status`), {
      headers: this.getAuthHeaders(),
    }, { retries: 0, timeoutMs: 30_000 });
  }

  async runAnalysisWithPolling(
    sessionId: string,
    options?: { pollIntervalMs?: number; pollTimeoutMs?: number; onProgress?: (status: AnalysisJobStatusResponse) => void }
  ): Promise<ScorecardResponse> {
    // Try to start the analysis. If the client-side request times out while the
    // server is queuing or warming up, fall back to polling the status endpoint
    // instead of failing immediately.
    try {
      const initial = await this.runAnalysis(sessionId);
      if (initial && initial.scorecard) {
        return initial;
      }
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('Request timed out') || msg.toLowerCase().includes('timeout')) {
        apiTrace('runAnalysisWithPolling:runAnalysis_timeout', { sessionId, message: msg });
        // continue to polling fallback below
      } else {
        throw err;
      }
    }

    const pollIntervalMs = options?.pollIntervalMs ?? 2000;
    const startedAt = Date.now();
    const maxWaitMs = (options?.pollTimeoutMs && options.pollTimeoutMs > 0)
      ? options.pollTimeoutMs
      : 20 * 60_000; // default 20 minutes

    for (;;) {
      try {
        const status = await this.getAnalysisStatus(sessionId);
        options?.onProgress?.(status);
        if (status.job_status === 'completed' && status.scorecard) {
          return {
            session_id: sessionId,
            scorecard: status.scorecard,
            job_status: status.job_status,
            progress_label: status.progress_label,
          };
        }
        if (status.job_status === 'failed') {
          throw new Error(status.error || 'Analysis failed');
        }
      } catch (err: any) {
        const isRealFailure = err?.message === 'Analysis failed' || (err instanceof Error && !err.message.includes('timed out') && !err.message.includes('Fetch') && !err.message.includes('Failed to fetch'));
        if (isRealFailure) {
          throw err;
        }
        console.warn('[slideforge-api] Analysis status poll failed (retrying):', err);
      }
      if (Date.now() - startedAt > maxWaitMs) {
        throw new Error(`Analysis polling timed out after ${Math.round(maxWaitMs / 1000)}s`);
      }
      await new Promise((resolve) => window.setTimeout(resolve, pollIntervalMs));
    }
  }

  async getScorecard(sessionId: string): Promise<ScorecardResponse['scorecard']> {
    const base = await this.ensureApiBase();
    return this.fetchJson<ScorecardResponse['scorecard']>(`${base}/session/${sessionId}/scorecard`, undefined, { retries: 1 });
  }

  async getSlides(sessionId: string): Promise<SlidesResponse> {
    const base = await this.ensureApiBase();
    return this.fetchJson<SlidesResponse>(`${base}/session/${sessionId}/slides`, undefined, { retries: 1 });
  }

  async getSlideAnalysis(sessionId: string, slideIndex: number): Promise<SlideAnalysis | null> {
    try {
      const response = await this.fetchWithResolvedBase(`/session/${sessionId}/slide/${slideIndex}/analysis`, {
        headers: this.getAuthHeaders()
      });

      const data = await response.json();
      return data;
    } catch (err) {
      // 404 means analysis not yet ready; return null gracefully.
      // All other errors (network, 5xx) should propagate so callers can show error UI.
      if (err instanceof ApiError && err.status === 404) {
        return null;
      }
      console.error('Error fetching slide analysis:', err);
      throw err;
    }
  }
async rerunSlideDeepAnalysis(sessionId: string, slideIndex: number): Promise<{status: string; session_id: string; slide_index: number}> {
    const response = await this.fetchWithResolvedBase(`/session/${sessionId}/slide/${slideIndex}/deep-analysis`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    return response.json();
  }

  async getLlmProvider(): Promise<LlmProviderResponse> {
    const base = await this.ensureApiBase();
    return this.fetchJson<LlmProviderResponse>(`${base}/settings/local-llm`, undefined, { retries: 1 });
  }

  async getAnalysisSettings(): Promise<AnalysisSettingsResponse> {
    return this.fetchJson<AnalysisSettingsResponse>(await this.buildUrl('/settings/analysis'), {
      headers: this.getAuthHeaders()
    }, { retries: 1 });
  }

  async updateAnalysisSettings(analysisMaxTokens: number): Promise<AnalysisSettingsResponse & {status: string}> {
    return this.fetchJson<AnalysisSettingsResponse & {status: string}>(
      await this.buildUrl(`/settings/analysis?analysis_max_tokens=${encodeURIComponent(String(analysisMaxTokens))}`),
      {
        method: 'POST',
        headers: this.getAuthHeaders()
      },
      { retries: 1 }
    );
  }

  async getGrammarStatus(): Promise<GrammarStatusResponse> {
    return this.fetchJson<GrammarStatusResponse>(await this.buildUrl('/settings/grammar-status'), {
      headers: this.getAuthHeaders()
    }, { retries: 1 });
  }

  async getRuntimeAssetStatus(): Promise<RuntimeAssetStatusResponse> {
    return this.fetchJson<RuntimeAssetStatusResponse>(await this.buildUrl('/settings/runtime-assets'), {
      headers: this.getAuthHeaders()
    }, { retries: 0, timeoutMs: 60_000 });
  }

  async getOcrVariantState(): Promise<OcrVariantState> {
    return this.fetchJson<OcrVariantState>(await this.buildUrl('/settings/ocr-variant'), {
      headers: this.getAuthHeaders(),
    }, { retries: 0, timeoutMs: 60_000 });
  }

  async startOcrDownload(backendId?: string): Promise<OcrDownloadJobResponse> {
    const params = backendId ? `?backend=${encodeURIComponent(backendId)}` : '';
    return this.fetchJson<OcrDownloadJobResponse>(await this.buildUrl(`/ocr/download${params}`), {
      method: 'POST',
      headers: this.getAuthHeaders(),
    }, { retries: 0, timeoutMs: 60_000 });
  }

  async getOcrDownloadStatus(jobId?: string): Promise<OcrJobStatus> {
    const suffix = jobId ? `/job/${encodeURIComponent(jobId)}` : '/status';
    return this.fetchJson<OcrJobStatus>(await this.buildUrl(`/ocr${suffix}`), {
      headers: this.getAuthHeaders(),
    }, { retries: 0, timeoutMs: 60_000 });
  }

  async getOcrBackends(): Promise<import('../types').OcrBackendsResponse> {
    return this.fetchJson<import('../types').OcrBackendsResponse>(await this.buildUrl('/ocr/backends'), {
      headers: this.getAuthHeaders(),
    }, { retries: 0, timeoutMs: 30_000 });
  }

  async detectOcrDevice(): Promise<import('../types').OcrDeviceCapabilities> {
    return this.fetchJson<import('../types').OcrDeviceCapabilities>(await this.buildUrl('/ocr/detect-device'), {
      headers: this.getAuthHeaders(),
    }, { retries: 0, timeoutMs: 30_000 });
  }

  async cancelOcrDownload(jobId: string): Promise<Record<string, unknown>> {
    return this.fetchJson<Record<string, unknown>>(await this.buildUrl(`/ocr/cancel?job_id=${encodeURIComponent(jobId)}`), {
      method: 'POST',
      headers: this.getAuthHeaders(),
    }, { retries: 0, timeoutMs: 60_000 });
  }

  async activateOcrBackend(backendId: string): Promise<{ activated: boolean; backend_id: string; label: string }> {
    return this.fetchJson(await this.buildUrl(`/ocr/activate?backend=${encodeURIComponent(backendId)}`), {
      method: 'POST',
      headers: this.getAuthHeaders(),
    }, { retries: 0, timeoutMs: 60_000 });
  }

  async clearOcrCache(backendId?: string): Promise<{ removed: string[]; errors: string[] }> {
    const params = backendId ? `?backend=${encodeURIComponent(backendId)}` : '';
    return this.fetchJson(await this.buildUrl(`/ocr/cache${params}`), {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    }, { retries: 0, timeoutMs: 60_000 });
  }

  async forceRedownloadOcr(backendId?: string): Promise<OcrDownloadJobResponse> {
    const params = backendId ? `?backend=${encodeURIComponent(backendId)}` : '';
    return this.fetchJson<OcrDownloadJobResponse>(await this.buildUrl(`/ocr/force-download${params}`), {
      method: 'POST',
      headers: this.getAuthHeaders(),
    }, { retries: 0, timeoutMs: 60_000 });
  }

  async setLlmProvider(payload: UpdateLlmProviderPayload): Promise<LlmProviderResponse & {status: string}> {
    const response = await this.fetchWithResolvedBase('/settings/local-llm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return response.json();
  }

  async setSessionLlmSettings(sessionId: string, provider: string, contextWindow?: number | null): Promise<any> {
    const base = await this.ensureApiBase();
    const params = new URLSearchParams({ provider });
    if (contextWindow) {
      params.set('context_window', String(contextWindow));
    }
    const url = `${base}/session/${sessionId}/llm-settings?${params.toString()}`;
    apiTrace('setSessionLlmSettings:start', { url, sessionId, provider, contextWindow: contextWindow ?? null });
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    if (!response.ok) {
      const message = await this.getErrorMessage(response, 'Failed to save session LLM settings');
      apiTrace('setSessionLlmSettings:error', { url, sessionId, status: response.status, message });
      throw new Error(message);
    }
    const payload = await response.json();
    apiTrace('setSessionLlmSettings:success', { url, sessionId, payload });
    return payload;
  }

  async testLlmConnection(): Promise<TestLlmConnectionResponse> {
    const base = await this.ensureApiBase();
    return this.fetchJson<TestLlmConnectionResponse>(`${base}/settings/local-llm/test`, undefined, { retries: 0, timeoutMs: 30_000 });
  }

  getSlideImageUrl(sessionId: string, index: number): string {
    return `${this.apiBase}/session/${sessionId}/slide/${index}/image`;
  }

  resolveAssetUrl(pathOrUrl?: string | null): string | null {
    if (!pathOrUrl) return null;
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    if (!pathOrUrl.startsWith('/')) return pathOrUrl;
    return `${this.apiBase}${pathOrUrl.replace(/^\/api/, '')}`;
  }

  async acceptFix(sessionId: string, annotationId: string): Promise<any> {
    const response = await this.fetchWithResolvedBase(`/session/${sessionId}/accept`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ annotation_id: annotationId }),
    });
    return response.json();
  }

  async dismissAnnotation(sessionId: string, annotationId: string, reason: string): Promise<any> {
    const response = await this.fetchWithResolvedBase(`/session/${sessionId}/override`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ annotation_id: annotationId, reason }),
    });
    return response.json();
  }

  async prepareDelivery(sessionId: string): Promise<any> {
    const response = await this.fetchWithResolvedBase(`/session/${sessionId}/prepare`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    return response.json();
  }

  async getDeliveryStatus(sessionId: string): Promise<DeliveryStatusResponse> {
    const response = await this.fetchWithResolvedBase(`/session/${sessionId}/delivery-status`, {
      headers: this.getAuthHeaders(),
    });
    return response.json();
  }

  async signGuardrail(sessionId: string, userName: string): Promise<any> {
    const response = await this.fetchWithResolvedBase(`/guardrail/${sessionId}/sign`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ user_name: userName }),
    });
    return response.json();
  }

  async getSessionGuardrail(sessionId: string): Promise<GuardrailResponse> {
    const response = await this.fetchWithResolvedBase(`/session/${sessionId}/guardrail`, {
      headers: this.getAuthHeaders(),
    });
    return response.json();
  }

  async applySessionGuardrail(
    sessionId: string,
    guardrail: GuardrailResponse | Record<string, unknown>
  ): Promise<ApplyGuardrailResponse> {
    const response = await this.fetchWithResolvedBase(`/session/${sessionId}/guardrail/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify(guardrail),
    });
    return response.json();
  }

  async listGuardrails(sessionId: string): Promise<GuardrailListResponse> {
    const response = await this.fetchWithResolvedBase(`/guardrail/list?session_id=${encodeURIComponent(sessionId)}`, {
      headers: this.getAuthHeaders(),
    });
    return response.json();
  }

  async diffGuardrails(sessionId: string, oldId: string, newId: string): Promise<GuardrailDiffResponse> {
    const params = new URLSearchParams({ session_id: sessionId, old_id: oldId, new_id: newId });
    const response = await this.fetchWithResolvedBase(`/guardrail/diff?${params.toString()}`, {
      headers: this.getAuthHeaders(),
    });
    return response.json();
  }

  async saveGuardrailTemplate(sessionId: string, templateName: string): Promise<any> {
    const response = await this.fetchWithResolvedBase(`/session/${sessionId}/guardrail/template/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ template_name: templateName }),
    });
    return response.json();
  }

  async listGuardrailTemplates(sessionId?: string): Promise<GuardrailTemplateListResponse> {
    const suffix = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
    const response = await this.fetchWithResolvedBase(`/guardrail/template/list${suffix}`, {
      headers: this.getAuthHeaders(),
    });
    return response.json();
  }

  async activateGuardrailTemplate(sessionId: string, templateId: string): Promise<ApplyGuardrailResponse> {
    const response = await this.fetchWithResolvedBase(`/session/${sessionId}/guardrail/template/${encodeURIComponent(templateId)}/activate`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
    return response.json();
  }

  async getAuditLog(sessionId: string): Promise<{entries: AuditLogEntry[]}> {
    const response = await this.fetchWithResolvedBase(`/session/${sessionId}/audit-log`, {
      headers: this.getAuthHeaders()
    });
    return response.json();
  }

  async startDiscovery(sessionId: string): Promise<DiscoveryResponse> {
    const response = await this.fetchWithResolvedBase(`/template/discover/start?session_id=${sessionId}`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    return response.json();
  }

  async answerDiscovery(sessionId: string, answer: string): Promise<DiscoveryResponse> {
    const response = await this.fetchWithResolvedBase(`/template/discover/answer?session_id=${sessionId}&answer=${encodeURIComponent(answer)}`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    return response.json();
  }

  async discoverTemplateFromPlaybook(playbookText: string, engagementType = 'strategy'): Promise<GuardrailResponse | Record<string, unknown>> {
    const response = await this.fetchWithResolvedBase('/template/discover', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ playbook_text: playbookText, engagement_type: engagementType })
    });
    return response.json();
  }

  async discoverTemplateFromPlaybookFile(
    sessionId: string,
    file: File,
    engagementType = 'strategy'
  ): Promise<PlaybookUploadDiscoveryResponse> {
    const formData = new FormData();
    formData.append('file', file);
    const params = new URLSearchParams({ session_id: sessionId, engagement_type: engagementType });
    const response = await this.fetchWithResolvedBase(`/template/discover/upload?${params.toString()}`, {
      method: 'POST',
      body: formData,
      headers: this.getAuthHeaders()
    });
    return response.json();
  }

  private getAuthHeaders(): Record<string, string> {
    const role = localStorage.getItem('slideforge_role') || 'junior';
    if (this.authHeadersCache.role !== role) {
      this.authHeadersCache.role = role;
      this.authHeadersCache.headers = { 'X-User-Role': role };
    }
    return this.authHeadersCache.headers;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  async downloadAnnotated(sessionId: string): Promise<void> {
    const response = await this.fetchWithResolvedBase(`/session/${sessionId}/download`, {
      headers: this.getAuthHeaders()
    });
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SlideForge_annotated.pptx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  async downloadPackage(sessionId: string): Promise<void> {
    const response = await this.fetchWithResolvedBase(`/session/${sessionId}/download-package`);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Delivery_Package.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  async signOffSession(sessionId: string, userName: string): Promise<any> {
    const response = await this.fetchWithResolvedBase(`/session/${sessionId}/sign-off`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ user_name: userName }),
    });
    return response.json();
  }

  async uploadSourceDocument(sessionId: string, file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.fetchWithResolvedBase(`/session/${sessionId}/upload-source`, {
      method: 'POST',
      body: formData,
    });
    return response.json();
  }

  async uploadExcelForDataLineage(sessionId: string, file: File): Promise<UploadExcelResponse> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.fetchWithResolvedBase(`/session/${sessionId}/upload-excel`, {
      method: 'POST',
      body: formData,
      headers: this.getAuthHeaders(),
    });
    return response.json();
  }

  async getSessionEvidence(sessionId: string): Promise<SessionEvidenceResponse> {
    const response = await this.fetchWithResolvedBase(`/session/${sessionId}/evidence`, {
      headers: this.getAuthHeaders(),
    });
    return response.json();
  }

  async runRevisionLoop(sessionId: string): Promise<RevisionLoopResponse> {
    const response = await this.fetchWithResolvedBase(`/session/${sessionId}/revision`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
    return response.json();
  }

  async getLlmDiagnostics(): Promise<any> {
    const response = await this.fetchWithResolvedBase('/settings/local-llm/diagnostics');
    return response.json();
  }

  async getDiagnostics(): Promise<DiagnosticsResponse> {
    return this.fetchJson<DiagnosticsResponse>(await this.buildUrl('/diagnostics'), {
      headers: this.getAuthHeaders(),
    }, { retries: 0, timeoutMs: 60_000 });
  }

  async getSessionMetrics(includeSessions = false): Promise<SessionMetricsResponse> {
    return this.fetchJson<SessionMetricsResponse>(
      await this.buildUrl(`/admin/session-metrics?include_sessions=${includeSessions ? 'true' : 'false'}`),
      { headers: this.getAuthHeaders() },
      { retries: 1 }
    );
  }

  async getRecentHistory(limit = 12): Promise<{items: HistoryItem[]}> {
    const base = await this.ensureApiBase();
    return this.fetchJson<{items: HistoryItem[]}>(`${base}/history/recent?limit=${limit}`, {
      headers: this.getAuthHeaders()
    }, { retries: 1 });
  }

  async openHistory(fingerprint: string): Promise<AnalysisResponse> {
    const base = await this.ensureApiBase();
    return this.fetchJson<AnalysisResponse>(`${base}/history/${encodeURIComponent(fingerprint)}/open`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    }, { retries: 1, timeoutMs: 120_000 });
  }
}

export const apiService = new ApiService();
export { ApiError };

export type {
  ErrorContextPayload,
  StructuredErrorPayload,
  DiagnosticsResponse,
  Annotation,
  SlideData,
  HistoryItem,
  LlmProviderResponse,
  RuntimeProviderStatus,
  UpdateLlmProviderPayload,
  TestLlmConnectionResponse,
};
