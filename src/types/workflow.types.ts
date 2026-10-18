export type WorkflowCategory = 'pdf' | 'image';

export interface WorkflowStep {
  id: string;
  options: Record<string, any>;
  tool: string;
}

export interface UserWorkflow {
  category: WorkflowCategory;
  created_at: string;
  description: string | null;
  id: string;
  name: string;
  steps: WorkflowStep[];
  updated_at: string;
  user_id: string;
}

export interface CreateWorkflowDto {
  category?: WorkflowCategory;
  description?: string;
  name: string;
  steps: WorkflowStep[];
}

export interface UpdateWorkflowDto {
  category?: WorkflowCategory;
  description?: string;
  name?: string;
  steps?: WorkflowStep[];
}

export interface WorkflowExecutionStepResult {
  stepId: string;
  success: boolean;
  tool: string;
}

export interface WorkflowExecutionResponse {
  downloadUrl?: string;
  filename?: string;
  fileSize?: number;
  steps: WorkflowExecutionStepResult[];
  success: boolean;
  totalSteps: number;
}
