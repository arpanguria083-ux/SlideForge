import { describe, it, expect } from 'vitest';
import { formatCategory, sortAgentsByScore, prettyJson, severityMeta } from '../analysisUtils';

describe('analysisUtils', () => {
  it('formats categories correctly', () => {
    expect(formatCategory('claim_grounding')).toBe('Claim Grounding');
    expect(formatCategory(undefined)).toBe('');
  });

  it('sorts agents by score descending', () => {
    const agents = [{ score: 10 }, { score: 80 }, {}];
    const sorted = sortAgentsByScore(agents as any);
    expect(sorted[0].score).toBe(80);
    expect(sorted[1].score).toBe(10);
    expect(sorted[2].score).toBeUndefined();
  });

  it('prettyJson produces indented JSON', () => {
    expect(prettyJson({ a: 1 })).toContain('\n  "a": 1\n');
  });

  it('severityMeta contains expected labels', () => {
    expect(severityMeta.hard_block.label).toBe('Needs attention');
    expect(severityMeta.default.label).toBe('Issue');
  });
});
