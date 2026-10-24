export interface DashboardSummary {
  accountsToday: number;
  accountsTotal: number;
  accountsYesterday: number;
  activeSubscribers: number;
  ticketsActive: number;
  ticketsResolved: number;
  ticketsTotal: number;
  totalRevenue: number;
  totalSubscribers: number;
  workflowsToday: number;
  workflowsTotal: number;
  workflowsYesterday: number;
}

export interface DashboardTimeSeriesPoint {
  accounts: number;
  date: string;
  label: string;
  workflows: number;
}

export interface DashboardTierDistribution {
  enterprise: number;
  free: number;
  pro: number;
}

export interface DashboardTicketsByStatus {
  closed: number;
  in_progress: number;
  open: number;
  resolved: number;
  urgent: number;
}

export interface DashboardStatsResponse {
  summary: DashboardSummary;
  tickets: DashboardTicketsByStatus;
  tiers: DashboardTierDistribution;
  trends: DashboardTimeSeriesPoint[];
}
