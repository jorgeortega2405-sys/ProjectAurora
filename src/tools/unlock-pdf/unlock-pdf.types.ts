export interface UnlockPdfOptions {
  filename?: string;
  password?: string;
}

export interface UnlockPdfResponse {
  downloadUrl: string;
  fileId: string;
  filename: string;
  fileSize: number;
  totalPages: number;
}

export interface StoredUnlockPdfResult {
  buffer: Buffer;
  contentType: string;
  createdAt: number;
  filename: string;
  id: string;
  pagesCount: number;
  size: number;
}
