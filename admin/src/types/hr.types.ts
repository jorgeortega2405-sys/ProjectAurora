export interface HrDepartment {
  color: string;
  created_at: string;
  description: string | null;
  id: string;
  name: string;
}

export type EmploymentType = 'full_time' | 'part_time' | 'contractor' | 'intern';
export type EmployeeStatus = 'active' | 'on_leave' | 'probation' | 'terminated';
export type SalaryFrequency = 'monthly' | 'biweekly' | 'weekly' | 'annual';
export type DocumentType = 'contract' | 'nda' | 'tax_id' | 'certification' | 'other';
export type VacationStatus = 'pending' | 'approved' | 'rejected';

export interface HrEmployee {
  avatar_url: string | null;
  created_at: string;
  department_color: string;
  department_id: string;
  department_name: string;
  direct_reports_count: number;
  email: string;
  employment_type: EmploymentType;
  hire_date: string;
  id: string;
  job_title: string;
  manager_id: string | null;
  manager_name: string | null;
  manager_title: string | null;
  notes: string | null;
  role: string;
  salary_amount: number;
  salary_currency: string;
  salary_frequency: SalaryFrequency;
  status: EmployeeStatus;
  updated_at: string;
  user_id: string;
  username: string;
  vacation_balance: number;
  vacation_days_allocated: number;
  vacation_days_used: number;
}

export interface HrDocument {
  created_at: string;
  document_type: DocumentType;
  employee_id: string;
  employee_name: string;
  file_name: string;
  file_size_bytes: number;
  file_url: string;
  id: string;
  mime_type: string;
  title: string;
  uploaded_by: string | null;
  uploaded_by_username: string | null;
}

export interface HrVacationRequest {
  created_at: string;
  days_count: number;
  employee_id: string;
  employee_name: string;
  end_date: string;
  id: string;
  reason: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  start_date: string;
  status: VacationStatus;
}

export interface HrOrganigramNode {
  avatar_url: string | null;
  department_color: string;
  department_id: string;
  department_name: string;
  direct_reports_count: number;
  email: string;
  hire_date: string;
  id: string;
  job_title: string;
  name: string;
  role: string;
  salary_amount: number;
  salary_currency: string;
  status: EmployeeStatus;
  subordinates: HrOrganigramNode[];
  user_id: string;
  vacation_balance: number;
}

export interface HireEmployeeInput {
  department_id: string;
  email?: string;
  employment_type?: EmploymentType;
  full_name: string;
  hire_date: string;
  job_title: string;
  manager_id?: string | null;
  notes?: string;
  role: string;
  salary_amount: number;
  salary_currency?: string;
  salary_frequency?: SalaryFrequency;
  vacation_days_allocated?: number;
}

export interface HireEmployeeResult {
  credentials: {
    email: string;
    role: string;
    temporary_password: string;
    username: string;
  };
  employee: HrEmployee;
}

export interface HrSummaryStats {
  active_employees: number;
  monthly_payroll_usd: number;
  on_leave_employees: number;
  pending_vacations_count: number;
  total_documents_count: number;
  total_employees: number;
}
