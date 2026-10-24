import { DashboardStatsResponse, DashboardSummary, DashboardTicketsByStatus, DashboardTierDistribution, DashboardTimeSeriesPoint } from '../types/dashboard.types.js';
import { adminDbPool } from './db.service.js';
import { logger } from './logger.service.js';
import { RowDataPacket } from 'mysql2/promise';

function formatDayLabel(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const monthIndex = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const monthName = monthNames[monthIndex] || parts[1];
  return `${day} ${monthName}`;
}

export async function getDashboardStats(): Promise<DashboardStatsResponse> {
  try {
    let workflowsToday = 0;
    let workflowsYesterday = 0;
    let workflowsTotal = 0;
    const workflowMap = new Map<string, number>();

    try {
      const [wfRows] = await adminDbPool.query<RowDataPacket[]>(`
        SELECT
          (SELECT COUNT(*) FROM user_workflows WHERE DATE(created_at) = CURDATE()) AS workflowsToday,
          (SELECT COUNT(*) FROM user_workflows WHERE DATE(created_at) = SUBDATE(CURDATE(), 1)) AS workflowsYesterday,
          (SELECT COUNT(*) FROM user_workflows) AS workflowsTotal
      `);
      if (wfRows[0]) {
        workflowsToday = Number(wfRows[0].workflowsToday || 0);
        workflowsYesterday = Number(wfRows[0].workflowsYesterday || 0);
        workflowsTotal = Number(wfRows[0].workflowsTotal || 0);
      }

      const [wfTrendRows] = await adminDbPool.query<RowDataPacket[]>(`
        SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date, COUNT(*) AS count
        FROM user_workflows
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
        GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
      `);
      wfTrendRows.forEach((r) => {
        workflowMap.set(String(r.date), Number(r.count || 0));
      });
    } catch (wfErr) {
      logger.db.warn('No se pudieron consultar métricas de user_workflows', wfErr);
    }

    let totalRevenue = 0;
    try {
      const [revRows] = await adminDbPool.query<RowDataPacket[]>(`
        SELECT COALESCE(SUM(amount_total), 0) AS totalRevenue
        FROM purchases
        WHERE status IN ('completed', 'paid')
      `);
      if (revRows[0]) {
        totalRevenue = Number(revRows[0].totalRevenue || 0);
      }
    } catch (revErr) {
      logger.db.warn('No se pudieron consultar ingresos de purchases', revErr);
    }

    const [summaryRows] = await adminDbPool.query<RowDataPacket[]>(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE DATE(created_at) = CURDATE()) AS accountsToday,
        (SELECT COUNT(*) FROM users WHERE DATE(created_at) = SUBDATE(CURDATE(), 1)) AS accountsYesterday,
        (SELECT COUNT(*) FROM users) AS accountsTotal,
        (SELECT COUNT(*) FROM users WHERE subscription_tier IN ('pro', 'enterprise')) AS activeSubscribers,
        (SELECT COUNT(*) FROM users WHERE subscription_tier != 'free') AS totalSubscribers
    `);

    const s = summaryRows[0] || {};

    const tickets: DashboardTicketsByStatus = {
      closed: 0,
      in_progress: 0,
      open: 0,
      resolved: 0,
      urgent: 0,
    };

    try {
      const [ticketRows] = await adminDbPool.query<RowDataPacket[]>(`
        SELECT LOWER(status) AS status, COUNT(*) AS count
        FROM internal_tickets
        GROUP BY LOWER(status)
      `);
      ticketRows.forEach((r) => {
        const st = String(r.status || '').toLowerCase();
        const count = Number(r.count || 0);
        if (st === 'open') tickets.open = count;
        else if (st === 'in_progress') tickets.in_progress = count;
        else if (st === 'resolved') tickets.resolved = count;
        else if (st === 'closed') tickets.closed = count;
      });

      const [urgentRows] = await adminDbPool.query<RowDataPacket[]>(`
        SELECT COUNT(*) AS count
        FROM internal_tickets
        WHERE priority IN ('urgent', 'high') AND status IN ('open', 'in_progress')
      `);
      if (urgentRows[0]) {
        tickets.urgent = Number(urgentRows[0].count || 0);
      }
    } catch (tktErr) {
      logger.db.warn('No se pudieron consultar métricas de internal_tickets', tktErr);
    }

    const ticketsActive = tickets.open + tickets.in_progress;
    const ticketsResolved = tickets.resolved + tickets.closed;
    const ticketsTotal = ticketsActive + ticketsResolved;

    const summary: DashboardSummary = {
      accountsToday: Number(s.accountsToday || 0),
      accountsTotal: Number(s.accountsTotal || 0),
      accountsYesterday: Number(s.accountsYesterday || 0),
      activeSubscribers: Number(s.activeSubscribers || 0),
      ticketsActive,
      ticketsResolved,
      ticketsTotal,
      totalRevenue,
      totalSubscribers: Number(s.totalSubscribers || 0),
      workflowsToday,
      workflowsTotal,
      workflowsYesterday,
    };

    const [userTrendRows] = await adminDbPool.query<RowDataPacket[]>(`
      SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date, COUNT(*) AS count
      FROM users
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
    `);

    const userMap = new Map<string, number>();
    userTrendRows.forEach((r) => {
      userMap.set(String(r.date), Number(r.count || 0));
    });

    const trends: DashboardTimeSeriesPoint[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      trends.push({
        accounts: userMap.get(dateStr) || 0,
        date: dateStr,
        label: formatDayLabel(dateStr),
        workflows: workflowMap.get(dateStr) || 0,
      });
    }

    const [tierRows] = await adminDbPool.query<RowDataPacket[]>(`
      SELECT LOWER(subscription_tier) AS tier, COUNT(*) AS count
      FROM users
      GROUP BY LOWER(subscription_tier)
    `);

    const tiers: DashboardTierDistribution = {
      enterprise: 0,
      free: 0,
      pro: 0,
    };

    tierRows.forEach((r) => {
      const tierKey = String(r.tier || '').toLowerCase();
      const count = Number(r.count || 0);
      if (tierKey === 'pro') tiers.pro = count;
      else if (tierKey === 'enterprise' || tierKey === 'business') tiers.enterprise = count;
      else tiers.free += count;
    });

    return { summary, tickets, tiers, trends };
  } catch (err) {
    logger.db.error('Error al calcular estadísticas del dashboard de Aurora', err);
    throw err;
  }
}
