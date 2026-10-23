import { hasPermission } from '../services/auth.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { toast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { escapeHtml } from '../utils/dom.util.js';

export interface AdminOrganizationItem {
  active_members_count: number;
  created_at: string;
  domains: string | null;
  enforce_sso: boolean;
  id: string;
  name: string;
  org_type: string;
  owner_email: string | null;
  owner_id: string;
  owner_username: string | null;
  seat_limit: number;
  slug: string;
  sso_enabled: boolean;
  sso_provider: string | null;
  subscription_status: string;
}

export class OrganizationsController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private organizations: AdminOrganizationItem[] = [];
  private selectedOrg: AdminOrganizationItem | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    renderIcons(this.container);
    this.setupSearchToolbar();
    this.setupModalEvents();
    await this.loadOrganizations();
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private async loadOrganizations(): Promise<void> {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="organizations-tbody"]');
    const badge = this.container.querySelector<HTMLElement>('[data-ref="organizations-count-badge"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="organizations-page-error"]');

    try {
      const res = await fetch('/api/admin/organizations', { signal: this.abortController?.signal });
      if (!res.ok) {
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Error al consultar las organizaciones.</td></tr>';
        }
        if (errorBanner) {
          errorBanner.textContent = 'No se pudo cargar la lista de organizaciones corporativas. Intenta más tarde.';
          errorBanner.style.display = 'block';
        }
        return;
      }

      const data = await res.json() as { organizations: AdminOrganizationItem[]; success: boolean };
      this.organizations = Array.isArray(data.organizations) ? data.organizations : [];
      if (badge) badge.textContent = String(this.organizations.length);
      this.renderOrganizations(this.organizations);
    } catch {
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Error de red al consultar las organizaciones.</td></tr>';
      }
      if (errorBanner) {
        errorBanner.textContent = 'Error de conexión al cargar las organizaciones corporativas.';
        errorBanner.style.display = 'block';
      }
    }
  }

  private renderOrganizations(items: AdminOrganizationItem[]): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="organizations-tbody"]');
    const badge = this.container.querySelector<HTMLElement>('[data-ref="organizations-count-badge"]');
    if (!tbody) return;

    if (badge) badge.textContent = String(items.length);

    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 64px 20px; color: var(--text-secondary);">
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; margin: 0 auto;">
              <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--bg-hover, rgba(0,0,0,0.05)); display: flex; align-items: center; justify-content: center; color: var(--text-tertiary);">
                <svg class="component-icon" aria-hidden="true" style="width: 24px; height: 24px;"><use href="/icons.svg#groups"></use></svg>
              </div>
              <strong style="font-weight: 600; font-size: 14.5px; color: var(--text-primary);">No hay organizaciones</strong>
              <span style="font-size: 13px; color: var(--text-secondary); max-width: 420px; line-height: 1.4;">No se encontraron cuentas empresariales que coincidan con la búsqueda.</span>
            </div>
          </td>
        </tr>
      `;
      renderIcons(tbody);
      return;
    }

    tbody.innerHTML = items
      .map((item) => {
        const statusLower = (item.subscription_status || '').toLowerCase();
        const statusText = statusLower === 'suspended' ? 'Suspendida' : (statusLower === 'trial' ? 'Prueba' : 'Activa');
        const statusBadge = `<span class="component-badge component-badge--sm">${statusText}</span>`;

        const ssoText = item.sso_enabled && item.sso_provider ? item.sso_provider.toUpperCase() : 'Inactivo';
        const ssoLabel = `<span class="component-badge component-badge--sm">${escapeHtml(ssoText)}</span>`;
        const domainText = item.domains ? escapeHtml(item.domains) : 'Sin dominio';

        return `
          <tr data-ref="org-row-${item.id}">
            <td>
              <span class="component-badge component-badge--sm">${escapeHtml(item.name)}</span>
            </td>
            <td>
              <span class="component-badge component-badge--sm">${escapeHtml(item.owner_username || item.owner_email || 'Propietario')}</span>
            </td>
            <td>
              <span class="component-badge component-badge--sm">
                ${item.active_members_count} / ${item.seat_limit}
              </span>
            </td>
            <td>
              <span class="component-badge component-badge--sm">${domainText}</span>
            </td>
            <td>
              ${ssoLabel}
            </td>
            <td>
              ${statusBadge}
            </td>
            <td class="text-right">
              ${hasPermission('admin:organizations:manage') ? `
              <button type="button" class="component-button component-button--h32 component-button--outline" data-ref="btn-edit-org-${item.id}" data-id="${escapeHtml(item.id)}">
                Gestionar
              </button>` : `<span class="component-badge component-badge--sm">Solo lectura</span>`}
            </td>
          </tr>
        `;
      })
      .join('');

    renderIcons(tbody);
    this.bindRowActions(tbody);
  }

  private bindRowActions(tbody: HTMLElement): void {
    tbody.querySelectorAll<HTMLButtonElement>('[data-ref^="btn-edit-org-"]').forEach((btn) => {
      btn.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          const id = btn.getAttribute('data-id');
          const org = this.organizations.find((o) => o.id === id);
          if (org) {
            this.openOrgModal(org);
          }
        },
        { signal: this.abortController?.signal }
      );
    });
  }

  private openOrgModal(org: AdminOrganizationItem): void {
    this.selectedOrg = org;
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-org-backdrop"]');
    const nameEl = this.container.querySelector<HTMLElement>('[data-ref="modal-org-name"]');
    const ownerEl = this.container.querySelector<HTMLElement>('[data-ref="modal-org-owner"]');
    const seatInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-seat-limit"]');
    const statusInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-org-status"]');
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="modal-org-error"]');

    if (nameEl) nameEl.textContent = `${org.name} (/${org.slug})`;
    if (ownerEl) ownerEl.textContent = `Propietario: ${org.owner_username || ''} (${org.owner_email || ''})`;
    if (seatInput) seatInput.value = String(org.seat_limit);
    if (statusInput) statusInput.value = org.subscription_status;
    if (errorEl) errorEl.style.display = 'none';

    if (backdrop) backdrop.style.display = 'flex';
  }

  private closeOrgModal(): void {
    this.selectedOrg = null;
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-org-backdrop"]');
    if (backdrop) backdrop.style.display = 'none';
  }

  private setupModalEvents(): void {
    const signal = this.abortController?.signal;
    const btnClose = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-close-modal-org"]');
    const btnSave = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-save-org-settings"]');
    const seatInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-seat-limit"]');
    const statusInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-org-status"]');
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="modal-org-error"]');

    btnClose?.addEventListener('click', (e) => {
      e.preventDefault();
      this.closeOrgModal();
    }, { signal });

    btnSave?.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!this.selectedOrg) return;
      const orgId = this.selectedOrg.id;
      const seatLimit = seatInput ? parseInt(seatInput.value, 10) : 5;
      const status = statusInput ? statusInput.value.trim() : 'active';

      try {
        const res = await fetch(`/api/admin/organizations/${orgId}`, {
          body: JSON.stringify({
            seat_limit: seatLimit > 0 ? seatLimit : 5,
            subscription_status: status,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PATCH',
          signal,
        });

        if (!res.ok) {
          throw new Error('Error al actualizar organización');
        }

        const data = await res.json() as { message?: string };
        toast.success(data.message || 'Organización actualizada exitosamente.');

        const index = this.organizations.findIndex((o) => o.id === orgId);
        if (index !== -1) {
          this.organizations[index].seat_limit = seatLimit;
          this.organizations[index].subscription_status = status;
        }

        this.closeOrgModal();
        this.renderOrganizations(this.organizations);
      } catch {
        if (errorEl) {
          errorEl.textContent = 'No se pudo guardar la configuración. Intenta nuevamente.';
          errorEl.style.display = 'block';
        }
      }
    }, { signal });
  }

  private setupSearchToolbar(): void {
    const btnToggleSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-search"]');
    const searchToolbar = this.container.querySelector<HTMLElement>('[data-ref="search-toolbar"]');
    const searchInput = this.container.querySelector<HTMLInputElement>('[data-ref="organizations-search-input"]');
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
            this.renderOrganizations(this.organizations);
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
          this.renderOrganizations(this.organizations);
          return;
        }

        const filtered = this.organizations.filter((o) => {
          return (
            o.name.toLowerCase().includes(query) ||
            o.slug.toLowerCase().includes(query) ||
            (o.owner_username && o.owner_username.toLowerCase().includes(query)) ||
            (o.owner_email && o.owner_email.toLowerCase().includes(query)) ||
            (o.domains && o.domains.toLowerCase().includes(query)) ||
            o.subscription_status.toLowerCase().includes(query)
          );
        });
        this.renderOrganizations(filtered);
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
        this.renderOrganizations(this.organizations);
      },
      { signal: this.abortController?.signal }
    );
  }
}

export async function createOrganizationsView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/organizations/organizations.html');
  const controller = new OrganizationsController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
