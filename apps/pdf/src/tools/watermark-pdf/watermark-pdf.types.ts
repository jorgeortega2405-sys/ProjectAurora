export type WatermarkType = 'image' | 'text';

export type WatermarkPosition =
  | 'bottom-center'
  | 'bottom-left'
  | 'bottom-right'
  | 'center'
  | 'center-left'
  | 'center-right'
  | 'top-center'
  | 'top-left'
  | 'top-right';

export interface WatermarkOptions {
  color?: string;
  filename?: string;
  fontFamily?: 'Courier' | 'Helvetica' | 'Helvetica-Bold' | 'Times-Roman';
  fontSize?: number;
  fromPage?: number;
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  layer?: 'over' | 'under';
  mosaic?: boolean;
  position?: WatermarkPosition;
  rotation?: number;
  text?: string;
  toPage?: number;
  transparency?: number;
  type?: WatermarkType;
}

export interface WatermarkPdfResponse {
  downloadUrl: string;
  fileId: string;
  filename: string;
  fileSize: number;
  totalPages: number;
}

export interface StoredWatermarkPdfResult {
  buffer: Buffer;
  contentType: string;
  createdAt: number;
  filename: string;
  id: string;
  pagesCount: number;
  size: number;
}
