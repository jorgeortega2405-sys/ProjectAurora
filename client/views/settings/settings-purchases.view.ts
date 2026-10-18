import { escapeHtml, getApi } from '../../services/api.service.js';
import { t, translateElement } from '../../services/i18n.service.js';
import { renderIcons } from '../../services/icon.service.js';
import { loadTemplate } from '../../services/template.service.js';
import { ViewController } from '../../types/common.types.js';

interface PurchaseItem {
  amount_total: number;
  billing_period: string;
  created_at: string;
  currency: string;
  id: number;
  plan_id: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_session_id: string;
  stripe_subscription_id: string | null;
}

export class PurchasesViewController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private purchases: PurchaseItem[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    translateElement(this.container);
    renderIcons(this.container);
    this.setupSearchToolbar();
    await this.loadPurchases();
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private async loadPurchases(): Promise<void> {
    try {
      const res = await getApi('/api/subscriptions/purchases');
      if (res.ok) {
        const data = await res.json();
        this.purchases = Array.isArray(data.purchases) ? data.purchases : [];
      } else {
        this.purchases = [];
      }
    } catch {
      this.purchases = [];
    }
    this.renderPurchases(this.purchases);
  }

  private renderPurchases(items: PurchaseItem[]): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="purchases-tbody"]');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (items.length === 0) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `
        <td colspan="6" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">
          <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <svg class="component-icon" aria-hidden="true" style="font-size: 32px; color: var(--text-tertiary);"><use href="/icons.svg#receipt_long"></use></svg>
            <span>${escapeHtml(t('settings.purchases.empty') || 'No tienes compras registradas.')}</span>
          </div>
        </td>
      `;
      tbody.appendChild(emptyRow);
      return;
    }

    items.forEach((item) => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-ref', `purchase-row-${item.id}`);

      let dateFormatted = '-';
      if (item.created_at) {
        try {
          const d = new Date(item.created_at);
          dateFormatted = d.toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          });
        } catch {}
      }

      const planName = item.plan_id === 'enterprise' ? 'Aurora Empresas' : 'Aurora Pro';
      const periodName = item.billing_period === 'yearly'
        ? (t('upgrade.billing_yearly') || 'Anual')
        : (t('upgrade.billing_monthly') || 'Mensual');
      const amountFormatted = `${item.currency} $${Number(item.amount_total || 0).toFixed(2)}`;

      let statusBadge = '<span class="component-badge component-badge--sm">Pendiente</span>';
      if (item.status === 'completed') {
        statusBadge = '<span class="component-badge component-badge--sm component-badge--success">Completado</span>';
      } else if (item.status === 'failed') {
        statusBadge = '<span class="component-badge component-badge--sm component-badge--danger">Fallido</span>';
      }

      const refId = item.stripe_session_id.startsWith('inv_')
        ? item.stripe_session_id
        : item.stripe_session_id.slice(0, 16) + '...';

      tr.innerHTML = `
        <td data-ref="cell-date-${item.id}">${escapeHtml(dateFormatted)}</td>
        <td data-ref="cell-plan-${item.id}"><strong>${escapeHtml(planName)}</strong></td>
        <td data-ref="cell-period-${item.id}">${escapeHtml(periodName)}</td>
        <td data-ref="cell-amount-${item.id}">${escapeHtml(amountFormatted)}</td>
        <td data-ref="cell-status-${item.id}">${statusBadge}</td>
        <td data-ref="cell-ref-${item.id}"><code>${escapeHtml(refId)}</code></td>
      `;

      tbody.appendChild(tr);
    });
  }

  private setupSearchToolbar(): void {
    const btnToggleSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-search"]');
    const searchToolbar = this.container.querySelector<HTMLElement>('[data-ref="search-toolbar"]');
    const searchInput = this.container.querySelector<HTMLInputElement>('[data-ref="purchases-search-input"]');
    const btnClearSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-clear-search"]');

    btnToggleSearch?.addEventListener('click', (e) => {
      e.preventDefault();
      if (!searchToolbar) return;
      const isHidden = searchToolbar.classList.contains('is-hidden');
      if (isHidden) {
        searchToolbar.classList.remove('is-hidden');
        searchInput?.focus();
      } else {
        searchToolbar.classList.add('is-hidden');
        if (searchInput) {
          searchInput.value = '';
          this.renderPurchases(this.purchases);
        }
        if (btnClearSearch) btnClearSearch.style.display = 'none';
      }
    });

    searchInput?.addEventListener('input', () => {
      const query = (searchInput.value || '').trim().toLowerCase();
      if (btnClearSearch) {
        btnClearSearch.style.display = query.length > 0 ? 'inline-flex' : 'none';
      }

      if (!query) {
        this.renderPurchases(this.purchases);
        return;
      }

      const filtered = this.purchases.filter((p) => {
        return (
          p.plan_id.toLowerCase().includes(query) ||
          p.billing_period.toLowerCase().includes(query) ||
          p.status.toLowerCase().includes(query) ||
          p.stripe_session_id.toLowerCase().includes(query) ||
          String(p.amount_total).includes(query)
        );
      });
      this.renderPurchases(filtered);
    });

    btnClearSearch?.addEventListener('click', (e) => {
      e.preventDefault();
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      if (btnClearSearch) btnClearSearch.style.display = 'none';
      this.renderPurchases(this.purchases);
    });
  }
}

export async function createPurchasesView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/settings/purchases.html');
  const controller = new PurchasesViewController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
