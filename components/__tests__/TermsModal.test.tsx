import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TermsModal from '../TermsModal';

describe('TermsModal', () => {
  it('returns null when open is false', () => {
    const { container } = render(<TermsModal open={false} accepted={false} onAccept={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders when open is true', () => {
    render(<TermsModal open={true} accepted={false} onAccept={() => {}} />);
    expect(screen.getByText('Terms and Privacy Notice')).toBeInTheDocument();
    expect(screen.getByText('I Accept')).toBeInTheDocument();
  });

  it('shows "Continue" instead of "I Accept" when already accepted', () => {
    render(<TermsModal open={true} accepted={true} onAccept={() => {}} />);
    expect(screen.getByText('Continue')).toBeInTheDocument();
    expect(screen.queryByText('I Accept')).not.toBeInTheDocument();
  });

  it('calls onAccept when the accept button is clicked', () => {
    const onAccept = vi.fn();
    render(<TermsModal open={true} accepted={false} onAccept={onAccept} />);
    fireEvent.click(screen.getByText('I Accept'));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('renders privacy and terms sections', () => {
    render(<TermsModal open={true} accepted={false} onAccept={() => {}} />);
    expect(screen.getByText('Privacy Notice')).toBeInTheDocument();
    expect(screen.getByText('Connectivity and Model Downloads')).toBeInTheDocument();
  });
});
