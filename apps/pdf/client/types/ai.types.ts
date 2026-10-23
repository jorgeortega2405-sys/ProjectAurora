export interface AttachedClientFile {
  file: File;
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface ChatMessageAlternativeOption {
  icon?: string;
  label: string;
  prompt: string;
  sourceType?: 'original' | 'result';
  tool?: string;
}

export interface ChatMessageResult {
  action?: string;
  alternatives?: ChatMessageAlternativeOption[];
  characterCount?: number;
  downloadUrl?: string;
  extractedChars?: number;
  fileSize?: number;
  filename?: string;
  mode?: string;
  originalFilename?: string;
  originalSize?: number;
  originalToken?: string;
  savingsBytes?: number;
  savingsPercent?: number;
  summary?: string;
  token?: string;
  tool?: string;
  wordCount?: number;
}

export interface ChatMessageItem {
  files?: Array<{ name: string; size: number }>;
  id: string;
  reply: string;
  result?: ChatMessageResult;
  results?: ChatMessageResult[];
  role: 'assistant' | 'user';
  suggestedActions?: string[];
  timestamp: number;
}
