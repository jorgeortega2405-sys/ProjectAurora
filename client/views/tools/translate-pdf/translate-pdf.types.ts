export interface TranslatePdfResultData {
  downloadUrl: string;
  fileId: string;
  filename: string;
  format: string;
  originalname: string;
  size: number;
  sourceLang?: string;
  targetLang: string;
}
