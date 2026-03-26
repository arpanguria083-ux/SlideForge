import React, { useState, useEffect } from 'react';
import { SlideModel } from '../types';
import CouncilPanel from './CouncilPanel';
import SlideCanvas from './SlideCanvas';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { ChevronRight, Layout, AlertTriangle, CheckCircle2, FileText, Share2, Download, Loader2 } from 'lucide-react';

interface DashboardProps {
  slides: SlideModel[];
  progress: { current: number; total: number } | null;
}

const Dashboard: React.FC<DashboardProps> = ({ slides, progress }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentSlide = slides[currentIndex];
  const analysis = currentSlide?.analysis;

  // Auto-advance to the latest completed slide if the user hasn't manually selected one?
  // For now, let's keep manual navigation but ensure we don't crash on empty analysis.

  const scoreData = analysis ? [
    { name: 'Score', value: analysis.overallScore },
    { name: 'Gap', value: 100 - analysis.overallScore },
  ] : [];
  const COLORS = ['#4f46e5', '#e2e8f0'];

  // If slide is still processing, show a placeholder in the main area
  const isAnalyzingCurrent = currentSlide?.status === 'analyzing';
  const isIdleCurrent = currentSlide?.status === 'idle';

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm z-20">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">SF</div>
            <h1 className="font-semibold text-slate-800">SlideForge AI <span className="text-slate-400 font-normal">| Evaluation Report</span></h1>
        </div>
        <div className="flex items-center gap-3">
             <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors">
                <Share2 className="w-4 h-4" /> Share
             </button>
             <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm transition-colors">
                <Download className="w-4 h-4" /> Export PPTX
             </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Navigation */}
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col z-10">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Slides</h3>
            {progress ? (
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-indigo-600 font-medium animate-pulse">Analyzing...</span>
                        <span className="text-slate-500 font-mono text-xs">{progress.current}/{progress.total}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div 
                            className="bg-indigo-500 h-full rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${(progress.current / progress.total) * 100}%` }}
                        ></div>
                    </div>
                </div>
            ) : (
                <div className="flex items-center justify-between text-sm text-slate-600">
                    <span>{slides.length} Processed</span>
                    <span className="text-green-600 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Ready
                    </span>
                </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {slides.map((slide, idx) => (
              <button
                key={slide.id}
                onClick={() => setCurrentIndex(idx)}
                className={`w-full flex items-center gap-3 p-2 rounded-lg transition-all text-left group relative
                  ${currentIndex === idx ? 'bg-indigo-50 border border-indigo-200 shadow-sm' : 'hover:bg-slate-50 border border-transparent'}
                  ${slide.status === 'idle' ? 'opacity-60' : 'opacity-100'}
                `}
              >
                <div className="relative w-12 h-8 bg-slate-200 rounded overflow-hidden flex-shrink-0">
                    <img src={slide.previewUrl} className="w-full h-full object-cover opacity-80" alt={`Slide ${idx + 1}`} />
                    
                    {slide.status === 'analyzing' && (
                        <div className="absolute inset-0 bg-indigo-900/40 flex items-center justify-center">
                            <Loader2 className="w-4 h-4 text-white animate-spin" />
                        </div>
                    )}
                    
                    {slide.status === 'complete' && slide.analysis?.overallScore && slide.analysis.overallScore < 70 && (
                        <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></div>
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <div className={`text-xs font-semibold truncate ${currentIndex === idx ? 'text-indigo-700' : 'text-slate-700'}`}>
                        Slide {idx + 1}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                        {slide.status === 'analyzing' ? (
                            <span className="text-indigo-500 italic">Processing...</span>
                        ) : slide.status === 'idle' ? (
                            <span className="text-slate-400">Queued</span>
                        ) : (
                            slide.analysis?.title || "Untitled Slide"
                        )}
                    </div>
                </div>
                {currentIndex === idx && <ChevronRight className="w-4 h-4 text-indigo-400" />}
              </button>
            ))}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
            
            {(isAnalyzingCurrent || isIdleCurrent || !analysis) ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                    {isAnalyzingCurrent ? (
                        <>
                            <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
                            <p className="text-lg font-medium text-slate-600">Agents are analyzing this slide...</p>
                            <p className="text-sm">Wait for the Council's verdict.</p>
                        </>
                    ) : (
                        <>
                            <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center">
                                <Layout className="w-8 h-8 text-slate-400" />
                            </div>
                            <p>Select a processed slide to view details.</p>
                        </>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-12 gap-6">
                    {/* Top Row: Metrics & Info */}
                    <div className="col-span-12 grid grid-cols-4 gap-4 h-32">
                        {/* Score Card */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between relative overflow-hidden">
                            <div>
                                <div className="text-slate-500 text-sm font-medium mb-1">Impact Score</div>
                                <div className="text-4xl font-bold text-slate-800">{analysis.overallScore}</div>
                                <div className="text-xs text-slate-400 mt-2">MBB Standard</div>
                            </div>
                            <div className="w-24 h-24">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={scoreData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={25}
                                            outerRadius={35}
                                            startAngle={90}
                                            endAngle={-270}
                                            dataKey="value"
                                        >
                                            {scoreData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Summary Card */}
                        <div className="col-span-2 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                            <div className="flex items-center gap-2 mb-2">
                                <FileText className="w-4 h-4 text-indigo-500" />
                                <span className="text-sm font-bold text-slate-700">Content Summary</span>
                            </div>
                            <p className="text-sm text-slate-600 line-clamp-3 leading-relaxed">
                                {analysis.summary}
                            </p>
                        </div>

                        {/* Alerts Card */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Detected Issues</div>
                            <div className="space-y-2 overflow-y-auto custom-scrollbar">
                                {analysis.citationIssues && analysis.citationIssues.length > 0 ? (
                                    analysis.citationIssues.map((issue, i) => (
                                        <div key={i} className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 p-1.5 rounded border border-amber-100">
                                            <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                            {issue}
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 p-1.5 rounded border border-green-100">
                                        <CheckCircle2 className="w-3 h-3" />
                                        Citations Verified
                                    </div>
                                )}
                                {analysis.density === 'High' && (
                                    <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 p-1.5 rounded border border-red-100">
                                        <Layout className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                        High Text Density
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Middle Row: Canvas & Council */}
                    <div className="col-span-8 h-[600px] flex flex-col">
                        <SlideCanvas imageUrl={currentSlide.previewUrl} analysis={analysis} />
                    </div>

                    <div className="col-span-4 h-[600px]">
                        <CouncilPanel comments={analysis.councilDebate || []} />
                    </div>

                    {/* Bottom Row: Framework Detection */}
                    <div className="col-span-12 bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-indigo-50 rounded-lg">
                                <Layout className="w-6 h-6 text-indigo-600" />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-slate-500">Framework Detected</div>
                                <div className="text-lg font-bold text-slate-800">
                                    {analysis.frameworkDetected || "None Detected (Generic Layout)"}
                                </div>
                            </div>
                        </div>
                        <div className="h-10 border-l border-slate-200 mx-4"></div>
                        <div className="flex-1">
                            <div className="text-sm font-medium text-slate-500 mb-1">Ingestion Tech</div>
                            <div className="flex gap-2">
                                <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded font-mono">Gemini Vision 2.5</span>
                                <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded font-mono">YOLOv8-Consulting</span>
                                <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded font-mono">LangGraph</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;