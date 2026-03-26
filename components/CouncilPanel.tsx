import React from 'react';
import { PersonaComment } from '../types';
import { User, BookOpen, BarChart3, PenTool } from 'lucide-react';

interface CouncilPanelProps {
  comments: PersonaComment[];
}

const getPersonaIcon = (persona: string) => {
  switch (persona) {
    case 'Chairman': return <User className="w-5 h-5" />;
    case 'Storyteller': return <BookOpen className="w-5 h-5" />;
    case 'Data Auditor': return <BarChart3 className="w-5 h-5" />;
    case 'Designer': return <PenTool className="w-5 h-5" />;
    default: return <User className="w-5 h-5" />;
  }
};

const getPersonaColor = (persona: string) => {
    switch (persona) {
      case 'Chairman': return 'bg-slate-800 text-white';
      case 'Storyteller': return 'bg-emerald-600 text-white';
      case 'Data Auditor': return 'bg-blue-600 text-white';
      case 'Designer': return 'bg-purple-600 text-white';
      default: return 'bg-gray-600 text-white';
    }
  };

const CouncilPanel: React.FC<CouncilPanelProps> = ({ comments }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col">
      <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
        <h2 className="font-bold text-slate-800 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          Council of Agents
        </h2>
        <span className="text-xs font-mono text-slate-400">LLM-COUNCIL-FORK v5.0</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {comments.map((comment, idx) => (
          <div key={idx} className="flex gap-4 group">
             <div className="flex flex-col items-center gap-1">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-md ${getPersonaColor(comment.persona)}`}>
                    {getPersonaIcon(comment.persona)}
                </div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{comment.persona}</div>
             </div>
            
            <div className="flex-1">
              <div className="bg-slate-50 p-4 rounded-2xl rounded-tl-none border border-slate-100 group-hover:border-slate-200 transition-colors">
                <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-semibold text-slate-500">
                        Sentiment: <span className={`
                            ${comment.sentiment === 'positive' ? 'text-green-600' : ''}
                            ${comment.sentiment === 'negative' ? 'text-red-600' : ''}
                            ${comment.sentiment === 'critical' ? 'text-orange-600' : ''}
                            ${comment.sentiment === 'neutral' ? 'text-blue-600' : ''}
                        `}>{comment.sentiment}</span>
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 bg-white border border-slate-200 rounded-full">
                        Score: {comment.score}/10
                    </span>
                </div>
                <p className="text-slate-700 text-sm leading-relaxed">
                  {comment.text}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CouncilPanel;
