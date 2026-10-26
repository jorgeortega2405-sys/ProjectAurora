export interface RepairPdfParams {
  buffer: Buffer;
  filename?: string;
  originalname: string;
}

export interface RepairPdfResponse {
  downloadUrl: string;
  fileId: string;
  filename: string;
  originalSize: number;
  pageCount: number;
  repairedSize: number;
  status: string;
}

export interface StoredRepairedPdf {
  buffer: Buffer;
  contentType: string;
  createdAt: number;
  filename: string;
  id: string;
  originalSize: number;
  pageCount: number;
  size: number;
}
