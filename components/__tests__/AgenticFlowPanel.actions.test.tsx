import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AgenticFlowPanel from '../AgenticFlowPanel';
import type { DeepAnalysis } from '../../types';
import { apiService } from '../../services/apiService';

const sampleDeep = {
  agents: [
    {
      name: 'So What Agent',
      score: 50,
      summary: 'summary',
      findings: [
        {
          slide_index: 0,
          text: 'Missing action',
          category: 'so_what',
          severity: 'warning',
          message: 'No clear next step',
          suggestion: 'Add explicit action',
          annotation_id: 'ann-1',
        },
      ],
    },
  ],
  judge: { name: 'Judge', summary: '', findings: [] },
} as unknown as DeepAnalysis;

describe('AgenticFlowPanel actions', () => {
  it('accepts and dismisses findings via apiService and triggers rerun', async () => {
    const acceptSpy = vi.spyOn(apiService, 'acceptFix').mockResolvedValue({} as any);
    const dismissSpy = vi.spyOn(apiService, 'dismissAnnotation').mockResolvedValue({} as any);
    const rerun = vi.fn().mockResolvedValue(undefined);

    // no prompt; we will interact with the dismiss modal

    render(<AgenticFlowPanel sessionId="s1" slideIndex={0} deepAnalysis={sampleDeep} onRerunDeepAnalysis={rerun} />);

    // expand the agent
    const expand = await screen.findByLabelText('Expand');
    fireEvent.click(expand);

    const acceptBtn = await screen.findByText('Accept');
    fireEvent.click(acceptBtn);

    await waitFor(() => expect(acceptSpy).toHaveBeenCalledWith('s1', 'ann-1'));
    expect(rerun).toHaveBeenCalled();

    const dismissBtn = screen.getByText('Dismiss');
    fireEvent.click(dismissBtn);

    // modal should appear
    await screen.findByText('Dismiss finding');
    const textarea = screen.getByPlaceholderText('Reason (optional)');
    fireEvent.change(textarea, { target: { value: 'test-reason' } });
    const confirm = screen.getByText('Confirm');
    fireEvent.click(confirm);

    await waitFor(() => expect(dismissSpy).toHaveBeenCalledWith('s1', 'ann-1', 'test-reason'));

    // restore
    acceptSpy.mockRestore();
    dismissSpy.mockRestore();
    // cleanup
  });
});
