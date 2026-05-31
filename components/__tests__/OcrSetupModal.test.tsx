import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import OcrSetupModal from '../OcrSetupModal';
import type { OcrBackendsResponse, OcrJobStatus } from '../../types';

// ── vi.hoisted() is REQUIRED because vi.mock factories are hoisted ────────────

const { mockGetOcrBackends, mockStartOcrDownload } = vi.hoisted(() => ({
  mockGetOcrBackends: vi.fn(),
  mockStartOcrDownload: vi.fn(),
}));

vi.mock('../../services/apiService', () => ({
  apiService: {
    getOcrBackends: mockGetOcrBackends,
    startOcrDownload: mockStartOcrDownload,
  },
}));

// ── Sample fixture ───────────────────────────────────────────────────────────

const SAMPLE_BACKENDS_RESPONSE: OcrBackendsResponse = {
  device: {
    platform: 'windows',
    python_arch: 'amd64',
    cuda_available: false,
    cuda_device_name: null,
    cuda_vram_mb: null,
    mps_available: false,
    ram_total_mb: 16384,
    ram_available_mb: 8192,
    recommended_backend: 'doctr',
    recommended_reason: 'Best for your CPU-only system',
    all_supported_backends: ['paddleocr', 'got_ocr2', 'doctr'],
  },
  active_backend: 'doctr',
  backends: [
    {
      id: 'paddleocr',
      label: 'PaddleOCR',
      description: 'High-accuracy OCR engine',
      recommended_for: ['Tables', 'Formulas'],
      size_label: '~900 MB',
      min_ram_mb: 4096,
      ready: false,
      bytes_present: 0,
      bytes_required: 900_000_000,
      models: [],
    },
    {
      id: 'got_ocr2',
      label: 'GOT-OCR2',
      description: 'End-to-end OCR model',
      recommended_for: ['Equations', 'Charts'],
      size_label: '~1.4 GB',
      min_ram_mb: 8192,
      ready: false,
      bytes_present: 0,
      bytes_required: 1_400_000_000,
      models: [],
    },
    {
      id: 'doctr',
      label: 'DocTR',
      description: 'Lightweight OCR engine',
      recommended_for: ['Printed text', 'Forms'],
      size_label: '~200 MB',
      min_ram_mb: 2048,
      ready: false,
      bytes_present: 0,
      bytes_required: 200_000_000,
      recommended: true,
      active: false,
      models: [],
    },
  ],
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('OcrSetupModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when open is false', () => {
    const { container } = render(
      <OcrSetupModal
        open={false}
        ready={false}
        onDownload={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows the modal header when open', () => {
    render(
      <OcrSetupModal
        open={true}
        ready={false}
        onDownload={vi.fn()}
      />
    );
    expect(screen.getByText('OCR Setup')).toBeInTheDocument();
    expect(screen.getByText('Choose an OCR Engine')).toBeInTheDocument();
  });

  it('shows a loading indicator while backends are being fetched', () => {
    mockGetOcrBackends.mockReturnValue(new Promise<never>(() => {}));
    render(
      <OcrSetupModal
        open={true}
        ready={false}
        onDownload={vi.fn()}
      />
    );
    expect(screen.getByText(/Detecting your device/i)).toBeInTheDocument();
  });

  it('shows an error state when fetching backends fails', async () => {
    mockGetOcrBackends.mockRejectedValue(new Error('Network error'));
    render(
      <OcrSetupModal
        open={true}
        ready={false}
        onDownload={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Could not reach the OCR service')).toBeInTheDocument();
    });
    expect(screen.getByText('Network error')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('renders backend cards when backends are loaded', async () => {
    mockGetOcrBackends.mockResolvedValue(SAMPLE_BACKENDS_RESPONSE);
    render(
      <OcrSetupModal
        open={true}
        ready={false}
        onDownload={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Available Engines')).toBeInTheDocument();
    });
    expect(screen.getByText('PaddleOCR')).toBeInTheDocument();
    expect(screen.getByText('GOT-OCR2')).toBeInTheDocument();
    expect(screen.getByText('DocTR')).toBeInTheDocument();
  });

  it('shows device info when backends are loaded', async () => {
    mockGetOcrBackends.mockResolvedValue(SAMPLE_BACKENDS_RESPONSE);
    render(
      <OcrSetupModal
        open={true}
        ready={false}
        onDownload={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Your Device')).toBeInTheDocument();
    });
    expect(screen.getByText('windows')).toBeInTheDocument();
    expect(screen.getByText(/16 GB RAM/)).toBeInTheDocument();
    expect(screen.getByText(/Best for your CPU-only system/)).toBeInTheDocument();
  });

  it('shows recommended badge on the recommended backend', async () => {
    mockGetOcrBackends.mockResolvedValue(SAMPLE_BACKENDS_RESPONSE);
    render(
      <OcrSetupModal
        open={true}
        ready={false}
        onDownload={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Recommended')).toBeInTheDocument();
    });
  });

  it('renders download buttons for backends that are not ready', async () => {
    mockGetOcrBackends.mockResolvedValue(SAMPLE_BACKENDS_RESPONSE);
    render(
      <OcrSetupModal
        open={true}
        ready={false}
        onDownload={vi.fn()}
      />
    );
    await waitFor(() => {
      const downloadBtns = screen.getAllByText('Download');
      expect(downloadBtns.length).toBeGreaterThan(0);
    });
  });

  it('calls onDownload when a download button is clicked', async () => {
    mockGetOcrBackends.mockResolvedValue(SAMPLE_BACKENDS_RESPONSE);
    const onDownload = vi.fn();
    render(
      <OcrSetupModal
        open={true}
        ready={false}
        onDownload={onDownload}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Available Engines')).toBeInTheDocument();
    });

    const downloadBtns = screen.getAllByText('Download');
    fireEvent.click(downloadBtns[0]);
    expect(onDownload).toHaveBeenCalledWith(expect.any(String));
  });

  it('shows a close button when onClose is provided', async () => {
    mockGetOcrBackends.mockResolvedValue(SAMPLE_BACKENDS_RESPONSE);
    const onClose = vi.fn();
    render(
      <OcrSetupModal
        open={true}
        ready={false}
        onDownload={vi.fn()}
        onClose={onClose}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Skip for now')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Skip for now'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows "Close" button when OCR is ready', async () => {
    mockGetOcrBackends.mockResolvedValue(SAMPLE_BACKENDS_RESPONSE);
    const onClose = vi.fn();
    render(
      <OcrSetupModal
        open={true}
        ready={true}
        onDownload={vi.fn()}
        onClose={onClose}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Close')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders a ready badge for backends that are ready', async () => {
    const responseWithReady: OcrBackendsResponse = {
      ...SAMPLE_BACKENDS_RESPONSE,
      backends: SAMPLE_BACKENDS_RESPONSE.backends.map((b) =>
        b.id === 'doctr' ? { ...b, ready: true } : b
      ),
    };
    mockGetOcrBackends.mockResolvedValue(responseWithReady);
    render(
      <OcrSetupModal
        open={true}
        ready={true}
        onDownload={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Ready')).toBeInTheDocument();
    });
  });

  it('shows a running download progress bar when jobStatus is running', async () => {
    mockGetOcrBackends.mockResolvedValue(SAMPLE_BACKENDS_RESPONSE);
    const jobStatus: OcrJobStatus = {
      job_id: 'job-1',
      status: 'running',
      phase: 'downloading',
      message: 'Downloading model files…',
      progress: 50,
      total: 100,
      bytes_done: 100_000_000,
      bytes_total: 200_000_000,
      backend_id: 'paddleocr',
    };
    render(
      <OcrSetupModal
        open={true}
        ready={false}
        onDownload={vi.fn()}
        jobId="job-1"
        jobStatus={jobStatus}
        onCancel={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/Downloading model files/i)).toBeInTheDocument();
    });
    // Two Cancel buttons exist: sticky banner + card — verify at least one is present
    expect(screen.getAllByText('Cancel').length).toBeGreaterThanOrEqual(1);
  });

  it('calls onCancel when the cancel button is clicked on running job', async () => {
    mockGetOcrBackends.mockResolvedValue(SAMPLE_BACKENDS_RESPONSE);
    const onCancel = vi.fn();
    const jobStatus: OcrJobStatus = {
      job_id: 'job-1',
      status: 'running',
      phase: 'downloading',
      message: 'Downloading…',
      progress: 50,
      total: 100,
      backend_id: 'paddleocr',
    };
    render(
      <OcrSetupModal
        open={true}
        ready={false}
        onDownload={vi.fn()}
        jobId="job-1"
        jobStatus={jobStatus}
        onCancel={onCancel}
      />
    );
    const cancelBtns = screen.getAllByText('Cancel');
    expect(cancelBtns.length).toBeGreaterThan(0);
    // Click the last Cancel button (the one inside the card, not the sticky banner)
    fireEvent.click(cancelBtns[cancelBtns.length - 1]);
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows completed job status message', async () => {
    mockGetOcrBackends.mockResolvedValue(SAMPLE_BACKENDS_RESPONSE);
    const jobStatus: OcrJobStatus = {
      job_id: 'job-1',
      status: 'completed',
      phase: 'done',
      message: 'Download complete',
      progress: 100,
      total: 100,
      backend_id: 'paddleocr',
    };
    render(
      <OcrSetupModal
        open={true}
        ready={false}
        onDownload={vi.fn()}
        jobId="job-1"
        jobStatus={jobStatus}
      />
    );
    await waitFor(() => {
      expect(
        screen.getByText(/OCR engine downloaded and ready/i)
      ).toBeInTheDocument();
    });
  });

  it('shows failed job error message', async () => {
    mockGetOcrBackends.mockResolvedValue(SAMPLE_BACKENDS_RESPONSE);
    const jobStatus: OcrJobStatus = {
      job_id: 'job-1',
      status: 'failed',
      phase: 'error',
      message: 'Connection lost',
      progress: 0,
      total: 0,
      error: 'Network timeout',
      backend_id: 'paddleocr',
    };
    render(
      <OcrSetupModal
        open={true}
        ready={false}
        onDownload={vi.fn()}
        jobId="job-1"
        jobStatus={jobStatus}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/Download failed: Network timeout/i)).toBeInTheDocument();
    });
  });

  it('uses provided backendsData instead of fetching', async () => {
    const onDownload = vi.fn();
    const { rerender } = render(
      <OcrSetupModal
        open={true}
        ready={false}
        onDownload={onDownload}
        backendsData={SAMPLE_BACKENDS_RESPONSE}
      />
    );
    expect(mockGetOcrBackends).not.toHaveBeenCalled();
    expect(await screen.findByText('PaddleOCR')).toBeInTheDocument();
    expect(screen.getByText('DocTR')).toBeInTheDocument();

    const downloadBtns = screen.getAllByText('Download');
    fireEvent.click(downloadBtns[0]);
    expect(onDownload).toHaveBeenCalled();

    const onClose = vi.fn();
    rerender(
      <OcrSetupModal
        open={true}
        ready={false}
        onDownload={onDownload}
        backendsData={SAMPLE_BACKENDS_RESPONSE}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByText('Skip for now'));
    expect(onClose).toHaveBeenCalled();
  });

  it('fetches backends only when open becomes true', () => {
    mockGetOcrBackends.mockReturnValue(new Promise<never>(() => {}));
    const { rerender } = render(
      <OcrSetupModal
        open={false}
        ready={false}
        onDownload={vi.fn()}
      />
    );
    expect(mockGetOcrBackends).not.toHaveBeenCalled();

    rerender(
      <OcrSetupModal
        open={true}
        ready={false}
        onDownload={vi.fn()}
      />
    );
    expect(mockGetOcrBackends).toHaveBeenCalledTimes(1);
  });
});
