import { apiService, ApiError } from '../apiService';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function okResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    blob: () => Promise.resolve(new Blob()),
    headers: new Headers(),
  } as Response;
}

function errorResponse(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(),
  } as Response;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let localStore: Record<string, string> = {};

beforeEach(() => {
  vi.restoreAllMocks();

  // Mock localStorage — jsdom's native Storage may not be properly available
  localStore = { slideforge_role: 'junior' };
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => localStore[key] ?? null,
    setItem: (key: string, value: string) => { localStore[key] = String(value); },
    removeItem: (key: string) => { delete localStore[key]; },
    clear: () => { localStore = {}; },
    get length() { return Object.keys(localStore).length; },
    key: (index: number) => Object.keys(localStore)[index] ?? null,
  });

  // Reset apiService internal state to defaults
  (apiService as any).apiBase = '/api';
  (apiService as any).apiBaseResolved = false;
  (apiService as any).sessionId = null;
  (apiService as any).authHeadersCache = { role: '', headers: {} };
  delete (window as any).slideforge;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// Prep a mock fetch and set it on globalThis
function mockFetch(fn: (url: string, init?: RequestInit) => unknown): void {
  (globalThis as any).fetch = vi.fn().mockImplementation(fn);
}

// ---------------------------------------------------------------------------
// 1. ApiError class
// ---------------------------------------------------------------------------

describe('ApiError', () => {
  it('stores message, status, code, title, hint and context', () => {
    const ctx = { requestId: 'abc', timestamp: '2025-01-01T00:00:00Z', endpoint: '/test' };
    const err = new ApiError('something broke', 409, {
      code: 'CONFLICT',
      title: 'Version conflict',
      hint: 'Refresh and retry',
      context: ctx,
    });
    expect(err.message).toBe('something broke');
    expect(err.status).toBe(409);
    expect(err.code).toBe('CONFLICT');
    expect(err.title).toBe('Version conflict');
    expect(err.hint).toBe('Refresh and retry');
    expect(err.context).toEqual(ctx);
  });

  it('defaults code, title, hint to undefined when omitted', () => {
    const err = new ApiError('nope', 400);
    expect(err.status).toBe(400);
    expect(err.code).toBeUndefined();
    expect(err.title).toBeUndefined();
    expect(err.hint).toBeUndefined();
    expect(err.context).toBeUndefined();
  });

  it('is an instance of Error', () => {
    const err = new ApiError('msg', 500);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });
});

// ---------------------------------------------------------------------------
// 2. API base URL resolution
// ---------------------------------------------------------------------------

describe('API base URL', () => {
  it('defaults to /api', () => {
    expect(apiService.getApiBase()).toBe('/api');
  });

  it('setApiBase appends /api to the provided base', () => {
    apiService.setApiBase('http://localhost:8000');
    expect(apiService.getApiBase()).toBe('http://localhost:8000/api');
  });

  it('setApiBase strips trailing slashes before appending /api', () => {
    apiService.setApiBase('http://localhost:8000/');
    expect(apiService.getApiBase()).toBe('http://localhost:8000/api');
  });

  it('setApiBase ignores empty strings', () => {
    apiService.setApiBase('');
    expect(apiService.getApiBase()).toBe('/api');
  });

  it('setApiBase ignores whitespace-only strings', () => {
    apiService.setApiBase('   ');
    expect(apiService.getApiBase()).toBe('/api');
  });

  it('ensureApiBase picks up window.slideforge.apiBase when set', async () => {
    // ensureApiBase checks for window.slideforge?.getApiBase existence first
    (window as any).slideforge = { apiBase: 'http://electron:8000', getApiBase: vi.fn() };
    // force apiBaseResolved back to false so ensureApiBase runs the electron path
    (apiService as any).apiBaseResolved = false;
    (apiService as any).apiBase = '/api';

    const base = await (apiService as any).ensureApiBase();
    expect(base).toBe('http://electron:8000/api');
    expect(apiService.getApiBase()).toBe('http://electron:8000/api');
  });

  it('ensureApiBase falls back to getApiBase() when apiBase is empty on slideforge', async () => {
    (window as any).slideforge = {
      apiBase: '',
      getApiBase: vi.fn().mockResolvedValue('http://fallback:4000'),
    };
    (apiService as any).apiBaseResolved = false;
    (apiService as any).apiBase = '/api';

    const base = await (apiService as any).ensureApiBase();
    expect(base).toBe('http://fallback:4000/api');
  });
});

// ---------------------------------------------------------------------------
// 3. Auth headers
// ---------------------------------------------------------------------------

describe('auth headers', () => {
  it('returns X-User-Role based on localStorage', () => {
    localStorage.setItem('slideforge_role', 'senior');
    const headers = (apiService as any).getAuthHeaders();
    expect(headers).toEqual({ 'X-User-Role': 'senior' });
  });

  it('defaults to junior when no role is stored', () => {
    localStorage.removeItem('slideforge_role');
    const headers = (apiService as any).getAuthHeaders();
    expect(headers).toEqual({ 'X-User-Role': 'junior' });
  });

  it('caches headers and re-computes on role change', () => {
    const cache = (apiService as any).authHeadersCache;
    expect(cache.role).toBe('');

    const first = (apiService as any).getAuthHeaders();
    expect(cache.role).toBe('junior');
    expect(first).toEqual({ 'X-User-Role': 'junior' });

    // Same call returns the same object
    const second = (apiService as any).getAuthHeaders();
    expect(second).toBe(first);

    // Change role → new headers
    localStorage.setItem('slideforge_role', 'senior');
    const third = (apiService as any).getAuthHeaders();
    expect(third).toEqual({ 'X-User-Role': 'senior' });
    expect(third).not.toBe(first);
  });
});

// ---------------------------------------------------------------------------
// 4. Session creation
// ---------------------------------------------------------------------------

describe('createSession', () => {
  it('POSTs /session/create and returns session_id', async () => {
    mockFetch(() => okResponse({ session_id: 'sess-123' }));

    const id = await apiService.createSession();
    expect(id).toBe('sess-123');
    expect(apiService.getSessionId()).toBe('sess-123');
    expect(fetch).toHaveBeenCalledWith(
      '/api/session/create',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('passes client_namespace when provided', async () => {
    mockFetch(() => okResponse({ session_id: 'sess-ns' }));

    const id = await apiService.createSession('acme-corp');
    expect(id).toBe('sess-ns');
    const url = (fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('client_namespace=acme-corp');
  });

  it('throws ApiError on non-ok response', async () => {
    mockFetch(() => errorResponse(500, { detail: 'Server error' }));

    await expect(apiService.createSession()).rejects.toThrow(ApiError);
  });
});

// ---------------------------------------------------------------------------
// 5. Session LLM settings
// ---------------------------------------------------------------------------

describe('setSessionLlmSettings', () => {
  it('POSTs provider and context_window params', async () => {
    mockFetch(() => okResponse({ status: 'ok' }));

    await apiService.setSessionLlmSettings('sess-1', 'ollama', 8192);
    const url = (fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('/session/sess-1/llm-settings');
    expect(url).toContain('provider=ollama');
    expect(url).toContain('context_window=8192');
    expect((fetch as any).mock.calls[0][1].method).toBe('POST');
  });

  it('omits context_window when not provided', async () => {
    mockFetch(() => okResponse({ status: 'ok' }));

    await apiService.setSessionLlmSettings('sess-1', 'api');
    const url = (fetch as any).mock.calls[0][0] as string;
    expect(url).not.toContain('context_window');
  });

  it('sets X-User-Role header from auth cache', async () => {
    mockFetch(() => okResponse({ status: 'ok' }));

    await apiService.setSessionLlmSettings('sess-1', 'api');
    const headers = (fetch as any).mock.calls[0][1].headers;
    expect(headers).toEqual({ 'X-User-Role': 'junior' });
  });

  it('throws an Error with the detail message on failure', async () => {
    mockFetch(() => errorResponse(400, { detail: 'Invalid provider' }));

    await expect(
      apiService.setSessionLlmSettings('sess-1', 'bogus'),
    ).rejects.toThrow('Invalid provider');
  });

  it('falls back to a default message when detail is missing', async () => {
    mockFetch(() => errorResponse(400, {}));

    await expect(
      apiService.setSessionLlmSettings('sess-1', 'bogus'),
    ).rejects.toThrow('Failed to save session LLM settings');
  });
});

// ---------------------------------------------------------------------------
// 6. File upload
// ---------------------------------------------------------------------------

describe('uploadDeck', () => {
  const file = new File(['fake content'], 'deck.pptx', {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });

  it('POSTs FormData to the upload endpoint', async () => {
    mockFetch(() => okResponse({ document_fingerprint: 'fp-1', history_available: false }));

    const result = await apiService.uploadDeck('sess-1', file);
    expect(result.document_fingerprint).toBe('fp-1');
    expect(result.history_available).toBe(false);

    const url = (fetch as any).mock.calls[0][0] as string;
    expect(url).toBe('/api/session/sess-1/upload');

    const init = (fetch as any).mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('throws an Error with extracted detail message on failure', async () => {
    mockFetch(() => errorResponse(413, { detail: 'File too large' }));

    await expect(apiService.uploadDeck('sess-1', file)).rejects.toThrow('File too large');
  });

  it('falls back to default message when detail is not a string', async () => {
    // detail is an object with title but no message → getErrorMessage returns title
    mockFetch(() => errorResponse(500, { detail: { title: 'Oops' } }));

    await expect(apiService.uploadDeck('sess-1', file)).rejects.toThrow('Oops');
  });

  it('falls back when json parse fails', async () => {
    const resp = {
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error('invalid json')),
      headers: new Headers(),
    };
    (globalThis as any).fetch = vi.fn().mockResolvedValue(resp);

    await expect(apiService.uploadDeck('sess-1', file)).rejects.toThrow('Failed to upload deck');
  });
});

// ---------------------------------------------------------------------------
// 7. Parse deck
// ---------------------------------------------------------------------------

describe('parseDeck', () => {
  it('POSTs to /analyze and returns AnalysisResponse', async () => {
    mockFetch(() =>
      okResponse({ session_id: 'sess-1', slide_count: 5, status: 'completed' }),
    );

    const result = await apiService.parseDeck('sess-1');
    expect(result.session_id).toBe('sess-1');
    expect(result.slide_count).toBe(5);
    expect(result.status).toBe('completed');

    const url = (fetch as any).mock.calls[0][0] as string;
    expect(url).toBe('/api/session/sess-1/analyze');
  });

  it('includes auth headers in the request', async () => {
    mockFetch(() => okResponse({ session_id: 'sess-1', slide_count: 0, status: 'idle' }));

    await apiService.parseDeck('sess-1');
    const headers = (fetch as any).mock.calls[0][1].headers;
    expect(headers['X-User-Role']).toBe('junior');
  });
});

// ---------------------------------------------------------------------------
// 8. Analysis retrieval
// ---------------------------------------------------------------------------

describe('getSlides', () => {
  it('GETs /session/{id}/slides and returns the response', async () => {
    const slidesData = {
      slides: [
        { id: 's1', index: 0, title: 'Intro', full_text: 'Hello', previewUrl: '/img/0.png' },
      ],
    };
    mockFetch(() => okResponse(slidesData));

    const result = await apiService.getSlides('sess-1');
    expect(result.slides).toHaveLength(1);
    expect(result.slides[0].title).toBe('Intro');

    const url = (fetch as any).mock.calls[0][0] as string;
    expect(url).toBe('/api/session/sess-1/slides');
  });
});

describe('getScorecard', () => {
  it('GETs /session/{id}/scorecard and returns scorecard data', async () => {
    const scorecard = { composite_score: 92, summary: 'Great' };
    mockFetch(() => okResponse(scorecard));

    const result = await apiService.getScorecard('sess-1');
    expect(result.composite_score).toBe(92);
  });
});

describe('getSlideAnalysis', () => {
  it('returns analysis when available', async () => {
    const analysis = {
      id: 'a1',
      title: 'Slide 1',
      summary: 'Analysis summary',
      overallScore: 85,
      density: 'Medium',
      visuals: [],
      fixes: [],
      councilDebate: [],
      citationIssues: [],
    };
    mockFetch(() => okResponse(analysis));

    const result = await apiService.getSlideAnalysis('sess-1', 0);
    expect(result).toEqual(analysis);
  });

  it('returns null on 404', async () => {
    mockFetch(() => errorResponse(404, { detail: 'Not found' }));

    const result = await apiService.getSlideAnalysis('sess-1', 0);
    expect(result).toBeNull();
  });

  it('re-throws non-404 ApiErrors', async () => {
    mockFetch(() => errorResponse(500, { detail: 'Server error' }));

    await expect(apiService.getSlideAnalysis('sess-1', 0)).rejects.toThrow(ApiError);
  });

  it('re-throws network errors', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    await expect(apiService.getSlideAnalysis('sess-1', 0)).rejects.toThrow('Failed to fetch');
  });
});

describe('runAnalysis', () => {
  it('POSTs and returns scorecard', async () => {
    const payload = {
      session_id: 'sess-1',
      scorecard: { composite_score: 88, summary: 'Good', annotations: [] },
    };
    mockFetch(() => okResponse(payload));

    const result = await apiService.runAnalysis('sess-1');
    expect(result.scorecard.composite_score).toBe(88);
  });
});

// ---------------------------------------------------------------------------
// 9. Analysis polling (runAnalysisWithPolling)
// ---------------------------------------------------------------------------

describe('runAnalysisWithPolling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns immediately when runAnalysis succeeds with a scorecard', async () => {
    const scorecard = { composite_score: 95, summary: 'Excellent', annotations: [] };
    const payload = { session_id: 'sess-1', scorecard };
    mockFetch(() => okResponse(payload));

    const result = await apiService.runAnalysisWithPolling('sess-1');
    expect(result.scorecard).toEqual(scorecard);
    // Should only call one fetch (runAnalysis) — no polling
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to polling when runAnalysis times out', async () => {
    vi.useFakeTimers();

    const scorecard = { composite_score: 72, summary: 'Needs work', annotations: [] };

    let statusCalls = 0;
    mockFetch((url: string) => {
      if (url.includes('/run-analysis/status')) {
        statusCalls++;
        if (statusCalls === 1) {
          return okResponse({ job_status: 'running' });
        }
        return okResponse({ job_status: 'completed', scorecard });
      }
      // runAnalysis endpoint → simulate timeout
      return Promise.reject(new Error('timeout'));
    });

    const promise = apiService.runAnalysisWithPolling('sess-1');

    // First poll: returns 'running' → waits pollInterval (2000ms)
    await vi.advanceTimersByTimeAsync(2000);
    // Second poll: returns 'completed' → resolves
    await vi.advanceTimersByTimeAsync(2000);

    const result = await promise;
    expect(result.scorecard).toEqual(scorecard);
    expect(result.job_status).toBe('completed');
    expect(statusCalls).toBe(2);
  });

  it('throws when job_status is failed', async () => {
    vi.useFakeTimers();

    mockFetch((url: string) => {
      if (url.includes('/run-analysis/status')) {
        return okResponse({ job_status: 'failed', error: 'Model crashed' });
      }
      return Promise.reject(new Error('timeout'));
    });

    const promise = apiService.runAnalysisWithPolling('sess-1');
    await vi.advanceTimersByTimeAsync(2000);

    await expect(promise).rejects.toThrow('Model crashed');
  });

  it('throws when polling times out', async () => {
    vi.useFakeTimers();

    mockFetch((url: string) => {
      if (url.includes('/run-analysis/status')) {
        return okResponse({ job_status: 'running' });
      }
      return Promise.reject(new Error('timeout'));
    });

    const promise = apiService.runAnalysisWithPolling('sess-1', {
      pollIntervalMs: 2000,
      pollTimeoutMs: 5000,
    });

    // Advance past the timeout
    await vi.advanceTimersByTimeAsync(6000);

    await expect(promise).rejects.toThrow(/polling timed out/);
  });

  it('calls onProgress callback with each poll result', async () => {
    vi.useFakeTimers();

    const scorecard = { composite_score: 80, summary: 'OK', annotations: [] };
    const onProgress = vi.fn();

    let statusCalls = 0;
    mockFetch((url: string) => {
      if (url.includes('/run-analysis/status')) {
        statusCalls++;
        if (statusCalls <= 2) {
          return okResponse({ job_status: 'running', progress_label: 'Working...' });
        }
        return okResponse({ job_status: 'completed', scorecard });
      }
      return Promise.reject(new Error('timeout'));
    });

    const promise = apiService.runAnalysisWithPolling('sess-1', {
      pollIntervalMs: 2000,
      onProgress,
    });

    await vi.advanceTimersByTimeAsync(2000); // poll 1 → running
    await vi.advanceTimersByTimeAsync(2000); // poll 2 → running
    await vi.advanceTimersByTimeAsync(2000); // poll 3 → completed

    await promise;
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, expect.objectContaining({ job_status: 'running' }));
    expect(onProgress).toHaveBeenNthCalledWith(3, expect.objectContaining({ job_status: 'completed' }));
  });

  it('re-throws non-timeout errors from runAnalysis', async () => {
    mockFetch(() => Promise.reject(new Error('Network failure')));

    await expect(
      apiService.runAnalysisWithPolling('sess-1'),
    ).rejects.toThrow('Network failure');
  });
});

// ---------------------------------------------------------------------------
// 10. OCR status polling
// ---------------------------------------------------------------------------

describe('OCR status', () => {
  it('getOcrVariantState returns variant info', async () => {
    mockFetch(() =>
      okResponse({ variant: 'full', ready: true, bundleAvailable: true, runtimeCacheReady: true, cacheDir: '/tmp' }),
    );
    const state = await apiService.getOcrVariantState();
    expect(state.variant).toBe('full');
    expect(state.ready).toBe(true);
  });

  it('getRuntimeAssetStatus returns asset data', async () => {
    const status = {
      ocr: {
        phase: 'loaded',
        message: 'All models loaded',
        download_active: false,
        download_required: false,
        offline_ready: true,
        bundled_seeded: true,
        cache_dir: null,
        tmp_dir: null,
        files: [],
        updated_at: null,
        layout_loaded: true,
        recognition_loaded: true,
        detector_loaded: true,
        foundation_loaded: true,
        cooldown_active: false,
        last_error: null,
      },
      download_active: false,
      download_required: false,
    };
    mockFetch(() => okResponse(status));
    const result = await apiService.getRuntimeAssetStatus();
    expect(result.ocr.phase).toBe('loaded');
    expect(result.download_active).toBe(false);
  });

  it('getOcrDownloadStatus returns job status for a specific job', async () => {
    const jobStatus = {
      job_id: 'job-1',
      status: 'running',
      phase: 'downloading',
      message: 'Downloading model...',
      progress: 50,
      total: 100,
    };
    mockFetch(() => okResponse(jobStatus));
    const result = await apiService.getOcrDownloadStatus('job-1');
    expect(result.job_id).toBe('job-1');
    expect(result.status).toBe('running');

    const url = (fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('/ocr/job/job-1');
  });

  it('getOcrDownloadStatus without jobId calls /ocr/status', async () => {
    mockFetch(() =>
      okResponse({ job_id: '', status: 'idle', phase: '', message: '', progress: 0, total: 0 }),
    );
    await apiService.getOcrDownloadStatus();
    const url = (fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('/ocr/status');
  });
});

describe('OCR downloads', () => {
  it('startOcrDownload POSTs and returns job_id', async () => {
    mockFetch(() => okResponse({ job_id: 'dl-1', status: 'running' }));
    const result = await apiService.startOcrDownload();
    expect(result.job_id).toBe('dl-1');
    expect((fetch as any).mock.calls[0][1].method).toBe('POST');
  });

  it('startOcrDownload passes backendId when provided', async () => {
    mockFetch(() => okResponse({ job_id: 'dl-2', status: 'running' }));
    await apiService.startOcrDownload('paddleocr');
    const url = (fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('backend=paddleocr');
  });

  it('cancelOcrDownload POSTs with job_id param', async () => {
    mockFetch(() => okResponse({ cancelled: true }));
    await apiService.cancelOcrDownload('job-1');
    const url = (fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('/ocr/cancel');
    expect(url).toContain('job_id=job-1');
    expect((fetch as any).mock.calls[0][1].method).toBe('POST');
  });

  it('activateOcrBackend POSTs with backend param', async () => {
    mockFetch(() => okResponse({ activated: true, backend_id: 'paddleocr', label: 'PaddleOCR' }));
    const result = await apiService.activateOcrBackend('paddleocr');
    expect(result.activated).toBe(true);
    const url = (fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('/ocr/activate');
    expect(url).toContain('backend=paddleocr');
  });

  it('clearOcrCache sends DELETE', async () => {
    mockFetch(() => okResponse({ removed: ['model'], errors: [] }));
    const result = await apiService.clearOcrCache();
    expect(result.removed).toEqual(['model']);
    expect((fetch as any).mock.calls[0][1].method).toBe('DELETE');
  });

  it('getOcrBackends returns backends data', async () => {
    mockFetch(() =>
      okResponse({
        device: { platform: 'windows', python_arch: 'x64', recommended_backend: 'paddleocr' },
        active_backend: 'paddleocr',
        backends: [],
      }),
    );
    const result = await apiService.getOcrBackends();
    expect(result.device.platform).toBe('windows');
  });

  it('detectOcrDevice returns device capabilities', async () => {
    mockFetch(() =>
      okResponse({ platform: 'windows', python_arch: 'x64', cuda_available: false }),
    );
    const result = await apiService.detectOcrDevice();
    expect(result.platform).toBe('windows');
  });
});

// ---------------------------------------------------------------------------
// 11. Error handling — parseError & getErrorMessage
// ---------------------------------------------------------------------------

describe('error parsing', () => {
  it('getErrorMessage extracts detail string', async () => {
    const resp = { json: () => Promise.resolve({ detail: 'Capacity exceeded' }) } as Response;
    const msg = await (apiService as any).getErrorMessage(resp, 'Fallback');
    expect(msg).toBe('Capacity exceeded');
  });

  it('getErrorMessage extracts structured detail.message', async () => {
    const resp = {
      json: () =>
        Promise.resolve({
          detail: { message: 'Structured error', code: 'ERR_001', title: 'Oops' },
        }),
    } as Response;
    const msg = await (apiService as any).getErrorMessage(resp, 'Fallback');
    expect(msg).toBe('Structured error');
  });

  it('getErrorMessage extracts structured detail.title when message missing', async () => {
    const resp = {
      json: () => Promise.resolve({ detail: { title: 'Title only' } }),
    } as Response;
    const msg = await (apiService as any).getErrorMessage(resp, 'Fallback');
    expect(msg).toBe('Title only');
  });

  it('getErrorMessage returns fallback when json parse fails', async () => {
    const resp = { json: () => Promise.reject(new Error('bad json')) } as Response;
    const msg = await (apiService as any).getErrorMessage(resp, 'Fallback');
    expect(msg).toBe('Fallback');
  });

  it('parseError builds ApiError from structured detail', async () => {
    const resp = {
      status: 422,
      json: () =>
        Promise.resolve({
          detail: {
            code: 'VALIDATION',
            title: 'Bad input',
            message: 'Field X is required',
            hint: 'Add field X',
            context: { requestId: 'r1' },
          },
        }),
    } as Response;
    const err = await (apiService as any).parseError(resp, 'Fallback');
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.code).toBe('VALIDATION');
    expect(err.title).toBe('Bad input');
    // parseError uses structured.message || structured.title || fallback as Error message
    expect(err.message).toBe('Field X is required');
    expect(err.hint).toBe('Add field X');
    expect(err.context?.requestId).toBe('r1');
  });

  it('parseError handles detail string', async () => {
    const resp = { status: 400, json: () => Promise.resolve({ detail: 'Bad request' }) } as Response;
    const err = await (apiService as any).parseError(resp, 'Fallback');
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe('Bad request');
    expect(err.status).toBe(400);
  });

  it('parseError falls back when detail is absent', async () => {
    const resp = { status: 503, json: () => Promise.resolve({}) } as Response;
    const err = await (apiService as any).parseError(resp, 'Fallback');
    expect(err.message).toBe('Fallback');
    expect(err.status).toBe(503);
  });

  it('parseError falls back when json parse fails', async () => {
    const resp = { status: 502, json: () => Promise.reject(new Error('bad json')) } as Response;
    const err = await (apiService as any).parseError(resp, 'Fallback');
    expect(err.message).toBe('Fallback');
    expect(err.status).toBe(502);
  });
});

describe('shouldRetry', () => {
  it('returns true for 429 and 5xx', () => {
    expect((apiService as any).shouldRetry(429)).toBe(true);
    expect((apiService as any).shouldRetry(500)).toBe(true);
    expect((apiService as any).shouldRetry(502)).toBe(true);
    expect((apiService as any).shouldRetry(503)).toBe(true);
  });

  it('returns false for 4xx and success', () => {
    expect((apiService as any).shouldRetry(400)).toBe(false);
    expect((apiService as any).shouldRetry(401)).toBe(false);
    expect((apiService as any).shouldRetry(404)).toBe(false);
    expect((apiService as any).shouldRetry(200)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 12. Retry & timeout in fetchJson
// ---------------------------------------------------------------------------

describe('fetchJson retry logic', () => {
  it('retries on 429 and succeeds on second attempt', async () => {
    let attempts = 0;
    (globalThis as any).fetch = vi.fn().mockImplementation(() => {
      attempts++;
      if (attempts === 1) return Promise.resolve(errorResponse(429, { detail: 'Rate limited' }));
      return Promise.resolve(okResponse({ session_id: 'sess-retry' }));
    });

    const id = await apiService.createSession();
    expect(id).toBe('sess-retry');
    expect(attempts).toBe(2);
  });

  it('does not retry on 400', async () => {
    let attempts = 0;
    mockFetch(() => {
      attempts++;
      return Promise.resolve(errorResponse(400, { detail: 'Bad request' }));
    });

    await expect(apiService.createSession()).rejects.toThrow(ApiError);
    expect(attempts).toBe(1);
  });

  it('retries on network error', async () => {
    let attempts = 0;
    mockFetch(() => {
      attempts++;
      if (attempts === 1) return Promise.reject(new Error('Network flake'));
      return Promise.resolve(okResponse({ session_id: 'sess-net-retry' }));
    });

    const id = await apiService.createSession();
    expect(id).toBe('sess-net-retry');
    expect(attempts).toBe(2);
  });

  it('throws after exhausting retries', async () => {
    let attempts = 0;
    mockFetch(() => {
      attempts++;
      return Promise.resolve(errorResponse(500, { detail: 'Still failing' }));
    });

    await expect(apiService.createSession()).rejects.toThrow(ApiError);
    // createSession uses retries:1 → 2 attempts total (0, 1)
    expect(attempts).toBe(2);
  });
});

describe('timeout handling', () => {
  it('throws a timeout error when fetch aborts', async () => {
    // Simulate AbortError
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    mockFetch(() => Promise.reject(abortError));

    await expect(apiService.createSession()).rejects.toThrow(/timed out/);
  });
});

// ---------------------------------------------------------------------------
// 13. URL utilities
// ---------------------------------------------------------------------------

describe('getSlideImageUrl', () => {
  it('returns the full image URL for a slide', () => {
    const url = apiService.getSlideImageUrl('sess-1', 2);
    expect(url).toBe('/api/session/sess-1/slide/2/image');
  });

  it('reflects custom base URL', () => {
    apiService.setApiBase('http://localhost:9000');
    const url = apiService.getSlideImageUrl('sess-1', 0);
    expect(url).toBe('http://localhost:9000/api/session/sess-1/slide/0/image');
  });
});

describe('resolveAssetUrl', () => {
  it('returns null for null/undefined', () => {
    expect(apiService.resolveAssetUrl(null)).toBeNull();
    expect(apiService.resolveAssetUrl(undefined)).toBeNull();
  });

  it('returns absolute URLs unchanged', () => {
    expect(apiService.resolveAssetUrl('https://cdn.example.com/img.png')).toBe(
      'https://cdn.example.com/img.png',
    );
    expect(apiService.resolveAssetUrl('http://localhost:8000/img.png')).toBe(
      'http://localhost:8000/img.png',
    );
  });

  it('returns non-absolute paths without leading slash as-is', () => {
    expect(apiService.resolveAssetUrl('img/slide0.png')).toBe('img/slide0.png');
  });

  it('prepends apiBase for absolute paths, stripping the leading /api from the path', () => {
    // Default base: /api + /session/… = /api/session/…
    const result = apiService.resolveAssetUrl('/api/session/sess-1/slide/0/image');
    expect(result).toBe('/api/session/sess-1/slide/0/image');
    // With custom base: http://local:7000/api + /session/… = http://local:7000/api/session/…
    apiService.setApiBase('http://local:7000');
    const result2 = apiService.resolveAssetUrl('/api/session/s1/slide/0/image');
    expect(result2).toBe('http://local:7000/api/session/s1/slide/0/image');
  });
});

// ---------------------------------------------------------------------------
// 14. Download methods
// ---------------------------------------------------------------------------

describe('downloadAnnotated', () => {
  it('fetches blob, creates anchor, clicks and cleans up', async () => {
    const blob = new Blob(['pptx data'], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    mockFetch(() => ({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(blob),
      headers: new Headers(),
    } as Response));

    const createObjectURL = vi.fn(() => 'blob:http://localhost/test');
    const revokeObjectURL = vi.fn();
    window.URL.createObjectURL = createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL;

    // Use a real anchor element so document.body.appendChild works
    const anchor = document.createElement('a');
    const anchorClick = vi.fn();
    const originalCreate = document.createElement.bind(document);
    document.createElement = vi.fn((tag: string, options?: ElementCreationOptions) => {
      if (tag === 'a') {
        anchor.click = anchorClick;
        return anchor;
      }
      return originalCreate(tag, options);
    }) as any;

    await apiService.downloadAnnotated('sess-1');

    const url = (fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('/session/sess-1/download');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(anchor.download).toBe('SlideForge_annotated.pptx');
    expect(anchorClick).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/test');
  });
});

describe('downloadPackage', () => {
  it('fetches blob for delivery package', async () => {
    const blob = new Blob(['zip data'], { type: 'application/zip' });
    mockFetch(() => ({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(blob),
      headers: new Headers(),
    } as Response));

    const createObjectURL = vi.fn(() => 'blob:http://localhost/zip');
    window.URL.createObjectURL = createObjectURL;

    const anchor = document.createElement('a');
    const anchorClick = vi.fn();
    const originalCreate = document.createElement.bind(document);
    document.createElement = vi.fn((tag: string, options?: ElementCreationOptions) => {
      if (tag === 'a') {
        anchor.click = anchorClick;
        return anchor;
      }
      return originalCreate(tag, options);
    }) as any;

    await apiService.downloadPackage('sess-1');
    expect(anchor.download).toBe('Delivery_Package.zip');
    expect(anchorClick).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 15. History
// ---------------------------------------------------------------------------

describe('history', () => {
  it('getRecentHistory fetches recent items', async () => {
    const items = {
      items: [
        {
          fingerprint: 'fp-1',
          original_filename: 'Deck.pptx',
          slide_count: 10,
          composite_score: 85,
          warning_count: 2,
          hard_block_count: 0,
          updated_at: '2025-01-01T00:00:00Z',
        },
      ],
    };
    mockFetch(() => okResponse(items));
    const result = await apiService.getRecentHistory(5);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].original_filename).toBe('Deck.pptx');
    const url = (fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('/history/recent');
    expect(url).toContain('limit=5');
  });

  it('getRecentHistory defaults to limit 12', async () => {
    mockFetch(() => okResponse({ items: [] }));
    await apiService.getRecentHistory();
    const url = (fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('limit=12');
  });

  it('openHistory POSTs to the history endpoint', async () => {
    mockFetch(() =>
      okResponse({ session_id: 'sess-hist', slide_count: 5, status: 'completed' }),
    );
    const result = await apiService.openHistory('fp-abc');
    expect(result.session_id).toBe('sess-hist');
    const url = (fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('/history/fp-abc/open');
    expect((fetch as any).mock.calls[0][1].method).toBe('POST');
  });
});

// ---------------------------------------------------------------------------
// 16. LLM settings & diagnostics
// ---------------------------------------------------------------------------

describe('LLM and diagnostics', () => {
  it('testLlmConnection returns connection result', async () => {
    mockFetch(() => okResponse({ ok: true, status: 'connected', response: 'pong', provider: 'ollama', model: 'llama3' }));
    const result = await apiService.testLlmConnection();
    expect(result.ok).toBe(true);
    expect(result.status).toBe('connected');
  });

  it('getLlmProvider returns provider config', async () => {
    mockFetch(() =>
      okResponse({
        enabled: true,
        provider: 'ollama',
        api_key_configured: false,
        api_key_preview: null,
        configured: false,
        requires_api_key: false,
        providers: {},
      }),
    );
    const result = await apiService.getLlmProvider();
    expect(result.provider).toBe('ollama');
  });

  it('getDiagnostics returns diagnostics data', async () => {
    mockFetch(() =>
      okResponse({
        status: 'ok',
        timestamp: 'now',
        backend: { status: 'running', pid: 123, uptime_seconds: 100, app_ready: true, active_sessions: 0, analysis_jobs: 0 },
        startup: { model_warmup_state: 'ready', warmup_task_running: false, preflight: { overall: 'OK', checks: [] } },
        llm: { provider: 'api', configured: true, llm_available: true, providers: {} },
        ocr: { state: 'loaded', phase: 'ready', offline_ready: true, cached_files: 0, cooldown_active: false, loaded: { layout: true, recognition: true, detector: true, foundation: true } },
        chromadb: { state: 'initialized', collections: 1 },
        system: { disk: { ok: true }, memory: { ok: true } },
        analysis: { last_run_at: null, last_status: 'idle', last_session_id: null, last_error: null },
      }),
    );
    const result = await apiService.getDiagnostics();
    expect(result.status).toBe('ok');
    expect(result.backend.status).toBe('running');
  });
});

// ---------------------------------------------------------------------------
// 17. Guardrail methods (representative sample)
// ---------------------------------------------------------------------------

describe('guardrail operations', () => {
  it('getSessionGuardrail fetches guardrail config', async () => {
    mockFetch(() => okResponse({ schema_version: '1.0', engagement_type: 'strategy', playbook_rules: [], human_confirmed_rules: [], rubric_weights: {}, language_rules: {}, pass_threshold: 0.7 }));
    const result = await apiService.getSessionGuardrail('sess-1');
    expect(result.schema_version).toBe('1.0');
  });

  it('signGuardrail POSTs user_name', async () => {
    mockFetch(() => okResponse({ status: 'signed' }));
    const result = await apiService.signGuardrail('sess-1', 'Alice');
    expect(result.status).toBe('signed');
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.user_name).toBe('Alice');
  });

  it('listGuardrailTemplates returns templates', async () => {
    mockFetch(() => okResponse({ templates: [] }));
    const result = await apiService.listGuardrailTemplates();
    expect(result.templates).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 18. Asset / upload-source / evidence
// ---------------------------------------------------------------------------

describe('source documents and evidence', () => {
  it('uploadSourceDocument sends FormData', async () => {
    mockFetch(() => okResponse({ status: 'ok' }));
    const file = new File(['content'], 'source.pdf', { type: 'application/pdf' });
    await apiService.uploadSourceDocument('sess-1', file);
    const init = (fetch as any).mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('getSessionEvidence returns evidence data', async () => {
    mockFetch(() =>
      okResponse({
        session_id: 'sess-1',
        evidence_sources: [{ filename: 'src.pdf', documents_indexed: 1 }],
        excel_snapshot: null,
        source_namespace: null,
      }),
    );
    const result = await apiService.getSessionEvidence('sess-1');
    expect(result.evidence_sources[0].filename).toBe('src.pdf');
  });
});

// ---------------------------------------------------------------------------
// 19. Session getter
// ---------------------------------------------------------------------------

describe('getSessionId', () => {
  it('returns null when no session has been created', () => {
    (apiService as any).sessionId = null;
    expect(apiService.getSessionId()).toBeNull();
  });

  it('returns the stored session id after createSession', async () => {
    mockFetch(() => okResponse({ session_id: 'sess-stored' }));
    await apiService.createSession();
    expect(apiService.getSessionId()).toBe('sess-stored');
  });
});

// ---------------------------------------------------------------------------
// 20. Analysis status
// ---------------------------------------------------------------------------

describe('getAnalysisStatus', () => {
  it('returns the current job status', async () => {
    mockFetch(() =>
      okResponse({ session_id: 'sess-1', job_status: 'running', progress_label: 'Analyzing slide 3' }),
    );
    const result = await apiService.getAnalysisStatus('sess-1');
    expect(result.job_status).toBe('running');
    expect(result.progress_label).toBe('Analyzing slide 3');
  });
});

// ---------------------------------------------------------------------------
// 21. Accept / dismiss / prepare delivery / sign-off
// ---------------------------------------------------------------------------

describe('annotations and delivery', () => {
  it('acceptFix POSTs annotation_id', async () => {
    mockFetch(() => okResponse({ status: 'accepted' }));
    await apiService.acceptFix('sess-1', 'ann-1');
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.annotation_id).toBe('ann-1');
  });

  it('dismissAnnotation POSTs annotation_id and reason', async () => {
    mockFetch(() => okResponse({ status: 'dismissed' }));
    await apiService.dismissAnnotation('sess-1', 'ann-1', 'Not relevant');
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.annotation_id).toBe('ann-1');
    expect(body.reason).toBe('Not relevant');
  });

  it('prepareDelivery POSTs', async () => {
    mockFetch(() => okResponse({ status: 'prepared' }));
    const result = await apiService.prepareDelivery('sess-1');
    expect(result.status).toBe('prepared');
  });

  it('signOffSession POSTs user_name', async () => {
    mockFetch(() => okResponse({ status: 'signed_off' }));
    await apiService.signOffSession('sess-1', 'Bob');
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.user_name).toBe('Bob');
  });

  it('getDeliveryStatus returns delivery status', async () => {
    mockFetch(() => okResponse({ senior_signed: false }));
    const result = await apiService.getDeliveryStatus('sess-1');
    expect(result.senior_signed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 22. Settings endpoints
// ---------------------------------------------------------------------------

describe('settings endpoints', () => {
  it('getAnalysisSettings returns settings', async () => {
    mockFetch(() => okResponse({ analysis_max_tokens: 4096 }));
    const result = await apiService.getAnalysisSettings();
    expect(result.analysis_max_tokens).toBe(4096);
  });

  it('getGrammarStatus returns grammar status', async () => {
    mockFetch(() =>
      okResponse({ enabled: true, engine: 'languagetool', language_tool_available: true, base_url: '', notes: '' }),
    );
    const result = await apiService.getGrammarStatus();
    expect(result.enabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 23. Template discovery
// ---------------------------------------------------------------------------

describe('template discovery', () => {
  it('discoverTemplateFromPlaybook POSTs playbook_text', async () => {
    mockFetch(() => okResponse({ schema_version: '1' }));
    const result = await apiService.discoverTemplateFromPlaybook('Our playbook text');
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.playbook_text).toBe('Our playbook text');
    expect(result).toEqual({ schema_version: '1' });
  });
});
