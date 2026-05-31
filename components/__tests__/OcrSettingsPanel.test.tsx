import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import OcrSettingsPanel from '../OcrSettingsPanel';
import { apiService } from '../../services/apiService';

// Mock apiService
vi.mock('../../services/apiService', () => ({
  apiService: {
    getOcrBackends: vi.fn(),
    activateOcrBackend: vi.fn(),
    clearOcrCache: vi.fn(),
  },
}));

// Mock lucide-react icons used by OcrSettingsPanel
vi.mock('lucide-react', () => ({
  AlertCircle: () => <span data-testid="icon-alertcircle">AC</span>,
  AlertTriangle: () => <span data-testid="icon-alerttriangle">AT</span>,
  Apple: () => <span data-testid="icon-apple">AP</span>,
  CheckCircle2: () => <span data-testid="icon-checkcircle">CC</span>,
  ChevronRight: () => <span data-testid="icon-chevron">CR</span>,
  Cpu: () => <span data-testid="icon-cpu">CU</span>,
  Download: () => <span data-testid="icon-download">DL</span>,
  HardDrive: () => <span data-testid="icon-harddrive">HD</span>,
  Loader2: () => <span data-testid="icon-loader">LD</span>,
  Monitor: () => <span data-testid="icon-monitor">MN</span>,
  RefreshCw: () => <span data-testid="icon-refresh">RF</span>,
  Server: () => <span data-testid="icon-server">SV</span>,
  Trash2: () => <span data-testid="icon-trash">TR</span>,
  XCircle: () => <span data-testid="icon-xcircle">XC</span>,
  Zap: () => <span data-testid="icon-zap">ZP</span>,
}));

const mockBackendsData = {
  device: {
    platform: 'windows',
    ram_total_mb: 16384,
    cuda_available: false,
    mps_available: false,
    cuda_device_name: null,
    cuda_vram_mb: null,
    recommended_reason: 'DocTR is recommended for CPU-only systems',
  },
  active_backend: 'doctr',
  backends: [
    {
      id: 'doctr',
      label: 'DocTR',
      active: true,
      ready: true,
      recommended: true,
      description: 'Lightweight OCR for printed text',
      bytes_present: 160_000_000,
      bytes_required: 160_000_000,
    },
    {
      id: 'paddleocr',
      label: 'PaddleOCR',
      active: false,
      ready: false,
      recommended: false,
      description: 'Full-featured OCR for complex layouts',
      bytes_present: 0,
      bytes_required: 6_000_000_000,
    },
    {
      id: 'got_ocr2',
      label: 'GOT-OCR2',
      active: false,
      ready: true,
      recommended: false,
      description: 'Lightning-fast OCR',
      bytes_present: 580_000_000,
      bytes_required: 580_000_000,
    },
  ],
};

const defaultProps = {
  ocrJobId: null,
  ocrJobStatus: null,
  onStartDownload: vi.fn(),
  onCancelDownload: vi.fn(),
  onBackendActivated: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (apiService.getOcrBackends as ReturnType<typeof vi.fn>).mockResolvedValue(mockBackendsData);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OcrSettingsPanel', () => {
  it('renders panel header and fetches backends on mount', async () => {
    render(<OcrSettingsPanel {...defaultProps} />);
    expect(screen.getByText('OCR Engine')).toBeInTheDocument();
    expect(screen.getByText('Manage OCR Backends')).toBeInTheDocument();
    await waitFor(() => {
      expect(apiService.getOcrBackends).toHaveBeenCalledTimes(1);
    });
  });

  it('renders device info chip', async () => {
    render(<OcrSettingsPanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/windows/i)).toBeInTheDocument();
      expect(screen.getByText(/16 GB RAM/i)).toBeInTheDocument();
      expect(screen.getByText('CPU only')).toBeInTheDocument();
    });
  });

  it('shows recommended reason tip', async () => {
    render(<OcrSettingsPanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/DocTR is recommended/)).toBeInTheDocument();
    });
  });

  it('renders backend cards with labels and status', async () => {
    render(<OcrSettingsPanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('DocTR')).toBeInTheDocument();
      expect(screen.getByText('PaddleOCR')).toBeInTheDocument();
      expect(screen.getByText('GOT-OCR2')).toBeInTheDocument();
    });
    expect(screen.getByText('Recommended for your device')).toBeInTheDocument();
    // Active badge
    expect(screen.getByText('Active')).toBeInTheDocument();
    // Downloaded badge for GOT-OCR2 (ready but not active)
    expect(screen.getByText('Downloaded')).toBeInTheDocument();
  });

  it('shows Download button for backends that are not ready', async () => {
    render(<OcrSettingsPanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('PaddleOCR')).toBeInTheDocument();
    });
    const downloadButtons = screen.getAllByText('Download');
    expect(downloadButtons.length).toBe(1); // Only paddleocr needs download
  });

  it('shows Activate button for backends that are ready but not active', async () => {
    render(<OcrSettingsPanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('GOT-OCR2')).toBeInTheDocument();
    });
    const activateButtons = screen.getAllByText('Activate');
    expect(activateButtons.length).toBe(1); // Only GOT-OCR2 is ready but not active
  });

  it('shows Clear button for ready non-active backends', async () => {
    render(<OcrSettingsPanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('GOT-OCR2')).toBeInTheDocument();
    });
    const clearButtons = screen.getAllByText('Clear');
    expect(clearButtons.length).toBe(1); // Only GOT-OCR2 is ready and non-active
  });

  it('shows In use badge for active backend', async () => {
    render(<OcrSettingsPanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('In use')).toBeInTheDocument();
    });
  });

  it('calls apiService.activateOcrBackend and refreshes on Activate', async () => {
    (apiService.activateOcrBackend as ReturnType<typeof vi.fn>).mockResolvedValue({});
    render(<OcrSettingsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('GOT-OCR2')).toBeInTheDocument();
    });

    const activateBtn = screen.getByText('Activate');
    await act(async () => {
      fireEvent.click(activateBtn);
    });

    await waitFor(() => {
      expect(apiService.activateOcrBackend).toHaveBeenCalledWith('got_ocr2');
    });
    // Should refresh backends after activation
    // getOcrBackends was called on mount (1x) + after activation (1x) = 2x or more
    expect(apiService.getOcrBackends).toHaveBeenCalledTimes(2);
  });

  it('calls onStartDownload when download is clicked', async () => {
    const onStartDownload = vi.fn();
    render(<OcrSettingsPanel {...defaultProps} onStartDownload={onStartDownload} />);

    await waitFor(() => {
      expect(screen.getByText('PaddleOCR')).toBeInTheDocument();
    });

    const downloadBtn = screen.getByText('Download');
    await act(async () => {
      fireEvent.click(downloadBtn);
    });

    expect(onStartDownload).toHaveBeenCalledWith('paddleocr');
  });

  it('shows progress bar when a download job is running', async () => {
    render(
      <OcrSettingsPanel
        {...defaultProps}
        ocrJobId="paddleocr-job"
        ocrJobStatus={{ job_id: 'paddleocr-job', status: 'running', phase: 'downloading', backend_id: 'paddleocr', bytes_done: 1_500_000_000, bytes_total: 6_000_000_000, progress: 25, message: 'Downloading file 3 of 12', total: 100, download_active: true }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Downloading file 3 of 12/)).toBeInTheDocument();
    });
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('shows Cancel button during download', async () => {
    render(
      <OcrSettingsPanel
        {...defaultProps}
        ocrJobId="paddleocr-job"
        ocrJobStatus={{ job_id: 'paddleocr-job', status: 'running', phase: 'downloading', backend_id: 'paddleocr', bytes_done: 0, bytes_total: 100, progress: 0, message: 'Starting download...', total: 100, download_active: true }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  it('calls onCancelDownload when Cancel is clicked', async () => {
    const onCancelDownload = vi.fn();
    render(
      <OcrSettingsPanel
        {...defaultProps}
        onCancelDownload={onCancelDownload}
        ocrJobId="paddleocr-job"
        ocrJobStatus={{ job_id: 'paddleocr-job', status: 'running', phase: 'downloading', backend_id: 'paddleocr', bytes_done: 0, bytes_total: 100, progress: 0, message: 'Starting...', total: 100, download_active: true }}
      />
    );

    await waitFor(() => {
      const cancelBtn = screen.getByText('Cancel');
      fireEvent.click(cancelBtn);
    });

    expect(onCancelDownload).toHaveBeenCalled();
  });

  it('shows confirm clear cache dialog and clears on confirm', async () => {
    render(<OcrSettingsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('GOT-OCR2')).toBeInTheDocument();
    });

    // Click Clear button for GOT-OCR2
    const clearBtn = screen.getByText('Clear');
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.getByText(/Clear cache for got_ocr2/)).toBeInTheDocument();
    });

    // Click confirm button
    const confirmClearBtn = screen.getByText('Clear cache');
    await act(async () => {
      fireEvent.click(confirmClearBtn);
    });

    await waitFor(() => {
      expect(apiService.clearOcrCache).toHaveBeenCalledWith('got_ocr2');
    });
  });

  it('dismisses clear cache dialog on Cancel', async () => {
    render(<OcrSettingsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('GOT-OCR2')).toBeInTheDocument();
    });

    const clearBtn = screen.getByText('Clear');
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.getByText(/Clear cache for got_ocr2/)).toBeInTheDocument();
    });

    // Click Cancel
    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByText(/Clear cache for got_ocr2/)).not.toBeInTheDocument();
    });
  });

  it('shows loading skeleton while fetching for the first time', async () => {
    // Make the promise pending so loading state shows
    let resolvePromise: (value: unknown) => void;
    const pendingPromise = new Promise((resolve) => { resolvePromise = resolve; });
    (apiService.getOcrBackends as ReturnType<typeof vi.fn>).mockReturnValue(pendingPromise);

    render(<OcrSettingsPanel {...defaultProps} />);
    expect(screen.getByText(/Detecting device and loading backend status/)).toBeInTheDocument();

    // Resolve the promise
    await act(async () => {
      resolvePromise!(mockBackendsData);
    });
  });

  it('shows error state when fetch fails', async () => {
    (apiService.getOcrBackends as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Failed to reach backend'));
    render(<OcrSettingsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/Could not reach OCR service/)).toBeInTheDocument();
      expect(screen.getByText('Failed to reach backend')).toBeInTheDocument();
    });
  });

  it('retries fetch when Retry is clicked after error', async () => {
    (apiService.getOcrBackends as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('First failure'));
    render(<OcrSettingsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    // Now make the second call succeed
    (apiService.getOcrBackends as ReturnType<typeof vi.fn>).mockResolvedValue(mockBackendsData);
    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('DocTR')).toBeInTheDocument();
    });
  });

  it('renders storage summary with total cache size', async () => {
    render(<OcrSettingsPanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Total cache on disk/)).toBeInTheDocument();
    });
    // DocTR: 160 MB + PaddleOCR: 0 B + GOT-OCR2: 580 MB = 740 MB
    expect(screen.getByText('740 MB')).toBeInTheDocument();
  });

  it('renders pros/cons for each backend', async () => {
    render(<OcrSettingsPanel {...defaultProps} />);
    // DocTR has "Lightest" badge in BACKEND_META
    await waitFor(() => {
      expect(screen.getByText(/~160 MB download/)).toBeInTheDocument();
      expect(screen.getByText(/Runs on any CPU/)).toBeInTheDocument();
      expect(screen.getByText(/Lower accuracy on complex tables/)).toBeInTheDocument();
    });
  });
});
