import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { ViewController } from '../types/common.types.js';
import { escapeHtml } from '../utils/dom.util.js';
import { getFallbackTierColor } from '../utils/tier.util.js';

export interface AdminUserItem {
  avatar_url: string | null;
  created_at: string;
  email: string;
  id: string;
  role: string;
  subscription_tier: string;
  username: string;
}

export class UsersController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private users: AdminUserItem[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    renderIcons(this.container);
    this.setupSearchToolbar();
    await this.loadUsers();
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private async loadUsers(): Promise<void> {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="users-tbody"]');
    const badge = this.container.querySelector<HTMLElement>('[data-ref="users-count-badge"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="users-page-error"]');

    try {
      const res = await fetch('/api/admin/users', { signal: this.abortController?.signal });
      if (!res.ok) {
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Error al consultar la lista de usuarios.</td></tr>';
        }
        if (errorBanner) {
          errorBanner.textContent = 'No se pudo cargar la lista de usuarios. Intenta nuevamente más tarde.';
          errorBanner.style.display = 'block';
        }
        return;
      }

      const data = await res.json() as { success: boolean; total: number; users: AdminUserItem[] };
      this.users = Array.isArray(data.users) ? data.users : [];
      if (badge) badge.textContent = String(this.users.length);
      this.renderUsers(this.users);
    } catch {
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Error de red al consultar la lista de usuarios.</td></tr>';
      }
      if (errorBanner) {
        errorBanner.textContent = 'Error de conexión al cargar la lista de usuarios.';
        errorBanner.style.display = 'block';
      }
    }
  }

  private renderUsers(items: AdminUserItem[]): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="users-tbody"]');
    const badge = this.container.querySelector<HTMLElement>('[data-ref="users-count-badge"]');
    if (!tbody) return;

    if (badge) badge.textContent = String(items.length);

    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 64px 20px; color: var(--text-secondary);">
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; margin: 0 auto;">
              <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--bg-hover, rgba(0,0,0,0.05)); display: flex; align-items: center; justify-content: center; color: var(--text-tertiary);">
                <svg class="component-icon" aria-hidden="true" style="width: 24px; height: 24px;"><use href="/icons.svg#group"></use></svg>
              </div>
              <strong style="font-weight: 600; font-size: 14.5px; color: var(--text-primary);">No se encontraron usuarios</strong>
              <span style="font-size: 13px; color: var(--text-secondary); max-width: 420px; line-height: 1.4;">No hay cuentas que coincidan con los filtros de búsqueda aplicados.</span>
            </div>
          </td>
        </tr>
      `;
      renderIcons(tbody);
      return;
    }

    tbody.innerHTML = items
      .map((item) => {
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

        const roleUpper = (item.role || '').toUpperCase();
        let roleText = 'Usuario';
        if (roleUpper === 'ADMIN') {
          roleText = 'Administrador';
        } else if (roleUpper === 'SUPER_ADMIN') {
          roleText = 'Super Admin';
        } else if (roleUpper.includes('ORG')) {
          roleText = item.role;
        } else if (roleUpper) {
          roleText = item.role;
        }

        const tierLower = (item.subscription_tier || '').toLowerCase();
        let tierText = 'Gratis';
        if (tierLower === 'enterprise') {
          tierText = 'Enterprise';
        } else if (tierLower === 'pro') {
          tierText = 'Pro';
        }

        const avatarUrl = item.avatar_url || `/api/avatar?name=${encodeURIComponent(item.username)}`;
        const tierColor = getFallbackTierColor(item.subscription_tier);
        const avatarMarkup = `
          <div class="avatar-ring" style="width: 32px; height: 32px; border-radius: 50%; --avatar-tier-bg: ${tierColor}; --tier-border-color: ${tierColor}; flex-shrink: 0;">
            <img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(item.username)}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;" onerror="this.src='/api/avatar?name=${encodeURIComponent(item.username)}'" />
          </div>
        `;

        return `
          <tr data-ref="user-row-${item.id}">
            <td>
              <div style="display: flex; align-items: center; gap: 10px;">
                ${avatarMarkup}
                <span class="component-badge component-badge--sm">${escapeHtml(item.username)}</span>
              </div>
            </td>
            <td>
              <span class="component-badge component-badge--sm">${escapeHtml(item.email)}</span>
            </td>
            <td>
              <span class="component-badge component-badge--sm">${escapeHtml(roleText)}</span>
            </td>
            <td>
              <span class="component-badge component-badge--sm">${escapeHtml(tierText)}</span>
            </td>
            <td>
              <span class="component-badge component-badge--sm">${escapeHtml(dateFormatted)}</span>
            </td>
          </tr>
        `;
      })
      .join('');

    renderIcons(tbody);
  }

  private setupSearchToolbar(): void {
    const btnToggleSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-search"]');
    const searchToolbar = this.container.querySelector<HTMLElement>('[data-ref="search-toolbar"]');
    const searchInput = this.container.querySelector<HTMLInputElement>('[data-ref="users-search-input"]');
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
            this.renderUsers(this.users);
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
          this.renderUsers(this.users);
          return;
        }

        const filtered = this.users.filter((u) => {
          return (
            u.username.toLowerCase().includes(query) ||
            u.email.toLowerCase().includes(query) ||
            u.role.toLowerCase().includes(query) ||
            u.subscription_tier.toLowerCase().includes(query) ||
            u.id.toLowerCase().includes(query)
          );
        });
        this.renderUsers(filtered);
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
        this.renderUsers(this.users);
      },
      { signal: this.abortController?.signal }
    );
  }
}

export async function createUsersView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/users/users.html');
  const controller = new UsersController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
