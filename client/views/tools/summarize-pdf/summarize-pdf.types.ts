export type ClientSummaryMode = 'standard' | 'advanced';

export interface SummarizePdfResultData {
  characterCount: number;
  extractedChars: number;
  filename: string;
  mode: ClientSummaryMode;
  model: string;
  summary: string;
  wordCount: number;
}
