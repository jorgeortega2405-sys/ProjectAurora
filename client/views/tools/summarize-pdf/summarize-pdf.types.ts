export type ClientSummaryMode = 'executive' | 'detailed' | 'key_points' | 'qa';

export interface SummarizePdfResultData {
  characterCount: number;
  extractedChars: number;
  filename: string;
  mode: ClientSummaryMode;
  model: string;
  summary: string;
  wordCount: number;
}
