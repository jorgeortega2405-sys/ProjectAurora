import { getAdminUser, hasPermission } from '../services/auth.service.js';
import { renderIcons } from '../services/icon.service.js';
import { navigate } from '../services/navigation.service.js';
import { loadTemplate } from '../services/template.service.js';
import { toast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { CreateTicketInput, DepartmentOption, InternalTicket, InternalTicketComment, StaffOption, TicketCategory, TicketPriority, TicketStatus, TicketSummaryStats, UpdateTicketInput } from '../types/tickets.types.js';
import { escapeHtml } from '../utils/dom.util.js';

export class InternalTicketsController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private departments: DepartmentOption[] = [];
  private initialTicketId: string = '';
  private selectedComments: InternalTicketComment[] = [];
  private selectedTicket: InternalTicket | null = null;
  private staff: StaffOption[] = [];
  private tickets: InternalTicket[] = [];

  constructor(container: HTMLElement, initialTicketId = '') {
    this.container = container;
    this.initialTicketId = initialTicketId;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    renderIcons(this.container);
    this.setupSearchToolbar();
    this.setupFilterEvents();
    this.setupModalEvents();

    await Promise.all([
      this.loadOptions(),
      this.loadStats(),
      this.loadTickets(),
    ]);

    if (this.initialTicketId) {
      await this.openTicketDetail(this.initialTicketId);
    }
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    document.body.classList.remove('modal-open');
  }

  private setupSearchToolbar(): void {
    const btnToggleSearch = this.container.querySelector<HTMLElement>('[data-ref="btn-toggle-search"]');
    const searchToolbar = this.container.querySelector<HTMLElement>('[data-ref="search-toolbar"]');
    const searchInput = this.container.querySelector<HTMLInputElement>('[data-ref="tickets-search-input"]');
    const btnClearSearch = this.container.querySelector<HTMLElement>('[data-ref="btn-clear-search"]');

    btnToggleSearch?.addEventListener('click', () => {
      if (!searchToolbar) return;
      const isHidden = searchToolbar.classList.contains('is-hidden');
      searchToolbar.classList.toggle('is-hidden', !isHidden);
      if (isHidden) {
        searchInput?.focus();
      } else if (searchInput) {
        searchInput.value = '';
        if (btnClearSearch) btnClearSearch.style.display = 'none';
        void this.loadTickets();
      }
    });

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    searchInput?.addEventListener('input', () => {
      const val = searchInput.value.trim();
      if (btnClearSearch) {
        btnClearSearch.style.display = val ? 'inline-flex' : 'none';
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void this.loadTickets();
      }, 250);
    });

    btnClearSearch?.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        btnClearSearch.style.display = 'none';
        searchInput.focus();
        void this.loadTickets();
      }
    });
  }

  private setupFilterEvents(): void {
    const selectDept = this.container.querySelector<HTMLSelectElement>('[data-ref="filter-department"]');
    const selectStatus = this.container.querySelector<HTMLSelectElement>('[data-ref="filter-status"]');
    const selectPriority = this.container.querySelector<HTMLSelectElement>('[data-ref="filter-priority"]');
    const selectAssigned = this.container.querySelector<HTMLSelectElement>('[data-ref="filter-assigned"]');
    const btnReset = this.container.querySelector<HTMLElement>('[data-ref="btn-reset-filters"]');
    const btnRefresh = this.container.querySelector<HTMLElement>('[data-ref="btn-refresh-tickets"]');

    const handleFilterChange = () => {
      void this.loadTickets();
    };

    selectDept?.addEventListener('change', handleFilterChange);
    selectStatus?.addEventListener('change', handleFilterChange);
    selectPriority?.addEventListener('change', handleFilterChange);
    selectAssigned?.addEventListener('change', handleFilterChange);

    btnReset?.addEventListener('click', () => {
      if (selectDept) selectDept.value = 'all';
      if (selectStatus) selectStatus.value = 'all';
      if (selectPriority) selectPriority.value = 'all';
      if (selectAssigned) selectAssigned.value = 'all';
      const searchInput = this.container.querySelector<HTMLInputElement>('[data-ref="tickets-search-input"]');
      if (searchInput) searchInput.value = '';
      const btnClearSearch = this.container.querySelector<HTMLElement>('[data-ref="btn-clear-search"]');
      if (btnClearSearch) btnClearSearch.style.display = 'none';
      void this.loadTickets();
    });

    btnRefresh?.addEventListener('click', () => {
      void Promise.all([this.loadStats(), this.loadTickets()]);
      toast.info('Tickets actualizados');
    });
  }

  private setupModalEvents(): void {
    const btnOpenCreate = this.container.querySelector<HTMLElement>('[data-ref="btn-open-create-modal"]');
    const btnCloseCreate = this.container.querySelector<HTMLElement>('[data-ref="btn-close-create-modal"]');
    const btnCancelCreate = this.container.querySelector<HTMLElement>('[data-ref="btn-cancel-create-ticket"]');
    const formCreate = this.container.querySelector<HTMLFormElement>('[data-ref="form-create-ticket"]');
    const modalCreateBackdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-create-ticket-backdrop"]');

    btnOpenCreate?.addEventListener('click', () => {
      this.openCreateModal();
    });

    btnCloseCreate?.addEventListener('click', () => {
      this.closeCreateModal();
    });

    btnCancelCreate?.addEventListener('click', () => {
      this.closeCreateModal();
    });

    modalCreateBackdrop?.addEventListener('click', (e) => {
      if (e.target === modalCreateBackdrop) {
        this.closeCreateModal();
      }
    });

    formCreate?.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.handleCreateTicket();
    });

    const btnCloseDetail = this.container.querySelector<HTMLElement>('[data-ref="btn-close-detail-modal"]');
    const modalDetailBackdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-detail-ticket-backdrop"]');
    const btnSaveUpdates = this.container.querySelector<HTMLElement>('[data-ref="btn-save-ticket-updates"]');
    const btnSubmitComment = this.container.querySelector<HTMLElement>('[data-ref="btn-submit-comment"]');

    btnCloseDetail?.addEventListener('click', () => {
      this.closeTicketDetail();
    });

    modalDetailBackdrop?.addEventListener('click', (e) => {
      if (e.target === modalDetailBackdrop) {
        this.closeTicketDetail();
      }
    });

    btnSaveUpdates?.addEventListener('click', () => {
      void this.handleSaveTicketUpdates();
    });

    btnSubmitComment?.addEventListener('click', () => {
      void this.handleSubmitComment();
    });
  }

  private async loadOptions(): Promise<void> {
    try {
      const res = await fetch('/api/admin/internal-tickets/options', { signal: this.abortController?.signal });
      if (!res.ok) return;

      const data = await res.json() as { departments: DepartmentOption[]; staff: StaffOption[]; success: boolean };
      if (!data.success) return;

      this.departments = Array.isArray(data.departments) ? data.departments : [];
      this.staff = Array.isArray(data.staff) ? data.staff : [];

      this.populateDepartmentSelects();
      this.populateStaffSelects();
    } catch {}
  }

  private populateDepartmentSelects(): void {
    const filterDept = this.container.querySelector<HTMLSelectElement>('[data-ref="filter-department"]');
    const createTargetDept = this.container.querySelector<HTMLSelectElement>('[data-ref="select-create-target-dept"]');
    const createSourceDept = this.container.querySelector<HTMLSelectElement>('[data-ref="select-create-source-dept"]');

    if (filterDept) {
      filterDept.innerHTML = '<option value="all">Todos los Departamentos</option>';
      this.departments.forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.name;
        filterDept.appendChild(opt);
      });
    }

    if (createTargetDept) {
      createTargetDept.innerHTML = '<option value="">Selecciona departamento</option>';
      this.departments.forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.name;
        createTargetDept.appendChild(opt);
      });
    }

    if (createSourceDept) {
      createSourceDept.innerHTML = '<option value="">Detectar automáticamente</option>';
      this.departments.forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.name;
        createSourceDept.appendChild(opt);
      });
    }
  }

  private populateStaffSelects(): void {
    const selectAssignee = this.container.querySelector<HTMLSelectElement>('[data-ref="select-update-assignee"]');
    if (!selectAssignee) return;

    selectAssignee.innerHTML = '<option value="">Sin Asignar</option>';
    this.staff.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.user_id;
      opt.textContent = `${s.username} (${s.department_name} - ${s.job_title})`;
      selectAssignee.appendChild(opt);
    });
  }

  private async loadStats(): Promise<void> {
    try {
      const res = await fetch('/api/admin/internal-tickets/stats', { signal: this.abortController?.signal });
      if (!res.ok) return;

      const data = await res.json() as { stats: TicketSummaryStats; success: boolean };
      if (!data.success || !data.stats) return;

      const statTotal = this.container.querySelector<HTMLElement>('[data-ref="stat-total-val"]');
      const statOpen = this.container.querySelector<HTMLElement>('[data-ref="stat-open-val"]');
      const statProgress = this.container.querySelector<HTMLElement>('[data-ref="stat-progress-val"]');
      const statUrgent = this.container.querySelector<HTMLElement>('[data-ref="stat-urgent-val"]');
      const statResolved = this.container.querySelector<HTMLElement>('[data-ref="stat-resolved-val"]');

      if (statTotal) statTotal.textContent = String(data.stats.total);
      if (statOpen) statOpen.textContent = String(data.stats.open);
      if (statProgress) statProgress.textContent = String(data.stats.in_progress);
      if (statUrgent) statUrgent.textContent = String(data.stats.urgent_or_high);
      if (statResolved) statResolved.textContent = String(data.stats.resolved);
    } catch {}
  }

  private async loadTickets(): Promise<void> {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="tickets-tbody"]');
    const badge = this.container.querySelector<HTMLElement>('[data-ref="tickets-count-badge"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="tickets-page-error"]');

    const selectDept = this.container.querySelector<HTMLSelectElement>('[data-ref="filter-department"]');
    const selectStatus = this.container.querySelector<HTMLSelectElement>('[data-ref="filter-status"]');
    const selectPriority = this.container.querySelector<HTMLSelectElement>('[data-ref="filter-priority"]');
    const selectAssigned = this.container.querySelector<HTMLSelectElement>('[data-ref="filter-assigned"]');
    const searchInput = this.container.querySelector<HTMLInputElement>('[data-ref="tickets-search-input"]');

    const params = new URLSearchParams();
    if (selectDept && selectDept.value !== 'all') params.set('department', selectDept.value);
    if (selectStatus && selectStatus.value !== 'all') params.set('status', selectStatus.value);
    if (selectPriority && selectPriority.value !== 'all') params.set('priority', selectPriority.value);

    if (selectAssigned && selectAssigned.value === 'mine') {
      const user = getAdminUser();
      if (user) params.set('assigned_to', user.id);
    } else if (selectAssigned && selectAssigned.value === 'unassigned') {
      params.set('assigned_to', 'unassigned');
    }

    if (searchInput && searchInput.value.trim()) {
      params.set('search', searchInput.value.trim());
    }

    try {
      const queryStr = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/admin/internal-tickets${queryStr}`, { signal: this.abortController?.signal });

      if (!res.ok) {
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Error al consultar los tickets internos.</td></tr>';
        }
        if (errorBanner) {
          errorBanner.textContent = 'No se pudo cargar la lista de tickets. Intenta más tarde.';
          errorBanner.style.display = 'block';
        }
        return;
      }

      const data = await res.json() as { success: boolean; tickets: InternalTicket[] };
      this.tickets = Array.isArray(data.tickets) ? data.tickets : [];
      if (badge) badge.textContent = String(this.tickets.length);
      if (errorBanner) errorBanner.style.display = 'none';

      this.renderTicketsTable(this.tickets);
    } catch {
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Error de red al consultar los tickets.</td></tr>';
      }
      if (errorBanner) {
        errorBanner.textContent = 'Error de conexión al cargar los tickets internos.';
        errorBanner.style.display = 'block';
      }
    }
  }

  private renderTicketsTable(items: InternalTicket[]): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="tickets-tbody"]');
    if (!tbody) return;

    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 64px 20px; color: var(--text-secondary);">
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; margin: 0 auto;">
              <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--bg-hover, rgba(0,0,0,0.05)); display: flex; align-items: center; justify-content: center; color: var(--text-tertiary);">
                <svg class="component-icon" aria-hidden="true" style="width: 24px; height: 24px;"><use href="/icons.svg#support_agent"></use></svg>
              </div>
              <strong style="font-weight: 600; font-size: 14.5px; color: var(--text-primary);">No se encontraron tickets</strong>
              <span style="font-size: 13px; color: var(--text-secondary); max-width: 420px; line-height: 1.4;">No hay reportes de fallas o tareas que coincidan con los filtros aplicados. Puedes crear uno con el botón "Nuevo Reporte".</span>
            </div>
          </td>
        </tr>
      `;
      renderIcons(tbody);
      return;
    }

    const priorityBadges: Record<TicketPriority, { bg: string; color: string; label: string }> = {
      high: { bg: 'rgba(249, 115, 22, 0.1)', color: '#ea580c', label: 'Alta' },
      low: { bg: 'rgba(100, 116, 139, 0.1)', color: '#64748b', label: 'Baja' },
      medium: { bg: 'rgba(14, 165, 233, 0.1)', color: '#0284c7', label: 'Media' },
      urgent: { bg: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', label: 'Urgente' },
    };

    const statusBadges: Record<TicketStatus, { bg: string; color: string; label: string }> = {
      closed: { bg: 'rgba(100, 116, 139, 0.1)', color: '#64748b', label: 'Cerrado' },
      in_progress: { bg: 'rgba(245, 158, 11, 0.1)', color: '#d97706', label: 'En Progreso' },
      open: { bg: 'rgba(59, 130, 246, 0.1)', color: '#2563eb', label: 'Abierto' },
      resolved: { bg: 'rgba(16, 185, 129, 0.1)', color: '#059669', label: 'Resuelto' },
    };

    const categoryLabels: Record<TicketCategory, string> = {
      access: 'Accesos',
      facilities: 'Instalaciones',
      finance: 'Finanzas',
      hardware: 'Hardware',
      hr: 'RRHH',
      network: 'Redes',
      other: 'General',
      software: 'Software',
    };

    tbody.innerHTML = items
      .map((t) => {
        const pBadge = priorityBadges[t.priority] || priorityBadges.medium;
        const sBadge = statusBadges[t.status] || statusBadges.open;
        const catLabel = categoryLabels[t.category] || 'General';

        const createdDate = new Date(t.created_at).toLocaleDateString('es-MX', {
          day: '2-digit',
          month: 'short',
        });

        const assigneeHtml = t.assignee_username
          ? `<div style="display: flex; align-items: center; gap: 6px;">
               <div style="width: 22px; height: 22px; border-radius: 50%; overflow: hidden; background: var(--border-color); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700;">
                 ${t.assignee_avatar_url ? `<img src="${escapeHtml(t.assignee_avatar_url)}" alt="${escapeHtml(t.assignee_username)}" style="width: 100%; height: 100%; object-fit: cover;" />` : escapeHtml(t.assignee_username.slice(0, 2).toUpperCase())}
               </div>
               <span style="font-size: 12.5px; color: var(--text-primary); max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(t.assignee_username)}</span>
             </div>`
          : '<span style="font-size: 12px; color: var(--text-tertiary); font-style: italic;">Sin Asignar</span>';

        return `
          <tr class="ticket-row" data-ref="ticket-row-${t.id}" data-ticket-id="${t.id}" style="cursor: pointer; border-bottom: 1px solid var(--border-color); transition: background 0.15s ease;">
            <td style="padding: 12px 14px; font-weight: 700; font-family: monospace; font-size: 12.5px; color: var(--text-primary);">
              ${escapeHtml(t.ticket_number)}
            </td>
            <td style="padding: 12px 14px;">
              <div style="display: flex; flex-direction: column; gap: 4px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span class="component-badge component-badge--sm" style="font-size: 10.5px; padding: 1px 6px; background: var(--bg-hover, rgba(0,0,0,0.05)); color: var(--text-secondary);">${escapeHtml(catLabel)}</span>
                  <strong style="font-size: 13.5px; color: var(--text-primary); font-weight: 600; line-height: 1.3;">${escapeHtml(t.title)}</strong>
                </div>
                <span style="font-size: 12px; color: var(--text-secondary); max-width: 440px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(t.description)}</span>
              </div>
            </td>
            <td style="padding: 12px 14px;">
              <span class="component-badge component-badge--sm" style="background: rgba(99, 102, 241, 0.08); color: ${escapeHtml(t.target_department_color)}; font-weight: 600; font-size: 11.5px;">
                ${escapeHtml(t.target_department_name)}
              </span>
            </td>
            <td style="padding: 12px 14px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 12.5px; color: var(--text-primary); font-weight: 500;">${escapeHtml(t.creator_username)}</span>
                ${t.source_department_name ? `<span style="font-size: 10.5px; color: var(--text-tertiary);">(${escapeHtml(t.source_department_name)})</span>` : ''}
              </div>
            </td>
            <td style="padding: 12px 14px;">
              <span class="component-badge component-badge--sm" style="background: ${pBadge.bg}; color: ${pBadge.color}; font-weight: 700; font-size: 11px;">
                ${pBadge.label}
              </span>
            </td>
            <td style="padding: 12px 14px;">
              <span class="component-badge component-badge--sm" style="background: ${sBadge.bg}; color: ${sBadge.color}; font-weight: 600; font-size: 11px;">
                ${sBadge.label}
              </span>
            </td>
            <td style="padding: 12px 14px;">
              ${assigneeHtml}
            </td>
            <td style="padding: 12px 14px; text-align: right;">
              <button type="button" class="component-button component-button--h30 component-button--icon-only" data-ref="btn-view-ticket-${t.id}" data-ticket-id="${t.id}" data-tooltip="Revisar ticket" aria-label="Revisar ticket">
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#chevron_right"></use></svg>
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    renderIcons(tbody);

    tbody.querySelectorAll<HTMLTableRowElement>('.ticket-row').forEach((row) => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-ticket-id');
        if (id) void this.openTicketDetail(id);
      });
    });
  }

  private openCreateModal(): void {
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-create-ticket-backdrop"]');
    const form = this.container.querySelector<HTMLFormElement>('[data-ref="form-create-ticket"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="create-ticket-error"]');

    if (form) form.reset();
    if (errorBanner) errorBanner.style.display = 'none';

    if (backdrop) {
      backdrop.style.display = 'flex';
      backdrop.classList.add('is-open', 'is-visible');
      document.body.classList.add('modal-open');
    }
  }

  private closeCreateModal(): void {
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-create-ticket-backdrop"]');
    if (backdrop) {
      backdrop.style.display = 'none';
      backdrop.classList.remove('is-open', 'is-visible');
    }
    const openModals = this.container.querySelectorAll<HTMLElement>('.modal-backdrop.is-open, .modal-backdrop[style*="display: flex"]');
    if (openModals.length === 0) {
      document.body.classList.remove('modal-open');
    }
  }

  private async handleCreateTicket(): Promise<void> {
    const titleInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-create-title"]');
    const targetDeptSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="select-create-target-dept"]');
    const categorySelect = this.container.querySelector<HTMLSelectElement>('[data-ref="select-create-category"]');
    const prioritySelect = this.container.querySelector<HTMLSelectElement>('[data-ref="select-create-priority"]');
    const sourceDeptSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="select-create-source-dept"]');
    const descTextarea = this.container.querySelector<HTMLTextAreaElement>('[data-ref="textarea-create-desc"]');
    const submitBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-create-ticket"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="create-ticket-error"]');

    if (errorBanner) errorBanner.style.display = 'none';

    const title = titleInput?.value.trim() || '';
    const targetDept = targetDeptSelect?.value || '';
    const category = (categorySelect?.value || 'other') as TicketCategory;
    const priority = (prioritySelect?.value || 'medium') as TicketPriority;
    const sourceDept = sourceDeptSelect?.value || null;
    const description = descTextarea?.value.trim() || '';

    if (!title || title.length < 3) {
      if (errorBanner) {
        errorBanner.textContent = 'El título debe contener al menos 3 caracteres.';
        errorBanner.style.display = 'block';
      }
      titleInput?.focus();
      return;
    }

    if (!targetDept) {
      if (errorBanner) {
        errorBanner.textContent = 'Selecciona el departamento responsable para atender la incidencia.';
        errorBanner.style.display = 'block';
      }
      targetDeptSelect?.focus();
      return;
    }

    if (!description || description.length < 5) {
      if (errorBanner) {
        errorBanner.textContent = 'Por favor describe la incidencia con mayor detalle (mínimo 5 caracteres).';
        errorBanner.style.display = 'block';
      }
      descTextarea?.focus();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Registrando...';
    }

    try {
      const payload: CreateTicketInput = {
        category,
        description,
        priority,
        source_department_id: sourceDept,
        target_department_id: targetDept,
        title,
      };

      const res = await fetch('/api/admin/internal-tickets', {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      const data = await res.json() as { error?: string; success: boolean; ticket?: InternalTicket };

      if (!res.ok || !data.success || !data.ticket) {
        if (errorBanner) {
          errorBanner.textContent = data.error || 'Ocurrió un error al crear el ticket.';
          errorBanner.style.display = 'block';
        }
        return;
      }

      this.closeCreateModal();
      toast.success(`Reporte ${data.ticket.ticket_number} generado correctamente`);

      await Promise.all([this.loadStats(), this.loadTickets()]);
      await this.openTicketDetail(data.ticket.id);
    } catch {
      if (errorBanner) {
        errorBanner.textContent = 'Error de conexión al registrar el ticket.';
        errorBanner.style.display = 'block';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Registrar Ticket';
      }
    }
  }

  async openTicketDetail(ticketIdOrNumber: string): Promise<void> {
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-detail-ticket-backdrop"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="update-ticket-error"]');
    const commentError = this.container.querySelector<HTMLElement>('[data-ref="comment-ticket-error"]');

    if (errorBanner) errorBanner.style.display = 'none';
    if (commentError) commentError.style.display = 'none';

    try {
      const res = await fetch(`/api/admin/internal-tickets/${ticketIdOrNumber}`, {
        signal: this.abortController?.signal,
      });

      if (!res.ok) {
        toast.error('No se pudo encontrar el ticket especificado');
        return;
      }

      const data = await res.json() as { comments: InternalTicketComment[]; success: boolean; ticket: InternalTicket };
      if (!data.success || !data.ticket) {
        toast.error('El ticket solicitado no existe');
        return;
      }

      this.selectedTicket = data.ticket;
      this.selectedComments = Array.isArray(data.comments) ? data.comments : [];

      window.history.replaceState({}, '', `/internal-tickets/${encodeURIComponent(data.ticket.ticket_number)}`);

      this.populateDetailView(this.selectedTicket, this.selectedComments);

      if (backdrop) {
        backdrop.style.display = 'flex';
        backdrop.classList.add('is-open', 'is-visible');
        document.body.classList.add('modal-open');
      }
    } catch {
      toast.error('Error al consultar el detalle del ticket');
    }
  }

  private closeTicketDetail(): void {
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-detail-ticket-backdrop"]');
    if (backdrop) {
      backdrop.style.display = 'none';
      backdrop.classList.remove('is-open', 'is-visible');
    }

    this.selectedTicket = null;
    this.selectedComments = [];

    window.history.replaceState({}, '', '/internal-tickets');

    const openModals = this.container.querySelectorAll<HTMLElement>('.modal-backdrop.is-open, .modal-backdrop[style*="display: flex"]');
    if (openModals.length === 0) {
      document.body.classList.remove('modal-open');
    }
  }

  private populateDetailView(ticket: InternalTicket, comments: InternalTicketComment[]): void {
    const numEl = this.container.querySelector<HTMLElement>('[data-ref="detail-ticket-number"]');
    const titleEl = this.container.querySelector<HTMLElement>('[data-ref="detail-ticket-title"]');
    const statusBadge = this.container.querySelector<HTMLElement>('[data-ref="detail-status-badge"]');
    const priorityBadge = this.container.querySelector<HTMLElement>('[data-ref="detail-priority-badge"]');
    const dateEl = this.container.querySelector<HTMLElement>('[data-ref="detail-created-date"]');
    const creatorName = this.container.querySelector<HTMLElement>('[data-ref="detail-creator-name"]');
    const creatorRole = this.container.querySelector<HTMLElement>('[data-ref="detail-creator-role"]');
    const creatorAvatar = this.container.querySelector<HTMLImageElement>('[data-ref="detail-creator-avatar"]');
    const sourceBadge = this.container.querySelector<HTMLElement>('[data-ref="detail-source-dept-badge"]');
    const targetBadge = this.container.querySelector<HTMLElement>('[data-ref="detail-target-dept-badge"]');
    const descBox = this.container.querySelector<HTMLElement>('[data-ref="detail-desc-box"]');

    const resSection = this.container.querySelector<HTMLElement>('[data-ref="detail-resolution-section"]');
    const resText = this.container.querySelector<HTMLElement>('[data-ref="detail-resolution-text"]');

    const selectStatus = this.container.querySelector<HTMLSelectElement>('[data-ref="select-update-status"]');
    const selectPriority = this.container.querySelector<HTMLSelectElement>('[data-ref="select-update-priority"]');
    const selectAssignee = this.container.querySelector<HTMLSelectElement>('[data-ref="select-update-assignee"]');
    const textareaResolution = this.container.querySelector<HTMLTextAreaElement>('[data-ref="textarea-update-resolution"]');

    if (numEl) numEl.textContent = ticket.ticket_number;
    if (titleEl) titleEl.textContent = ticket.title;

    const statusLabels: Record<TicketStatus, string> = {
      closed: 'Cerrado',
      in_progress: 'En Progreso',
      open: 'Abierto',
      resolved: 'Resuelto',
    };
    if (statusBadge) {
      statusBadge.textContent = statusLabels[ticket.status] || ticket.status;
      statusBadge.style.color = ticket.status === 'resolved' ? '#059669' : ticket.status === 'in_progress' ? '#d97706' : '#2563eb';
    }

    const priorityLabels: Record<TicketPriority, string> = {
      high: 'Prioridad Alta',
      low: 'Prioridad Baja',
      medium: 'Prioridad Media',
      urgent: 'Prioridad Urgente',
    };
    if (priorityBadge) {
      priorityBadge.textContent = priorityLabels[ticket.priority] || ticket.priority;
      priorityBadge.style.color = ticket.priority === 'urgent' ? '#dc2626' : ticket.priority === 'high' ? '#ea580c' : '#0284c7';
    }

    if (dateEl) {
      dateEl.textContent = `Reportado el ${new Date(ticket.created_at).toLocaleString('es-MX', {
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
        year: 'numeric',
      })}`;
    }

    if (creatorName) creatorName.textContent = ticket.creator_username;
    if (creatorRole) creatorRole.textContent = ticket.creator_job_title || ticket.source_department_name || 'Personal Corporativo';
    if (creatorAvatar) {
      creatorAvatar.src = ticket.creator_avatar_url || `/api/avatar?name=${encodeURIComponent(ticket.creator_username)}`;
    }

    if (sourceBadge) {
      sourceBadge.textContent = ticket.source_department_name ? `Origen: ${ticket.source_department_name}` : 'Origen: General';
    }
    if (targetBadge) {
      targetBadge.textContent = `Destino: ${ticket.target_department_name}`;
      targetBadge.style.color = ticket.target_department_color;
    }

    if (descBox) descBox.textContent = ticket.description;

    if (ticket.resolution_notes && ticket.resolution_notes.trim()) {
      if (resSection) resSection.style.display = 'block';
      if (resText) resText.textContent = ticket.resolution_notes;
    } else if (resSection) {
      resSection.style.display = 'none';
    }

    if (selectStatus) selectStatus.value = ticket.status;
    if (selectPriority) selectPriority.value = ticket.priority;
    if (selectAssignee) selectAssignee.value = ticket.assigned_to || '';
    if (textareaResolution) textareaResolution.value = ticket.resolution_notes || '';

    this.renderCommentsList(comments);
  }

  private renderCommentsList(comments: InternalTicketComment[]): void {
    const listContainer = this.container.querySelector<HTMLElement>('[data-ref="detail-comments-list"]');
    const countBadge = this.container.querySelector<HTMLElement>('[data-ref="detail-comments-count"]');

    if (countBadge) countBadge.textContent = String(comments.length);
    if (!listContainer) return;

    if (comments.length === 0) {
      listContainer.innerHTML = `
        <div style="padding: 20px; text-align: center; color: var(--text-secondary); background: var(--bg-hover, rgba(0,0,0,0.02)); border-radius: 8px; font-size: 13px;">
          No hay notas registradas todavía. Puedes publicar la primera respuesta o actualización técnica abajo.
        </div>
      `;
      return;
    }

    listContainer.innerHTML = comments
      .map((c) => {
        const dateStr = new Date(c.created_at).toLocaleString('es-MX', {
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          month: 'short',
        });

        const isInternal = c.is_internal_note;
        const noteBadge = isInternal
          ? '<span class="component-badge component-badge--sm" style="background: rgba(239, 68, 68, 0.1); color: #dc2626; font-size: 10.5px; font-weight: 700;">Nota Interna Confidencial</span>'
          : '';

        return `
          <div class="admin-card" style="padding: 12px 14px; gap: 8px; background: ${isInternal ? 'rgba(254, 242, 242, 0.5)' : 'var(--bg-surface)'}; border-left: 3px solid ${isInternal ? '#ef4444' : '#6366f1'};">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 24px; height: 24px; border-radius: 50%; overflow: hidden; background: var(--border-color); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700;">
                  ${c.avatar_url ? `<img src="${escapeHtml(c.avatar_url)}" alt="${escapeHtml(c.username)}" style="width: 100%; height: 100%; object-fit: cover;" />` : escapeHtml(c.username.slice(0, 2).toUpperCase())}
                </div>
                <strong style="font-size: 13px; color: var(--text-primary);">${escapeHtml(c.username)}</strong>
                ${c.department_name ? `<span style="font-size: 11px; color: var(--text-tertiary);">(${escapeHtml(c.department_name)})</span>` : ''}
                ${noteBadge}
              </div>
              <span style="font-size: 11.5px; color: var(--text-tertiary);">${escapeHtml(dateStr)}</span>
            </div>
            <div style="font-size: 13px; line-height: 1.5; color: var(--text-primary); white-space: pre-wrap; padding-left: 32px;">
              ${escapeHtml(c.message)}
            </div>
          </div>
        `;
      })
      .join('');

    renderIcons(listContainer);
  }

  private async handleSaveTicketUpdates(): Promise<void> {
    if (!this.selectedTicket) return;

    const selectStatus = this.container.querySelector<HTMLSelectElement>('[data-ref="select-update-status"]');
    const selectPriority = this.container.querySelector<HTMLSelectElement>('[data-ref="select-update-priority"]');
    const selectAssignee = this.container.querySelector<HTMLSelectElement>('[data-ref="select-update-assignee"]');
    const textareaResolution = this.container.querySelector<HTMLTextAreaElement>('[data-ref="textarea-update-resolution"]');
    const saveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-save-ticket-updates"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="update-ticket-error"]');

    if (errorBanner) errorBanner.style.display = 'none';

    const status = (selectStatus?.value || this.selectedTicket.status) as TicketStatus;
    const priority = (selectPriority?.value || this.selectedTicket.priority) as TicketPriority;
    const assigned_to = selectAssignee ? (selectAssignee.value || null) : undefined;
    const resolution_notes = textareaResolution ? textareaResolution.value.trim() : undefined;

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando...';
    }

    try {
      const payload: UpdateTicketInput = {
        assigned_to,
        priority,
        resolution_notes,
        status,
      };

      const res = await fetch(`/api/admin/internal-tickets/${this.selectedTicket.id}`, {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      });

      const data = await res.json() as { error?: string; success: boolean; ticket?: InternalTicket };

      if (!res.ok || !data.success || !data.ticket) {
        if (errorBanner) {
          errorBanner.textContent = data.error || 'No se pudieron guardar las modificaciones.';
          errorBanner.style.display = 'block';
        }
        return;
      }

      this.selectedTicket = data.ticket;
      this.populateDetailView(this.selectedTicket, this.selectedComments);
      toast.success('Ticket actualizado exitosamente');

      void Promise.all([this.loadStats(), this.loadTickets()]);
    } catch {
      if (errorBanner) {
        errorBanner.textContent = 'Error de conexión al actualizar el ticket.';
        errorBanner.style.display = 'block';
      }
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar Modificaciones';
      }
    }
  }

  private async handleSubmitComment(): Promise<void> {
    if (!this.selectedTicket) return;

    const textarea = this.container.querySelector<HTMLTextAreaElement>('[data-ref="textarea-new-comment"]');
    const checkbox = this.container.querySelector<HTMLInputElement>('[data-ref="checkbox-internal-note"]');
    const submitBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-comment"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="comment-ticket-error"]');

    if (errorBanner) errorBanner.style.display = 'none';

    const message = textarea?.value.trim() || '';
    if (!message) {
      if (errorBanner) {
        errorBanner.textContent = 'Escribe un mensaje antes de enviar.';
        errorBanner.style.display = 'block';
      }
      textarea?.focus();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';
    }

    try {
      const res = await fetch(`/api/admin/internal-tickets/${this.selectedTicket.id}/comments`, {
        body: JSON.stringify({
          is_internal_note: Boolean(checkbox?.checked),
          message,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      const data = await res.json() as { comment?: InternalTicketComment; error?: string; success: boolean };

      if (!res.ok || !data.success || !data.comment) {
        if (errorBanner) {
          errorBanner.textContent = data.error || 'Error al publicar el comentario.';
          errorBanner.style.display = 'block';
        }
        return;
      }

      this.selectedComments.push(data.comment);
      this.renderCommentsList(this.selectedComments);

      if (textarea) textarea.value = '';
      if (checkbox) checkbox.checked = false;

      toast.success('Nota registrada correctamente');
    } catch {
      if (errorBanner) {
        errorBanner.textContent = 'Error de conexión al enviar el comentario.';
        errorBanner.style.display = 'block';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar Nota';
      }
    }
  }
}

export async function createInternalTicketsView(ticketId = ''): Promise<HTMLElement> {
  const container = await loadTemplate('/views/internal-tickets/internal-tickets.html');
  const controller = new InternalTicketsController(container, ticketId);
  (container as any).__viewController = controller;
  await controller.init();

  return container;
}
