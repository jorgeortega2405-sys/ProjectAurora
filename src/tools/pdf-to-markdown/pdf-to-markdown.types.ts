export type MarkdownConversionMode = 'academic' | 'clean' | 'structured' | 'tables';

export interface PdfToMarkdownParams {
  buffer: Buffer;
  customPrompt?: string;
  includeMathLatex?: boolean;
  mode?: MarkdownConversionMode;
  originalname?: string;
  preserveTables?: boolean;
  removeHeadersFooters?: boolean;
}

export interface PdfToMarkdownResponse {
  characterCount: number;
  downloadUrl: string;
  fileId: string;
  filename: string;
  lineCount: number;
  markdown: string;
  mode: MarkdownConversionMode;
  model: string;
  processingTimeMs: number;
  wordCount: number;
}

export interface StoredMarkdownFile {
  buffer: Buffer;
  contentType: string;
  createdAt: number;
  fileId: string;
  filename: string;
  fileSize: number;
  markdown: string;
}
