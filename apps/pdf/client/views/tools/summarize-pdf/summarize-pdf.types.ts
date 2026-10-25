export interface SummarizePdfResultData {
  characterCount: number;
  extractedChars: number;
  filename: string;
  mode?: string;
  model: string;
  summary: string;
  wordCount: number;
}
