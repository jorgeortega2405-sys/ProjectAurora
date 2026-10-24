import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { DashboardStatsResponse } from '../types/dashboard.types.js';
import Chart from 'chart.js/auto';

function formatNumber(num: number): string {
  return new Intl.NumberFormat('es-MX').format(num);
}

export class DashboardController implements ViewController {
  private abortController: AbortController | null = null;
  private chartTickets: Chart | null = null;
  private chartTiers: Chart | null = null;
  private chartTrends: Chart | null = null;
  private container: HTMLElement;
  private statsData: DashboardStatsResponse | null = null;
  private themeObserver: MutationObserver | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    renderIcons(this.container);
    this.setupThemeObserver();
    await this.loadStats();
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.destroyCharts();
    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }
  }

  private setupThemeObserver(): void {
    this.themeObserver = new MutationObserver(() => {
      if (this.statsData) {
        this.renderCharts(this.statsData);
      }
    });

    this.themeObserver.observe(document.documentElement, {
      attributeFilter: ['data-theme', 'class'],
      attributes: true,
    });
  }

  private async loadStats(): Promise<void> {
    const signal = this.abortController?.signal;

    try {
      const res = await fetch('/api/admin/dashboard/stats', { signal });
      const data = await res.json().catch(() => ({})) as { error?: string; stats?: DashboardStatsResponse; success?: boolean };

      if (res.ok && data.success && data.stats) {
        this.statsData = data.stats;
        this.populateCards(data.stats);
        this.renderCharts(data.stats);
      } else {
        showToast(data.error || 'No se pudieron consultar las métricas del dashboard.', 'danger');
      }
    } catch {
      if (!this.abortController?.signal.aborted) {
        showToast('Error de comunicación con el servidor al cargar métricas.', 'danger');
      }
    }
  }

  private populateCards(stats: DashboardStatsResponse): void {
    const { summary } = stats;

    const accTodayEl = this.container.querySelector<HTMLElement>('[data-ref="stat-accounts-today"]');
    const accTotalEl = this.container.querySelector<HTMLElement>('[data-ref="stat-accounts-total"]');
    const accTrendEl = this.container.querySelector<HTMLElement>('[data-ref="stat-accounts-trend"]');

    if (accTodayEl) accTodayEl.textContent = formatNumber(summary.accountsToday);
    if (accTotalEl) accTotalEl.textContent = `Total: ${formatNumber(summary.accountsTotal)} usuarios`;
    if (accTrendEl) {
      const diff = summary.accountsToday - summary.accountsYesterday;
      if (diff > 0) {
        accTrendEl.textContent = `+${diff} vs ayer`;
        accTrendEl.className = 'component-badge component-badge--sm component-badge--success';
      } else if (diff < 0) {
        accTrendEl.textContent = `${diff} vs ayer`;
        accTrendEl.className = 'component-badge component-badge--sm component-badge--secondary';
      } else {
        accTrendEl.textContent = '= vs ayer';
        accTrendEl.className = 'component-badge component-badge--sm component-badge--secondary';
      }
    }

    const wfTodayEl = this.container.querySelector<HTMLElement>('[data-ref="stat-workflows-today"]');
    const wfTotalEl = this.container.querySelector<HTMLElement>('[data-ref="stat-workflows-total"]');
    const wfTrendEl = this.container.querySelector<HTMLElement>('[data-ref="stat-workflows-trend"]');

    if (wfTodayEl) wfTodayEl.textContent = formatNumber(summary.workflowsToday);
    if (wfTotalEl) wfTotalEl.textContent = `Total: ${formatNumber(summary.workflowsTotal)} flujos`;
    if (wfTrendEl) {
      const diff = summary.workflowsToday - summary.workflowsYesterday;
      if (diff > 0) {
        wfTrendEl.textContent = `+${diff} vs ayer`;
        wfTrendEl.className = 'component-badge component-badge--sm component-badge--success';
      } else if (diff < 0) {
        wfTrendEl.textContent = `${diff} vs ayer`;
        wfTrendEl.className = 'component-badge component-badge--sm component-badge--secondary';
      } else {
        wfTrendEl.textContent = '= vs ayer';
        wfTrendEl.className = 'component-badge component-badge--sm component-badge--secondary';
      }
    }

    const tktActiveEl = this.container.querySelector<HTMLElement>('[data-ref="stat-tickets-active"]');
    const tktResolvedEl = this.container.querySelector<HTMLElement>('[data-ref="stat-tickets-resolved"]');
    if (tktActiveEl) tktActiveEl.textContent = formatNumber(summary.ticketsActive);
    if (tktResolvedEl) tktResolvedEl.textContent = `${formatNumber(summary.ticketsResolved)} resueltos`;

    const subActiveEl = this.container.querySelector<HTMLElement>('[data-ref="stat-subscribers-active"]');
    const subTotalEl = this.container.querySelector<HTMLElement>('[data-ref="stat-subscribers-total"]');
    if (subActiveEl) subActiveEl.textContent = formatNumber(summary.activeSubscribers);
    if (subTotalEl) subTotalEl.textContent = `Pro (${formatNumber(stats.tiers.pro)}) & Enterprise (${formatNumber(stats.tiers.enterprise)})`;

    const freeCountEl = this.container.querySelector<HTMLElement>('[data-ref="tier-count-free"]');
    const proCountEl = this.container.querySelector<HTMLElement>('[data-ref="tier-count-pro"]');
    const entCountEl = this.container.querySelector<HTMLElement>('[data-ref="tier-count-enterprise"]');

    if (freeCountEl) freeCountEl.textContent = formatNumber(stats.tiers.free);
    if (proCountEl) proCountEl.textContent = formatNumber(stats.tiers.pro);
    if (entCountEl) entCountEl.textContent = formatNumber(stats.tiers.enterprise);
  }

  private renderCharts(stats: DashboardStatsResponse): void {
    this.destroyCharts();

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
    const tooltipBg = isDark ? '#1e293b' : '#ffffff';
    const tooltipText = isDark ? '#f8fafc' : '#0f172a';
    const tooltipBorder = isDark ? '#334155' : '#e2e8f0';

    const canvasTrends = this.container.querySelector<HTMLCanvasElement>('[data-ref="canvas-chart-trends"]');
    if (canvasTrends) {
      const labels = stats.trends.map((t) => t.label);
      const accountsData = stats.trends.map((t) => t.accounts);
      const workflowsData = stats.trends.map((t) => t.workflows);

      this.chartTrends = new Chart(canvasTrends, {
        data: {
          datasets: [
            {
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              borderColor: '#3b82f6',
              borderWidth: 2.5,
              data: accountsData,
              fill: true,
              label: 'Nuevos Usuarios',
              pointBackgroundColor: '#3b82f6',
              pointHoverRadius: 6,
              pointRadius: 3,
              tension: 0.35,
            },
            {
              backgroundColor: 'rgba(234, 88, 12, 0.08)',
              borderColor: '#ea580c',
              borderWidth: 2.5,
              data: workflowsData,
              fill: true,
              label: 'Workflows Creados',
              pointBackgroundColor: '#ea580c',
              pointHoverRadius: 6,
              pointRadius: 3,
              tension: 0.35,
            },
          ],
          labels,
        },
        options: {
          animation: { duration: 600 },
          interaction: { intersect: false, mode: 'index' },
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: tooltipBg,
              borderColor: tooltipBorder,
              borderWidth: 1,
              bodyColor: tooltipText,
              padding: 10,
              titleColor: tooltipText,
            },
          },
          responsive: true,
          scales: {
            x: {
              grid: { color: gridColor },
              ticks: { color: textColor, font: { size: 11 } },
            },
            y: {
              beginAtZero: true,
              grid: { color: gridColor },
              ticks: {
                color: textColor,
                font: { size: 11 },
                precision: 0,
              },
            },
          },
        },
        type: 'line',
      });
    }

    const canvasTiers = this.container.querySelector<HTMLCanvasElement>('[data-ref="canvas-chart-tiers"]');
    if (canvasTiers) {
      const totalTiers = stats.tiers.free + stats.tiers.pro + stats.tiers.enterprise;
      const dataValues = totalTiers > 0
        ? [stats.tiers.free, stats.tiers.pro, stats.tiers.enterprise]
        : [1, 0, 0];

      this.chartTiers = new Chart(canvasTiers, {
        data: {
          datasets: [
            {
              backgroundColor: totalTiers > 0 ? ['#64748b', '#3b82f6', '#ea580c'] : ['#94a3b8', '#3b82f6', '#ea580c'],
              borderColor: isDark ? '#18181b' : '#ffffff',
              borderWidth: 2,
              data: dataValues,
              hoverOffset: 6,
            },
          ],
          labels: ['Free', 'Pro', 'Enterprise'],
        },
        options: {
          animation: { duration: 600 },
          cutout: '72%',
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: tooltipBg,
              borderColor: tooltipBorder,
              borderWidth: 1,
              bodyColor: tooltipText,
              callbacks: {
                label: (ctx: any) => {
                  const val = Number(ctx.raw || 0);
                  const pct = totalTiers > 0 ? ((val / totalTiers) * 100).toFixed(1) : '0';
                  return ` ${ctx.label}: ${formatNumber(val)} (${pct}%)`;
                },
              },
              padding: 10,
              titleColor: tooltipText,
            },
          },
          responsive: true,
        },
        type: 'doughnut',
      });
    }

    const canvasTickets = this.container.querySelector<HTMLCanvasElement>('[data-ref="canvas-chart-tickets"]');
    if (canvasTickets) {
      const ticketLabels = ['Abiertos', 'En curso', 'Urgentes', 'Resueltos', 'Cerrados'];
      const ticketValues = [
        stats.tickets.open,
        stats.tickets.in_progress,
        stats.tickets.urgent,
        stats.tickets.resolved,
        stats.tickets.closed,
      ];

      this.chartTickets = new Chart(canvasTickets, {
        data: {
          datasets: [
            {
              backgroundColor: ['#f59e0b', '#3b82f6', '#ef4444', '#10b981', '#64748b'],
              borderRadius: 6,
              data: ticketValues,
              label: 'Tickets',
            },
          ],
          labels: ticketLabels,
        },
        options: {
          animation: { duration: 600 },
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: tooltipBg,
              borderColor: tooltipBorder,
              borderWidth: 1,
              bodyColor: tooltipText,
              padding: 10,
              titleColor: tooltipText,
            },
          },
          responsive: true,
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: textColor, font: { size: 11 } },
            },
            y: {
              beginAtZero: true,
              grid: { color: gridColor },
              ticks: {
                color: textColor,
                font: { size: 11 },
                precision: 0,
              },
            },
          },
        },
        type: 'bar',
      });
    }
  }

  private destroyCharts(): void {
    if (this.chartTrends) {
      this.chartTrends.destroy();
      this.chartTrends = null;
    }
    if (this.chartTiers) {
      this.chartTiers.destroy();
      this.chartTiers = null;
    }
    if (this.chartTickets) {
      this.chartTickets.destroy();
      this.chartTickets = null;
    }
  }
}

export async function createDashboardView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/dashboard/dashboard.html');
  const controller = new DashboardController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
