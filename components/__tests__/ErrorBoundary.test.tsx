import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';

// Component that throws an error on demand
const Bomb: React.FC<{ shouldThrow?: boolean }> = ({ shouldThrow }) => {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div>Normal content</div>;
};

// Suppress console.error from React error boundary logging
let consoleSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Safe content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  it('catches errors and shows fallback UI', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test error message')).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('shows generic error message when no error message is provided', () => {
    const ThrowsNull: React.FC = () => {
      throw null;
    };

    render(
      <ErrorBoundary>
        <ThrowsNull />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument();
  });

  it('resets error state and re-renders children on "Try Again" click', () => {
    // Use a controlled flag so we can stop the bomb from throwing after reset
    let shouldThrow = true;
    const DynamicBomb: React.FC = () => {
      if (shouldThrow) throw new Error('Test error message');
      return <div>Recovered content</div>;
    };

    render(
      <ErrorBoundary>
        <DynamicBomb />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Stop the bomb from throwing BEFORE clicking Try Again,
    // so after reset the children render without errors
    shouldThrow = false;
    fireEvent.click(screen.getByText('Try Again'));

    expect(screen.getByText('Recovered content')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    const customFallback = <div>Custom error display</div>;
    render(
      <ErrorBoundary fallback={customFallback}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Custom error display')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('does not render dev-only stack trace in production', () => {
    const origNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.queryByText('Test error message')).toBeInTheDocument();
    // Stack trace pre element should not be visible in production
    expect(screen.queryByRole('region')).not.toBeInTheDocument();

    process.env.NODE_ENV = origNodeEnv;
  });
});
