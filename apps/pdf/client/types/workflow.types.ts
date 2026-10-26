export interface WorkflowStep {
  id: string;
  options: Record<string, any>;
  tool: string;
}

export interface UserWorkflow {
  category: 'pdf' | 'image';
  created_at: string;
  description: string | null;
  id: string;
  name: string;
  steps: WorkflowStep[];
  updated_at: string;
}

export interface ToolDefinition {
  category: 'pdf' | 'image';
  group: string;
  icon: string;
  id: string;
  isTerminal?: boolean;
  name: string;
  targetType?: string;
}

export interface OrganizePageItem {
  id: string;
  originalIndex: number;
  pageNum: number;
  rotation: number;
  thumbnailDataUrl?: string;
}
