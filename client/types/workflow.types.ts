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
  user_id: string;
}

export interface ToolDefinition {
  category: 'pdf' | 'image';
  group: string;
  icon: string;
  id: string;
  isTerminal?: boolean;
  name: string;
}
