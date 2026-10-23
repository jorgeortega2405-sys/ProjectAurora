import { hasPermission } from '../services/auth.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { toast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { escapeHtml } from '../utils/dom.util.js';
import { getFallbackTierColor } from '../utils/tier.util.js';

export interface AdminInquiryItem {
  company: string;
  created_at: string;
  email: string;
  first_name: string;
  id: string;
  last_name: string;
  message: string;
  status: 'pending' | 'contacted' | 'closed';
  updated_at: string;
}

export class InquiriesController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private inquiries: AdminInquiryItem[] = [];
  private selectedInquiry: AdminInquiryItem | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    renderIcons(this.container);
    this.setupSearchToolbar();
    this.setupModalEvents();
    await this.loadInquiries();
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private async loadInquiries(): Promise<void> {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="inquiries-tbody"]');
    const badge = this.container.querySelector<HTMLElement>('[data-ref="inquiries-count-badge"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="inquiries-page-error"]');

    try {
      const res = await fetch('/api/admin/inquiries', { signal: this.abortController?.signal });
      if (!res.ok) {
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Error al consultar las solicitudes comerciales.</td></tr>';
        }
        if (errorBanner) {
          errorBanner.textContent = 'No se pudo cargar la lista de solicitudes. Intenta más tarde.';
          errorBanner.style.display = 'block';
        }
        return;
      }

      const data = await res.json() as { inquiries: AdminInquiryItem[]; success: boolean };
      this.inquiries = Array.isArray(data.inquiries) ? data.inquiries : [];
      if (badge) badge.textContent = String(this.inquiries.length);
      this.renderInquiries(this.inquiries);
    } catch {
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Error de red al consultar las solicitudes.</td></tr>';
      }
      if (errorBanner) {
        errorBanner.textContent = 'Error de conexión al cargar los leads comerciales.';
        errorBanner.style.display = 'block';
      }
    }
  }

  private renderInquiries(items: AdminInquiryItem[]): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="inquiries-tbody"]');
    const badge = this.container.querySelector<HTMLElement>('[data-ref="inquiries-count-badge"]');
    if (!tbody) return;

    if (badge) badge.textContent = String(items.length);

    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 64px 20px; color: var(--text-secondary);">
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; margin: 0 auto;">
              <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--bg-hover, rgba(0,0,0,0.05)); display: flex; align-items: center; justify-content: center; color: var(--text-tertiary);">
                <svg class="component-icon" aria-hidden="true" style="width: 24px; height: 24px;"><use href="/icons.svg#mail"></use></svg>
              </div>
              <strong style="font-weight: 600; font-size: 14.5px; color: var(--text-primary);">No hay leads comerciales</strong>
              <span style="font-size: 13px; color: var(--text-secondary); max-width: 420px; line-height: 1.4;">No se encontraron solicitudes entrantes que coincidan con los criterios de búsqueda.</span>
            </div>
          </td>
        </tr>
      `;
      renderIcons(tbody);
      return;
    }

    const rowsHtml = items.map((inquiry) => {
      const fullName = `${inquiry.first_name || ''} ${inquiry.last_name || ''}`.trim() || 'Sin nombre';
      const formattedDate = this.formatDate(inquiry.created_at);
      const snippetMessage = this.truncateText(inquiry.message || 'Sin mensaje especificado.', 65);

      let statusLabel = 'Pendiente';
      if (inquiry.status === 'contacted') {
        statusLabel = 'En Contacto';
      } else if (inquiry.status === 'closed') {
        statusLabel = 'Cerrado';
      }

      const avatarUrl = `/api/avatar?name=${encodeURIComponent(fullName)}`;
      const tierColor = getFallbackTierColor('enterprise');
      const avatarMarkup = `
        <div class="avatar-ring" style="width: 28px; height: 28px; border-radius: 50%; --avatar-tier-bg: ${tierColor}; --tier-border-color: ${tierColor}; flex-shrink: 0;">
          <img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(fullName)}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover;" onerror="this.src='/api/avatar?name=${encodeURIComponent(fullName)}'" />
        </div>
      `;

      return `
        <tr data-ref="inquiry-row-${inquiry.id}">
          <td style="padding: 14px 16px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              ${avatarMarkup}
              <span class="component-badge component-badge--sm">${escapeHtml(fullName)}</span>
              <span class="component-badge component-badge--sm">${escapeHtml(inquiry.email)}</span>
            </div>
          </td>
          <td style="padding: 14px 16px;">
            <span class="component-badge component-badge--sm">${escapeHtml(inquiry.company || 'No especificada')}</span>
          </td>
          <td style="padding: 14px 16px;">
            <span class="component-badge component-badge--sm" data-tooltip="${escapeHtml(inquiry.message || '')}">${escapeHtml(snippetMessage)}</span>
          </td>
          <td style="padding: 14px 16px;">
            <span class="component-badge component-badge--sm">${escapeHtml(formattedDate)}</span>
          </td>
          <td style="padding: 14px 16px;">
            <span class="component-badge component-badge--sm">${statusLabel}</span>
          </td>
          <td class="text-right" style="padding: 14px 16px;">
            <button type="button" class="component-button component-button--h34 component-button--outline" data-ref="btn-view-inquiry" data-inquiry-id="${inquiry.id}">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#visibility"></use></svg>
              <span>Detalle</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rowsHtml;
    renderIcons(tbody);
    this.bindRowActionButtons(tbody);
  }

  private bindRowActionButtons(tbody: HTMLElement): void {
    const actionButtons = tbody.querySelectorAll<HTMLElement>('[data-ref="btn-view-inquiry"]');
    actionButtons.forEach((btn) => {
      btn.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          const inquiryId = btn.getAttribute('data-inquiry-id');
          if (!inquiryId) return;
          const found = this.inquiries.find((i) => String(i.id) === inquiryId);
          if (found) {
            this.openInquiryModal(found);
          }
        },
        { signal: this.abortController?.signal }
      );
    });
  }

  private openInquiryModal(inquiry: AdminInquiryItem): void {
    this.selectedInquiry = inquiry;
    const modalBackdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-inquiry-backdrop"]');
    const modalName = this.container.querySelector<HTMLElement>('[data-ref="modal-inquiry-name"]');
    const modalCompany = this.container.querySelector<HTMLElement>('[data-ref="modal-inquiry-company"]');
    const modalEmailLink = this.container.querySelector<HTMLAnchorElement>('[data-ref="modal-inquiry-email-link"]');
    const modalDate = this.container.querySelector<HTMLElement>('[data-ref="modal-inquiry-date"]');
    const modalBadge = this.container.querySelector<HTMLElement>('[data-ref="modal-inquiry-badge"]');
    const modalMessageBox = this.container.querySelector<HTMLElement>('[data-ref="modal-inquiry-message-box"]');
    const selectStatus = this.container.querySelector<HTMLSelectElement>('[data-ref="select-inquiry-status"]');
    const modalError = this.container.querySelector<HTMLElement>('[data-ref="modal-inquiry-error"]');

    if (modalError) {
      modalError.style.display = 'none';
      modalError.textContent = '';
    }

    const fullName = `${inquiry.first_name || ''} ${inquiry.last_name || ''}`.trim() || 'Sin nombre';
    if (modalName) modalName.textContent = fullName;
    if (modalCompany) modalCompany.textContent = inquiry.company || 'Empresa no especificada';
    if (modalEmailLink) {
      modalEmailLink.textContent = inquiry.email;
      modalEmailLink.href = `mailto:${inquiry.email}`;
    }
    if (modalDate) modalDate.textContent = this.formatDate(inquiry.created_at);
    if (modalMessageBox) modalMessageBox.textContent = inquiry.message || 'Sin mensaje.';

    if (modalBadge) {
      modalBadge.className = 'component-badge component-badge--sm';
      if (inquiry.status === 'contacted') {
        modalBadge.classList.add('component-badge--info');
        modalBadge.textContent = 'En Contacto';
      } else if (inquiry.status === 'closed') {
        modalBadge.classList.add('component-badge--success');
        modalBadge.textContent = 'Cerrado';
      } else {
        modalBadge.classList.add('component-badge--warning');
        modalBadge.textContent = 'Pendiente';
      }
    }

    if (selectStatus) {
      selectStatus.value = inquiry.status || 'pending';
      selectStatus.disabled = !hasPermission('admin:inquiries:manage');
    }

    const btnSave = this.container.querySelector<HTMLElement>('[data-ref="btn-save-inquiry-status"]');
    if (btnSave) {
      btnSave.style.display = hasPermission('admin:inquiries:manage') ? '' : 'none';
    }

    if (modalBackdrop) {
      modalBackdrop.style.display = 'flex';
    }
  }

  private closeInquiryModal(): void {
    const modalBackdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-inquiry-backdrop"]');
    if (modalBackdrop) {
      modalBackdrop.style.display = 'none';
    }
    this.selectedInquiry = null;
  }

  private setupModalEvents(): void {
    const modalBackdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-inquiry-backdrop"]');
    const btnClose = this.container.querySelector<HTMLElement>('[data-ref="btn-close-modal-inquiry"]');
    const btnSave = this.container.querySelector<HTMLElement>('[data-ref="btn-save-inquiry-status"]');
    const selectStatus = this.container.querySelector<HTMLSelectElement>('[data-ref="select-inquiry-status"]');
    const modalError = this.container.querySelector<HTMLElement>('[data-ref="modal-inquiry-error"]');

    btnClose?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        this.closeInquiryModal();
      },
      { signal: this.abortController?.signal }
    );

    modalBackdrop?.addEventListener(
      'click',
      (e) => {
        if (e.target === modalBackdrop) {
          this.closeInquiryModal();
        }
      },
      { signal: this.abortController?.signal }
    );

    btnSave?.addEventListener(
      'click',
      async (e) => {
        e.preventDefault();
        if (!this.selectedInquiry || !selectStatus) return;

        const newStatus = selectStatus.value;
        if (newStatus !== 'pending' && newStatus !== 'contacted' && newStatus !== 'closed') {
          return;
        }

        const originalBtnText = btnSave.innerHTML;
        btnSave.setAttribute('disabled', 'true');
        btnSave.textContent = 'Actualizando...';
        if (modalError) modalError.style.display = 'none';

        try {
          const res = await fetch(`/api/admin/inquiries/${this.selectedInquiry.id}`, {
            body: JSON.stringify({ status: newStatus }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PATCH',
            signal: this.abortController?.signal,
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({})) as { error?: string };
            if (modalError) {
              modalError.textContent = errData.error || 'No se pudo actualizar el estado de la solicitud.';
              modalError.style.display = 'block';
            }
            btnSave.removeAttribute('disabled');
            btnSave.innerHTML = originalBtnText;
            renderIcons(btnSave);
            return;
          }

          this.selectedInquiry.status = newStatus as 'pending' | 'contacted' | 'closed';
          const targetItem = this.inquiries.find((i) => i.id === this.selectedInquiry?.id);
          if (targetItem) {
            targetItem.status = newStatus as 'pending' | 'contacted' | 'closed';
          }

          toast.success('Estado del lead comercial actualizado exitosamente.');
          this.closeInquiryModal();
          this.renderInquiries(this.inquiries);
        } catch {
          if (modalError) {
            modalError.textContent = 'Error de conexión al procesar la solicitud.';
            modalError.style.display = 'block';
          }
        } finally {
          btnSave.removeAttribute('disabled');
          btnSave.innerHTML = originalBtnText;
          renderIcons(btnSave);
        }
      },
      { signal: this.abortController?.signal }
    );
  }

  private setupSearchToolbar(): void {
    const btnToggleSearch = this.container.querySelector<HTMLElement>('[data-ref="btn-toggle-search"]');
    const searchToolbar = this.container.querySelector<HTMLElement>('[data-ref="search-toolbar"]');
    const searchInput = this.container.querySelector<HTMLInputElement>('[data-ref="inquiries-search-input"]');
    const btnClearSearch = this.container.querySelector<HTMLElement>('[data-ref="btn-clear-search"]');

    btnToggleSearch?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (!searchToolbar) return;
        const isHidden = searchToolbar.classList.toggle('is-hidden');
        btnToggleSearch.classList.toggle('is-active', !isHidden);
        if (!isHidden && searchInput) {
          searchInput.focus();
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
          this.renderInquiries(this.inquiries);
          return;
        }

        const filtered = this.inquiries.filter((inquiry) => {
          const fullName = `${inquiry.first_name || ''} ${inquiry.last_name || ''}`.toLowerCase();
          return (
            fullName.includes(query) ||
            (inquiry.company && inquiry.company.toLowerCase().includes(query)) ||
            (inquiry.email && inquiry.email.toLowerCase().includes(query)) ||
            (inquiry.message && inquiry.message.toLowerCase().includes(query)) ||
            inquiry.status.toLowerCase().includes(query)
          );
        });
        this.renderInquiries(filtered);
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
        this.renderInquiries(this.inquiries);
      },
      { signal: this.abortController?.signal }
    );
  }

  private formatDate(dateStr: string): string {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(d);
    } catch {
      return dateStr;
    }
  }

  private truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}...`;
  }
}

export async function createInquiriesView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/inquiries/inquiries.html');
  const controller = new InquiriesController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
