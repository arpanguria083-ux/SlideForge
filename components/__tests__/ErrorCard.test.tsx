import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorCard from '../ErrorCard';

describe('ErrorCard', () => {
  it('renders title and body', () => {
    render(<ErrorCard title="Error Title" body="Something went wrong" />);
    expect(screen.getByText('Error Title')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders action buttons and calls onClick', () => {
    const handleClick = vi.fn();
    render(
      <ErrorCard
        title="Error"
        body="Body"
        actions={[{ label: 'Retry', onClick: handleClick }]}
      />
    );
    const retryBtn = screen.getByText('Retry');
    expect(retryBtn).toBeInTheDocument();
    fireEvent.click(retryBtn);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders action links with href', () => {
    render(
      <ErrorCard
        title="Error"
        body="Body"
        actions={[{ label: 'Docs', href: 'https://example.com/docs' }]}
      />
    );
    const link = screen.getByText('Docs');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', 'https://example.com/docs');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('renders multiple actions', () => {
    render(
      <ErrorCard
        title="Error"
        body="Body"
        actions={[
          { label: 'Retry', onClick: () => {} },
          { label: 'Docs', href: 'https://example.com' },
        ]}
      />
    );
    expect(screen.getByText('Retry')).toBeInTheDocument();
    expect(screen.getByText('Docs')).toBeInTheDocument();
  });

  it('renders context items', () => {
    render(
      <ErrorCard
        title="Error"
        body="Body"
        context={{
          requestId: 'req-123',
          status: 500,
          endpoint: '/api/test',
          timestamp: '2024-01-15T12:00:00Z',
        }}
      />
    );
    expect(screen.getByText(/request req-123/)).toBeInTheDocument();
    expect(screen.getByText(/status 500/)).toBeInTheDocument();
    expect(screen.getByText(/endpoint \/api\/test/)).toBeInTheDocument();
  });

  it('calls onCopyError when copy button is clicked', () => {
    const onCopy = vi.fn();
    render(
      <ErrorCard
        title="Error"
        body="Body"
        onCopyError={onCopy}
      />
    );
    const copyBtn = screen.getByText('Copy error');
    expect(copyBtn).toBeInTheDocument();
    fireEvent.click(copyBtn);
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it('applies custom className', () => {
    const { container } = render(
      <ErrorCard title="Error" body="Body" className="my-custom-class" />
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain('my-custom-class');
  });

  it('renders without actions or context', () => {
    render(<ErrorCard title="Simple Error" body="Just a message" />);
    expect(screen.getByText('Simple Error')).toBeInTheDocument();
    expect(screen.getByText('Just a message')).toBeInTheDocument();
    expect(screen.queryByText('Retry')).not.toBeInTheDocument();
    expect(screen.queryByText('Copy error')).not.toBeInTheDocument();
  });
});
