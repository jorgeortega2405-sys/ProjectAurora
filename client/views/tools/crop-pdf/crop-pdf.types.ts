export interface CropBoxPercent {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface CropPdfResponseData {
  downloadUrl: string;
  fileId: string;
  filename: string;
  fileSize: number;
  totalPages: number;
}
