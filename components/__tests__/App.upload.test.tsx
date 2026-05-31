import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import App from '../../App';

// ── vi.hoisted() is REQUIRED because vi.mock factories are hoisted to the top ─
// All mock variables MUST be created inside vi.hoisted() so they're available
// when the hoisted vi.mock() calls execute.

const {
  mockCreateSession,
  mockGetLlmProvider,
  mockSetSessionLlmSettings,
  mockUploadDeck,
  mockParseDeck,
  mockRunAnalysisWithPolling,
  mockGetSlides,
  mockGetSlideAnalysis,
  mockGetScorecard,
  mockGetOcrVariantState,
  mockGetRuntimeAssetStatus,
  mockSetApiBase,
  mockGetRecentHistory,
  mockGetDiagnostics,
  mockGetOcrBackends,
  mockApiService,
} = vi.hoisted(() => {
  const mockCreateSession = vi.fn<[], Promise<string>>();
  const mockGetLlmProvider = vi.fn();
  const mockSetSessionLlmSettings = vi.fn();
  const mockUploadDeck = vi.fn();
  const mockParseDeck = vi.fn();
  const mockRunAnalysisWithPolling = vi.fn();
  const mockGetSlides = vi.fn();
  const mockGetSlideAnalysis = vi.fn();
  const mockGetScorecard = vi.fn();
  const mockGetOcrVariantState = vi.fn();
  const mockGetRuntimeAssetStatus = vi.fn();
  const mockSetApiBase = vi.fn();
  const mockGetRecentHistory = vi.fn();
  const mockGetDiagnostics = vi.fn();
  const mockGetOcrBackends = vi.fn();
  const mockApiService = {
    createSession: mockCreateSession,
    getLlmProvider: mockGetLlmProvider,
    setSessionLlmSettings: mockSetSessionLlmSettings,
    uploadDeck: mockUploadDeck,
    parseDeck: mockParseDeck,
    runAnalysisWithPolling: mockRunAnalysisWithPolling,
    getSlides: mockGetSlides,
    getSlideAnalysis: mockGetSlideAnalysis,
    getScorecard: mockGetScorecard,
    getOcrVariantState: mockGetOcrVariantState,
    getRuntimeAssetStatus: mockGetRuntimeAssetStatus,
    setApiBase: mockSetApiBase,
    getApiBase: vi.fn().mockReturnValue('/api'),
    getAnalysisStatus: vi.fn(),
    resolveAssetUrl: vi.fn().mockReturnValue('/slide-image-0.png'),
    getSlideImageUrl: vi.fn().mockReturnValue('/slide-image-0.png'),
    startOcrDownload: vi.fn(),
    getOcrDownloadStatus: vi.fn(),
    cancelOcrDownload: vi.fn(),
    activateOcrBackend: vi.fn(),
    openHistory: vi.fn(),
    getRecentHistory: mockGetRecentHistory,
    getDiagnostics: mockGetDiagnostics,
    getOcrBackends: mockGetOcrBackends,
    testLlmConnection: vi.fn(),
    setLlmProvider: vi.fn(),
  };
  return {
    mockCreateSession,
    mockGetLlmProvider,
    mockSetSessionLlmSettings,
    mockUploadDeck,
    mockParseDeck,
    mockRunAnalysisWithPolling,
    mockGetSlides,
    mockGetSlideAnalysis,
    mockGetScorecard,
    mockGetOcrVariantState,
    mockGetRuntimeAssetStatus,
    mockSetApiBase,
    mockGetRecentHistory,
    mockGetDiagnostics,
    mockGetOcrBackends,
    mockApiService,
  };
});

// ── Mock lazy-loaded components ──────────────────────────────────────────────

vi.mock('../Dashboard', () => ({
  __esModule: true,
  default: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="dashboard">Dashboard: {sessionId}</div>
  ),
}));

vi.mock('../DiagnosticsView', () => ({
  __esModule: true,
  default: ({ onBack }: { onBack: () => void }) => (
    <div data-testid="diagnostics">
      Diagnostics
      <button onClick={onBack}>Back</button>
    </div>
  ),
}));

vi.mock('../Toast', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="toast-provider">{children}</div>
  ),
}));

// ── Mock apiService ───────────────────────────────────────────────────────────

vi.mock('../../services/apiService', () => ({
  apiService: mockApiService,
  ApiError: class extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

// ── Mock window.slideforge ────────────────────────────────────────────────────

const originalSlideforge = (window as any).slideforge;

// ── Mock localStorage (directly on window, not Storage.prototype) ────────────
// In jsdom, Storage.prototype spying can break. Instead we mock window.localStorage.

function setupLocalStorage(overrides: Record<string, string> = {}) {
  const store: Record<string, string> = {
    slideforge_terms_accepted: 'true',
    slideforge_role: 'junior',
    ...overrides,
  };
  const storageMock = {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
  Object.defineProperty(window, 'localStorage', {
    value: storageMock,
    writable: true,
    configurable: true,
  });
}

// ── Sample data ───────────────────────────────────────────────────────────────

const SAMPLE_SLIDES_RESPONSE = {
  slides: [
    { index: 0, title: 'Slide 1', full_text: 'Content', previewUrl: '/preview-0.png', width: 1920, height: 1080, id: 'slide-0', text_boxes: [], charts: [], tables: [], images: [] },
    { index: 1, title: 'Slide 2', full_text: 'Content 2', previewUrl: '/preview-1.png', width: 1920, height: 1080, id: 'slide-1', text_boxes: [], charts: [], tables: [], images: [] },
  ],
};

const SAMPLE_ANALYSIS_RESULT = {
  scorecard: {
    composite_score: 75,
    annotations: [
      { slide_index: 0, text: 'Add evidence', category: 'claim_grounding', severity: 'warning', message: 'Missing evidence', suggestion: 'Add supporting data' },
    ],
    summary: 'Good overall',
  },
};

const SAMPLE_OCR_STATE_READY = {
  variant: 'full' as const,
  ready: true,
  bundleAvailable: true,
  runtimeCacheReady: true,
  cacheDir: '/tmp/ocr',
};

const SAMPLE_OCR_STATE_NOT_READY = {
  variant: 'full' as const,
  ready: false,
  bundleAvailable: false,
  runtimeCacheReady: false,
  cacheDir: '/tmp/ocr',
};

const SAMPLE_LLM_PROVIDER = {
  enabled: true,
  provider: 'api',
  api_base_url: 'http://localhost:11434',
  model: 'llama3',
  local_context_window: 8192,
  api_key_configured: true,
  api_key_preview: 'sk-...',
  configured: true,
  requires_api_key: true,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('App upload flow', () => {
  beforeEach(() => {
    // Use real timers — all async operations are handled by mocked promises
    // Mock window.slideforge to be absent (dev mode — backend auto-ready)
    delete (window as any).slideforge;

    // Silence console noise in tests
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});

    setupLocalStorage();

    // Default mock implementations
    mockGetOcrVariantState.mockResolvedValue(SAMPLE_OCR_STATE_READY);
    mockGetLlmProvider.mockResolvedValue(SAMPLE_LLM_PROVIDER);
    mockCreateSession.mockResolvedValue('session-abc');
    mockSetSessionLlmSettings.mockResolvedValue({});
    mockUploadDeck.mockResolvedValue({ document_fingerprint: 'fp-1', history_available: false });
    mockParseDeck.mockResolvedValue({ session_id: 'session-abc', slide_count: 2, status: 'parsed' });
    mockRunAnalysisWithPolling.mockResolvedValue(SAMPLE_ANALYSIS_RESULT);
    mockGetSlides.mockResolvedValue(SAMPLE_SLIDES_RESPONSE);
    mockGetSlideAnalysis.mockResolvedValue({ id: 'analysis-0', title: 'Slide 1', summary: 'Good slide', overallScore: 75, density: 'Medium', visuals: [], fixes: [], councilDebate: [], citationIssues: [] });
    mockGetScorecard.mockRejectedValue(new Error('No scorecard'));
    mockGetRuntimeAssetStatus.mockResolvedValue({ ocr: { phase: 'idle', message: '', download_active: false, download_required: false, offline_ready: true, bundled_seeded: true, cache_dir: '/tmp', tmp_dir: '/tmp', files: [], updated_at: null, layout_loaded: true, recognition_loaded: true, detector_loaded: true, foundation_loaded: true, cooldown_active: false, last_error: null }, download_active: false, download_required: false });
    mockGetRecentHistory.mockResolvedValue({ items: [] });
    mockGetDiagnostics.mockResolvedValue({ status: 'ok', timestamp: '2025-01-01T00:00:00Z', backend: { status: 'ready', pid: 1, uptime_seconds: 100, app_ready: true, active_sessions: 0, analysis_jobs: 0 }, startup: { model_warmup_state: 'ready', warmup_task_running: false, preflight: { overall: 'OK', timestamp: '2025-01-01T00:00:00Z', checks: [] } }, llm: { provider: 'api', configured: true, llm_available: true, providers: {} }, ocr: { state: 'loaded', phase: 'idle', offline_ready: true, cached_files: 0, loaded: { layout: true, recognition: true, detector: true, foundation: true } }, chromadb: { state: 'not_initialized', collections: null }, system: { disk: { ok: true }, memory: { ok: true } }, analysis: { last_run_at: null, last_status: 'idle', last_session_id: null, last_error: null } });
    mockGetOcrBackends.mockResolvedValue({
      device: { platform: 'windows', python_arch: 'amd64', cuda_available: false, cuda_device_name: null, cuda_vram_mb: null, mps_available: false, ram_total_mb: 16384, ram_available_mb: 8192, recommended_backend: 'doctr', recommended_reason: 'Best choice', all_supported_backends: ['doctr'] },
      active_backend: 'doctr',
      backends: [{ id: 'doctr', label: 'DocTR', description: 'Lightweight OCR', recommended_for: ['Text'], size_label: '~200 MB', min_ram_mb: 2048, ready: true, bytes_present: 200_000_000, bytes_required: 200_000_000, recommended: true, active: true, models: [] }],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (window as any).slideforge = originalSlideforge;
  });

  // ───── OCR setup flow ──────────────────────────────────────────────────────

  it('opens OCR setup modal when OCR variant state says not ready', async () => {
    mockGetOcrVariantState.mockResolvedValue(SAMPLE_OCR_STATE_NOT_READY);
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('OCR Setup')).toBeInTheDocument();
    });
    expect(screen.getByText('Choose an OCR Engine')).toBeInTheDocument();
  });

  it('does not open OCR setup modal when OCR is already ready', async () => {
    mockGetOcrVariantState.mockResolvedValue(SAMPLE_OCR_STATE_READY);
    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText('OCR Setup')).not.toBeInTheDocument();
    });
  });

  // ───── Upload flow: OCR ready path ─────────────────────────────────────────

  it('uploads a file successfully when OCR is ready', async () => {
    render(<App />);

    await waitFor(() => {
      expect(mockGetOcrVariantState).toHaveBeenCalled();
    });

    const fileInput = document.querySelector('#file-upload') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    const file = new File(['deck content'], 'test-deck.pptx', { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockGetLlmProvider).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mockSetSessionLlmSettings).toHaveBeenCalledWith('session-abc', 'api', null);
    });
    await waitFor(() => {
      expect(mockUploadDeck).toHaveBeenCalledWith('session-abc', file);
    });
    await waitFor(() => {
      expect(mockParseDeck).toHaveBeenCalledWith('session-abc');
    });
    await waitFor(() => {
      expect(mockRunAnalysisWithPolling).toHaveBeenCalledWith('session-abc', expect.objectContaining({ onProgress: expect.any(Function) }));
    });
    await waitFor(() => {
      expect(mockGetSlides).toHaveBeenCalledWith('session-abc');
    });
  });

  it('stores files and opens OCR modal when OCR is not ready', async () => {
    mockGetOcrVariantState.mockResolvedValue(SAMPLE_OCR_STATE_NOT_READY);
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('OCR Setup')).toBeInTheDocument();
    });
    expect(screen.getByText('Choose an OCR Engine')).toBeInTheDocument();
  });

  it('shows an error toast when upload fails', async () => {
    mockUploadDeck.mockRejectedValue(new Error('Upload rejected by server'));

    render(<App />);

    await waitFor(() => {
      expect(mockGetOcrVariantState).toHaveBeenCalled();
    });

    const fileInput = document.querySelector('#file-upload') as HTMLInputElement;
    const file = new File(['deck'], 'test.pptx', { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Upload Failed: Upload rejected by server/i)).toBeInTheDocument();
    });
  });

  it('shows an error toast when analysis fails', async () => {
    mockRunAnalysisWithPolling.mockRejectedValue(new Error('LLM provider unavailable'));

    render(<App />);

    await waitFor(() => {
      expect(mockGetOcrVariantState).toHaveBeenCalled();
    });

    const fileInput = document.querySelector('#file-upload') as HTMLInputElement;
    const file = new File(['deck'], 'test.pptx', { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Agent Analysis Failed: LLM provider unavailable/i)).toBeInTheDocument();
    });
  });

  it('handles upload cancellation and shows error toast', async () => {
    mockUploadDeck.mockRejectedValue(new Error('Upload was cancelled'));
    render(<App />);

    await waitFor(() => {
      expect(mockGetOcrVariantState).toHaveBeenCalled();
    });

    const fileInput = document.querySelector('#file-upload') as HTMLInputElement;
    const file = new File(['deck'], 'test.pptx', { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Upload Failed: Upload was cancelled/i)).toBeInTheDocument();
    });
  });

  // ───── Session restore ─────────────────────────────────────────────────────

  it('restores a previous session from localStorage', async () => {
    setupLocalStorage({
      slideforge_terms_accepted: 'true',
      slideforge_role: 'junior',
      slideforge_last_session: 'session-xyz',
    });
    mockGetScorecard.mockResolvedValue({
      composite_score: 80,
      annotations: [
        { slide_index: 0, text: 'Good', category: 'claim_grounding', severity: 'info', message: 'All good', suggestion: null },
      ],
      summary: 'Great analysis',
    });
    mockGetSlides.mockResolvedValue(SAMPLE_SLIDES_RESPONSE);
    mockGetSlideAnalysis.mockResolvedValue({ id: 'analysis-0', title: 'Slide 1', summary: 'Restored', overallScore: 80, density: 'Medium', visuals: [], fixes: [], councilDebate: [], citationIssues: [] });

    render(<App />);

    await waitFor(() => {
      expect(mockGetScorecard).toHaveBeenCalledWith('session-xyz');
    });

    await waitFor(() => {
      expect(mockGetSlides).toHaveBeenCalledWith('session-xyz');
    });
  });

  it('clears invalid session from localStorage on restore failure', async () => {
    const store: Record<string, string> = {
      slideforge_terms_accepted: 'true',
      slideforge_role: 'junior',
      slideforge_last_session: 'session-invalid',
    };
    const removeItemSpy = vi.fn((key: string) => { delete store[key]; });
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => store[key] ?? null),
        setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
        removeItem: removeItemSpy,
        clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
        get length() { return Object.keys(store).length; },
        key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
      },
      writable: true,
      configurable: true,
    });
    mockGetScorecard.mockRejectedValue(new Error('Session expired'));

    render(<App />);

    await waitFor(() => {
      expect(mockGetScorecard).toHaveBeenCalledWith('session-invalid');
    });

    await waitFor(() => {
      expect(removeItemSpy).toHaveBeenCalledWith('slideforge_last_session');
    });
  });

  // ───── API base bootstrapping ──────────────────────────────────────────────

  it('bootstraps API base from Electron when available', async () => {
    (window as any).slideforge = {
      getApiBase: vi.fn().mockResolvedValue('http://localhost:8002'),
    };

    render(<App />);

    await waitFor(() => {
      expect(mockSetApiBase).toHaveBeenCalledWith('http://localhost:8002');
    });
  });
});
