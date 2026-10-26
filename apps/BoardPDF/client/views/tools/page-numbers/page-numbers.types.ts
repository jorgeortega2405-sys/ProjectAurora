export type PageNumberPosition =
  | 'bottom-center'
  | 'bottom-left'
  | 'bottom-right'
  | 'top-center'
  | 'top-left'
  | 'top-right';

export type PageNumberMargin = 'large' | 'recommended' | 'small';

export type PageNumberMode = 'double' | 'single';

export interface PageThumbnailItem {
  id: string;
  originalIndex: number;
  pageNum: number;
}

export interface PageNumberResponseData {
  downloadUrl: string;
  fileId: string;
  filename: string;
  fileSize: number;
  totalPages: number;
}
