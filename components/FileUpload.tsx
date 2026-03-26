import React, { useCallback } from 'react';
import { Upload, FileUp, Loader2, FileText, MonitorPlay } from 'lucide-react';

interface FileUploadProps {
  onUpload: (files: File[]) => void;
  isProcessing: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onUpload, isProcessing }) => {
  const isValidFile = (file: File) => {
    return (
      file.type.startsWith('image/') || 
      file.type === 'application/pdf' ||
      file.name.endsWith('.ppt') || 
      file.name.endsWith('.pptx') ||
      file.type.includes('presentation')
    );
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (isProcessing) return;
      
      const files = Array.from(e.dataTransfer.files).filter(isValidFile);
      if (files.length > 0) onUpload(files);
    },
    [onUpload, isProcessing]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).filter(isValidFile);
      onUpload(files);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-slate-800 mb-2">SlideForge AI</h1>
            <p className="text-slate-500 text-lg">Agentic Consulting Deck Evaluator</p>
        </div>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={`
          relative w-full max-w-2xl h-80 border-2 border-dashed rounded-2xl 
          flex flex-col items-center justify-center transition-all duration-300
          ${isProcessing 
            ? 'border-indigo-200 bg-indigo-50/50 cursor-wait' 
            : 'border-slate-300 bg-white hover:border-indigo-500 hover:bg-slate-50 cursor-pointer shadow-sm hover:shadow-md'
          }
        `}
      >
        <input
          type="file"
          id="file-upload"
          multiple
          accept="image/*,application/pdf,.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          onChange={handleFileChange}
          disabled={isProcessing}
        />

        <div className="flex flex-col items-center space-y-4 pointer-events-none">
          {isProcessing ? (
            <>
              <Loader2 className="w-16 h-16 text-indigo-600 animate-spin" />
              <div className="text-center">
                <p className="text-lg font-semibold text-indigo-900">Ingesting Deck...</p>
                <p className="text-sm text-indigo-600">Converting slides & processing pixels...</p>
              </div>
            </>
          ) : (
            <>
              <div className="p-4 bg-indigo-50 rounded-full flex items-center gap-2">
                <FileUp className="w-8 h-8 text-indigo-600" />
                <span className="text-indigo-300">|</span>
                <MonitorPlay className="w-8 h-8 text-indigo-600" />
              </div>
              <div className="text-center">
                <p className="text-xl font-medium text-slate-700">
                  Drop Deck (PDF/PPT) or Slide Images
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  PDF format recommended for auto-sequencing
                </p>
              </div>
            </>
          )}
        </div>
      </div>
      
      {!isProcessing && (
          <div className="mt-8 grid grid-cols-3 gap-6 text-center max-w-2xl w-full">
            <div className="p-4 bg-white rounded-lg shadow-sm border border-slate-100">
                <div className="text-indigo-600 font-bold text-lg">OCR</div>
                <div className="text-xs text-slate-500">Gemini Vision Extraction</div>
            </div>
            <div className="p-4 bg-white rounded-lg shadow-sm border border-slate-100">
                <div className="text-indigo-600 font-bold text-lg">Agents</div>
                <div className="text-xs text-slate-500">Multi-Persona Debate</div>
            </div>
            <div className="p-4 bg-white rounded-lg shadow-sm border border-slate-100">
                <div className="text-indigo-600 font-bold text-lg">Fixes</div>
                <div className="text-xs text-slate-500">Visual Annotations</div>
            </div>
          </div>
      )}
    </div>
  );
};

export default FileUpload;