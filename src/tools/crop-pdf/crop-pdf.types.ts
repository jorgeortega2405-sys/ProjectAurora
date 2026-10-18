export interface CropBoxPercent {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface CropPdfOptions {
  applyToAll?: boolean;
  cropBox: CropBoxPercent;
  filename?: string;
  targetPageIndex?: number;
}

export interface CropPdfResponse {
  downloadUrl: string;
  fileId: string;
  filename: string;
  fileSize: number;
  totalPages: number;
}

export interface StoredCropPdfResult {
  buffer: Buffer;
  contentType: string;
  createdAt: number;
  filename: string;
  id: string;
  pagesCount: number;
  size: number;
}
