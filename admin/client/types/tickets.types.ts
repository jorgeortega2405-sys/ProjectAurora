export type TicketCategory =
  | 'access'
  | 'facilities'
  | 'finance'
  | 'hardware'
  | 'hr'
  | 'network'
  | 'other'
  | 'software';

export type TicketPriority = 'high' | 'low' | 'medium' | 'urgent';

export type TicketStatus = 'closed' | 'in_progress' | 'open' | 'resolved';

export interface InternalTicket {
  assigned_to: string | null;
  assignee_avatar_url: string | null;
  assignee_job_title: string | null;
  assignee_username: string | null;
  category: TicketCategory;
  closed_at: string | null;
  comments_count: number;
  created_at: string;
  created_by: string;
  creator_avatar_url: string | null;
  creator_job_title: string | null;
  creator_username: string;
  description: string;
  id: string;
  priority: TicketPriority;
  resolution_notes: string | null;
  resolved_at: string | null;
  source_department_color: string | null;
  source_department_id: string | null;
  source_department_name: string | null;
  status: TicketStatus;
  target_department_color: string;
  target_department_id: string;
  target_department_name: string;
  ticket_number: string;
  title: string;
  updated_at: string;
}

export interface InternalTicketComment {
  avatar_url: string | null;
  created_at: string;
  department_name: string | null;
  id: string;
  is_internal_note: boolean;
  job_title: string | null;
  message: string;
  ticket_id: string;
  user_id: string;
  username: string;
}

export interface TicketSummaryStats {
  closed: number;
  in_progress: number;
  open: number;
  resolved: number;
  total: number;
  urgent_or_high: number;
}

export interface CreateTicketInput {
  category?: TicketCategory;
  description: string;
  priority?: TicketPriority;
  source_department_id?: string | null;
  target_department_id: string;
  title: string;
}

export interface UpdateTicketInput {
  assigned_to?: string | null;
  category?: TicketCategory;
  priority?: TicketPriority;
  resolution_notes?: string | null;
  status?: TicketStatus;
  target_department_id?: string;
}

export interface DepartmentOption {
  color: string;
  description: string | null;
  id: string;
  name: string;
}

export interface StaffOption {
  department_id: string;
  department_name: string;
  id: string;
  job_title: string;
  user_id: string;
  username: string;
}
