export type ConversionType =
  | 'pdf-to-jpg'
  | 'pdf-to-word'
  | 'pdf-to-powerpoint'
  | 'pdf-to-excel'
  | 'pdf-to-pdfa';

export interface ConversionTypeConfig {
  actionBtnKey: string;
  badgeLabel: string;
  colorClass: string;
  descKey: string;
  icon: string;
  mimeType: string;
  nameKey: string;
  outputExt: string;
  type: ConversionType;
}

export interface ConvertJobResult {
  downloadToken: string;
  downloadUrl: string;
  fileSize: number;
  filename: string;
  isZip: boolean;
  mimeType: string;
  success: boolean;
}

export interface StoredConversionFile {
  buffer: Buffer;
  contentType: string;
  createdAt: number;
  filePath?: string;
  filename: string;
  isZip?: boolean;
  mimeType: string;
  token: string;
}
