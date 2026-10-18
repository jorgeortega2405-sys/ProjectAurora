export type OcrLanguage = 'spa' | 'eng' | 'spa+eng';

export interface OcrPdfParams {
  buffer: Buffer;
  deskew?: boolean;
  filename?: string;
  language?: OcrLanguage;
  originalname: string;
}

export interface OcrPdfResponse {
  downloadUrl: string;
  fileId: string;
  filename: string;
  language: string;
  originalSize: number;
  pageCount: number;
  processedSize: number;
}

export interface StoredOcrPdf {
  buffer: Buffer;
  contentType: string;
  createdAt: number;
  filename: string;
  id: string;
  language: string;
  originalSize: number;
  pageCount: number;
  size: number;
}
