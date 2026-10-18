export interface RedactionBox {
  height: number;
  text?: string;
  width: number;
  x: number;
  y: number;
}

export interface PageRedaction {
  boxes: RedactionBox[];
  fullPage?: boolean;
  pageIndex: number;
}

export interface RedactPdfParams {
  buffer: Buffer;
  originalFilename?: string;
  redactions: PageRedaction[];
  redactionStyle?: 'solid' | 'strike';
  sanitizeMetadata?: boolean;
}

export interface RedactPdfResponse {
  downloadUrl: string;
  fileId: string;
  fileSize: number;
  filename: string;
  redactedBoxesCount: number;
  redactedPagesCount: number;
  totalPages: number;
}

export interface StoredRedactedPdf {
  buffer: Buffer;
  contentType: string;
  createdAt: number;
  fileId: string;
  filename: string;
  fileSize: number;
}
