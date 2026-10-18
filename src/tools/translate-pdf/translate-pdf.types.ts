export interface TranslatePdfParams {
  buffer: Buffer;
  filename: string;
  originalname?: string;
  sourceLang?: string;
  targetLang: string;
}

export interface TranslatePdfResponse {
  downloadUrl: string;
  fileId: string;
  filename: string;
  format: string;
  originalname: string;
  size: number;
  sourceLang?: string;
  targetLang: string;
}

export interface StoredTranslatedPdf {
  buffer: Buffer;
  contentType: string;
  createdAt: number;
  filename: string;
  format: string;
  originalname: string;
  size: number;
  sourceLang?: string;
  targetLang: string;
}
