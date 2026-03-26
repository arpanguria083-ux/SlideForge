import React, { useState } from 'react';
import { SlideAnalysis, BoundingBox } from '../types';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';

interface SlideCanvasProps {
  imageUrl: string;
  analysis: SlideAnalysis | null;
}

const SlideCanvas: React.FC<SlideCanvasProps> = ({ imageUrl, analysis }) => {
  const [showVisuals, setShowVisuals] = useState(true);
  const [showFixes, setShowFixes] = useState(true);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-4 mb-4">
        <button 
          onClick={() => setShowVisuals(!showVisuals)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${showVisuals ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}
        >
          {showVisuals ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          Detected Visuals
        </button>
        <button 
          onClick={() => setShowFixes(!showFixes)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${showFixes ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}
        >
          {showFixes ? <AlertCircle className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          Suggested Fixes
        </button>
      </div>

      {/* Canvas Area */}
      <div className="relative flex-1 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shadow-inner flex items-center justify-center">
        {imageUrl && (
          <div className="relative w-full h-full max-w-4xl max-h-[600px] shadow-lg">
            <img 
              src={imageUrl} 
              alt="Slide Preview" 
              className="w-full h-full object-contain bg-white" 
            />
            
            {/* Overlays */}
            {analysis && (
              <div className="absolute inset-0 pointer-events-none">
                {showVisuals && analysis.visuals?.map((box, idx) => (
                  <div
                    key={`vis-${idx}`}
                    style={{
                      top: `${box.top}%`,
                      left: `${box.left}%`,
                      width: `${box.width}%`,
                      height: `${box.height}%`,
                    }}
                    className="absolute border-2 border-blue-400/60 bg-blue-400/10 hover:bg-blue-400/20 transition-all cursor-help group"
                  >
                    <span className="absolute -top-6 left-0 bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                      {box.label}
                    </span>
                  </div>
                ))}

                {showFixes && analysis.fixes?.map((box, idx) => (
                  <div
                    key={`fix-${idx}`}
                    style={{
                      top: `${box.top}%`,
                      left: `${box.left}%`,
                      width: `${box.width}%`,
                      height: `${box.height}%`,
                    }}
                    className="absolute border-2 border-dashed border-red-500 bg-red-500/10 hover:bg-red-500/20 transition-all animate-pulse"
                  >
                     <span className="absolute -bottom-6 right-0 bg-red-600 text-white text-[10px] px-2 py-0.5 rounded shadow-sm z-10 whitespace-nowrap">
                      Fix: {box.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SlideCanvas;