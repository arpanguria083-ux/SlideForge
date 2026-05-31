export const severityMeta: Record<string, { label: string; badge: string; card: string }> = {
  hard_block: {
    label: 'Needs attention',
    badge: 'bg-rose-100 text-rose-700 border border-rose-200',
    card: 'border-rose-200 bg-rose-50',
  },
  warning: {
    label: 'Important',
    badge: 'bg-amber-100 text-amber-700 border border-amber-200',
    card: 'border-amber-200 bg-amber-50',
  },
  suggestion: {
    label: 'Polish',
    badge: 'bg-sky-50 text-sky-700 border border-sky-200',
    card: 'border-sky-200 bg-sky-50',
  },
  default: {
    label: 'Issue',
    badge: 'bg-slate-100 text-slate-700 border border-slate-200',
    card: 'border-slate-100 bg-slate-50',
  },
};

export const formatCategory = (value?: string) =>
  (value || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const sortAgentsByScore = <T extends { score?: number }>(agents?: T[]) => {
  if (!Array.isArray(agents)) return [] as T[];
  return [...agents].sort((a, b) => {
    const as = typeof a.score === 'number' ? a.score : -Infinity;
    const bs = typeof b.score === 'number' ? b.score : -Infinity;
    return bs - as;
  });
};

export const prettyJson = (obj: unknown) => JSON.stringify(obj, null, 2);
