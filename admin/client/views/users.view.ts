import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { toast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { escapeHtml } from '../utils/dom.util.js';

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
          tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Error al consultar la lista de usuarios.</td></tr>';
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
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Error de red al consultar la lista de usuarios.</td></tr>';
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
          <td colspan="6" style="text-align: center; padding: 64px 20px; color: var(--text-secondary);">
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

        const initial = (item.username || item.email || 'U').charAt(0).toUpperCase();
        const idShort = item.id.length > 12 ? `${item.id.slice(0, 8)}...` : item.id;

        const roleUpper = (item.role || '').toUpperCase();
        let roleBadge = '<span class="component-badge component-badge--sm">Usuario</span>';
        if (roleUpper === 'ADMIN') {
          roleBadge = '<span class="component-badge component-badge--sm" style="color: var(--sl-color-purple-700, #7e22ce); background: var(--sl-color-purple-50, #faf5ff); border: 1px solid var(--sl-color-purple-200, #e9d5ff);">Administrador</span>';
        } else if (roleUpper.includes('ORG')) {
          roleBadge = `<span class="component-badge component-badge--sm" style="color: var(--sl-color-blue-700, #1d4ed8); background: var(--sl-color-blue-50, #eff6ff); border: 1px solid var(--sl-color-blue-200, #bfdbfe);">${escapeHtml(item.role)}</span>`;
        }

        const tierLower = (item.subscription_tier || '').toLowerCase();
        let tierBadge = '<span class="component-badge component-badge--sm">Gratis</span>';
        if (tierLower === 'enterprise') {
          tierBadge = '<span class="component-badge component-badge--sm" style="color: var(--sl-color-blue-700, #1d4ed8); background: rgba(37, 99, 235, 0.1);">Empresas</span>';
        } else if (tierLower === 'pro') {
          tierBadge = '<span class="component-badge component-badge--sm" style="color: var(--color-warning, #d97706); background: rgba(217, 119, 6, 0.1);">Pro</span>';
        }

        const avatarMarkup = item.avatar_url
          ? `<img src="${escapeHtml(item.avatar_url)}" alt="${escapeHtml(item.username)}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border-color); flex-shrink: 0;" />`
          : `<div style="width: 32px; height: 32px; border-radius: 50%; background: var(--bg-hover); display: flex; align-items: center; justify-content: center; color: var(--text-primary); font-weight: 600; font-size: 13px; border: 1px solid var(--border-color); flex-shrink: 0;">${escapeHtml(initial)}</div>`;

        return `
          <tr data-ref="user-row-${item.id}">
            <td>
              <div style="display: flex; align-items: center; gap: 12px;">
                ${avatarMarkup}
                <div style="display: flex; flex-direction: column;">
                  <strong style="font-weight: 600; color: var(--text-primary); font-size: 13.5px;">${escapeHtml(item.username)}</strong>
                  <span style="font-size: 11.5px; color: var(--text-secondary); font-family: monospace;">ID: ${escapeHtml(idShort)}</span>
                </div>
              </div>
            </td>
            <td>
              <span style="font-size: 13px; color: var(--text-primary);">${escapeHtml(item.email)}</span>
            </td>
            <td>
              ${roleBadge}
            </td>
            <td>
              ${tierBadge}
            </td>
            <td style="color: var(--text-secondary); font-size: 13px;">${escapeHtml(dateFormatted)}</td>
            <td class="text-right">
              <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
                <code style="font-family: monospace; font-size: 11.5px; padding: 4px 8px; border-radius: 6px; background: var(--bg-hover); color: var(--text-secondary); border: 1px solid var(--border-color);">${escapeHtml(idShort)}</code>
                <button type="button" class="component-button component-button--h32 component-button--icon-only" data-ref="btn-copy-id-${item.id}" data-id="${escapeHtml(item.id)}" data-tooltip="Copiar ID de usuario" aria-label="Copiar ID de usuario">
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
    tbody.querySelectorAll<HTMLButtonElement>('[data-ref^="btn-copy-id-"]').forEach((btn) => {
      btn.addEventListener(
        'click',
        async (e) => {
          e.preventDefault();
          const userId = btn.getAttribute('data-id');
          if (userId) {
            try {
              await navigator.clipboard.writeText(userId);
              toast.success('ID de usuario copiado al portapapeles.');
            } catch {
              toast.error('No se pudo copiar el ID.');
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
