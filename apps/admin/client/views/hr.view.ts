import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { toast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { DocumentType, EmployeeStatus, EmploymentType, HireCredentials, HrDepartment, HrDocumentItem, HrEmployeeItem, HrOrganigramNodeItem, HrSummaryStats, HrVacationItem, SalaryFrequency } from '../types/hr.types.js';
import { escapeHtml } from '../utils/dom.util.js';

export class HrController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private currentTab: 'employees' | 'organigram' | 'documents' | 'vacations' = 'employees';
  private departments: HrDepartment[] = [];
  private documents: HrDocumentItem[] = [];
  private employees: HrEmployeeItem[] = [];
  private organigramTree: HrOrganigramNodeItem[] = [];
  private organigramZoom = 1;
  private selectedUploadFile: File | null = null;
  private vacations: HrVacationItem[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    renderIcons(this.container);
    this.bindTabs();
    this.bindModals();
    this.bindFilterEvents();
    this.bindOrganigramControls();
    await this.loadInitialData();
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    document.body.classList.remove('modal-open');
  }

  private openModal(modal: HTMLElement | null): void {
    if (!modal) return;
    modal.style.display = 'flex';
    modal.classList.add('is-open', 'is-visible');
    document.body.classList.add('modal-open');
  }

  private closeModal(modal: HTMLElement | null): void {
    if (!modal) return;
    modal.style.display = 'none';
    modal.classList.remove('is-open', 'is-visible');
    const openModals = this.container.querySelectorAll<HTMLElement>('.modal-backdrop.is-open, .modal-backdrop[style*="display: flex"]');
    if (openModals.length === 0) {
      document.body.classList.remove('modal-open');
    }
  }

  private async loadInitialData(): Promise<void> {
    await Promise.all([
      this.loadOverview(),
      this.loadDepartments(),
      this.loadEmployees(),
    ]);
  }

  private async loadOverview(): Promise<void> {
    try {
      const res = await fetch('/api/admin/hr/overview', { signal: this.abortController?.signal });
      if (!res.ok) return;
      const data = await res.json() as { stats: HrSummaryStats; success: boolean };
      if (!data.success || !data.stats) return;

      const statActive = this.container.querySelector<HTMLElement>('[data-ref="stat-active-employees"]');
      const statPayroll = this.container.querySelector<HTMLElement>('[data-ref="stat-monthly-payroll"]');
      const statVacations = this.container.querySelector<HTMLElement>('[data-ref="stat-pending-vacations"]');
      const statDocs = this.container.querySelector<HTMLElement>('[data-ref="stat-total-documents"]');

      if (statActive) statActive.textContent = String(data.stats.active_employees);
      if (statPayroll) statPayroll.textContent = `$${data.stats.monthly_payroll_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (statVacations) statVacations.textContent = String(data.stats.pending_vacations_count);
      if (statDocs) statDocs.textContent = String(data.stats.total_documents_count);
    } catch {}
  }

  private async loadDepartments(): Promise<void> {
    try {
      const res = await fetch('/api/admin/hr/departments', { signal: this.abortController?.signal });
      if (!res.ok) return;
      const data = await res.json() as { departments: HrDepartment[]; success: boolean };
      if (data.success && Array.isArray(data.departments)) {
        this.departments = data.departments;
        this.populateDepartmentSelects();
      }
    } catch {}
  }

  private populateDepartmentSelects(): void {
    const filterSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="employees-department-filter"]');
    const hireSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="hire-select-department"]');
    const editSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="edit-select-department"]');

    if (filterSelect) {
      const current = filterSelect.value;
      filterSelect.innerHTML = '<option value="">Todos los departamentos</option>' +
        this.departments.map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join('');
      filterSelect.value = current;
    }

    if (hireSelect) {
      hireSelect.innerHTML = '<option value="" disabled selected>Selecciona un departamento</option>' +
        this.departments.map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join('');
    }

    if (editSelect) {
      editSelect.innerHTML = this.departments.map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`).join('');
    }
  }

  private populateEmployeeSelects(): void {
    const hireManagerSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="hire-select-manager"]');
    const editManagerSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="edit-select-manager"]');
    const uploadEmployeeSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="upload-select-employee"]');
    const vacEmployeeSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="vacation-select-employee"]');

    const optionsHtml = this.employees
      .filter((e) => e.status !== 'terminated')
      .map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.username)} (${escapeHtml(e.job_title)} - ${escapeHtml(e.department_name)})</option>`)
      .join('');

    if (hireManagerSelect) {
      hireManagerSelect.innerHTML = '<option value="">Sin supervisor directo (Nivel Directivo)</option>' + optionsHtml;
    }

    if (editManagerSelect) {
      editManagerSelect.innerHTML = '<option value="">Sin supervisor directo</option>' + optionsHtml;
    }

    if (uploadEmployeeSelect) {
      uploadEmployeeSelect.innerHTML = '<option value="" disabled selected>Selecciona un colaborador</option>' + optionsHtml;
    }

    if (vacEmployeeSelect) {
      vacEmployeeSelect.innerHTML = '<option value="" disabled selected>Selecciona un colaborador</option>' + optionsHtml;
    }
  }

  private async loadEmployees(): Promise<void> {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="employees-tbody"]');
    const badge = this.container.querySelector<HTMLElement>('[data-ref="hr-employees-badge"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="employees-table-error"]');

    const deptFilter = this.container.querySelector<HTMLSelectElement>('[data-ref="employees-department-filter"]')?.value || '';
    const statusFilter = this.container.querySelector<HTMLSelectElement>('[data-ref="employees-status-filter"]')?.value || '';
    const searchInput = this.container.querySelector<HTMLInputElement>('[data-ref="employees-search-input"]')?.value || '';

    const params = new URLSearchParams();
    if (deptFilter) params.set('department_id', deptFilter);
    if (statusFilter) params.set('status', statusFilter);
    if (searchInput.trim()) params.set('search', searchInput.trim());

    try {
      const res = await fetch(`/api/admin/hr/employees?${params.toString()}`, { signal: this.abortController?.signal });
      if (!res.ok) {
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Error al consultar nómina de colaboradores.</td></tr>';
        }
        if (errorBanner) {
          errorBanner.textContent = 'No se pudo cargar la lista de colaboradores. Intenta nuevamente más tarde.';
          errorBanner.style.display = 'block';
        }
        return;
      }

      const data = await res.json() as { employees: HrEmployeeItem[]; success: boolean; total: number };
      this.employees = Array.isArray(data.employees) ? data.employees : [];

      if (badge) badge.textContent = `${this.employees.length} colaboradores`;
      if (errorBanner) errorBanner.style.display = 'none';

      this.populateEmployeeSelects();
      this.renderEmployeesTable(this.employees);
    } catch {
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Error de red al consultar colaboradores.</td></tr>';
      }
    }
  }

  private renderEmployeesTable(items: HrEmployeeItem[]): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="employees-tbody"]');
    if (!tbody) return;

    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 64px 20px; color: var(--text-secondary);">
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;">
              <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--bg-hover, rgba(0,0,0,0.05)); display: flex; align-items: center; justify-content: center; color: var(--text-tertiary);">
                <svg class="component-icon" aria-hidden="true" style="width: 24px; height: 24px;"><use href="/icons.svg#groups"></use></svg>
              </div>
              <strong style="font-weight: 600; font-size: 14.5px; color: var(--text-primary);">No se encontraron colaboradores</strong>
              <span style="font-size: 13px; color: var(--text-secondary); max-width: 420px; line-height: 1.4;">No hay registros de empleados que coincidan con los filtros aplicados.</span>
            </div>
          </td>
        </tr>
      `;
      renderIcons(tbody);
      return;
    }

    tbody.innerHTML = items
      .map((item) => {
        const avatarUrl = item.avatar_url || `/api/avatar?name=${encodeURIComponent(item.username)}`;
        const statusMap: Record<EmployeeStatus, { class: string; label: string }> = {
          active: { class: 'badge--success', label: 'Activo' },
          on_leave: { class: 'badge--warning', label: 'En Vacaciones' },
          probation: { class: 'badge--info', label: 'Periodo de Prueba' },
          terminated: { class: 'badge--danger', label: 'Baja' },
        };
        const statusBadge = statusMap[item.status] || { class: 'badge--info', label: item.status };

        const salaryFormatted = `${item.salary_currency} $${item.salary_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const frequencyLabel: Record<SalaryFrequency, string> = {
          annual: '/ año',
          biweekly: '/ quincena',
          monthly: '/ mes',
          weekly: '/ semana',
        };

        return `
          <tr data-ref="employee-row-${item.id}">
            <td>
              <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 38px; height: 38px; border-radius: 50%; overflow: hidden; background: var(--bg-hover, rgba(0,0,0,0.05)); flex-shrink: 0;">
                  <img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(item.username)}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='/api/avatar?name=${encodeURIComponent(item.username)}'" />
                </div>
                <div style="display: flex; flex-direction: column;">
                  <span style="font-weight: 600; color: var(--text-primary); font-size: 13.5px;">${escapeHtml(item.username)}</span>
                  <span style="font-size: 12px; color: var(--text-secondary); font-family: monospace;">${escapeHtml(item.email)}</span>
                </div>
              </div>
            </td>
            <td>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <span style="font-weight: 600; color: var(--text-primary);">${escapeHtml(item.job_title)}</span>
                <span style="display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 10.5px; font-weight: 700; color: #ffffff; background: ${escapeHtml(item.department_color)}; width: fit-content;">
                  ${escapeHtml(item.department_name)}
                </span>
              </div>
            </td>
            <td>
              <span class="badge badge--info" style="font-size: 11px; font-weight: 700;">${escapeHtml(item.role)}</span>
            </td>
            <td>
              <div style="display: flex; flex-direction: column;">
                <span style="font-weight: 700; color: var(--text-primary);">${salaryFormatted}</span>
                <span style="font-size: 11.5px; color: var(--text-secondary);">${frequencyLabel[item.salary_frequency] || ''}</span>
              </div>
            </td>
            <td>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="font-size: 13px; font-weight: 700; color: var(--success, #10b981);">${item.vacation_balance} días disp.</div>
                <div style="font-size: 11px; color: var(--text-tertiary);">(${item.vacation_days_used} de ${item.vacation_days_allocated})</div>
              </div>
            </td>
            <td>
              <span class="badge ${statusBadge.class}" style="font-size: 11px; font-weight: 700;">${statusBadge.label}</span>
            </td>
            <td style="text-align: right;">
              <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
                <button type="button" class="component-button component-button--secondary component-button--icon-only" data-ref="btn-edit-emp-${item.id}" data-tooltip="Editar empleado" aria-label="Editar empleado">
                  <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#edit"></use></svg>
                </button>
                <button type="button" class="component-button component-button--secondary component-button--icon-only" data-ref="btn-upload-emp-${item.id}" data-tooltip="Subir contrato o NDA" aria-label="Subir contrato">
                  <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#upload_file"></use></svg>
                </button>
                <button type="button" class="component-button component-button--secondary component-button--icon-only" data-ref="btn-vac-emp-${item.id}" data-tooltip="Solicitar vacaciones" aria-label="Solicitar vacaciones">
                  <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#slideshow"></use></svg>
                </button>
                ${item.status !== 'terminated' ? `
                  <button type="button" class="component-button component-button--danger component-button--icon-only" data-ref="btn-terminate-emp-${item.id}" data-tooltip="Dar de baja" aria-label="Dar de baja">
                    <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#close"></use></svg>
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    renderIcons(tbody);

    items.forEach((item) => {
      const btnEdit = tbody.querySelector<HTMLElement>(`[data-ref="btn-edit-emp-${item.id}"]`);
      const btnUpload = tbody.querySelector<HTMLElement>(`[data-ref="btn-upload-emp-${item.id}"]`);
      const btnVac = tbody.querySelector<HTMLElement>(`[data-ref="btn-vac-emp-${item.id}"]`);
      const btnTerminate = tbody.querySelector<HTMLElement>(`[data-ref="btn-terminate-emp-${item.id}"]`);

      btnEdit?.addEventListener('click', () => this.openEditModal(item));
      btnUpload?.addEventListener('click', () => this.openUploadModal(item.id));
      btnVac?.addEventListener('click', () => this.openVacationModal(item.id));
      btnTerminate?.addEventListener('click', () => this.confirmTerminateEmployee(item));
    });
  }

  private async loadOrganigram(): Promise<void> {
    const container = this.container.querySelector<HTMLElement>('[data-ref="organigram-tree"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="organigram-error"]');
    if (!container) return;

    try {
      const res = await fetch('/api/admin/hr/organigram', { signal: this.abortController?.signal });
      if (!res.ok) {
        if (errorBanner) {
          errorBanner.textContent = 'No se pudo cargar el organigrama empresarial.';
          errorBanner.style.display = 'block';
        }
        return;
      }

      const data = await res.json() as { organigram: HrOrganigramNodeItem[]; success: boolean };
      this.organigramTree = Array.isArray(data.organigram) ? data.organigram : [];
      if (errorBanner) errorBanner.style.display = 'none';

      this.renderOrganigramTree(this.organigramTree);
    } catch {
      if (container) {
        container.innerHTML = '<div style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Error de red al cargar el organigrama.</div>';
      }
    }
  }

  private renderOrganigramTree(nodes: HrOrganigramNodeItem[]): void {
    const container = this.container.querySelector<HTMLElement>('[data-ref="organigram-tree"]');
    if (!container) return;

    if (nodes.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 64px 20px; color: var(--text-secondary);">
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--bg-hover, rgba(0,0,0,0.05)); display: flex; align-items: center; justify-content: center; color: var(--text-tertiary);">
              <svg class="component-icon" aria-hidden="true" style="width: 24px; height: 24px;"><use href="/icons.svg#account_tree"></use></svg>
            </div>
            <strong style="font-weight: 600; font-size: 14.5px; color: var(--text-primary);">Organigrama vacío</strong>
            <span style="font-size: 13px; color: var(--text-secondary); max-width: 420px; line-height: 1.4;">Contrata colaboradores y asigna sus supervisores para visualizar el organigrama interactivo.</span>
          </div>
        </div>
      `;
      renderIcons(container);
      return;
    }

    const renderNodeHtml = (node: HrOrganigramNodeItem): string => {
      const avatarUrl = node.avatar_url || `/api/avatar?name=${encodeURIComponent(node.name)}`;
      const hasChildren = node.subordinates && node.subordinates.length > 0;

      return `
        <div class="tree-node-wrapper" data-ref="tree-node-${node.id}">
          <div class="org-card" data-ref="org-card-${node.id}">
            <div class="org-card__header">
              <div class="org-card__avatar">
                <img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(node.name)}" onerror="this.src='/api/avatar?name=${encodeURIComponent(node.name)}'" />
              </div>
              <div style="display: flex; flex-direction: column; overflow: hidden;">
                <span class="org-card__name">${escapeHtml(node.name)}</span>
                <span class="org-card__title">${escapeHtml(node.job_title)}</span>
              </div>
            </div>

            <span class="org-card__dept-badge" style="background: ${escapeHtml(node.department_color)};">
              ${escapeHtml(node.department_name)}
            </span>

            <div class="org-card__footer">
              <span>${escapeHtml(node.role)}</span>
              <span>${node.subordinates.length} a cargo</span>
            </div>
          </div>

          ${hasChildren ? `
            <div class="tree-children-container" data-ref="children-${node.id}">
              ${node.subordinates.map(renderNodeHtml).join('')}
            </div>
          ` : ''}
        </div>
      `;
    };

    container.innerHTML = `
      <div class="tree-level" data-ref="tree-roots">
        ${nodes.map(renderNodeHtml).join('')}
      </div>
    `;

    renderIcons(container);

    const bindNodeClicks = (nodeList: HrOrganigramNodeItem[]) => {
      for (const node of nodeList) {
        const card = container.querySelector<HTMLElement>(`[data-ref="org-card-${node.id}"]`);
        card?.addEventListener('click', () => {
          const emp = this.employees.find((e) => e.id === node.id);
          if (emp) this.openEditModal(emp);
        });
        if (node.subordinates?.length > 0) {
          bindNodeClicks(node.subordinates);
        }
      }
    };
    bindNodeClicks(nodes);
  }

  private async loadDocuments(): Promise<void> {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="documents-tbody"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="documents-table-error"]');
    if (!tbody) return;

    try {
      const res = await fetch('/api/admin/hr/documents', { signal: this.abortController?.signal });
      if (!res.ok) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Error al consultar repositorio de contratos y documentos.</td></tr>';
        return;
      }

      const data = await res.json() as { documents: HrDocumentItem[]; success: boolean; total: number };
      this.documents = Array.isArray(data.documents) ? data.documents : [];
      if (errorBanner) errorBanner.style.display = 'none';

      this.renderDocumentsTable(this.documents);
    } catch {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Error de red al consultar documentos.</td></tr>';
    }
  }

  private renderDocumentsTable(items: HrDocumentItem[]): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="documents-tbody"]');
    if (!tbody) return;

    const typeFilter = this.container.querySelector<HTMLSelectElement>('[data-ref="documents-type-filter"]')?.value || '';
    const searchVal = this.container.querySelector<HTMLInputElement>('[data-ref="documents-search-input"]')?.value.trim().toLowerCase() || '';

    const filtered = items.filter((d) => {
      if (typeFilter && d.document_type !== typeFilter) return false;
      if (searchVal && !d.title.toLowerCase().includes(searchVal) && !d.employee_name.toLowerCase().includes(searchVal)) return false;
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 64px 20px; color: var(--text-secondary);">
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;">
              <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--bg-hover, rgba(0,0,0,0.05)); display: flex; align-items: center; justify-content: center; color: var(--text-tertiary);">
                <svg class="component-icon" aria-hidden="true" style="width: 24px; height: 24px;"><use href="/icons.svg#description"></use></svg>
              </div>
              <strong style="font-weight: 600; font-size: 14.5px; color: var(--text-primary);">No hay documentos registrados</strong>
              <span style="font-size: 13px; color: var(--text-secondary); max-width: 420px; line-height: 1.4;">Sube contratos de trabajo o acuerdos de confidencialidad (NDA) para archivarlos con seguridad.</span>
            </div>
          </td>
        </tr>
      `;
      renderIcons(tbody);
      return;
    }

    const typeLabels: Record<DocumentType, { class: string; label: string }> = {
      certification: { class: 'badge--info', label: 'Certificación' },
      contract: { class: 'badge--primary', label: 'Contrato Laboral' },
      nda: { class: 'badge--warning', label: 'Acuerdo Confidencialidad (NDA)' },
      other: { class: 'badge--secondary', label: 'Otro' },
      tax_id: { class: 'badge--info', label: 'Identificación / Fiscal' },
    };

    tbody.innerHTML = filtered
      .map((item) => {
        const typeInfo = typeLabels[item.document_type] || { class: 'badge--info', label: item.document_type };
        const kbSize = (item.file_size_bytes / 1024).toFixed(1);
        const formattedDate = item.created_at ? item.created_at.split('T')[0] : '—';

        return `
          <tr data-ref="doc-row-${item.id}">
            <td>
              <div style="display: flex; align-items: center; gap: 10px;">
                <svg class="component-icon" aria-hidden="true" style="color: var(--primary, #0ea5e9);"><use href="/icons.svg#description"></use></svg>
                <div style="display: flex; flex-direction: column;">
                  <strong style="color: var(--text-primary); font-size: 13.5px;">${escapeHtml(item.title)}</strong>
                  <span style="font-size: 11.5px; color: var(--text-tertiary); font-family: monospace;">${escapeHtml(item.file_name)}</span>
                </div>
              </div>
            </td>
            <td>
              <span class="badge ${typeInfo.class}" style="font-size: 11px; font-weight: 700;">${typeInfo.label}</span>
            </td>
            <td>
              <strong style="color: var(--text-primary); font-size: 13px;">${escapeHtml(item.employee_name)}</strong>
            </td>
            <td>
              <span style="font-size: 12px; color: var(--text-secondary);">${kbSize} KB</span>
            </td>
            <td>
              <span style="font-size: 12.5px; color: var(--text-secondary);">${formattedDate}</span>
            </td>
            <td>
              <span style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(item.uploaded_by_username || 'Sistema')}</span>
            </td>
            <td style="text-align: right;">
              <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
                <a href="${escapeHtml(item.file_url)}" target="_blank" download rel="noopener noreferrer" class="component-button component-button--secondary component-button--icon-only" data-tooltip="Descargar archivo" aria-label="Descargar archivo">
                  <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#download"></use></svg>
                </a>
                <button type="button" class="component-button component-button--danger component-button--icon-only" data-ref="btn-delete-doc-${item.id}" data-tooltip="Eliminar documento" aria-label="Eliminar documento">
                  <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#delete"></use></svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    renderIcons(tbody);

    filtered.forEach((item) => {
      const btnDelete = tbody.querySelector<HTMLElement>(`[data-ref="btn-delete-doc-${item.id}"]`);
      btnDelete?.addEventListener('click', () => this.confirmDeleteDocument(item));
    });
  }

  private async loadVacations(): Promise<void> {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="vacations-tbody"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="vacations-table-error"]');
    if (!tbody) return;

    try {
      const res = await fetch('/api/admin/hr/vacations', { signal: this.abortController?.signal });
      if (!res.ok) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Error al consultar solicitudes de vacaciones.</td></tr>';
        return;
      }

      const data = await res.json() as { success: boolean; total: number; vacations: HrVacationItem[] };
      this.vacations = Array.isArray(data.vacations) ? data.vacations : [];
      if (errorBanner) errorBanner.style.display = 'none';

      this.renderVacationsTable(this.vacations);
    } catch {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Error de red al consultar solicitudes de vacaciones.</td></tr>';
    }
  }

  private renderVacationsTable(items: HrVacationItem[]): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="vacations-tbody"]');
    if (!tbody) return;

    const statusFilter = this.container.querySelector<HTMLSelectElement>('[data-ref="vacations-status-filter"]')?.value || '';
    const searchVal = this.container.querySelector<HTMLInputElement>('[data-ref="vacations-search-input"]')?.value.trim().toLowerCase() || '';

    const filtered = items.filter((v) => {
      if (statusFilter && v.status !== statusFilter) return false;
      if (searchVal && !v.employee_name.toLowerCase().includes(searchVal)) return false;
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 64px 20px; color: var(--text-secondary);">
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;">
              <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--bg-hover, rgba(0,0,0,0.05)); display: flex; align-items: center; justify-content: center; color: var(--text-tertiary);">
                <svg class="component-icon" aria-hidden="true" style="width: 24px; height: 24px;"><use href="/icons.svg#slideshow"></use></svg>
              </div>
              <strong style="font-weight: 600; font-size: 14.5px; color: var(--text-primary);">No hay solicitudes de vacaciones</strong>
              <span style="font-size: 13px; color: var(--text-secondary); max-width: 420px; line-height: 1.4;">Las solicitudes solicitadas o registradas aparecerán listadas aquí para su revisión.</span>
            </div>
          </td>
        </tr>
      `;
      renderIcons(tbody);
      return;
    }

    tbody.innerHTML = filtered
      .map((item) => {
        const statusMap = {
          approved: { class: 'badge--success', label: 'Aprobada' },
          pending: { class: 'badge--warning', label: 'Pendiente de Revisión' },
          rejected: { class: 'badge--danger', label: 'Rechazada' },
        };
        const statusInfo = statusMap[item.status] || { class: 'badge--info', label: item.status };

        return `
          <tr data-ref="vac-row-${item.id}">
            <td>
              <strong style="color: var(--text-primary); font-size: 13.5px;">${escapeHtml(item.employee_name)}</strong>
            </td>
            <td>
              <span style="font-size: 12.5px; color: var(--text-primary); font-weight: 600;">
                ${escapeHtml(item.start_date)} <span style="color: var(--text-tertiary); font-weight: normal;">hasta</span> ${escapeHtml(item.end_date)}
              </span>
            </td>
            <td>
              <span class="badge badge--info" style="font-weight: 700;">${item.days_count} días</span>
            </td>
            <td>
              <span style="font-size: 12.5px; color: var(--text-secondary); font-style: italic;">
                ${escapeHtml(item.reason || 'Sin justificación detallada')}
              </span>
            </td>
            <td>
              <span class="badge ${statusInfo.class}" style="font-size: 11px; font-weight: 700;">${statusInfo.label}</span>
            </td>
            <td>
              <span style="font-size: 12px; color: var(--text-secondary);">
                ${escapeHtml(item.review_notes || '—')}
              </span>
            </td>
            <td style="text-align: right;">
              <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
                ${item.status === 'pending' ? `
                  <button type="button" class="component-button component-button--primary" data-ref="btn-review-vac-${item.id}" style="font-size: 12px; height: 32px; padding: 0 12px;">
                    Revisar
                  </button>
                ` : `
                  <button type="button" class="component-button component-button--secondary component-button--icon-only" data-ref="btn-review-vac-${item.id}" data-tooltip="Modificar resolución" aria-label="Modificar resolución">
                    <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#edit"></use></svg>
                  </button>
                `}
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    renderIcons(tbody);

    filtered.forEach((item) => {
      const btnReview = tbody.querySelector<HTMLElement>(`[data-ref="btn-review-vac-${item.id}"]`);
      btnReview?.addEventListener('click', () => this.openReviewVacationModal(item));
    });
  }

  private bindTabs(): void {
    const tabs = [
      { btnRef: 'tab-btn-employees', panelRef: 'panel-employees', tab: 'employees' as const },
      { btnRef: 'tab-btn-organigram', panelRef: 'panel-organigram', tab: 'organigram' as const },
      { btnRef: 'tab-btn-documents', panelRef: 'panel-documents', tab: 'documents' as const },
      { btnRef: 'tab-btn-vacations', panelRef: 'panel-vacations', tab: 'vacations' as const },
    ];

    tabs.forEach(({ btnRef, panelRef, tab }) => {
      const btn = this.container.querySelector<HTMLElement>(`[data-ref="${btnRef}"]`);
      btn?.addEventListener('click', () => {
        tabs.forEach((t) => {
          this.container.querySelector<HTMLElement>(`[data-ref="${t.btnRef}"]`)?.classList.remove('is-active');
          const p = this.container.querySelector<HTMLElement>(`[data-ref="${t.panelRef}"]`);
          if (p) p.style.display = 'none';
        });

        btn.classList.add('is-active');
        const activePanel = this.container.querySelector<HTMLElement>(`[data-ref="${panelRef}"]`);
        if (activePanel) activePanel.style.display = '';

        this.currentTab = tab;
        if (tab === 'organigram') void this.loadOrganigram();
        if (tab === 'documents') void this.loadDocuments();
        if (tab === 'vacations') void this.loadVacations();
      });
    });
  }

  private bindFilterEvents(): void {
    const searchEmp = this.container.querySelector<HTMLInputElement>('[data-ref="employees-search-input"]');
    const deptFilter = this.container.querySelector<HTMLSelectElement>('[data-ref="employees-department-filter"]');
    const statusFilter = this.container.querySelector<HTMLSelectElement>('[data-ref="employees-status-filter"]');
    const refreshEmp = this.container.querySelector<HTMLElement>('[data-ref="btn-refresh-employees"]');

    let debounceTimer: any = null;
    searchEmp?.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => void this.loadEmployees(), 250);
    });

    deptFilter?.addEventListener('change', () => void this.loadEmployees());
    statusFilter?.addEventListener('change', () => void this.loadEmployees());
    refreshEmp?.addEventListener('click', () => void this.loadEmployees());

    const docTypeFilter = this.container.querySelector<HTMLSelectElement>('[data-ref="documents-type-filter"]');
    const docSearch = this.container.querySelector<HTMLInputElement>('[data-ref="documents-search-input"]');
    docTypeFilter?.addEventListener('change', () => this.renderDocumentsTable(this.documents));
    docSearch?.addEventListener('input', () => this.renderDocumentsTable(this.documents));

    const vacStatusFilter = this.container.querySelector<HTMLSelectElement>('[data-ref="vacations-status-filter"]');
    const vacSearch = this.container.querySelector<HTMLInputElement>('[data-ref="vacations-search-input"]');
    vacStatusFilter?.addEventListener('change', () => this.renderVacationsTable(this.vacations));
    vacSearch?.addEventListener('input', () => this.renderVacationsTable(this.vacations));
  }

  private bindOrganigramControls(): void {
    const btnZoomIn = this.container.querySelector<HTMLElement>('[data-ref="btn-organigram-zoom-in"]');
    const btnZoomOut = this.container.querySelector<HTMLElement>('[data-ref="btn-organigram-zoom-out"]');
    const btnReset = this.container.querySelector<HTMLElement>('[data-ref="btn-organigram-reset"]');
    const searchInput = this.container.querySelector<HTMLInputElement>('[data-ref="organigram-search-input"]');
    const tree = this.container.querySelector<HTMLElement>('[data-ref="organigram-tree"]');

    btnZoomIn?.addEventListener('click', () => {
      this.organigramZoom = Math.min(1.8, this.organigramZoom + 0.15);
      if (tree) tree.style.transform = `scale(${this.organigramZoom})`;
    });

    btnZoomOut?.addEventListener('click', () => {
      this.organigramZoom = Math.max(0.5, this.organigramZoom - 0.15);
      if (tree) tree.style.transform = `scale(${this.organigramZoom})`;
    });

    btnReset?.addEventListener('click', () => {
      this.organigramZoom = 1;
      if (tree) tree.style.transform = 'scale(1)';
    });

    searchInput?.addEventListener('input', () => {
      const query = searchInput.value.trim().toLowerCase();
      const allCards = this.container.querySelectorAll<HTMLElement>('.org-card');
      allCards.forEach((card) => {
        if (!query) {
          card.style.opacity = '1';
          card.style.borderColor = '';
        } else if (card.textContent?.toLowerCase().includes(query)) {
          card.style.opacity = '1';
          card.style.borderColor = 'var(--primary, #0ea5e9)';
          card.style.boxShadow = '0 0 0 3px rgba(14, 165, 233, 0.3)';
        } else {
          card.style.opacity = '0.35';
          card.style.borderColor = '';
          card.style.boxShadow = '';
        }
      });
    });
  }

  private bindModals(): void {
    const btnOpenHire = this.container.querySelector<HTMLElement>('[data-ref="btn-open-hire-modal"]');
    const btnOpenUpload = this.container.querySelector<HTMLElement>('[data-ref="btn-open-upload-modal"]');
    const btnUploadTab = this.container.querySelector<HTMLElement>('[data-ref="btn-upload-doc-tab"]');
    const btnOpenVac = this.container.querySelector<HTMLElement>('[data-ref="btn-open-vacation-modal"]');
    const btnVacTab = this.container.querySelector<HTMLElement>('[data-ref="btn-request-vacation-tab"]');

    btnOpenHire?.addEventListener('click', () => this.openHireModal());
    btnOpenUpload?.addEventListener('click', () => this.openUploadModal());
    btnUploadTab?.addEventListener('click', () => this.openUploadModal());
    btnOpenVac?.addEventListener('click', () => this.openVacationModal());
    btnVacTab?.addEventListener('click', () => this.openVacationModal());

    const hireModal = this.container.querySelector<HTMLElement>('[data-ref="modal-hire-backdrop"]');
    const btnCloseHire = this.container.querySelector<HTMLElement>('[data-ref="btn-close-hire-modal"]');
    const btnCancelHire = this.container.querySelector<HTMLElement>('[data-ref="btn-cancel-hire"]');
    const formHire = this.container.querySelector<HTMLFormElement>('[data-ref="form-hire"]');

    const closeHire = () => this.closeModal(hireModal);
    btnCloseHire?.addEventListener('click', closeHire);
    btnCancelHire?.addEventListener('click', closeHire);
    formHire?.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.handleHireSubmit();
    });

    const credModal = this.container.querySelector<HTMLElement>('[data-ref="modal-credentials-backdrop"]');
    const btnCloseCred = this.container.querySelector<HTMLElement>('[data-ref="btn-close-credentials"]');
    btnCloseCred?.addEventListener('click', () => this.closeModal(credModal));

    const editModal = this.container.querySelector<HTMLElement>('[data-ref="modal-edit-backdrop"]');
    const btnCloseEdit = this.container.querySelector<HTMLElement>('[data-ref="btn-close-edit-modal"]');
    const btnCancelEdit = this.container.querySelector<HTMLElement>('[data-ref="btn-cancel-edit"]');
    const formEdit = this.container.querySelector<HTMLFormElement>('[data-ref="form-edit"]');

    const closeEdit = () => this.closeModal(editModal);
    btnCloseEdit?.addEventListener('click', closeEdit);
    btnCancelEdit?.addEventListener('click', closeEdit);
    formEdit?.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.handleEditSubmit();
    });

    const uploadModal = this.container.querySelector<HTMLElement>('[data-ref="modal-upload-backdrop"]');
    const btnCloseUpload = this.container.querySelector<HTMLElement>('[data-ref="btn-close-upload-modal"]');
    const btnCancelUpload = this.container.querySelector<HTMLElement>('[data-ref="btn-cancel-upload"]');
    const formUpload = this.container.querySelector<HTMLFormElement>('[data-ref="form-upload"]');
    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="upload-dropzone"]');
    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="upload-input-file"]');

    const closeUpload = () => {
      this.closeModal(uploadModal);
      this.selectedUploadFile = null;
      const label = this.container.querySelector<HTMLElement>('[data-ref="upload-file-label"]');
      if (label) label.textContent = 'Haz clic o arrastra un archivo aquí';
    };
    btnCloseUpload?.addEventListener('click', closeUpload);
    btnCancelUpload?.addEventListener('click', closeUpload);

    dropzone?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        this.selectedUploadFile = fileInput.files[0];
        const label = this.container.querySelector<HTMLElement>('[data-ref="upload-file-label"]');
        if (label) label.textContent = `${this.selectedUploadFile.name} (${(this.selectedUploadFile.size / 1024).toFixed(1)} KB)`;
      }
    });

    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--primary, #0ea5e9)';
      dropzone.style.background = 'var(--bg-hover, rgba(0,0,0,0.03))';
    });

    dropzone?.addEventListener('dragleave', () => {
      dropzone.style.borderColor = '';
      dropzone.style.background = '';
    });

    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = '';
      dropzone.style.background = '';
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        this.selectedUploadFile = e.dataTransfer.files[0];
        const label = this.container.querySelector<HTMLElement>('[data-ref="upload-file-label"]');
        if (label) label.textContent = `${this.selectedUploadFile.name} (${(this.selectedUploadFile.size / 1024).toFixed(1)} KB)`;
      }
    });

    formUpload?.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.handleUploadSubmit();
    });

    const vacModal = this.container.querySelector<HTMLElement>('[data-ref="modal-vacation-backdrop"]');
    const btnCloseVac = this.container.querySelector<HTMLElement>('[data-ref="btn-close-vacation-modal"]');
    const btnCancelVac = this.container.querySelector<HTMLElement>('[data-ref="btn-cancel-vacation"]');
    const formVac = this.container.querySelector<HTMLFormElement>('[data-ref="form-vacation"]');

    const closeVac = () => this.closeModal(vacModal);
    btnCloseVac?.addEventListener('click', closeVac);
    btnCancelVac?.addEventListener('click', closeVac);
    formVac?.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.handleVacationSubmit();
    });

    const reviewModal = this.container.querySelector<HTMLElement>('[data-ref="modal-review-vacation-backdrop"]');
    const btnCloseReview = this.container.querySelector<HTMLElement>('[data-ref="btn-close-review-modal"]');
    const btnApprove = this.container.querySelector<HTMLElement>('[data-ref="btn-approve-vacation-action"]');
    const btnReject = this.container.querySelector<HTMLElement>('[data-ref="btn-reject-vacation-action"]');

    const closeReview = () => this.closeModal(reviewModal);
    btnCloseReview?.addEventListener('click', closeReview);
    btnApprove?.addEventListener('click', () => void this.handleReviewSubmit('approved'));
    btnReject?.addEventListener('click', () => void this.handleReviewSubmit('rejected'));

    const allModals = [hireModal, credModal, editModal, uploadModal, vacModal, reviewModal];
    allModals.forEach((m) => {
      m?.addEventListener('click', (e) => {
        if (e.target === m) this.closeModal(m);
      });
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        allModals.forEach((m) => this.closeModal(m));
      }
    }, { signal: this.abortController?.signal });
  }

  private openHireModal(): void {
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-hire-backdrop"]');
    const err = this.container.querySelector<HTMLElement>('[data-ref="hire-error-banner"]');
    const dateInput = this.container.querySelector<HTMLInputElement>('[data-ref="hire-input-date"]');

    if (err) err.style.display = 'none';
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
    this.openModal(modal);
  }

  private async handleHireSubmit(): Promise<void> {
    const fullNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="hire-input-fullname"]');
    const emailInput = this.container.querySelector<HTMLInputElement>('[data-ref="hire-input-email"]');
    const jobTitleInput = this.container.querySelector<HTMLInputElement>('[data-ref="hire-input-jobtitle"]');
    const deptSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="hire-select-department"]');
    const managerSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="hire-select-manager"]');
    const roleSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="hire-select-role"]');
    const typeSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="hire-select-type"]');
    const dateInput = this.container.querySelector<HTMLInputElement>('[data-ref="hire-input-date"]');
    const vacInput = this.container.querySelector<HTMLInputElement>('[data-ref="hire-input-vacation-days"]');
    const salaryInput = this.container.querySelector<HTMLInputElement>('[data-ref="hire-input-salary"]');
    const currencySelect = this.container.querySelector<HTMLSelectElement>('[data-ref="hire-select-currency"]');
    const freqSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="hire-select-frequency"]');
    const notesInput = this.container.querySelector<HTMLTextAreaElement>('[data-ref="hire-input-notes"]');
    const btnSubmit = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-hire"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="hire-error-banner"]');

    if (!fullNameInput?.value.trim() || !deptSelect?.value || !jobTitleInput?.value.trim() || !salaryInput?.value) {
      if (errorBanner) {
        errorBanner.textContent = 'Por favor completa todos los campos obligatorios.';
        errorBanner.style.display = 'block';
      }
      return;
    }

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Contratando y generando cuenta...';
    }

    try {
      const payload = {
        department_id: deptSelect.value,
        email: emailInput?.value.trim() || undefined,
        employment_type: typeSelect?.value as EmploymentType,
        full_name: fullNameInput.value.trim(),
        hire_date: dateInput?.value || new Date().toISOString().split('T')[0],
        job_title: jobTitleInput.value.trim(),
        manager_id: managerSelect?.value || null,
        notes: notesInput?.value.trim() || undefined,
        role: roleSelect?.value || 'USER',
        salary_amount: parseFloat(salaryInput.value) || 0,
        salary_currency: currencySelect?.value || 'USD',
        salary_frequency: freqSelect?.value as SalaryFrequency,
        vacation_days_allocated: parseInt(vacInput?.value || '15', 10),
      };

      const res = await fetch('/api/admin/hr/employees', {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      const data = await res.json() as { credentials: HireCredentials; employee: HrEmployeeItem; error?: string; success: boolean };

      if (!res.ok || !data.success) {
        if (errorBanner) {
          errorBanner.textContent = data.error || 'Ha ocurrido un error inesperado al procesar la solicitud.';
          errorBanner.style.display = 'block';
        }
        return;
      }

      const hireModal = this.container.querySelector<HTMLElement>('[data-ref="modal-hire-backdrop"]');
      this.closeModal(hireModal);

      (this.container.querySelector<HTMLFormElement>('[data-ref="form-hire"]'))?.reset();

      this.showCredentialsModal(data.credentials);
      await Promise.all([this.loadOverview(), this.loadEmployees()]);
      toast.success('Trabajador contratado exitosamente.');
    } catch {
      if (errorBanner) {
        errorBanner.textContent = 'Error de conexión al registrar la contratación.';
        errorBanner.style.display = 'block';
      }
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Contratar y Generar Credenciales';
      }
    }
  }

  private showCredentialsModal(creds: HireCredentials): void {
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-credentials-backdrop"]');
    const uDisplay = this.container.querySelector<HTMLElement>('[data-ref="cred-display-username"]');
    const eDisplay = this.container.querySelector<HTMLElement>('[data-ref="cred-display-email"]');
    const pDisplay = this.container.querySelector<HTMLElement>('[data-ref="cred-display-password"]');
    const rDisplay = this.container.querySelector<HTMLElement>('[data-ref="cred-display-role"]');
    const btnCopyInline = this.container.querySelector<HTMLElement>('[data-ref="btn-copy-password-inline"]');
    const btnCopyAll = this.container.querySelector<HTMLElement>('[data-ref="btn-copy-all-credentials"]');

    if (uDisplay) uDisplay.textContent = creds.username;
    if (eDisplay) eDisplay.textContent = creds.email;
    if (pDisplay) pDisplay.textContent = creds.temporary_password;
    if (rDisplay) rDisplay.textContent = creds.role;

    btnCopyInline?.replaceWith(btnCopyInline.cloneNode(true));
    btnCopyAll?.replaceWith(btnCopyAll.cloneNode(true));

    const newBtnInline = this.container.querySelector<HTMLElement>('[data-ref="btn-copy-password-inline"]');
    const newBtnAll = this.container.querySelector<HTMLElement>('[data-ref="btn-copy-all-credentials"]');

    newBtnInline?.addEventListener('click', () => {
      void navigator.clipboard.writeText(creds.temporary_password);
      toast.info('Contraseña copiada al portapapeles');
    });

    newBtnAll?.addEventListener('click', () => {
      const txt = `Credenciales de Inicio de Sesión:\nUsuario: ${creds.username}\nCorreo: ${creds.email}\nContraseña Temporal: ${creds.temporary_password}\nRol: ${creds.role}`;
      void navigator.clipboard.writeText(txt);
      toast.info('Todas las credenciales copiadas');
    });

    renderIcons(modal!);
    this.openModal(modal);
  }

  private openEditModal(emp: HrEmployeeItem): void {
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-edit-backdrop"]');
    const err = this.container.querySelector<HTMLElement>('[data-ref="edit-error-banner"]');
    if (err) err.style.display = 'none';

    const idInput = this.container.querySelector<HTMLInputElement>('[data-ref="edit-input-id"]');
    const jobTitleInput = this.container.querySelector<HTMLInputElement>('[data-ref="edit-input-jobtitle"]');
    const deptSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="edit-select-department"]');
    const managerSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="edit-select-manager"]');
    const roleSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="edit-select-role"]');
    const salaryInput = this.container.querySelector<HTMLInputElement>('[data-ref="edit-input-salary"]');
    const currencySelect = this.container.querySelector<HTMLSelectElement>('[data-ref="edit-select-currency"]');
    const freqSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="edit-select-frequency"]');
    const vacAllocInput = this.container.querySelector<HTMLInputElement>('[data-ref="edit-input-vacation-allocated"]');
    const vacUsedInput = this.container.querySelector<HTMLInputElement>('[data-ref="edit-input-vacation-used"]');
    const statusSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="edit-select-status"]');
    const notesInput = this.container.querySelector<HTMLTextAreaElement>('[data-ref="edit-input-notes"]');

    if (idInput) idInput.value = emp.id;
    if (jobTitleInput) jobTitleInput.value = emp.job_title;
    if (deptSelect) deptSelect.value = emp.department_id;
    if (managerSelect) managerSelect.value = emp.manager_id || '';
    if (roleSelect) roleSelect.value = emp.role;
    if (salaryInput) salaryInput.value = String(emp.salary_amount);
    if (currencySelect) currencySelect.value = emp.salary_currency;
    if (freqSelect) freqSelect.value = emp.salary_frequency;
    if (vacAllocInput) vacAllocInput.value = String(emp.vacation_days_allocated);
    if (vacUsedInput) vacUsedInput.value = String(emp.vacation_days_used);
    if (statusSelect) statusSelect.value = emp.status;
    if (notesInput) notesInput.value = emp.notes || '';

    this.openModal(modal);
  }

  private async handleEditSubmit(): Promise<void> {
    const idInput = this.container.querySelector<HTMLInputElement>('[data-ref="edit-input-id"]');
    const jobTitleInput = this.container.querySelector<HTMLInputElement>('[data-ref="edit-input-jobtitle"]');
    const deptSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="edit-select-department"]');
    const managerSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="edit-select-manager"]');
    const roleSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="edit-select-role"]');
    const salaryInput = this.container.querySelector<HTMLInputElement>('[data-ref="edit-input-salary"]');
    const currencySelect = this.container.querySelector<HTMLSelectElement>('[data-ref="edit-select-currency"]');
    const freqSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="edit-select-frequency"]');
    const vacAllocInput = this.container.querySelector<HTMLInputElement>('[data-ref="edit-input-vacation-allocated"]');
    const vacUsedInput = this.container.querySelector<HTMLInputElement>('[data-ref="edit-input-vacation-used"]');
    const statusSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="edit-select-status"]');
    const notesInput = this.container.querySelector<HTMLTextAreaElement>('[data-ref="edit-input-notes"]');
    const btnSubmit = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-edit"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="edit-error-banner"]');

    if (!idInput?.value || !jobTitleInput?.value.trim() || !deptSelect?.value) return;

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Guardando cambios...';
    }

    try {
      const payload = {
        department_id: deptSelect.value,
        job_title: jobTitleInput.value.trim(),
        manager_id: managerSelect?.value || null,
        notes: notesInput?.value.trim() || null,
        role: roleSelect?.value,
        salary_amount: parseFloat(salaryInput?.value || '0') || 0,
        salary_currency: currencySelect?.value || 'USD',
        salary_frequency: freqSelect?.value as SalaryFrequency,
        status: statusSelect?.value as EmployeeStatus,
        vacation_days_allocated: parseInt(vacAllocInput?.value || '15', 10),
        vacation_days_used: parseInt(vacUsedInput?.value || '0', 10),
      };

      const res = await fetch(`/api/admin/hr/employees/${idInput.value}`, {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      });

      const data = await res.json() as { error?: string; success: boolean };

      if (!res.ok || !data.success) {
        if (errorBanner) {
          errorBanner.textContent = data.error || 'Ha ocurrido un error inesperado al procesar la solicitud.';
          errorBanner.style.display = 'block';
        }
        return;
      }

      const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-edit-backdrop"]');
      this.closeModal(modal);

      await Promise.all([this.loadOverview(), this.loadEmployees()]);
      toast.success('Ficha del colaborador actualizada correctamente.');
    } catch {
      if (errorBanner) {
        errorBanner.textContent = 'Error de conexión al actualizar colaborador.';
        errorBanner.style.display = 'block';
      }
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Guardar Cambios';
      }
    }
  }

  private async confirmTerminateEmployee(emp: HrEmployeeItem): Promise<void> {
    const confirmed = window.confirm(`¿Estás seguro de que deseas dar de baja a ${emp.username}? El colaborador no podrá acceder a las herramientas internas.`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/admin/hr/employees/${emp.id}`, {
        body: JSON.stringify({ notes: 'Baja tramitada desde el panel de RRHH.' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'DELETE',
      });

      const data = await res.json() as { error?: string; success: boolean };
      if (res.ok && data.success) {
        toast.info('Colaborador dado de baja correctamente.');
        await Promise.all([this.loadOverview(), this.loadEmployees()]);
      } else {
        toast.error(data.error || 'Error al tramitar la baja del colaborador.');
      }
    } catch {
      toast.error('Error de red al tramitar baja.');
    }
  }

  private openUploadModal(employeeId?: string): void {
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-upload-backdrop"]');
    const err = this.container.querySelector<HTMLElement>('[data-ref="upload-error-banner"]');
    const empSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="upload-select-employee"]');
    const titleInput = this.container.querySelector<HTMLInputElement>('[data-ref="upload-input-title"]');

    if (err) err.style.display = 'none';
    if (employeeId && empSelect) {
      empSelect.value = employeeId;
      const emp = this.employees.find((e) => e.id === employeeId);
      if (titleInput && emp) {
        titleInput.value = `Contrato Laboral - ${emp.username}`;
      }
    }
    this.openModal(modal);
  }

  private async handleUploadSubmit(): Promise<void> {
    const empSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="upload-select-employee"]');
    const typeSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="upload-select-type"]');
    const titleInput = this.container.querySelector<HTMLInputElement>('[data-ref="upload-input-title"]');
    const btnSubmit = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-upload"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="upload-error-banner"]');

    if (!empSelect?.value || !titleInput?.value.trim()) {
      if (errorBanner) {
        errorBanner.textContent = 'Por favor selecciona el colaborador e indica el título del documento.';
        errorBanner.style.display = 'block';
      }
      return;
    }

    if (!this.selectedUploadFile) {
      if (errorBanner) {
        errorBanner.textContent = 'Por favor selecciona o arrastra un archivo para adjuntar.';
        errorBanner.style.display = 'block';
      }
      return;
    }

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Subiendo y registrando documento...';
    }

    try {
      const formData = new FormData();
      formData.append('employee_id', empSelect.value);
      formData.append('document_type', typeSelect?.value || 'contract');
      formData.append('title', titleInput.value.trim());
      formData.append('file', this.selectedUploadFile);

      const res = await fetch('/api/admin/hr/documents', {
        body: formData,
        method: 'POST',
      });

      const data = await res.json() as { document: HrDocumentItem; error?: string; success: boolean };

      if (!res.ok || !data.success) {
        if (errorBanner) {
          errorBanner.textContent = data.error || 'Ha ocurrido un error inesperado al procesar la solicitud.';
          errorBanner.style.display = 'block';
        }
        return;
      }

      const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-upload-backdrop"]');
      this.closeModal(modal);

      (this.container.querySelector<HTMLFormElement>('[data-ref="form-upload"]'))?.reset();
      this.selectedUploadFile = null;

      await Promise.all([this.loadOverview(), this.loadDocuments()]);
      toast.success('Documento subido y registrado exitosamente.');
    } catch {
      if (errorBanner) {
        errorBanner.textContent = 'Error de conexión al subir documento.';
        errorBanner.style.display = 'block';
      }
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Subir Documento';
      }
    }
  }

  private async confirmDeleteDocument(doc: HrDocumentItem): Promise<void> {
    const confirmed = window.confirm(`¿Estás seguro de que deseas eliminar el documento "${doc.title}"?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/admin/hr/documents/${doc.id}`, { method: 'DELETE' });
      const data = await res.json() as { error?: string; success: boolean };
      if (res.ok && data.success) {
        toast.info('Documento eliminado correctamente.');
        await Promise.all([this.loadOverview(), this.loadDocuments()]);
      } else {
        toast.error(data.error || 'Error al eliminar documento.');
      }
    } catch {
      toast.error('Error de red al eliminar documento.');
    }
  }

  private openVacationModal(employeeId?: string): void {
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-vacation-backdrop"]');
    const err = this.container.querySelector<HTMLElement>('[data-ref="vacation-error-banner"]');
    const empSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="vacation-select-employee"]');
    const startInput = this.container.querySelector<HTMLInputElement>('[data-ref="vacation-input-start"]');
    const endInput = this.container.querySelector<HTMLInputElement>('[data-ref="vacation-input-end"]');

    if (err) err.style.display = 'none';
    if (employeeId && empSelect) {
      empSelect.value = employeeId;
    }
    const today = new Date().toISOString().split('T')[0];
    if (startInput && !startInput.value) startInput.value = today;
    if (endInput && !endInput.value) endInput.value = today;

    this.openModal(modal);
  }

  private async handleVacationSubmit(): Promise<void> {
    const empSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="vacation-select-employee"]');
    const startInput = this.container.querySelector<HTMLInputElement>('[data-ref="vacation-input-start"]');
    const endInput = this.container.querySelector<HTMLInputElement>('[data-ref="vacation-input-end"]');
    const daysInput = this.container.querySelector<HTMLInputElement>('[data-ref="vacation-input-days"]');
    const reasonInput = this.container.querySelector<HTMLTextAreaElement>('[data-ref="vacation-input-reason"]');
    const btnSubmit = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-vacation"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="vacation-error-banner"]');

    if (!empSelect?.value || !startInput?.value || !endInput?.value) {
      if (errorBanner) {
        errorBanner.textContent = 'Por favor selecciona el colaborador y el rango de fechas.';
        errorBanner.style.display = 'block';
      }
      return;
    }

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Registrando solicitud...';
    }

    try {
      const payload = {
        days_count: parseInt(daysInput?.value || '1', 10),
        employee_id: empSelect.value,
        end_date: endInput.value,
        reason: reasonInput?.value.trim() || undefined,
        start_date: startInput.value,
      };

      const res = await fetch('/api/admin/hr/vacations', {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      const data = await res.json() as { error?: string; success: boolean };

      if (!res.ok || !data.success) {
        if (errorBanner) {
          errorBanner.textContent = data.error || 'Ha ocurrido un error inesperado al procesar la solicitud.';
          errorBanner.style.display = 'block';
        }
        return;
      }

      const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-vacation-backdrop"]');
      this.closeModal(modal);

      (this.container.querySelector<HTMLFormElement>('[data-ref="form-vacation"]'))?.reset();

      await Promise.all([this.loadOverview(), this.loadVacations()]);
      toast.success('Solicitud de vacaciones registrada con éxito.');
    } catch {
      if (errorBanner) {
        errorBanner.textContent = 'Error de red al registrar vacaciones.';
        errorBanner.style.display = 'block';
      }
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Registrar Solicitud';
      }
    }
  }

  private openReviewVacationModal(vac: HrVacationItem): void {
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-review-vacation-backdrop"]');
    const idInput = this.container.querySelector<HTMLInputElement>('[data-ref="review-input-id"]');
    const nameDisplay = this.container.querySelector<HTMLElement>('[data-ref="review-display-name"]');
    const periodDisplay = this.container.querySelector<HTMLElement>('[data-ref="review-display-period"]');
    const daysDisplay = this.container.querySelector<HTMLElement>('[data-ref="review-display-days"]');
    const reasonDisplay = this.container.querySelector<HTMLElement>('[data-ref="review-display-reason"]');
    const notesInput = this.container.querySelector<HTMLTextAreaElement>('[data-ref="review-input-notes"]');
    const err = this.container.querySelector<HTMLElement>('[data-ref="review-error-banner"]');

    if (err) err.style.display = 'none';
    if (idInput) idInput.value = vac.id;
    if (nameDisplay) nameDisplay.textContent = vac.employee_name;
    if (periodDisplay) periodDisplay.textContent = `${vac.start_date} al ${vac.end_date}`;
    if (daysDisplay) daysDisplay.textContent = `${vac.days_count} días hábiles`;
    if (reasonDisplay) reasonDisplay.textContent = vac.reason || 'Sin justificación';
    if (notesInput) notesInput.value = vac.review_notes || '';

    this.openModal(modal);
  }

  private async handleReviewSubmit(status: 'approved' | 'rejected'): Promise<void> {
    const idInput = this.container.querySelector<HTMLInputElement>('[data-ref="review-input-id"]');
    const notesInput = this.container.querySelector<HTMLTextAreaElement>('[data-ref="review-input-notes"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="review-error-banner"]');

    if (!idInput?.value) return;

    try {
      const res = await fetch(`/api/admin/hr/vacations/${idInput.value}`, {
        body: JSON.stringify({
          review_notes: notesInput?.value.trim() || undefined,
          status,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      });

      const data = await res.json() as { error?: string; success: boolean };

      if (!res.ok || !data.success) {
        if (errorBanner) {
          errorBanner.textContent = data.error || 'Ha ocurrido un error inesperado al procesar la solicitud.';
          errorBanner.style.display = 'block';
        }
        return;
      }

      const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-review-vacation-backdrop"]');
      this.closeModal(modal);

      await Promise.all([this.loadOverview(), this.loadVacations(), this.loadEmployees()]);
      if (status === 'approved') {
        toast.success('Vacaciones aprobadas y días descontados.');
      } else {
        toast.info('Solicitud de vacaciones rechazada.');
      }
    } catch {
      if (errorBanner) {
        errorBanner.textContent = 'Error de red al revisar vacaciones.';
        errorBanner.style.display = 'block';
      }
    }
  }
}

export async function createHrView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/hr/hr.html');
  const controller = new HrController(container);
  await controller.init();

  (container as any).__controller = controller;
  return container;
}
