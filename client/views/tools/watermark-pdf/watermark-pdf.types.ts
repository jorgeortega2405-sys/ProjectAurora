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

export interface PageThumbnailItem {
  id: string;
  originalIndex: number;
  pageNum: number;
}

export interface WatermarkPdfResponseData {
  downloadUrl: string;
  fileId: string;
  filename: string;
  fileSize: number;
  totalPages: number;
}
