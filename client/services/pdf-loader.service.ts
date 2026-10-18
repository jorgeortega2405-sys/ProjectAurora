let pdfjsPromise: Promise<any> | null = null;

export async function loadPdfJs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((pdfjsLib) => {
      if (typeof window !== 'undefined' && (pdfjsLib as any).GlobalWorkerOptions) {
        (pdfjsLib as any).GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
      }
      return pdfjsLib;
    });
  }
  return pdfjsPromise;
}
