import React, { useState } from 'react';
import { DeepAnalysis, DeepAgentReview } from '../types';
import { Bot, RefreshCcw, Copy, ChevronDown, ChevronUp, X } from 'lucide-react';
import { severityMeta, formatCategory, sortAgentsByScore, prettyJson } from './analysisUtils';
import { apiService } from '../services/apiService';

interface AgenticFlowPanelProps {
  sessionId: string;
  slideIndex: number;
  deepAnalysis?: DeepAnalysis | null;
  onRerunDeepAnalysis: () => Promise<void>;
}

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.focus();
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      return true;
    } catch {
      return false;
    }
  }
};

const AgentRow: React.FC<{
  agent: DeepAgentReview;
  defaultOpen?: boolean;
  sessionId?: string | null;
  slideIndex?: number;
  onActionComplete?: () => void;
}> = ({ agent, defaultOpen = false, sessionId, slideIndex, onActionComplete }) => {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const [showDismissModal, setShowDismissModal] = useState(false);
  const [dismissReason, setDismissReason] = useState('');
  const [pendingAnnotation, setPendingAnnotation] = useState<string | null>(null);

  const scoreTone = (score?: number) => {
    if (typeof score !== 'number') return 'bg-slate-100 text-slate-700 border border-slate-200';
    if (score >= 80) return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
    if (score >= 40) return 'bg-amber-100 text-amber-700 border border-amber-200';
    return 'bg-rose-100 text-rose-700 border border-rose-200';
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-800">{agent.name}</div>
          <div className="text-xs text-slate-500 mt-1">{agent.summary}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`text-xs font-bold px-2 py-1 rounded-full ${scoreTone(agent.score)}`}>Score {agent.score ?? '-'}</div>
          <button
            onClick={() => setOpen((v) => !v)}
            className="p-2 rounded-md text-slate-600 hover:bg-slate-50"
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          {(agent.findings || []).map((f, idx) => {
            const meta = severityMeta[f.severity || ''] || severityMeta.default;
            const annotationId = (f as any).annotation_id || (f as any).annotationId;
            const canAct = Boolean(sessionId && annotationId);

            const handleAccept = async () => {
              if (!sessionId) return alert('No active session');
              if (!annotationId) return alert('No server annotation id available for this finding');
              try {
                await apiService.acceptFix(sessionId, String(annotationId));
                onActionComplete?.();
                console.info('Accepted annotation', annotationId);
              } catch (err) {
                console.error('Failed to accept annotation', err);
                alert('Failed to accept annotation');
              }
            };

            const openDismiss = () => {
              if (!annotationId) return alert('No server annotation id available for this finding');
              setPendingAnnotation(String(annotationId));
              setDismissReason('');
              setShowDismissModal(true);
            };

            return (
              <div key={`f-${idx}`} className={`rounded-lg border p-3 ${meta.card}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs font-bold uppercase text-slate-400">{formatCategory(f.category)}</div>
                  <div className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.badge}`}>{meta.label}</div>
                </div>
                <div className="text-sm text-slate-800">{f.message}</div>
                {f.suggestion && <div className="mt-1 text-xs text-indigo-700">Suggested fix: {f.suggestion}</div>}
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={handleAccept}
                    disabled={!canAct}
                    className={`text-xs font-semibold px-2 py-1 rounded ${canAct ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                    Accept
                  </button>
                  <button
                    onClick={openDismiss}
                    disabled={!canAct}
                    className={`text-xs font-semibold px-2 py-1 rounded ${canAct ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-slate-100 text-slate-400'}`}>
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })}
          {!(agent.findings || []).length && (
            <div className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg p-2">No slide-specific issues from this agent.</div>
          )}
        </div>
      )}
      {showDismissModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-lg overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <div className="text-lg font-bold">Dismiss finding</div>
                <div className="text-xs text-slate-500">Provide a short reason for dismissing this finding (optional).</div>
              </div>
              <button onClick={() => setShowDismissModal(false)} className="rounded-full p-2 text-slate-600 hover:bg-slate-50">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              <textarea
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
                placeholder="Reason (optional)"
                className="w-full min-h-[100px] border rounded p-2 text-sm font-sans"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() => setShowDismissModal(false)}
                  className="px-3 py-2 rounded bg-slate-100 text-slate-600 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!sessionId || !pendingAnnotation) return alert('Missing session or annotation id');
                    try {
                      await apiService.dismissAnnotation(sessionId, String(pendingAnnotation), dismissReason || 'no_reason');
                      onActionComplete?.();
                      setShowDismissModal(false);
                      setPendingAnnotation(null);
                      setDismissReason('');
                      console.info('Dismissed annotation', pendingAnnotation);
                    } catch (err) {
                      console.error('Failed to dismiss annotation', err);
                      alert('Failed to dismiss annotation');
                    }
                  }}
                  className="px-3 py-2 rounded bg-rose-600 text-white text-sm"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AgenticFlowPanel: React.FC<AgenticFlowPanelProps> = ({ sessionId, slideIndex, deepAnalysis, onRerunDeepAnalysis }) => {
  const [running, setRunning] = useState(false);
  const agents = deepAnalysis?.agents || [];
  const [showJsonModal, setShowJsonModal] = useState(false);
  const sortedAgents = sortAgentsByScore(agents as DeepAgentReview[]);

  const handleRerun = async () => {
    setRunning(true);
    try {
      await onRerunDeepAnalysis();
    } catch (err) {
      console.error('Failed to rerun deep analysis', err);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-700">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800">Agentic Flow</div>
            <div className="text-xs text-slate-500">Interactive view of agent outputs and their findings for this slide.</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowJsonModal(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Copy className="w-4 h-4" />
            View JSON
          </button>
          <button
            onClick={handleRerun}
            disabled={running}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${running ? 'bg-slate-200 text-slate-500' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
          >
            <RefreshCcw className="w-4 h-4" />
            {running ? 'Re-running...' : 'Re-run deep analysis'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sortedAgents.length === 0 ? (
          <div className="col-span-1 text-xs text-slate-500">No agent outputs available for this slide.</div>
        ) : (
          sortedAgents.map((agent) => (
            <AgentRow
              key={agent.name}
              agent={agent}
              defaultOpen={false}
              sessionId={sessionId}
              slideIndex={slideIndex}
              onActionComplete={onRerunDeepAnalysis}
            />
          ))
        )}
      </div>

      {showJsonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-700">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-lg font-bold text-slate-800">Deep analysis JSON</div>
                  <div className="text-xs text-slate-500">Raw payload returned from backend for debugging and export.</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const ok = await copyToClipboard(prettyJson(deepAnalysis || {}));
                    if (!ok) alert('Copy failed');
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Copy className="w-4 h-4" />
                  Copy JSON
                </button>
                <button onClick={() => setShowJsonModal(false)} className="rounded-full p-2 text-slate-600 hover:bg-slate-50">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4">
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-xs font-mono bg-slate-900 text-white p-4 rounded">
                {prettyJson(deepAnalysis || {})}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgenticFlowPanel;
