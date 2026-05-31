declare module 'pdfjs-dist' {
  export const GlobalWorkerOptions: {
    workerSrc: string;
  };

  export function getDocument(src: { data: ArrayBuffer }): {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getViewport: (params: { scale: number }) => { width: number; height: number };
        render: (params: {
          canvasContext: CanvasRenderingContext2D;
          viewport: { width: number; height: number };
        }) => { promise: Promise<void> };
      }>;
    }>;
  };
}
