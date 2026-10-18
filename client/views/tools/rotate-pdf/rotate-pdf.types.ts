export interface RotatePageItem {
  id: string;
  originalIndex: number;
  pageNum: number;
  rotation: number;
  thumbnailUrl?: string;
}

export interface RotatePdfResponseData {
  downloadUrl: string;
  fileId: string;
  filename: string;
  fileSize: number;
  totalPages: number;
}
