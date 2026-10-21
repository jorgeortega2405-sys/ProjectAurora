export type AiChatActionType =
  | 'ask_user'
  | 'chat_response'
  | 'execute_plan';

export interface AiToolStep {
  options?: Record<string, any>;
  tool: string;
}

export interface AiTask {
  description?: string;
  plan: AiToolStep[];
  targetFileIndex?: number;
  targetFilename?: string;
}

export interface AiExecutionPlan {
  action: AiChatActionType;
  missingInfo?: string;
  plan?: AiToolStep[];
  reply: string;
  suggestedActions?: string[];
  tasks?: AiTask[];
  thought?: string;
}

export interface AiFileAttachment {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  path?: string;
  size: number;
}

export interface AiChatParams {
  files?: AiFileAttachment[];
  history?: Array<{ role: 'assistant' | 'user'; text: string }>;
  message: string;
  user?: {
    ai_credits_balance?: number;
    email?: string;
    id: string;
    permissions?: string[];
    subscription_tier?: string;
  };
}

export interface AiAlternativeOption {
  icon?: string;
  label: string;
  prompt: string;
  sourceType?: 'original' | 'result';
  tool?: string;
}

export interface AiActionResult {
  action?: string;
  alternatives?: AiAlternativeOption[];
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

export interface AiChatResponse {
  actionTaken?: string;
  creditsRemaining?: number;
  plan?: AiToolStep[];
  reply: string;
  result?: AiActionResult;
  results?: AiActionResult[];
  success: boolean;
  suggestedActions?: string[];
}
