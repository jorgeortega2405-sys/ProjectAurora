export type SplitMode = 'range' | 'pages' | 'size';

export interface SplitRangeItem {
  from: number;
  to: number;
}

export interface SplitPdfOptions {
  filename?: string;
  fixedPageCount?: number;
  maxSizeBytes?: number;
  mergeSelected?: boolean;
  mode: SplitMode;
  ranges?: SplitRangeItem[];
  selectedPages?: number[];
  submode?: 'all' | 'custom' | 'fixed';
}

export interface StoredSplitResult {
  buffer: Buffer;
  contentType: string;
  createdAt: number;
  filename: string;
  id: string;
  isZip: boolean;
  partsCount: number;
  size: number;
  totalPages: number;
}

export interface SplitPdfResponse {
  downloadUrl: string;
  fileId: string;
  filename: string;
  fileSize: number;
  isZip: boolean;
  partsCount: number;
  totalPages: number;
}
