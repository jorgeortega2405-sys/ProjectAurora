export type SummaryMode = 'executive' | 'detailed' | 'key_points' | 'qa';

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
