import React from 'react';
import { AlertTriangle, Copy, ExternalLink, RefreshCcw } from 'lucide-react';

type ErrorAction = {
  label: string;
  onClick?: () => void;
  href?: string;
};

type ErrorCardContext = {
  requestId?: string | null;
  timestamp?: string | null;
  endpoint?: string | null;
  status?: number;
};

interface ErrorCardProps {
  title: string;
  body: string;
  actions?: ErrorAction[];
  context?: ErrorCardContext;
  onCopyError?: () => void;
  className?: string;
}

const buttonBase =
  'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors';

const ErrorCard: React.FC<ErrorCardProps> = ({
  title,
  body,
  actions = [],
  context,
  onCopyError,
  className,
}) => {
  const contextItems = [
    context?.requestId ? `request ${context.requestId}` : null,
    context?.status ? `status ${context.status}` : null,
    context?.endpoint ? `endpoint ${context.endpoint}` : null,
    context?.timestamp ? `time ${new Date(context.timestamp).toLocaleString()}` : null,
  ].filter(Boolean) as string[];

  return (
    <div
      className={`rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-rose-900 shadow-sm ${
        className || ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-rose-100 p-2 text-rose-700">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{title}</div>
          <p className="mt-1 text-sm leading-6 text-rose-800">{body}</p>

          {contextItems.length > 0 && (
            <div className="mt-2 text-[11px] text-rose-700/90">{contextItems.join(' · ')}</div>
          )}

          {(actions.length > 0 || onCopyError) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {actions.map((action, index) => {
                if (action.href) {
                  return (
                    <a
                      key={`${action.label}-${index}`}
                      href={action.href}
                      target="_blank"
                      rel="noreferrer"
                      className={`${buttonBase} border-rose-200 bg-white text-rose-800 hover:bg-rose-100`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {action.label}
                    </a>
                  );
                }

                return (
                  <button
                    key={`${action.label}-${index}`}
                    type="button"
                    onClick={action.onClick}
                    className={`${buttonBase} border-rose-200 bg-white text-rose-800 hover:bg-rose-100`}
                  >
                    <RefreshCcw className="h-3.5 w-3.5" />
                    {action.label}
                  </button>
                );
              })}

              {onCopyError && (
                <button
                  type="button"
                  onClick={onCopyError}
                  className={`${buttonBase} border-rose-200 bg-white text-rose-800 hover:bg-rose-100`}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy error
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export type { ErrorAction, ErrorCardContext };
export default ErrorCard;
