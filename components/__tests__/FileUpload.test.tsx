import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import FileUpload from '../FileUpload';
import { apiService } from '../../services/apiService';

const MockApiError = vi.hoisted(() => {
  return class extends Error {
    status: number;
    code?: string;
    title?: string;
    hint?: string;

    constructor(
      message: string,
      status: number,
      details?: {
        code?: string;
        title?: string;
        hint?: string;
      }
    ) {
      super(message);
      this.status = status;
      this.code = details?.code;
      this.title = details?.title;
      this.hint = details?.hint;
    }
  };
});

// Mock the apiService
vi.mock('../../services/apiService', () => ({
  ApiError: MockApiError,
  apiService: {
    getLlmProvider: vi.fn(),
    getRecentHistory: vi.fn(),
    getDiagnostics: vi.fn(),
    getOcrBackends: vi.fn(),
    setLlmProvider: vi.fn(),
    testLlmConnection: vi.fn(),
  },
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  FileUp: () => <span data-testid="icon-fileup">FI</span>,
  Sparkles: () => <span data-testid="icon-sparkles">SP</span>,
  ShieldCheck: () => <span data-testid="icon-shield">SC</span>,
  ArrowRight: () => <span data-testid="icon-arrow">&rarr;</span>,
  Loader2: () => <span data-testid="icon-loader">LD</span>,
  CheckCircle2: () => <span data-testid="icon-check">CK</span>,
  AlertTriangle: () => <span data-testid="icon-alert">AT</span>,
  Settings2: () => <span data-testid="icon-settings">ST</span>,
  Server: () => <span data-testid="icon-server">SV</span>,
  FolderOpen: () => <span data-testid="icon-folder">FO</span>,
  Clock3: () => <span data-testid="icon-clock">CL</span>,
  KeyRound: () => <span data-testid="icon-key">KY</span>,
  Save: () => <span data-testid="icon-save">SA</span>,
  FileText: () => <span data-testid="icon-filetext">FT</span>,
  RefreshCcw: () => <span data-testid="icon-refresh">RF</span>,
  Copy: () => <span data-testid="icon-copy">CP</span>,
  ExternalLink: () => <span data-testid="icon-externallink">EL</span>,
}));

const defaultProviderConfig = {
  provider: 'api',
  configured: false,
  providers: {
    api: { configured: false, model: 'gpt-4.1-mini', api_base_url: 'https://api.openai.com/v1', api_key_preview: null, api_key_configured: false },
    ollama: { configured: false, model: 'llama3.1:8b', api_base_url: 'http://localhost:11434/v1', api_key_preview: null, api_key_configured: false },
    lm_studio: { configured: false, model: '', api_base_url: 'http://localhost:1234/v1', api_key_preview: null, api_key_configured: false },
  },
  local_context_window: 8192,
};

const mockBackends = {
  device: { platform: 'windows', ram_total_mb: 16384, cuda_available: false, mps_available: false, recommended_reason: 'doctr is recommended for CPU-only systems' },
  active_backend: 'doctr',
  backends: [
    { id: 'doctr', label: 'DocTR', active: true, ready: true, recommended: true, description: 'Lightweight OCR', bytes_present: 160_000_000, bytes_required: 160_000_000 },
    { id: 'paddleocr', label: 'PaddleOCR', active: false, ready: false, recommended: false, description: 'Full-featured OCR', bytes_present: 0, bytes_required: 6_000_000_000 },
    { id: 'got_ocr2', label: 'GOT-OCR2', active: false, ready: false, recommended: false, description: 'Heavy OCR', bytes_present: 0, bytes_required: 580_000_000 },
  ],
  device_recommendation: 'doctr',
  variant: 'full',
};

const mockHistory = {
  items: [
    { fingerprint: 'fp-1', original_filename: 'Q3 Review.pptx', slide_count: 15, composite_score: 72, warning_count: 1, hard_block_count: 1, updated_at: new Date(Date.now() - 3600000).toISOString() },
    { fingerprint: 'fp-2', original_filename: 'Strategy Memo.pdf', slide_count: 8, composite_score: 85, warning_count: 1, hard_block_count: 0, updated_at: new Date(Date.now() - 7200000).toISOString() },
  ],
};

const defaultProps = {
  onUpload: vi.fn(),
  isProcessing: false,
  processingStatus: null,
  progressLabel: null,
  onError: vi.fn(),
  onOpenHistory: vi.fn(),
  onOpenDiagnostics: vi.fn(),
  onOpenOcrSetup: vi.fn(),
  onRequestOcrDownload: vi.fn(),
  ocrJobId: null,
  ocrJobStatus: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  (apiService.getLlmProvider as ReturnType<typeof vi.fn>).mockResolvedValue(defaultProviderConfig);
  (apiService.getRecentHistory as ReturnType<typeof vi.fn>).mockResolvedValue(mockHistory);
  (apiService.getDiagnostics as ReturnType<typeof vi.fn>).mockResolvedValue({
    backend: { status: 'healthy' },
    ocr: { state: 'ready' },
    startup: { model_warmup_state: 'ready' },
    analysis: { last_status: 'idle' },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FileUpload', () => {
  it('renders the upload heading and highlights', async () => {
    render(<FileUpload {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('SlideForge')).toBeInTheDocument());
    expect(screen.getByText(/Upload a deck/)).toBeInTheDocument();
    expect(screen.getByText('Upload once')).toBeInTheDocument();
    expect(screen.getByText('Review in order')).toBeInTheDocument();
    expect(screen.getByText('Package confidently')).toBeInTheDocument();
  });

  it('renders drag-and-drop zone with file input', async () => {
    render(<FileUpload {...defaultProps} />);
    await waitFor(() => {
      const fileInput = document.querySelector('#file-upload') as HTMLInputElement;
      expect(fileInput).toBeInTheDocument();
      expect(fileInput.getAttribute('accept')).toContain('application/pdf');
      expect(fileInput.getAttribute('accept')).toContain('.pptx');
    });
    expect(screen.getByText(/Drop a client deck here/)).toBeInTheDocument();
  });

  it('shows processing state when isProcessing is true', async () => {
    render(<FileUpload {...defaultProps} isProcessing={true} />);
    await waitFor(() => {
      expect(screen.getByText(/Preparing your review workspace/)).toBeInTheDocument();
    });
    expect(screen.getByTestId('icon-loader')).toBeInTheDocument();
  });

  it('renders provider settings section with dropdown', async () => {
    render(<FileUpload {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Choose where SlideForge runs analysis/)).toBeInTheDocument();
    });
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    const cloudAi = screen.getAllByText('Cloud AI');
    expect(cloudAi.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Ollama')).toBeInTheDocument();
    expect(screen.getByText('LM Studio')).toBeInTheDocument();
  });

  it('shows API base URL and model inputs for cloud provider', async () => {
    render(<FileUpload {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('https://api.openai.com/v1')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('gpt-4.1-mini')).toBeInTheDocument();
    // API key input exists
    expect(screen.getByPlaceholderText(/Paste the cloud API key/)).toBeInTheDocument();
  });

  it('shows local context window for Ollama provider', async () => {
    render(<FileUpload {...defaultProps} />);
    await waitFor(() => expect(screen.getByDisplayValue('https://api.openai.com/v1')).toBeInTheDocument());

    // Switch to Ollama
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'ollama' } });

    await waitFor(() => {
      expect(screen.getByDisplayValue('http://localhost:11434/v1')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('llama3.1:8b')).toBeInTheDocument();
    // API key input should still exist (optional for local)
    expect(screen.getByPlaceholderText(/Optional unless your local server/)).toBeInTheDocument();
    // Context window input should be visible
    expect(screen.getByText(/Local context window/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('8192')).toBeInTheDocument();
  });

  it('calls onUpload when file is selected via input', async () => {
    const onUpload = vi.fn();
    render(<FileUpload {...defaultProps} onUpload={onUpload} />);
    await waitFor(() => {
      expect(document.querySelector('#file-upload')).toBeInTheDocument();
    });

    const fileInput = document.querySelector('#file-upload') as HTMLInputElement;
    const file = new File(['test'], 'test.pptx', { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });
    expect(onUpload).toHaveBeenCalledWith([file]);
  });

  it('calls onError for unsupported file format', async () => {
    const onError = vi.fn();
    render(<FileUpload {...defaultProps} onError={onError} />);
    await waitFor(() => {
      expect(document.querySelector('#file-upload')).toBeInTheDocument();
    });

    const fileInput = document.querySelector('#file-upload') as HTMLInputElement;
    const file = new File(['test'], 'test.txt', { type: 'text/plain' });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });
    expect(onError).toHaveBeenCalledWith('Unsupported format. Upload a PDF or PPTX deck.');
  });

  it('calls onUpload on drop of valid file', async () => {
    const onUpload = vi.fn();
    render(<FileUpload {...defaultProps} onUpload={onUpload} />);
    await waitFor(() => {
      expect(screen.getByText(/Drop a client deck here/)).toBeInTheDocument();
    });

    const dropZone = screen.getByText(/Drop a client deck here/).closest('div[class*="overflow-hidden"]')!;
    const file = new File(['test'], 'deck.pdf', { type: 'application/pdf' });

    await act(async () => {
      fireEvent.dragOver(dropZone);
      fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    });
    expect(onUpload).toHaveBeenCalledWith([file]);
  });

  it('disables file input during processing', async () => {
    render(<FileUpload {...defaultProps} isProcessing={true} />);
    await waitFor(() => {
      const fileInput = document.querySelector('#file-upload') as HTMLInputElement;
      expect(fileInput).toBeDisabled();
    });
  });

  it('renders OCR status card with processing status', async () => {
    render(
      <FileUpload
        {...defaultProps}
        isProcessing={true}
        processingStatus={{
          ocr: { phase: 'downloading', message: 'Downloading PaddleOCR (~6 GB)', download_active: true, download_required: true, offline_ready: false, bundled_seeded: false, cache_dir: null, tmp_dir: null, files: [{ name: 'paddleocr.zip', relative_path: 'ocr/paddleocr.zip', size_bytes: 6_000_000_000, modified_at: Date.now() }], updated_at: null, layout_loaded: false, recognition_loaded: false, detector_loaded: false, foundation_loaded: false, cooldown_active: false, last_error: null },
          download_active: true,
          download_required: true,
        }}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/Downloading OCR assets/)).toBeInTheDocument();
      const statusMessages = screen.getAllByText('Downloading PaddleOCR (~6 GB)');
      expect(statusMessages.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('First-run download')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument(); // cached asset count
    });
  });

  it('renders recent history section', async () => {
    render(<FileUpload {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Q3 Review.pptx')).toBeInTheDocument();
      expect(screen.getByText('Strategy Memo.pdf')).toBeInTheDocument();
    });
    // Q3 has warning_count=1 + hard_block_count=1 = 2 open items
    expect(screen.getByText(/2 open items/)).toBeInTheDocument();
    expect(screen.getByText(/15 slides/)).toBeInTheDocument();
    expect(screen.getByText(/8 slides/)).toBeInTheDocument();
  });

  it('calls onOpenHistory when clicking a history item', async () => {
    const onOpenHistory = vi.fn();
    render(<FileUpload {...defaultProps} onOpenHistory={onOpenHistory} />);
    await waitFor(() => {
      expect(screen.getByText('Q3 Review.pptx')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Q3 Review.pptx'));
    expect(onOpenHistory).toHaveBeenCalledWith('fp-1');
  });

  it('renders empty history state when no items', async () => {
    (apiService.getRecentHistory as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
    render(<FileUpload {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('No saved reviews yet')).toBeInTheDocument();
    });
  });

  it('renders error structured via ErrorCard', async () => {
    // Set settingsState to 'error' by triggering a save failure
    (apiService.setLlmProvider as ReturnType<typeof vi.fn>).mockRejectedValue(
      new MockApiError('Connection refused', 500, { title: 'Save Failed', hint: 'Check your endpoint URL' })
    );

    render(<FileUpload {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('SlideForge')).toBeInTheDocument());

    // Make provider dirty by changing the API base URL input
    const apiUrlInput = screen.getByDisplayValue('https://api.openai.com/v1');
    fireEvent.change(apiUrlInput, { target: { value: 'https://custom.openai.com/v1' } });

    // Now click Save & test to trigger saveProviderConfig which calls setLlmProvider
    const saveButton = screen.getByText('Save & test');
    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/Save Failed/)).toBeInTheDocument();
      expect(screen.getByText(/Check your endpoint URL/)).toBeInTheDocument();
    });
  });

  it('renders diagnostics button and can refresh', async () => {
    const onOpenDiagnostics = vi.fn();
    render(<FileUpload {...defaultProps} onOpenDiagnostics={onOpenDiagnostics} />);
    await waitFor(() => {
      expect(screen.getByText('Open diagnostics')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Open diagnostics'));
    expect(onOpenDiagnostics).toHaveBeenCalled();
  });

  it('renders OCR engine section with backend status', async () => {
    (apiService.getOcrBackends as ReturnType<typeof vi.fn>).mockResolvedValue(mockBackends);
    render(<FileUpload {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('DocTR')).toBeInTheDocument();
    });
    expect(screen.getByText('Manage')).toBeInTheDocument();
  });

  it('shows Configured vs Not configured badge based on provider state', async () => {
    const configuredConfig = {
      ...defaultProviderConfig,
      providers: {
        ...defaultProviderConfig.providers,
        api: { ...defaultProviderConfig.providers.api, configured: true, api_key_configured: true },
      },
    };
    (apiService.getLlmProvider as ReturnType<typeof vi.fn>).mockResolvedValue(configuredConfig);
    render(<FileUpload {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Configured')).toBeInTheDocument();
    });
  });
});
