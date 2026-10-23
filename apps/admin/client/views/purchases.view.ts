import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { toast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { escapeHtml } from '../utils/dom.util.js';

export interface AdminPurchaseItem {
  amount_total: number;
  billing_period: string;
  created_at: string;
  currency: string;
  email: string | null;
  id: number;
  plan_id: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_session_id: string;
  stripe_subscription_id: string | null;
  user_id: string;
  username: string | null;
}

export class PurchasesController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private purchases: AdminPurchaseItem[] = [];

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
      const res = await fetch('/api/admin/purchases', { signal: this.abortController?.signal });
      if (!res.ok) {
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Error al consultar el historial de compras.</td></tr>';
        }
        if (errorBanner) {
          errorBanner.textContent = 'No se pudo cargar el historial de compras global. Intenta más tarde.';
          errorBanner.style.display = 'block';
        }
        return;
      }

      const data = await res.json() as { purchases: AdminPurchaseItem[]; success: boolean };
      this.purchases = Array.isArray(data.purchases) ? data.purchases : [];
      if (badge) badge.textContent = String(this.purchases.length);
      this.renderPurchases(this.purchases);
    } catch {
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Error de red al consultar las compras.</td></tr>';
      }
      if (errorBanner) {
        errorBanner.textContent = 'Error de conexión al cargar las transacciones.';
        errorBanner.style.display = 'block';
      }
    }
  }

  private renderPurchases(items: AdminPurchaseItem[]): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="purchases-tbody"]');
    const badge = this.container.querySelector<HTMLElement>('[data-ref="purchases-count-badge"]');
    if (!tbody) return;

    if (badge) badge.textContent = String(items.length);

    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 64px 20px; color: var(--text-secondary);">
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; margin: 0 auto;">
              <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--bg-hover, rgba(0,0,0,0.05)); display: flex; align-items: center; justify-content: center; color: var(--text-tertiary);">
                <svg class="component-icon" aria-hidden="true" style="width: 24px; height: 24px;"><use href="/icons.svg#receipt_long"></use></svg>
              </div>
              <strong style="font-weight: 600; font-size: 14.5px; color: var(--text-primary);">No hay transacciones</strong>
              <span style="font-size: 13px; color: var(--text-secondary); max-width: 420px; line-height: 1.4;">No se encontraron registros de pago con los criterios de búsqueda actuales.</span>
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
        const periodLabel = item.billing_period === 'yearly' ? 'Anual' : 'Mensual';

        let dateFormatted = '—';
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

        const statusText = (item.status === 'completed' || item.status === 'paid') ? 'Completado' : (item.status === 'failed' ? 'Fallido' : 'Pendiente');
        const statusBadge = `<span class="component-badge component-badge--sm">${statusText}</span>`;

        const refId = item.stripe_session_id || item.stripe_payment_intent_id || String(item.id);
        const refShort = refId.length > 16 ? `${refId.slice(0, 8)}...${refId.slice(-6)}` : refId;

        return `
          <tr data-ref="purchase-row-${item.id}">
            <td>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="component-badge component-badge--sm">${escapeHtml(item.username || 'Usuario')}</span>
                <span class="component-badge component-badge--sm">${escapeHtml(item.email || '—')}</span>
              </div>
            </td>
            <td>
              <span class="component-badge component-badge--sm">${escapeHtml(planName)}</span>
            </td>
            <td>
              <span class="component-badge component-badge--sm">${amountFormatted}</span>
            </td>
            <td>
              <span class="component-badge component-badge--sm">${escapeHtml(periodLabel)}</span>
            </td>
            <td>
              ${statusBadge}
            </td>
            <td>
              <span class="component-badge component-badge--sm">${escapeHtml(dateFormatted)}</span>
            </td>
            <td class="text-right">
              <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
                <span class="component-badge component-badge--sm">${escapeHtml(refShort)}</span>
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
              toast.success('Referencia copiada al portapapeles.');
            } catch {
              toast.error('No se pudo copiar la referencia.');
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
            (p.username && p.username.toLowerCase().includes(query)) ||
            (p.email && p.email.toLowerCase().includes(query)) ||
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
  const container = await loadTemplate('/views/purchases/purchases.html');
  const controller = new PurchasesController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
