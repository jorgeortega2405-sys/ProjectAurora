export type ClientOcrLanguage = 'spa' | 'eng' | 'spa+eng';

export interface OcrResultData {
  downloadUrl: string;
  fileId: string;
  filename: string;
  language: string;
  originalSize: number;
  pageCount: number;
  processedSize: number;
}
