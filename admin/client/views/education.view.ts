import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { toast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { escapeHtml } from '../utils/dom.util.js';

export interface AdminVerificationItem {
  admin_notes: string | null;
  created_at: string;
  document_url: string;
  email: string | null;
  full_name: string;
  id: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  school_name: string;
  status: 'pending' | 'approved' | 'rejected';
  user_id: string;
  username: string | null;
}

export class EducationController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private selectedVerification: AdminVerificationItem | null = null;
  private verifications: AdminVerificationItem[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    renderIcons(this.container);
    this.setupSearchToolbar();
    this.setupModalEvents();
    await this.loadVerifications();
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private async loadVerifications(): Promise<void> {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="education-tbody"]');
    const badge = this.container.querySelector<HTMLElement>('[data-ref="education-count-badge"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="education-page-error"]');

    try {
      const res = await fetch('/api/admin/education/verifications', { signal: this.abortController?.signal });
      if (!res.ok) {
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Error al consultar las verificaciones de estudiantes.</td></tr>';
        }
        if (errorBanner) {
          errorBanner.textContent = 'No se pudo cargar la lista de solicitudes. Intenta más tarde.';
          errorBanner.style.display = 'block';
        }
        return;
      }

      const data = await res.json() as { success: boolean; verifications: AdminVerificationItem[] };
      this.verifications = Array.isArray(data.verifications) ? data.verifications : [];
      if (badge) badge.textContent = String(this.verifications.length);
      this.renderVerifications(this.verifications);
    } catch {
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Error de red al consultar las solicitudes.</td></tr>';
      }
      if (errorBanner) {
        errorBanner.textContent = 'Error de conexión al cargar las verificaciones.';
        errorBanner.style.display = 'block';
      }
    }
  }

  private renderVerifications(items: AdminVerificationItem[]): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="education-tbody"]');
    const badge = this.container.querySelector<HTMLElement>('[data-ref="education-count-badge"]');
    if (!tbody) return;

    if (badge) badge.textContent = String(items.length);

    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 64px 20px; color: var(--text-secondary);">
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; margin: 0 auto;">
              <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--bg-hover, rgba(0,0,0,0.05)); display: flex; align-items: center; justify-content: center; color: var(--text-tertiary);">
                <svg class="component-icon" aria-hidden="true" style="width: 24px; height: 24px;"><use href="/icons.svg#school"></use></svg>
              </div>
              <strong style="font-weight: 600; font-size: 14.5px; color: var(--text-primary);">No hay solicitudes</strong>
              <span style="font-size: 13px; color: var(--text-secondary); max-width: 420px; line-height: 1.4;">No se encontraron registros de verificación que coincidan con la búsqueda.</span>
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

        let statusBadge = '<span class="component-badge component-badge--sm" style="color: var(--color-warning, #d97706); background: rgba(217, 119, 6, 0.1);">Pendiente</span>';
        if (item.status === 'approved') {
          statusBadge = '<span class="component-badge component-badge--sm" style="color: var(--color-success, #16a34a); background: rgba(22, 163, 74, 0.1);">Aprobado</span>';
        } else if (item.status === 'rejected') {
          statusBadge = '<span class="component-badge component-badge--sm" style="color: var(--color-danger, #ef4444); background: rgba(239, 68, 68, 0.1);">Rechazado</span>';
        }

        const isUrl = item.document_url.startsWith('/') || item.document_url.startsWith('http');
        const docButton = isUrl
          ? `<a class="component-button component-button--h32 component-button--outline" href="${escapeHtml(item.document_url)}" target="_blank" rel="noopener noreferrer" data-ref="link-doc-${item.id}">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#visibility"></use></svg>
              <span>Ver</span>
            </a>`
          : `<span class="component-badge component-badge--sm" style="font-size: 11px;">${escapeHtml(item.document_url.split(':')[0])}</span>`;

        const actionMarkup = item.status === 'pending'
          ? `<button type="button" class="component-button component-button--h32 component-button--black" data-ref="btn-review-${item.id}" data-id="${escapeHtml(item.id)}">Revisar</button>`
          : `<span style="font-size: 12px; color: var(--text-tertiary);">Completado</span>`;

        return `
          <tr data-ref="verification-row-${item.id}">
            <td>
              <div style="display: flex; flex-direction: column;">
                <strong style="font-weight: 600; color: var(--text-primary); font-size: 13.5px;">${escapeHtml(item.full_name)}</strong>
                <span style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(item.username || 'Usuario')}</span>
              </div>
            </td>
            <td>
              <span style="font-size: 13px; color: var(--text-primary);">${escapeHtml(item.email || '—')}</span>
            </td>
            <td>
              <span style="font-size: 13px; color: var(--text-secondary);">${escapeHtml(item.school_name)}</span>
            </td>
            <td>
              ${docButton}
            </td>
            <td>
              ${statusBadge}
            </td>
            <td class="text-right">
              ${actionMarkup}
            </td>
          </tr>
        `;
      })
      .join('');

    renderIcons(tbody);
    this.bindRowActions(tbody);
  }

  private bindRowActions(tbody: HTMLElement): void {
    tbody.querySelectorAll<HTMLButtonElement>('[data-ref^="btn-review-"]').forEach((btn) => {
      btn.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          const id = btn.getAttribute('data-id');
          const item = this.verifications.find((v) => v.id === id);
          if (item) {
            this.openReviewModal(item);
          }
        },
        { signal: this.abortController?.signal }
      );
    });
  }

  private openReviewModal(item: AdminVerificationItem): void {
    this.selectedVerification = item;
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-review-backdrop"]');
    const nameEl = this.container.querySelector<HTMLElement>('[data-ref="modal-student-name"]');
    const schoolEl = this.container.querySelector<HTMLElement>('[data-ref="modal-student-school"]');
    const linkDoc = this.container.querySelector<HTMLAnchorElement>('[data-ref="link-view-document"]');
    const notesInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-admin-notes"]');
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="modal-review-error"]');

    if (nameEl) nameEl.textContent = `${item.full_name} (@${item.username || ''})`;
    if (schoolEl) schoolEl.textContent = item.school_name;
    if (linkDoc) {
      const isUrl = item.document_url.startsWith('/') || item.document_url.startsWith('http');
      if (isUrl) {
        linkDoc.href = item.document_url;
        linkDoc.style.display = 'inline-flex';
      } else {
        linkDoc.style.display = 'none';
      }
    }
    if (notesInput) notesInput.value = item.admin_notes || '';
    if (errorEl) errorEl.style.display = 'none';

    if (backdrop) backdrop.style.display = 'flex';
  }

  private closeReviewModal(): void {
    this.selectedVerification = null;
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-review-backdrop"]');
    if (backdrop) backdrop.style.display = 'none';
  }

  private setupModalEvents(): void {
    const signal = this.abortController?.signal;
    const btnClose = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-close-modal-review"]');
    const btnApprove = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-confirm-approve"]');
    const btnReject = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-confirm-reject"]');
    const notesInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-admin-notes"]');
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="modal-review-error"]');

    btnClose?.addEventListener('click', (e) => {
      e.preventDefault();
      this.closeReviewModal();
    }, { signal });

    const handleDecision = async (status: 'approved' | 'rejected') => {
      if (!this.selectedVerification) return;
      const id = this.selectedVerification.id;
      const notes = notesInput ? notesInput.value.trim() : '';

      try {
        const res = await fetch(`/api/admin/education/verifications/${id}/review`, {
          body: JSON.stringify({ notes, status }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          signal,
        });

        if (!res.ok) {
          throw new Error('Error al procesar solicitud');
        }

        const data = await res.json() as { message?: string };
        toast.success(data.message || 'Verificación procesada correctamente.');

        const index = this.verifications.findIndex((v) => v.id === id);
        if (index !== -1) {
          this.verifications[index].status = status;
          this.verifications[index].admin_notes = notes;
        }

        this.closeReviewModal();
        this.renderVerifications(this.verifications);
      } catch {
        if (errorEl) {
          errorEl.textContent = 'No se pudo guardar la revisión. Intenta nuevamente.';
          errorEl.style.display = 'block';
        }
      }
    };

    btnApprove?.addEventListener('click', (e) => {
      e.preventDefault();
      void handleDecision('approved');
    }, { signal });

    btnReject?.addEventListener('click', (e) => {
      e.preventDefault();
      void handleDecision('rejected');
    }, { signal });
  }

  private setupSearchToolbar(): void {
    const btnToggleSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-search"]');
    const searchToolbar = this.container.querySelector<HTMLElement>('[data-ref="search-toolbar"]');
    const searchInput = this.container.querySelector<HTMLInputElement>('[data-ref="education-search-input"]');
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
            this.renderVerifications(this.verifications);
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
          this.renderVerifications(this.verifications);
          return;
        }

        const filtered = this.verifications.filter((v) => {
          return (
            v.full_name.toLowerCase().includes(query) ||
            v.school_name.toLowerCase().includes(query) ||
            (v.username && v.username.toLowerCase().includes(query)) ||
            (v.email && v.email.toLowerCase().includes(query)) ||
            v.status.toLowerCase().includes(query)
          );
        });
        this.renderVerifications(filtered);
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
        this.renderVerifications(this.verifications);
      },
      { signal: this.abortController?.signal }
    );
  }
}

export async function createEducationView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/education/education.html');
  const controller = new EducationController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
