import { escapeHtml, getApi } from '../../services/api.service.js';
import { renderIcons } from '../../services/icon.service.js';
import { loadTemplate } from '../../services/template.service.js';
import { showToast } from '../../services/toast.service.js';
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
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="purchases-tbody"]');
    const badge = this.container.querySelector<HTMLElement>('[data-ref="purchases-count-badge"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="purchases-page-error"]');

    try {
      const res = await getApi('/api/subscriptions/purchases');
      if (!res.ok) {
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 32px; color: var(--text-secondary);">Error al consultar el historial de compras.</td></tr>';
        }
        if (errorBanner) {
          errorBanner.textContent = 'No se pudo cargar el historial de compras. Intenta recargar la página.';
          errorBanner.style.display = 'block';
        }
        return;
      }

      const data = await res.json();
      this.purchases = Array.isArray(data.purchases) ? data.purchases : [];
      if (badge) badge.textContent = String(this.purchases.length);
      this.renderPurchases(this.purchases);
    } catch {
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 32px; color: var(--text-secondary);">Error de red al consultar el historial de compras.</td></tr>';
      }
      if (errorBanner) {
        errorBanner.textContent = 'Error de conexión al cargar tus comprobantes.';
        errorBanner.style.display = 'block';
      }
    }
  }

  private renderPurchases(items: PurchaseItem[]): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="purchases-tbody"]');
    const badge = this.container.querySelector<HTMLElement>('[data-ref="purchases-count-badge"]');
    if (!tbody) return;

    if (badge) badge.textContent = String(items.length);

    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">
            <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
              <div style="width: 44px; height: 44px; border-radius: 50%; background: var(--bg-surface-secondary, rgba(0,0,0,0.04)); display: flex; align-items: center; justify-content: center; color: var(--text-tertiary);">
                <svg class="component-icon" aria-hidden="true" style="width: 22px; height: 22px;"><use href="/icons.svg#receipt_long"></use></svg>
              </div>
              <strong style="font-weight: 600; font-size: 14px; color: var(--text-primary);">No hay compras registradas</strong>
              <span style="font-size: 12.5px; color: var(--text-secondary);">Aquí verás tus recibos, comprobantes y licencias una vez que actives un plan.</span>
            </div>
          </td>
        </tr>
      `;
      renderIcons(tbody);
      return;
    }

    tbody.innerHTML = items
      .map((item) => {
        const isEnterprise = item.plan_id === 'enterprise';
        const planName = isEnterprise ? 'Aurora Empresas' : 'Aurora Pro';
        const periodSubtext = item.billing_period === 'yearly' ? 'Facturación Anual' : 'Facturación Mensual';
        const periodLabel = item.billing_period === 'yearly' ? 'Anual' : 'Mensual';
        const iconBg = isEnterprise ? 'rgba(37, 99, 235, 0.1)' : 'rgba(245, 158, 11, 0.1)';
        const iconColor = isEnterprise ? 'var(--primary-color, #2563eb)' : '#f59e0b';
        const iconHref = isEnterprise ? '/icons.svg#groups' : '/icons.svg#star';

        let dateFormatted = '-';
        if (item.created_at) {
          try {
            dateFormatted = new Intl.DateTimeFormat('es-ES', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            }).format(new Date(item.created_at));
          } catch {}
        }

        const amountFormatted = `$${Number(item.amount_total || 0).toFixed(2)} ${escapeHtml((item.currency || 'USD').toUpperCase())}`;

        let statusBadge = '<span class="component-badge component-badge--sm" style="color: var(--color-warning, #d97706); background: rgba(217, 119, 6, 0.1);">Pendiente</span>';
        if (item.status === 'completed') {
          statusBadge = '<span class="component-badge component-badge--sm" style="color: var(--color-success, #16a34a); background: rgba(22, 163, 74, 0.1);">Completado</span>';
        } else if (item.status === 'failed') {
          statusBadge = '<span class="component-badge component-badge--sm" style="color: var(--color-danger, #ef4444); background: rgba(239, 68, 68, 0.1);">Fallido</span>';
        }

        const refId = item.stripe_session_id || item.stripe_payment_intent_id || String(item.id);
        const refShort = refId.length > 20 ? `${refId.slice(0, 10)}...${refId.slice(-6)}` : refId;

        return `
          <tr data-ref="purchase-row-${item.id}">
            <td>
              <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 32px; height: 32px; border-radius: 50%; background: ${iconBg}; display: flex; align-items: center; justify-content: center; color: ${iconColor}; flex-shrink: 0;">
                  <svg class="component-icon" aria-hidden="true" style="width: 17px; height: 17px;"><use href="${iconHref}"></use></svg>
                </div>
                <div style="display: flex; flex-direction: column;">
                  <strong style="font-weight: 600; color: var(--text-primary); font-size: 13.5px;">${escapeHtml(planName)}</strong>
                  <span style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(periodSubtext)}</span>
                </div>
              </div>
            </td>
            <td>
              <strong style="font-weight: 600; color: var(--text-primary); font-size: 13.5px;">${amountFormatted}</strong>
            </td>
            <td>
              <span class="component-badge component-badge--sm">${escapeHtml(periodLabel)}</span>
            </td>
            <td>
              ${statusBadge}
            </td>
            <td style="color: var(--text-secondary); font-size: 13px;">${escapeHtml(dateFormatted)}</td>
            <td class="text-right">
              <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
                <code style="font-family: monospace; font-size: 11.5px; padding: 4px 8px; border-radius: 6px; background: var(--bg-surface-secondary, rgba(0,0,0,0.04)); color: var(--text-secondary); border: 1px solid var(--border-color, rgba(0,0,0,0.1));">${escapeHtml(refShort)}</code>
                <button type="button" class="component-button component-button--h32 component-button--icon-only" data-ref="btn-copy-ref-${item.id}" data-ref-id="${escapeHtml(refId)}" data-tooltip="Copiar referencia" aria-label="Copiar referencia">
                  <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#content_copy"></use></svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    renderIcons(tbody);
    this.bindRowActions(tbody);
  }

  private bindRowActions(tbody: HTMLElement): void {
    tbody.querySelectorAll<HTMLButtonElement>('[data-ref^="btn-copy-ref-"]').forEach((btn) => {
      btn.addEventListener(
        'click',
        async (e) => {
          e.preventDefault();
          const refId = btn.getAttribute('data-ref-id');
          if (refId) {
            try {
              await navigator.clipboard.writeText(refId);
              showToast('ID de referencia copiado al portapapeles.', 'success');
            } catch {
              showToast('No se pudo copiar la referencia.', 'danger');
            }
          }
        },
        { signal: this.abortController?.signal }
      );
    });
  }

  private setupSearchToolbar(): void {
    const btnToggleSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-search"]');
    const searchToolbar = this.container.querySelector<HTMLElement>('[data-ref="search-toolbar"]');
    const searchInput = this.container.querySelector<HTMLInputElement>('[data-ref="purchases-search-input"]');
    const btnClearSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-clear-search"]');

    btnToggleSearch?.addEventListener(
      'click',
      (e) => {
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
      },
      { signal: this.abortController?.signal }
    );

    searchInput?.addEventListener(
      'input',
      () => {
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
      },
      { signal: this.abortController?.signal }
    );

    btnClearSearch?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        if (btnClearSearch) btnClearSearch.style.display = 'none';
        this.renderPurchases(this.purchases);
      },
      { signal: this.abortController?.signal }
    );
  }
}

export async function createPurchasesView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/settings/purchases.html');
  const controller = new PurchasesViewController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
