export type SplitMode = 'range' | 'pages' | 'size';

export interface RangeItem {
  from: number;
  id: string;
  to: number;
}

export interface PageItem {
  id: string;
  num: number;
  thumbnailDataUrl?: string;
}

export interface SplitPdfResponseData {
  downloadUrl: string;
  fileId: string;
  filename: string;
  fileSize: number;
  isZip: boolean;
  partsCount: number;
  totalPages: number;
}
