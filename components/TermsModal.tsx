import React from 'react';

interface TermsModalProps {
  open: boolean;
  accepted: boolean;
  onAccept: () => void;
}

const TermsModal: React.FC<TermsModalProps> = ({ open, accepted, onAccept }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 px-4 py-6">
      <div className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-5">
          <h2 className="text-xl font-bold text-slate-900">Terms and Privacy Notice</h2>
          <p className="mt-1 text-sm text-slate-600">
            You must accept these terms before using SlideForge.
          </p>
        </div>

        <div className="max-h-[62vh] space-y-4 overflow-y-auto px-6 py-5 text-sm text-slate-700">
          <section>
            <h3 className="mb-2 font-semibold text-slate-900">Terms and Conditions</h3>
            <p>
              SlideForge provides AI-assisted review outputs that may contain errors. You are solely
              responsible for validating all outputs before use. Do not upload data unless you are
              authorized to process it. Use of third-party model providers is governed by their terms.
            </p>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-slate-900">Privacy Notice</h3>
            <p>
              SlideForge may store operational artifacts locally (sessions, logs, history, and generated
              files). If you configure remote model endpoints, uploaded content may be transmitted to those
              providers according to your configuration.
            </p>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-slate-900">Connectivity and Model Downloads</h3>
            <p>
              SlideForge is offline-first, but not every feature is guaranteed to be offline-only in every
              configuration.
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-600">
              <li>Uploads, sessions, review history, logs, and generated workspace files stay on this device.</li>
              <li>Local providers such as Ollama and LM Studio can keep analysis on your machine when they are pointed at local servers.</li>
              <li>Cloud AI providers send prompts and uploaded deck content to the remote endpoint you configure.</li>
              <li>Some local ML or OCR features may download model files on first use if those assets are not already cached and offline mode is not preconfigured.</li>
              <li>Grammar review falls back to local regex checks when LanguageTool is unavailable.</li>
            </ul>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-slate-900">Legal Agreements & Documentation</h3>
            <p className="mb-2 text-xs text-slate-500">
              The full text of all legal agreements required for distribution, installation, and compliance on Windows is packaged locally in the application's root directory:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-xs">
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                <span className="font-semibold text-slate-900 block mb-1">General Terms & Disclaimers</span>
                <ul className="list-disc list-inside space-y-1 text-slate-600">
                  <li><code className="text-slate-800 font-mono">legal/TERMS_AND_CONDITIONS.md</code></li>
                  <li><code className="text-slate-800 font-mono">legal/PRIVACY_NOTICE.md</code></li>
                </ul>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                <span className="font-semibold text-slate-900 block mb-1">End User License Agreements (EULAs)</span>
                <ul className="list-disc list-inside space-y-1 text-slate-600">
                  <li>🇺🇸 <code className="text-slate-800 font-mono">legal/EULA_US.md</code></li>
                  <li>🇪🇺 <code className="text-slate-800 font-mono">legal/EULA_EU.md</code></li>
                </ul>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                <span className="font-semibold text-slate-900 block mb-1">Privacy & Compliance</span>
                <ul className="list-disc list-inside space-y-1 text-slate-600">
                  <li>🛡️ <code className="text-slate-800 font-mono">legal/GDPR_COMPLIANCE_PRIVACY_POLICY.md</code></li>
                </ul>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                <span className="font-semibold text-slate-900 block mb-1">Windows Installer & Licenses</span>
                <ul className="list-disc list-inside space-y-1 text-slate-600">
                  <li>⚙️ <code className="text-slate-800 font-mono">legal/OPEN_SOURCE_INSTALLER_AGREEMENT.md</code></li>
                  <li>📜 <code className="text-slate-800 font-mono">legal/OPEN_SOURCE_LICENSES.md</code></li>
                </ul>
              </div>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
          <div className="flex flex-col gap-0.5">
            <p className="text-xs text-slate-500">
              Acceptance is stored locally on this device.
            </p>
            <p className="text-xs text-slate-400">
              Connect with Founder: <a href="https://www.arpan-guria.in/" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-medium hover:underline">Arpan Guria</a>
            </p>
          </div>
          <button
            onClick={onAccept}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
          >
            {accepted ? 'Continue' : 'I Accept'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TermsModal;
