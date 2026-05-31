import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import StartupOverlay from '../StartupOverlay';

describe('StartupOverlay', () => {
  beforeEach(() => {
    // Set up window.slideforge mock
    Object.defineProperty(window, 'slideforge', {
      value: {
        onBackendPhase: vi.fn().mockReturnValue(vi.fn()),
        onBackendReady: vi.fn(),
        onBackendError: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as any).slideforge;
  });

  it('renders the initial loading state', () => {
    render(<StartupOverlay />);
    expect(screen.getByText('SlideForge AI')).toBeInTheDocument();
    expect(screen.getByText('Initializing...')).toBeInTheDocument();
    expect(screen.getByText('Starting backend...')).toBeInTheDocument();
  });

  it('shows elapsed seconds increasing', () => {
    render(<StartupOverlay />);
    expect(screen.getByText(/Elapsed: 0s/)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText(/Elapsed: 2s/)).toBeInTheDocument();
  });

  it('shows first-run note about model loading', () => {
    render(<StartupOverlay />);
    expect(screen.getByText(/First run may take 60–120 seconds/)).toBeInTheDocument();
  });

  it('adds backend phase messages to the log', () => {
    render(<StartupOverlay />);

    const onBackendPhase = (window as any).slideforge.onBackendPhase;
    const phaseCallback = onBackendPhase.mock.calls[0][0];

    act(() => {
      phaseCallback('Loading model...');
    });

    expect(screen.getByText('Starting backend...')).toBeInTheDocument();
    expect(screen.getByText('Loading model...')).toBeInTheDocument();
  });

  it('shows APP_READY message with green styling', () => {
    render(<StartupOverlay />);

    const onBackendPhase = (window as any).slideforge.onBackendPhase;
    const phaseCallback = onBackendPhase.mock.calls[0][0];

    act(() => {
      phaseCallback('APP_READY');
    });

    expect(screen.getByText('APP_READY')).toBeInTheDocument();
    expect(screen.getByText('Backend ready, finishing initialization...')).toBeInTheDocument();
  });

  it('shows error state when backend error occurs', () => {
    render(<StartupOverlay />);

    const onBackendError = (window as any).slideforge.onBackendError;
    const errorCallback = onBackendError.mock.calls[0][0];

    act(() => {
      errorCallback('Connection refused: server not reachable');
    });

    expect(screen.getByText('Connection refused: server not reachable')).toBeInTheDocument();
    expect(screen.getByText('Restart the App')).toBeInTheDocument();
  });

  it('calls onReady when backend becomes ready', () => {
    const onReady = vi.fn();
    render(<StartupOverlay onReady={onReady} />);

    const onBackendReady = (window as any).slideforge.onBackendReady;
    const readyCallback = onBackendReady.mock.calls[0][0];

    act(() => {
      readyCallback();
    });

    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('cleans up subscriptions on unmount', () => {
    const unsubscribePhase = vi.fn();
    (window as any).slideforge.onBackendPhase.mockReturnValue(unsubscribePhase);
    (window as any).slideforge.onBackendReady = vi.fn();
    (window as any).slideforge.onBackendError = vi.fn();

    const { unmount } = render(<StartupOverlay />);
    unmount();

    expect(unsubscribePhase).toHaveBeenCalledTimes(1);
  });

  it('renders error messages with red styling', () => {
    render(<StartupOverlay />);

    const onBackendPhase = (window as any).slideforge.onBackendPhase;
    const phaseCallback = onBackendPhase.mock.calls[0][0];

    act(() => {
      phaseCallback('Error: Model failed to load');
    });

    const errorMsg = screen.getByText('Error: Model failed to load');
    expect(errorMsg).toBeInTheDocument();
  });
});
