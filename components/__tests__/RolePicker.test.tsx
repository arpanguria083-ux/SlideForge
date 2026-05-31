import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RolePicker from '../RolePicker';

describe('RolePicker', () => {
  it('renders both workspace options', () => {
    render(<RolePicker onSelect={() => {}} />);
    expect(screen.getByText('Consultant workspace')).toBeInTheDocument();
    expect(screen.getByText('Senior reviewer workspace')).toBeInTheDocument();
  });

  it('calls onSelect with "junior" when Consultant workspace is clicked', () => {
    const onSelect = vi.fn();
    render(<RolePicker onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Consultant workspace'));
    expect(onSelect).toHaveBeenCalledWith('junior');
  });

  it('calls onSelect with "senior" when Senior reviewer workspace is clicked', () => {
    const onSelect = vi.fn();
    render(<RolePicker onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Senior reviewer workspace'));
    expect(onSelect).toHaveBeenCalledWith('senior');
  });

  it('displays the role descriptions', () => {
    render(<RolePicker onSelect={() => {}} />);
    expect(screen.getByText(/Best for daily deck review/)).toBeInTheDocument();
    expect(screen.getByText(/Best for final QA/)).toBeInTheDocument();
  });

  it('shows the Approval controls badge on senior card', () => {
    render(<RolePicker onSelect={() => {}} />);
    expect(screen.getByText('Approval controls included')).toBeInTheDocument();
  });
});
