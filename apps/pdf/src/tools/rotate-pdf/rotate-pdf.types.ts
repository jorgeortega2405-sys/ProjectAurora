export interface RotatePageItem {
  pageIndex: number;
  rotation: number;
}

export interface RotatePdfOptions {
  filename?: string;
  globalRotation?: number;
  pages: RotatePageItem[];
}

export interface RotatePdfResponse {
  downloadUrl: string;
  fileId: string;
  filename: string;
  fileSize: number;
  totalPages: number;
}

export interface StoredRotatePdfResult {
  buffer: Buffer;
  contentType: string;
  createdAt: number;
  filename: string;
  id: string;
  pagesCount: number;
  size: number;
}
