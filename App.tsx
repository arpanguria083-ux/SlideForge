import React, { useState } from 'react';
import FileUpload from './components/FileUpload';
import Dashboard from './components/Dashboard';
import { SlideModel, ViewMode } from './types';
import { analyzeSlideImage } from './services/geminiService';
import { convertPdfToImages } from './services/pdfService';

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.UPLOAD);
  const [slides, setSlides] = useState<SlideModel[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const handleUpload = async (uploadedFiles: File[]) => {
    setIsProcessing(true);
    let allFiles: File[] = [];

    try {
        // Process inputs: Convert PDFs to images, collect raw images, warn about PPTs
        for (const file of uploadedFiles) {
            if (file.type === 'application/pdf') {
                const pdfImages = await convertPdfToImages(file);
                allFiles = [...allFiles, ...pdfImages];
            } else if (file.type.startsWith('image/')) {
                allFiles.push(file);
            } else if (
                file.name.endsWith('.ppt') || 
                file.name.endsWith('.pptx') || 
                file.type.includes('presentation')
            ) {
                alert(`File "${file.name}" detected.\n\nPlease save your PowerPoint as a PDF and upload the PDF file. This ensures fonts and layout are preserved exactly for analysis.`);
            }
        }

        if (allFiles.length === 0) {
            setIsProcessing(false);
            return;
        }

        // Sort files naturally (Slide 1, Slide 2, Slide 10)
        // PDF conversion names them slide-001, slide-002 so they sort correctly automatically.
        allFiles.sort((a, b) => 
            a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        );

        // Initialize slides in 'idle' state
        const newSlides: SlideModel[] = allFiles.map((file) => ({
            id: crypto.randomUUID(),
            file,
            previewUrl: URL.createObjectURL(file),
            analysis: null,
            status: 'idle'
        }));

        setSlides(newSlides);
        setViewMode(ViewMode.DASHBOARD);
        setIsProcessing(false);

        // Process each slide strictly sequentially
        const processedSlides = [...newSlides];

        for (let i = 0; i < processedSlides.length; i++) {
            // Update progress state
            setProgress({ current: i + 1, total: processedSlides.length });

            try {
                // 1. Update status to analyzing
                processedSlides[i] = {
                    ...processedSlides[i],
                    status: 'analyzing'
                };
                setSlides([...processedSlides]); // Trigger UI update

                // 2. Perform Analysis (Wait for it to finish)
                const analysis = await analyzeSlideImage(processedSlides[i].file);

                // 3. Update status to complete
                processedSlides[i] = {
                    ...processedSlides[i],
                    analysis,
                    status: 'complete'
                };
                
            } catch (error) {
                console.error(`Failed to process slide ${i + 1}`, error);
                processedSlides[i] = {
                    ...processedSlides[i],
                    status: 'error'
                };
            }
            
            // Update state after each slide finishes to show progress
            setSlides([...processedSlides]);
        }
        
        // Clear progress when done
        setProgress(null);

    } catch (error) {
        console.error("Error during upload processing", error);
        alert("An error occurred while processing your files. Please try again.");
        setIsProcessing(false);
        setProgress(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {viewMode === ViewMode.UPLOAD && (
        <FileUpload onUpload={handleUpload} isProcessing={isProcessing} />
      )}
      {viewMode === ViewMode.DASHBOARD && (
        <Dashboard slides={slides} progress={progress} />
      )}
    </div>
  );
};

export default App;