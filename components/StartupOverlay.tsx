import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

interface StartupOverlayProps {
  onReady?: () => void;
}

const StartupOverlay: React.FC<StartupOverlayProps> = ({ onReady }) => {
  const [phases, setPhases] = useState<string[]>(['Starting backend...']);
  const [hasError, setHasError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [appReadyAt, setAppReadyAt] = useState<number | null>(null);

  useEffect(() => {
    const startTime = Date.now();
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 100);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!window.slideforge?.onBackendPhase) return;

    const unsubscribePhase = window.slideforge.onBackendPhase((msg: string) => {
      setPhases((prev) => [...prev.slice(-4), msg]); // Keep last 5 lines
      if (msg.includes('APP_READY')) {
        setAppReadyAt(Date.now());
      }
    });

    const unsubscribeReady = () => {
      window.slideforge?.onBackendReady?.(() => {
        if (onReady) onReady();
      });
    };

    const unsubscribeError = () => {
      window.slideforge?.onBackendError?.((err: string) => {
        setHasError(err);
      });
    };

    unsubscribeReady();
    unsubscribeError();

    return () => {
      unsubscribePhase();
    };
  }, [onReady]);

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Logo + loading UI */}
      <div className="flex flex-col items-center gap-8">
        {/* SlideForge branding */}
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-3xl font-bold text-white">SlideForge AI</h1>
          <p className="text-sm text-slate-400">Initializing...</p>
        </div>

        {/* Spinner or error */}
        {!hasError ? (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />

            {/* Phase log */}
            <div className="w-96 rounded-lg border border-slate-700 bg-slate-900/50 p-4">
              <div className="font-mono text-xs leading-relaxed text-slate-300 space-y-1">
                {phases.map((phase, idx) => (
                  <div
                    key={idx}
                    className={
                      phase.includes('APP_READY')
                        ? 'text-emerald-400'
                        : phase.includes('error') || phase.includes('Error')
                          ? 'text-red-400'
                          : 'text-slate-400'
                    }
                  >
                    {phase}
                  </div>
                ))}
              </div>
            </div>

            {/* Elapsed time + note */}
            <div className="text-center">
              <p className="text-sm text-slate-400">Elapsed: {elapsedSeconds}s</p>
              <p className="mt-2 text-xs text-slate-500">
                First run may take 60–120 seconds while models load.
              </p>
              {appReadyAt && (
                <p className="mt-1 text-xs text-emerald-500">
                  Backend ready, finishing initialization...
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <AlertCircle className="h-10 w-10 text-red-500" />
            <div className="w-96 rounded-lg border border-red-700 bg-red-900/20 p-4">
              <p className="font-mono text-sm text-red-300">{hasError}</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Restart the App
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default StartupOverlay;
