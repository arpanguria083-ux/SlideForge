import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { ToastProvider, useToast } from '../Toast';

// Helper component that consumes the toast context
const ToastConsumer: React.FC = () => {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.success('Success message')}>Show Success</button>
      <button onClick={() => toast.error('Error message')}>Show Error</button>
      <button onClick={() => toast.warning('Warning message')}>Show Warning</button>
      <button onClick={() => toast.info('Info message')}>Show Info</button>
      <button onClick={() => toast.showToast('success', 'Custom toast', 0)}>Show Custom</button>
    </div>
  );
};

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders children', () => {
    render(
      <ToastProvider>
        <div>Child content</div>
      </ToastProvider>
    );
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('shows a success toast when success() is called', () => {
    render(
      <ToastProvider>
        <ToastConsumer />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('Show Success'));
    expect(screen.getByText('Success message')).toBeInTheDocument();
  });

  it('shows an error toast when error() is called', () => {
    render(
      <ToastProvider>
        <ToastConsumer />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('Show Error'));
    expect(screen.getByText('Error message')).toBeInTheDocument();
  });

  it('shows a warning toast when warning() is called', () => {
    render(
      <ToastProvider>
        <ToastConsumer />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('Show Warning'));
    expect(screen.getByText('Warning message')).toBeInTheDocument();
  });

  it('shows an info toast when info() is called', () => {
    render(
      <ToastProvider>
        <ToastConsumer />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('Show Info'));
    expect(screen.getByText('Info message')).toBeInTheDocument();
  });

  it('auto-dismisses a toast after the default duration', () => {
    render(
      <ToastProvider>
        <ToastConsumer />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('Show Success'));
    expect(screen.getByText('Success message')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByText('Success message')).not.toBeInTheDocument();
  });

  it('does not auto-dismiss a toast with duration 0', () => {
    render(
      <ToastProvider>
        <ToastConsumer />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('Show Custom'));
    expect(screen.getByText('Custom toast')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(screen.getByText('Custom toast')).toBeInTheDocument();
  });

  it('removes toast when dismiss button is clicked', () => {
    render(
      <ToastProvider>
        <ToastConsumer />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('Show Success'));
    expect(screen.getByText('Success message')).toBeInTheDocument();

    // Find the dismiss button (X icon button inside the toast)
    const dismissButtons = screen.getAllByRole('button');
    // The last button should be the dismiss button of the toast
    const dismissBtn = dismissButtons[dismissButtons.length - 1];
    fireEvent.click(dismissBtn);

    expect(screen.queryByText('Success message')).not.toBeInTheDocument();
  });

  it('supports multiple simultaneous toasts', () => {
    render(
      <ToastProvider>
        <ToastConsumer />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('Show Success'));
    fireEvent.click(screen.getByText('Show Error'));
    fireEvent.click(screen.getByText('Show Warning'));

    expect(screen.getByText('Success message')).toBeInTheDocument();
    expect(screen.getByText('Error message')).toBeInTheDocument();
    expect(screen.getByText('Warning message')).toBeInTheDocument();
  });
});

describe('useToast hook', () => {
  it('throws when used outside ToastProvider', () => {
    // Suppress console.error from React error boundary
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // In React 18+, render errors are caught by React and logged to console.error.
    // Assert that console.error was called with the expected error message.
    expect(() => {
      render(<ToastConsumer />);
    }).toThrow('useToast must be used within ToastProvider');

    consoleError.mockRestore();
  });
});
