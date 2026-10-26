export type ClientPdfCompressLevel = 'extreme' | 'recommended' | 'low';

export interface CompressResultData {
  compressedSize: number;
  downloadUrl: string;
  fileId: string;
  filename: string;
  originalSize: number;
  pageCount: number;
  savingsBytes: number;
  savingsPercent: number;
}
