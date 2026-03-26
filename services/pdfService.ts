import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

// Set the worker source to the CDN
GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs`;

/**
 * Converts a PDF file into an array of Image Files (JPEGs).
 * Names them sequentially (slide-001.jpg, slide-002.jpg, etc.) to ensure proper sorting.
 */
export const convertPdfToImages = async (file: File): Promise<File[]> => {
  const arrayBuffer = await file.arrayBuffer();
  
  // Load the PDF document
  const loadingTask = getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  const images: File[] = [];
  const totalPages = pdf.numPages;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    
    // Use a scale of 2.0 for higher resolution (better for OCR/Vision)
    const viewport = page.getViewport({ scale: 2.0 });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) continue;

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    await page.render(renderContext).promise;

    const blob = await new Promise<Blob | null>((resolve) => {
      // Export as high-quality JPEG
      canvas.toBlob(resolve, 'image/jpeg', 0.85);
    });

    if (blob) {
      // Pad page number with zeros for correct lexical sorting (001, 002... 010)
      const pageStr = String(pageNum).padStart(3, '0');
      const imageName = `slide-${pageStr}.jpg`;
      images.push(new File([blob], imageName, { type: 'image/jpeg' }));
    }
  }

  return images;
};