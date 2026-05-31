import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import AgenticFlowPanel from '../AgenticFlowPanel';
import type { DeepAnalysis } from '../../types';

const sampleDeep: DeepAnalysis = {
  agents: [
    { name: 'Insight Extractor', score: 90, summary: 'Extracts insights', findings: [] },
    {
      name: 'So What Test Agent',
      score: 45,
      summary: 'Assesses so what',
      findings: [
        {
          slide_index: 0,
          text: 'Missing action',
          category: 'so_what',
          severity: 'warning',
          message: 'No clear next step',
          suggestion: 'Add explicit action',
        },
      ],
    },
  ],
  judge: { name: 'Language Analysis', summary: '', findings: [] },
};

describe('AgenticFlowPanel', () => {
  it('renders agent list and allows rerun and JSON view', async () => {
    const rerun = vi.fn().mockResolvedValue(undefined);

    render(<AgenticFlowPanel sessionId="s1" slideIndex={0} deepAnalysis={sampleDeep} onRerunDeepAnalysis={rerun} />);

    // basic UI
    expect(screen.getByText('Agentic Flow')).toBeInTheDocument();
    expect(screen.getByText('Insight Extractor')).toBeInTheDocument();
    expect(screen.getByText('So What Test Agent')).toBeInTheDocument();

    // trigger rerun
    const rerunBtn = screen.getByText(/Re-run deep analysis/i);
    fireEvent.click(rerunBtn);
    await waitFor(() => expect(rerun).toHaveBeenCalled());

    // open JSON modal
    const viewJson = screen.getByText(/View JSON/i);
    fireEvent.click(viewJson);
    await waitFor(() => expect(screen.getByText(/Deep analysis JSON/i)).toBeInTheDocument());
  });
});
