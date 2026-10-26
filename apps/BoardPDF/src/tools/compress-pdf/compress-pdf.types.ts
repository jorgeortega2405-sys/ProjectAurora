export type PdfCompressLevel = 'extreme' | 'recommended' | 'low';

export interface CompressPdfParams {
  buffer: Buffer;
  filename?: string;
  level: PdfCompressLevel;
  originalname: string;
}

export interface CompressPdfResponse {
  compressedSize: number;
  downloadUrl: string;
  fileId: string;
  filename: string;
  originalSize: number;
  pageCount: number;
  savingsBytes: number;
  savingsPercent: number;
}

export interface StoredCompressedPdf {
  buffer: Buffer;
  compressedSize: number;
  contentType: string;
  createdAt: number;
  filename: string;
  id: string;
  originalSize: number;
  pageCount: number;
  savingsPercent: number;
  size: number;
}
