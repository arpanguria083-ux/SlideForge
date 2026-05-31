import React, { useState, useEffect, useCallback, useRef } from 'react';
import FileUpload from './components/FileUpload';
import RolePicker from './components/RolePicker';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import TermsModal from './components/TermsModal';
import OcrSetupModal from './components/OcrSetupModal';
import OcrSettingsPanel from './components/OcrSettingsPanel';
import StartupOverlay from './components/StartupOverlay';
import { RuntimeAssetStatusResponse, SlideModel, ViewMode, OcrJobStatus } from './types';
import { apiService, Annotation as ApiAnnotation } from './services/apiService';

const Dashboard = React.lazy(() => import('./components/Dashboard'));
const DiagnosticsView = React.lazy(() => import('./components/DiagnosticsView'));

const App: React.FC = () => {
  const [backendReady, setBackendReady] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.UPLOAD);
  const [slides, setSlides] = useState<SlideModel[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastMainView, setLastMainView] = useState<ViewMode>(ViewMode.UPLOAD);
  const [annotations, setAnnotations] = useState<ApiAnnotation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'junior' | 'senior' | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [runtimeAssetStatus, setRuntimeAssetStatus] = useState<RuntimeAssetStatusResponse | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ocrVariant, setOcrVariant] = useState<'full' | 'lite' | null>(null);
  const [ocrReady, setOcrReady] = useState(false);
  const [ocrBundleAvailable, setOcrBundleAvailable] = useState(false);
  const [ocrSetupOpen, setOcrSetupOpen] = useState(false);
  const [ocrSettingsOpen, setOcrSettingsOpen] = useState(false);
  const [ocrJobId, setOcrJobId] = useState<string | null>(null);
  const [ocrJobStatus, setOcrJobStatus] = useState<OcrJobStatus | null>(null);
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[] | null>(null);

  useEffect(() => {
    const savedRole = localStorage.getItem('slideforge_role') as 'junior' | 'senior' | null;
    if (savedRole) setUserRole(savedRole);
    const accepted = localStorage.getItem('slideforge_terms_accepted') === 'true';
    setTermsAccepted(accepted);
  }, []);

  // Auto-dismiss error toast after 8 seconds
  useEffect(() => {
    if (error) {
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
      }
      errorTimerRef.current = setTimeout(() => {
        setError(null);
        errorTimerRef.current = null;
      }, 8000);
    }
    return () => {
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
    };
  }, [error]);

  // Bootstrap backend ready state
  useEffect(() => {
    if (window.slideforge?.onBackendReady) {
      window.slideforge.onBackendReady(() => {
        setBackendReady(true);
      });
    } else {
      // Dev mode or non-electron: assume backend is already up at localhost:8000
      setBackendReady(true);
    }
  }, []);

  const handleAcceptTerms = () => {
    localStorage.setItem('slideforge_terms_accepted', 'true');
    setTermsAccepted(true);
  };

  // Restore last session from localStorage when backend becomes ready
  useEffect(() => {
    const restoreLastSession = async () => {
      const lastSessionId = localStorage.getItem('slideforge_last_session');
      if (!lastSessionId) return;

      try {
        console.info('[slideforge] Attempting to restore session:', lastSessionId);
        
        // Check if session still exists on backend
        const scorecard = await apiService.getScorecard(lastSessionId);
        
        if (scorecard && scorecard.annotations) {
          console.info('[slideforge] Restoring session with', scorecard.annotations.length, 'annotations');
          
          // Load slides and analysis data
          await loadSessionIntoDashboard(lastSessionId);
          
          // Restore state
          setSessionId(lastSessionId);
          setAnnotations(scorecard.annotations);
          
          console.info('[slideforge] Session restored successfully');
        }
      } catch (err) {
        console.warn('[slideforge] Could not restore last session:', err);
        // Clear invalid session from localStorage
        localStorage.removeItem('slideforge_last_session');
      }
    };

    // Only attempt restore when backend is ready and we don't already have a session
    if (backendReady && !sessionId && termsAccepted) {
      restoreLastSession();
    }
  }, [backendReady, termsAccepted]);

  // Save session ID to localStorage whenever it changes
  useEffect(() => {
    if (sessionId) {
      localStorage.setItem('slideforge_last_session', sessionId);
      console.info('[slideforge] Session ID saved to localStorage:', sessionId);
    }
  }, [sessionId]);

  useEffect(() => {
    const bootstrapApiBase = async () => {
      try {
        if (window.slideforge?.getApiBase) {
          const base = await window.slideforge.getApiBase();
          if (base) {
            apiService.setApiBase(base);
          }
        }
      } catch (err) {
        console.warn('Failed to resolve Electron API base, using default /api', err);
      }
    };

    bootstrapApiBase();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 15;

    const bootstrapOcrState = async () => {
      try {
        const state = await apiService.getOcrVariantState();
        if (cancelled) return;
        setOcrVariant(state.variant);
        setOcrReady(state.ready);
        setOcrBundleAvailable(state.bundleAvailable);
        // Only open modal if OCR is NOT ready on startup
        if (!state.ready) {
          setOcrSetupOpen(true);
        }
      } catch (error) {
        if (!cancelled) {
          attempts += 1;
          if (attempts < maxAttempts) {
            console.info(`[slideforge] OCR state fetch failed, retrying in 2s (attempt ${attempts}/${maxAttempts})...`);
            setTimeout(() => {
              if (!cancelled) {
                void bootstrapOcrState();
              }
            }, 2000);
          } else {
            console.warn('Failed to resolve OCR state after maximum retries', error);
          }
        }
      }
    };

    if (backendReady) {
      void bootstrapOcrState();
    }
    return () => {
      cancelled = true;
    };
  }, [backendReady]);

  const handleRoleSelect = (role: 'junior' | 'senior') => {
    localStorage.setItem('slideforge_role', role);
    setUserRole(role);
  };

  const refreshAnalysis = useCallback(async (targetSessionId?: string) => {
    const effectiveSessionId = targetSessionId || sessionId;
    if (!effectiveSessionId) return;
    try {
      const scorecard = await apiService.getScorecard(effectiveSessionId);
      setAnnotations(scorecard.annotations);
    } catch (err) {
      console.error('Failed to refresh analysis:', err);
    }
  }, [sessionId]);

  const updateSlideAnalysis = useCallback((slideIndex: number, analysis: SlideModel['analysis']) => {
    setSlides((prev) =>
      prev.map((slide, idx) =>
        idx === slideIndex
          ? {
              ...slide,
              analysis,
              status: analysis ? 'complete' : slide.status,
            }
          : slide
      )
    );
  }, []);

  useEffect(() => {
    if (!isProcessing) {
      setRuntimeAssetStatus(null);
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const status = await apiService.getRuntimeAssetStatus();
        if (!cancelled) {
          setRuntimeAssetStatus(status);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('Failed to fetch runtime asset status', err);
        }
      }
    };

    poll();
    const interval = window.setInterval(poll, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isProcessing]);

  const loadSessionIntoDashboard = useCallback(async (sessionId: string, sourceFile?: File) => {
    const slidesData = await apiService.getSlides(sessionId);
    const fallbackFile =
      sourceFile ||
      new File([''], 'restored-analysis', {
        type: 'application/octet-stream',
      });

    const newSlides: SlideModel[] = slidesData.slides.map((slideData) => ({
      id: `slide-${slideData.index}`,
      file: fallbackFile,
      previewUrl: apiService.resolveAssetUrl(slideData.previewUrl) || apiService.getSlideImageUrl(sessionId, slideData.index),
      slideData,
      analysis: null,
      status: 'idle'
    }));

    const pendingSlides = newSlides.map((slide) => ({ ...slide, status: 'analyzing' as const }));
    setSlides(pendingSlides);
    setViewMode(ViewMode.DASHBOARD);

    const totalSlides = Math.max(1, pendingSlides.length);
    setProgress({
      current: 0,
      total: totalSlides,
      label: 'Loading slide analysis',
    });

    if (pendingSlides.length === 0) {
      return;
    }

    const queue = Array.from({ length: pendingSlides.length }, (_, index) => index);
    const concurrency = Math.min(4, pendingSlides.length);
    let completed = 0;

    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (queue.length > 0) {
          const slideIndex = queue.pop();
          if (slideIndex === undefined) {
            return;
          }

          const analysis = await apiService.getSlideAnalysis(sessionId, slideIndex);
          completed += 1;

          setSlides((prev) => {
            if (!prev[slideIndex]) return prev;
            const next = [...prev];
            next[slideIndex] = {
              ...next[slideIndex],
              analysis,
              status: 'complete',
            };
            return next;
          });

          setProgress({
            current: completed,
            total: totalSlides,
            label: `Loading slide ${Math.min(completed, totalSlides)} analysis`,
          });
        }
      })
    );
  }, []);

  const handleUpload = async (uploadedFiles: File[]) => {
    if (!ocrReady) {
      // Store files and open modal - upload will resume when modal closes
      setPendingUploadFiles(uploadedFiles);
      setOcrSetupOpen(true);
      return;
    }
    // Clear any pending files since we're starting the upload now
    setPendingUploadFiles(null);
    setIsProcessing(true);
    setError(null);

    try {
      console.info('[slideforge-upload] start', {
        fileCount: uploadedFiles.length,
        files: uploadedFiles.map((file) => ({ name: file.name, size: file.size, type: file.type })),
        electronApiBase: window.slideforge?.apiBase || null,
        resolvedApiBase: apiService.getApiBase(),
      });
      const providerConfig = await apiService.getLlmProvider();
      const selectedProvider = providerConfig.provider || 'api';
      const localContextWindow = providerConfig.local_context_window || 8192;
      const sessionId = await apiService.createSession();
      console.info('[slideforge-upload] session-created', { sessionId, apiBase: apiService.getApiBase() });
      setSessionId(sessionId);
      await apiService.setSessionLlmSettings(
        sessionId,
        selectedProvider,
        selectedProvider === 'ollama' || selectedProvider === 'lm_studio'
          ? localContextWindow
          : null
      );

      const file = uploadedFiles[0];
      if (!file) {
        throw new Error('No file selected');
      }

      try {
        await apiService.uploadDeck(sessionId, file);
        console.info('[slideforge-upload] upload-complete', { sessionId, fileName: file.name });
      } catch (e: any) {
        throw new Error(`Upload Failed: ${e.message || 'Unknown error'}`);
      }

      setProgress({ current: 1, total: 4, label: 'Uploading deck' });
      
      try {
        await apiService.parseDeck(sessionId);
        console.info('[slideforge-upload] parse-complete', { sessionId });
      } catch (e: any) {
        throw new Error(`Parsing/OCR Failed: ${e.message || 'Unknown error'}`);
      }
      
      setProgress({ current: 2, total: 4, label: 'Parsing slides and OCR' });
      
      try {
        setProgress({ current: 3, total: 4, label: 'Running analysis agents' });
        const analysisResult = await apiService.runAnalysisWithPolling(sessionId, {
          onProgress: (status) => {
            setProgress({
              current: 3,
              total: 4,
              label: status.progress_label || 'Running analysis agents',
            });
          },
        });
        console.info('[slideforge-upload] analysis-complete', {
          sessionId,
          annotationCount: analysisResult.scorecard.annotations.length,
        });
        setAnnotations(analysisResult.scorecard.annotations);
      } catch (e: any) {
        throw new Error(`Agent Analysis Failed: ${e.message || 'Unknown error'}`);
      }
      
      await loadSessionIntoDashboard(sessionId, uploadedFiles[0]);

    } catch (err) {
      console.error('Error during upload:', err);
      console.error('[slideforge-upload] failed', {
        error: err instanceof Error ? err.message : String(err),
        sessionId,
        apiBase: apiService.getApiBase(),
        electronApiBase: window.slideforge?.apiBase || null,
      });
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  // Resume upload after OCR modal closes (if files were pending and OCR is now ready)
  useEffect(() => {
    if (!ocrSetupOpen && pendingUploadFiles && ocrReady) {
      const filesToUpload = pendingUploadFiles;
      setPendingUploadFiles(null);
      // Use setTimeout to ensure state updates are fully processed
      setTimeout(() => {
        void handleUpload(filesToUpload);
      }, 100);
    }
  }, [ocrSetupOpen, ocrReady, pendingUploadFiles]);

  const handleCancelOcr = useCallback(async () => {
    if (!ocrJobId) return;
    try {
      await apiService.cancelOcrDownload(ocrJobId);
      setOcrJobId(null);
      setOcrJobStatus(null);
      setIsProcessing(false);
      setProgress(null);
    } catch (err) {
      console.error('Failed to cancel OCR download:', err);
    }
  }, [ocrJobId]);

  /**
   * Called when OCR modal closes. Refreshes OCR state from backend
   * to ensure ocrReady is up-to-date before resuming any pending uploads.
   */
  const handleCloseOcrModal = useCallback(async () => {
    console.debug('[App] OCR modal closing, refreshing OCR state...');
    try {
      const state = await apiService.getOcrVariantState();
      console.debug('[App] OCR state refreshed after modal close:', state);
      setOcrReady(state.ready);
      setOcrBundleAvailable(state.bundleAvailable);
    } catch (err) {
      console.error('[App] Failed to refresh OCR state on modal close:', err);
    } finally {
      setOcrSetupOpen(false);
    }
  }, []);

  /**
   * Called from OcrSettingsPanel when user clicks "Activate" on a ready backend.
   * Calls the /ocr/activate endpoint (persists choice) and refreshes OCR state.
   */
  const handleOcrActivate = useCallback(async (backendId: string) => {
    try {
      await apiService.activateOcrBackend(backendId);
      const state = await apiService.getOcrVariantState();
      setOcrReady(state.ready);
      setOcrBundleAvailable(state.bundleAvailable);
    } catch (err) {
      console.error('Failed to activate OCR backend:', err);
    }
  }, []);

  /**
   * Called from OcrSettingsPanel when user clicks "Download" on a not-ready backend.
   * Mirrors handleOcrSetup but does NOT navigate away or block UI.
   * Progress is surfaced through ocrJobId/ocrJobStatus.
   */
  const handleOcrPanelDownload = useCallback(async (backendId: string) => {
    // Don't overwrite an already-running job
    if (ocrJobId) return;
    try {
      const job = await apiService.startOcrDownload(backendId);
      setOcrJobId(job.job_id);
      // Poll in background — OcrSettingsPanel auto-refreshes via its own effect
      const poll = async () => {
        try {
          const status = await apiService.getOcrDownloadStatus(job.job_id);
          setOcrJobStatus(status);
          if (status.status === 'running' || status.status === 'cancelling') {
            window.setTimeout(poll, 1500);
          } else {
            if (status.status === 'completed') {
              const state = await apiService.getOcrVariantState();
              setOcrReady(state.ready);
              setOcrBundleAvailable(state.bundleAvailable);
            } else if (status.status === 'failed') {
              setError(status.error || 'OCR model download failed.');
            }
            setOcrJobId(null);
            setOcrJobStatus(null);
          }
        } catch {
          setOcrJobId(null);
          setOcrJobStatus(null);
        }
      };
      void poll();
    } catch (err) {
      console.error('Failed to start OCR download from panel:', err);
      setError(err instanceof Error ? err.message : 'Failed to start OCR download.');
    }
  }, [ocrJobId]);

  const handleOcrSetup = async (backendId?: string) => {
    if (ocrReady && !backendId) {
      setOcrSetupOpen(false);
      return;
    }

    if (ocrVariant === 'lite' || backendId) {
      // Do NOT set isProcessing — OCR download uses its own banner & modal progress
      try {
        const job = await apiService.startOcrDownload(backendId);
        setOcrJobId(job.job_id);
        let completed = false;
        while (!completed) {
          const status = await apiService.getOcrDownloadStatus(job.job_id);
          const jobStatus = String(status.status || 'idle');
          setOcrJobStatus(status);
          if (jobStatus === 'completed') {
            completed = true;
          } else if (jobStatus === 'failed') {
            throw new Error(typeof status.error === 'string' ? status.error : 'OCR download failed');
          } else if (jobStatus === 'cancelled') {
            completed = true;
          }
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }

        const state = await apiService.getOcrVariantState();
        setOcrReady(state.ready);
        setOcrBundleAvailable(state.bundleAvailable);
        setOcrSetupOpen(!state.ready);
        setOcrJobId(null);
        setOcrJobStatus(null);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to download OCR assets');
        setOcrJobId(null);
        setOcrJobStatus(null);
      } finally {
        // isProcessing is NOT set for OCR downloads — no-op here
      }
      return;
    }

    setOcrSetupOpen(false);
  };

  const handleOpenHistory = async (fingerprint: string) => {
    setIsProcessing(true);
    setError(null);
    try {
      const result = await apiService.openHistory(fingerprint);
      setSessionId(result.session_id);
      await refreshAnalysis(result.session_id);
      await loadSessionIntoDashboard(result.session_id);
    } catch (err) {
      console.error('Error opening history:', err);
      setError(err instanceof Error ? err.message : 'Failed to open analysis history');
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const handleCloseSession = useCallback(() => {
    localStorage.removeItem('slideforge_last_session');
    setSessionId(null);
    setSlides([]);
    setAnnotations([]);
    setProgress(null);
    setViewMode(ViewMode.UPLOAD);
    setLastMainView(ViewMode.UPLOAD);
  }, []);

  const openDiagnostics = useCallback(() => {
    if (viewMode !== ViewMode.DIAGNOSTICS) {
      setLastMainView(viewMode);
    }
    setViewMode(ViewMode.DIAGNOSTICS);
  }, [viewMode]);

  const closeDiagnostics = useCallback(() => {
    setViewMode(lastMainView === ViewMode.DIAGNOSTICS ? ViewMode.UPLOAD : lastMainView);
  }, [lastMainView]);

  if (!backendReady) {
    return <StartupOverlay onReady={() => setBackendReady(true)} />;
  }

  return (
    <ToastProvider>
      <ErrorBoundary>
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
          <TermsModal open={!termsAccepted} accepted={termsAccepted} onAccept={handleAcceptTerms} />
          {!userRole && <RolePicker onSelect={handleRoleSelect} />}
          
          {error && (
            <div
              role="alert"
              className="animate-in slide-in-from-right duration-300 fixed right-4 top-4 z-[250] max-w-md rounded-2xl border border-rose-200 bg-white/95 px-5 py-4 text-rose-700 shadow-[0_20px_60px_rgba(190,24,93,0.14)] backdrop-blur"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold uppercase tracking-wide text-rose-500 mb-1">Error</div>
                  <p className="text-sm font-medium leading-snug">{error}</p>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="flex-shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition-colors"
                  aria-label="Dismiss error"
                >
                  Dismiss
                </button>
              </div>
              {/* Auto-dismiss progress bar */}
              <div className="mt-3 h-1 w-full rounded-full bg-rose-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-rose-400 animate-shrink-width"
                  style={{
                    animation: 'shrink-width 8s linear forwards',
                  }}
                />
              </div>
            </div>
          )}
          <OcrSetupModal
            open={ocrSetupOpen}
            variant={ocrVariant}
            ready={ocrReady}
            bundleAvailable={ocrBundleAvailable}
            onDownload={handleOcrSetup}
            onClose={handleCloseOcrModal}
            jobId={ocrJobId}
            jobStatus={ocrJobStatus}
            onCancel={handleCancelOcr}
          />

          {/* ── Global OCR download banner ─────────────────────────────────
               Always visible on top of everything (z-[200]) while a download
               is running, even if the setup modal has been dismissed. */}
          {ocrJobId && ocrJobStatus && (ocrJobStatus.status === 'running' || ocrJobStatus.status === 'cancelling') && (
            <div className="fixed inset-x-0 top-0 z-[200] bg-indigo-700 px-4 py-2.5 shadow-xl">
              <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {/* CSS-only spinner */}
                  <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  <span className="truncate text-sm font-medium text-white">
                    {ocrJobStatus.message || 'Downloading OCR engine\u2026'}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-indigo-200">
                    {ocrJobStatus.bytes_total
                      ? `~${Math.round(ocrJobStatus.bytes_total / 1e9 * 10) / 10} GB — may take 10\u201320 min`
                      : 'Large download — please wait'}
                  </span>
                  <button
                    onClick={() => setOcrSetupOpen(true)}
                    className="text-xs font-medium text-indigo-200 underline hover:text-white"
                  >
                    Details
                  </button>
                  <button
                    onClick={handleCancelOcr}
                    className="rounded-full border border-indigo-500 bg-indigo-800/60 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              {/* Indeterminate progress bar — snapshot_download doesn't report byte-level progress */}
              <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-indigo-600/50">
                <div
                  className="h-full w-1/3 rounded-full bg-white/60"
                  style={{ animation: 'ocr-progress-slide 2s ease-in-out infinite' }}
                />
              </div>
            </div>
          )}

          {/* OCR Settings slide-over drawer */}
          {ocrSettingsOpen && (
            <div className="fixed inset-0 z-[130] flex items-start justify-end">
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
                onClick={() => setOcrSettingsOpen(false)}
              />
              {/* Panel */}
              <div className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-[0_0_80px_rgba(15,23,42,0.25)]">
                {/* Drawer header */}
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-600">Settings</div>
                    <h2 className="mt-0.5 text-lg font-semibold text-slate-950">OCR Engine Management</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOcrSettingsOpen(false)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Close ✕
                  </button>
                </div>
                {/* Panel body */}
                <div className="flex-1 px-6 py-6">
                  <OcrSettingsPanel
                    ocrJobId={ocrJobId}
                    ocrJobStatus={ocrJobStatus}
                    onStartDownload={handleOcrPanelDownload}
                    onCancelDownload={handleCancelOcr}
                    onBackendActivated={handleOcrActivate}
                    variant={ocrVariant}
                  />
                </div>
              </div>
            </div>
          )}
          {viewMode === ViewMode.UPLOAD && (
            <div className="animate-in slide-in-from-bottom-4 duration-300">
            <ErrorBoundary>
              <FileUpload
                onUpload={(files) => {
                  if (!termsAccepted) {
                    setError('Accept Terms and Privacy Notice before uploading.');
                    return;
                  }
                  if (!ocrReady) {
                    setOcrSetupOpen(true);
                    return;
                  }
                  handleUpload(files);
                }}
                isProcessing={isProcessing}
                processingStatus={runtimeAssetStatus}
                progressLabel={progress?.label ?? null}
                onError={setError}
                onOpenHistory={(fingerprint) => {
                  if (!termsAccepted) {
                    setError('Accept Terms and Privacy Notice before opening history.');
                    return;
                  }
                  handleOpenHistory(fingerprint);
                }}
                onOpenDiagnostics={openDiagnostics}
                onOpenOcrSetup={() => {
                  // If already set up, open the full management panel
                  // If not yet ready, open the first-run setup modal
                  if (ocrReady) {
                    setOcrSettingsOpen(true);
                  } else {
                    setOcrSetupOpen(true);
                  }
                }}
                onRequestOcrDownload={(backendId?: string) => handleOcrSetup(backendId)}
                ocrJobId={ocrJobId}
                ocrJobStatus={ocrJobStatus}
              />
            </ErrorBoundary>
            </div>
          )}
           {viewMode === ViewMode.DASHBOARD && sessionId && (
             <div className="animate-in slide-in-from-bottom-4 duration-500">
             <ErrorBoundary>
               <React.Suspense
                 fallback={
                   <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
                     Loading workspace...
                   </div>
                 }
               >
                  <Dashboard 
                    sessionId={sessionId}
                    slides={slides} 
                    progress={progress} 
                    annotations={annotations}
                    onRefreshAnalysis={refreshAnalysis}
                    onUpdateSlideAnalysis={updateSlideAnalysis}
                    onOpenDiagnostics={openDiagnostics}
                    onCloseSession={handleCloseSession}
                  />
                </React.Suspense>
              </ErrorBoundary>
            </div>
            )}
            {viewMode === ViewMode.DIAGNOSTICS && (
              <div className="animate-in slide-in-from-bottom-4 duration-300">
              <ErrorBoundary>
                <React.Suspense
                  fallback={
                    <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
                      Loading diagnostics...
                    </div>
                  }
                >
                  <DiagnosticsView onBack={closeDiagnostics} />
                </React.Suspense>
              </ErrorBoundary>
            </div>
            )}
        </div>
      </ErrorBoundary>
    </ToastProvider>
  );
};

export default App;
