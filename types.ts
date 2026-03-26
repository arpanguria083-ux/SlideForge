export interface BoundingBox {
  top: number;
  left: number;
  width: number;
  height: number;
  label: string;
}

export interface PersonaComment {
  persona: 'Chairman' | 'Storyteller' | 'Data Auditor' | 'Designer';
  text: string;
  sentiment: 'positive' | 'neutral' | 'negative' | 'critical';
  score: number; // 0-10
}

export interface SlideAnalysis {
  id: string;
  title: string;
  summary: string;
  overallScore: number;
  density: 'Low' | 'Medium' | 'High';
  visuals: BoundingBox[];
  fixes: BoundingBox[]; // Suggested areas to fix
  councilDebate: PersonaComment[];
  frameworkDetected?: string;
  citationIssues: string[];
}

export interface SlideModel {
  id: string;
  file: File;
  previewUrl: string;
  analysis: SlideAnalysis | null;
  status: 'idle' | 'analyzing' | 'complete' | 'error';
}

export enum ViewMode {
  UPLOAD = 'UPLOAD',
  DASHBOARD = 'DASHBOARD'
}