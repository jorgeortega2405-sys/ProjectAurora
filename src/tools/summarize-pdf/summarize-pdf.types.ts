export type SummaryMode = 'standard' | 'advanced';

export interface SummarizePdfParams {
  buffer: Buffer;
  customPrompt?: string;
  filename?: string;
  mode?: SummaryMode;
  originalname: string;
}

export interface SummarizePdfResponse {
  characterCount: number;
  extractedChars: number;
  filename: string;
  mode: SummaryMode;
  model: string;
  summary: string;
  wordCount: number;
}
