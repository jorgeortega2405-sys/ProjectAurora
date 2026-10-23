import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { ViewController } from '../types/common.types.js';

export class DashboardController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    renderIcons(this.container);
    await this.loadStats();
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private async loadStats(): Promise<void> {
    const elUsers = this.container.querySelector<HTMLElement>('[data-ref="stat-total-users"]');
    const elUptime = this.container.querySelector<HTMLElement>('[data-ref="stat-server-uptime"]');
    const signal = this.abortController?.signal;

    try {
      const [resUsers, resHealth] = await Promise.all([
        fetch('/api/admin/users', { signal }),
        fetch('/api/admin/health', { signal }),
      ]);

      if (resUsers.ok) {
        const dataUsers = await resUsers.json() as { total?: number };
        if (elUsers && typeof dataUsers.total === 'number') {
          elUsers.textContent = String(dataUsers.total);
        }
      }

      if (resHealth.ok) {
        const dataHealth = await resHealth.json() as { uptime?: number };
        if (elUptime && typeof dataHealth.uptime === 'number') {
          const uptimeSec = Math.floor(dataHealth.uptime);
          const hours = Math.floor(uptimeSec / 3600);
          const minutes = Math.floor((uptimeSec % 3600) / 60);
          elUptime.textContent = `${hours}h ${minutes}m`;
        }
      }
    } catch {}
  }
}

export async function createDashboardView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/dashboard/dashboard.html');
  const controller = new DashboardController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
