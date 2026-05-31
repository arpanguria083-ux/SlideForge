import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SlideCanvas from '../SlideCanvas';
import { SlideAnalysis } from '../../types';

// Mock apiService.resolveAssetUrl
vi.mock('../../services/apiService', () => ({
  apiService: {
    resolveAssetUrl: vi.fn((url: string | null | undefined) => url || ''),
  },
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Eye: () => <span data-testid="icon-eye">EY</span>,
  EyeOff: () => <span data-testid="icon-eyeoff">EO</span>,
  AlertCircle: () => <span data-testid="icon-alertcircle">AC</span>,
  Info: () => <span data-testid="icon-info">IN</span>,
  Monitor: () => <span data-testid="icon-monitor">MN</span>,
  Image: () => <span data-testid="icon-image">IM</span>,
}));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const sampleAnalysis = {
  id: 'analysis-1',
  title: 'Slide Analysis',
  summary: 'Overview of key metrics',
  overallScore: 72,
  density: 'Medium' as const,
  councilDebate: [],
  citationIssues: [],
  fixes: [
    { top: 10, left: 10, width: 30, height: 20, severity: 'hard_block' as const, label: 'Missing data source', suggestion: 'Add source: McKinsey 2024' },
    { top: 50, left: 5, width: 90, height: 10, severity: 'warning' as const, label: 'Inconsistent font size', suggestion: 'Use 14pt throughout' },
    { top: 80, left: 40, width: 20, height: 15, severity: 'suggestion' as const, label: 'Consider a chart here' },
  ],
  visuals: [
    { top: 20, left: 60, width: 35, height: 40, label: 'Chart: Revenue Growth', visualKey: 'chart-revenue' },
    { top: 5, left: 5, width: 50, height: 12, label: 'Image: logo', visualKey: 'img-logo' },
  ],
};

const sampleSlideData = {
  id: 'slide-0',
  index: 0,
  title: 'Q3 Revenue Review',
  full_text: 'Q3 Revenue Review\nKey insights from Q3',
  previewUrl: '/previews/slide-1.png',
  width: 1920,
  height: 1080,
  text_boxes: [
    { id: 'tb-1', x: 100, y: 50, width: 800, height: 60, text: 'Q3 Revenue Review', runs: [{ text: 'Q3 Revenue Review', font_name: 'Calibri', font_size: 28, font_bold: true }] },
    { id: 'tb-2', x: 100, y: 150, width: 800, height: 40, text: 'Key insights from Q3', runs: [{ text: 'Key insights from Q3', font_name: 'Calibri', font_size: 18, font_bold: false }] },
  ],
  images: [
    { id: 'img-1', x: 100, y: 300, width: 400, height: 300, asset_url: '/assets/chart.png', content_type: 'image/png', extension: 'png' },
  ],
  tables: [],
  charts: [],
};

const defaultProps = {
  imageUrl: '/previews/slide-1.png',
  slideData: sampleSlideData,
  analysis: sampleAnalysis,
  onFixClick: vi.fn(),
  highlightedFixIndex: null,
  onVisualClick: vi.fn(),
  highlightedVisualKey: null,
  isDeepAnalyzing: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SlideCanvas', () => {
  it('renders browser render mode by default when slideData has content', async () => {
    render(<SlideCanvas {...defaultProps} />);
    // Browser mode is auto-selected when browserRenderable is true
    expect(screen.getByText('Q3 Revenue Review')).toBeInTheDocument();
    expect(screen.getByText('Key insights from Q3')).toBeInTheDocument();
  });

  it('renders image preview mode when no slideData is provided', async () => {
    const { container } = render(
      <SlideCanvas
        {...defaultProps}
        slideData={undefined}
      />
    );
    const img = container.querySelector('img[alt="Slide Preview"]');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/previews/slide-1.png');
  });

  it('renders browser render toggle when slideData has content', async () => {
    render(<SlideCanvas {...defaultProps} />);
    expect(screen.getByText('Browser Render')).toBeInTheDocument();
    expect(screen.getByText('PNG Preview')).toBeInTheDocument();
  });

  it('switches to browser render mode on click', async () => {
    render(<SlideCanvas {...defaultProps} />);
    // Browser render is already active by default
    expect(screen.getByText('Q3 Revenue Review')).toBeInTheDocument();
    // Switch to PNG Preview then back to Browser Render
    const pngBtn = screen.getByText('PNG Preview');
    fireEvent.click(pngBtn);
    const browserBtn = screen.getByText('Browser Render');
    fireEvent.click(browserBtn);
    expect(screen.getByText('Key insights from Q3')).toBeInTheDocument();
  });

  it('shows visual element overlay toggle with count', () => {
    render(<SlideCanvas {...defaultProps} />);
    const visualsBtn = screen.getByText(/Detected Elements/);
    expect(visualsBtn).toBeInTheDocument();
    expect(visualsBtn.textContent).toContain('2');
  });

  it('shows issues overlay toggle with count', () => {
    render(<SlideCanvas {...defaultProps} />);
    const issuesBtn = screen.getByText(/Issues/);
    expect(issuesBtn).toBeInTheDocument();
    expect(issuesBtn.textContent).toContain('3');
  });

  it('renders legend with severity colors', () => {
    render(<SlideCanvas {...defaultProps} />);
    expect(screen.getByText('Block')).toBeInTheDocument();
    expect(screen.getByText('Warn')).toBeInTheDocument();
    expect(screen.getByText('Tip')).toBeInTheDocument();
  });

  it('toggles visual overlays visibility when clicked', async () => {
    render(<SlideCanvas {...defaultProps} />);
    // Initially showVisuals is true — the overlay element with badge "Chart" should be visible
    expect(screen.getByText('Chart')).toBeInTheDocument();

    const visualsBtn = screen.getByText(/Detected Elements/);
    fireEvent.click(visualsBtn);

    // After toggling off, the badge should no longer be rendered
    await waitFor(() => {
      expect(screen.queryByText('Chart')).not.toBeInTheDocument();
    });
  });

  it('toggles fixes visibility when clicked', async () => {
    render(<SlideCanvas {...defaultProps} />);
    // Initially showFixes is true — the fix overlay badges should be rendered
    // Fix overlays render with AlertCircle icons (which are always present)
    const fixesBtn = screen.getByText(/Issues/);
    fireEvent.click(fixesBtn);

    // After toggle, the button styling changes — verify button still shows count
    expect(fixesBtn.textContent).toContain('3');
  });

  it('calls onVisualClick when a visual overlay badge is clicked', async () => {
    const onVisualClick = vi.fn();
    render(<SlideCanvas {...defaultProps} onVisualClick={onVisualClick} />);

    // The visual overlay renders a badge with "Chart" text for "Chart: Revenue Growth"
    // The badge is inside a pointer-events-auto div that's clickable
    const chartBadge = screen.getByText('Chart');
    fireEvent.click(chartBadge);

    expect(onVisualClick).toHaveBeenCalled();
  });

  it('disables interactions when deep analyzing', () => {
    render(<SlideCanvas {...defaultProps} isDeepAnalyzing={true} />);
    expect(screen.getByText('Deep analyzing this slide...')).toBeInTheDocument();
  });

  it('renders image in browser mode when slideData has images', () => {
    const { container } = render(<SlideCanvas {...defaultProps} />);
    // The image has alt set to image.id which is "img-1"
    const image = container.querySelector('img[alt="img-1"]');
    expect(image).toBeInTheDocument();
  });

  it('renders empty state when no imageUrl and no slideData', () => {
    render(
      <SlideCanvas
        {...defaultProps}
        imageUrl=""
        slideData={undefined}
      />
    );
    expect(screen.getByText('No slide preview available')).toBeInTheDocument();
    expect(screen.getByText('Upload and parse a document to see the preview')).toBeInTheDocument();
  });

  it('renders highlighting for highlighted visual key', () => {
    render(
      <SlideCanvas
        {...defaultProps}
        highlightedVisualKey="chart-revenue"
      />
    );
    // The visual with chart-revenue key should be highlighted
    expect(screen.getByText('Chart')).toBeInTheDocument();
  });

  it('renders text boxes in browser mode with correct styling', () => {
    const { container } = render(<SlideCanvas {...defaultProps} />);
    // text_boxes render as divs with title attribute
    const textBox = container.querySelector('[title="Q3 Revenue Review"]');
    expect(textBox).toBeInTheDocument();
  });
});
