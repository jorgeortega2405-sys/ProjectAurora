export type ClientMarkdownMode = 'academic' | 'clean' | 'structured' | 'tables';

export interface PdfToMarkdownResultData {
  characterCount: number;
  downloadUrl: string;
  fileId: string;
  filename: string;
  lineCount: number;
  markdown: string;
  mode: ClientMarkdownMode;
  model: string;
  processingTimeMs: number;
  wordCount: number;
}
