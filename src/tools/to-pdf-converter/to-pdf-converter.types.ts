export type ToPdfSourceType =
  | 'excel-to-pdf'
  | 'html-to-pdf'
  | 'jpg-to-pdf'
  | 'powerpoint-to-pdf'
  | 'word-to-pdf';

export interface ToPdfConversionResult {
  downloadToken: string;
  downloadUrl: string;
  fileSize: number;
  filename: string;
  originalSize: number;
  success: boolean;
}

export interface StoredToPdfFile {
  buffer: Buffer;
  contentType: string;
  createdAt: number;
  filePath?: string;
  filename: string;
  mimeType: string;
  token: string;
}
