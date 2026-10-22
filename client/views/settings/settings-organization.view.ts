import { navigate } from '../../app-router.js';
import { API_ROUTES } from '../../config/api-routes.js';
import { currentUser, deleteApi, escapeHtml, getApi, hasPermission, postApi } from '../../services/api.service.js';
import { t, translateElement } from '../../services/i18n.service.js';
import { renderIcons } from '../../services/icon.service.js';
import { loadTemplate } from '../../services/template.service.js';
import { showToast } from '../../services/toast.service.js';
import { ViewController } from '../../types/common.types.js';
import { OrganizationDetailsResponse, OrganizationDomain, OrganizationSsoConfig } from '../../types/enterprise.types.js';
import { bindNavigationLinks, createBannerManager, setupDropdown, withButtonLoading } from '../../utils/dom.util.js';
import { ArcElement, BarController, BarElement, CategoryScale, Chart, DoughnutController, Filler, Legend, LinearScale, LineController, LineElement, PointElement, Title, Tooltip } from 'chart.js';

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Title,
  Tooltip
);

export class OrganizationViewController implements ViewController {
  private abortController: AbortController | null = null;
  private charts: Chart[] = [];
  private container: HTMLElement;
  private currentOrg: OrganizationDetailsResponse | null = null;
  private selectedInviteRole = 'ORG_MEMBER';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    translateElement(this.container);
    renderIcons(this.container);

    bindNavigationLinks(this.container, {
      'btn-contact-sales': '/business/contact',
      'btn-explore-business': '/business',
    });

    this.bindEvents();
    await this.loadOrganizationData();
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.destroyCharts();
  }

  private destroyCharts(): void {
    for (const c of this.charts) {
      try {
        c.destroy();
      } catch {}
    }
    this.charts = [];
  }

  private bindEvents(): void {
    const btnOpenInvite = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-open-invite-modal"]');
    btnOpenInvite?.addEventListener('click', () => this.openModal('modal-invite'), { signal: this.abortController?.signal });

    const btnCloseInvite = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-close-invite-modal"]');
    btnCloseInvite?.addEventListener('click', () => this.closeModal('modal-invite'), { signal: this.abortController?.signal });

    const btnOpenMembers = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-open-members-modal"]');
    btnOpenMembers?.addEventListener('click', () => navigate('/organization/members'), { signal: this.abortController?.signal });

    const cardKpiMembers = this.container.querySelector<HTMLElement>('[data-ref="card-kpi-members"]');
    if (cardKpiMembers) {
      cardKpiMembers.style.cursor = 'pointer';
      cardKpiMembers.addEventListener('click', () => navigate('/organization/members'), { signal: this.abortController?.signal });
    }

    const btnOpenDomains = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-open-domains-modal"]');
    btnOpenDomains?.addEventListener('click', () => this.openModal('modal-domains'), { signal: this.abortController?.signal });

    const btnCloseDomains = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-close-domains-modal"]');
    btnCloseDomains?.addEventListener('click', () => this.closeModal('modal-domains'), { signal: this.abortController?.signal });

    const btnOpenSso = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-open-sso-page"], [data-ref="btn-open-sso-modal"]');
    btnOpenSso?.addEventListener('click', () => navigate('/organization/sso'), { signal: this.abortController?.signal });

    const cardKpiSso = this.container.querySelector<HTMLElement>('[data-ref="card-kpi-sso"]');
    if (cardKpiSso) {
      cardKpiSso.style.cursor = 'pointer';
      cardKpiSso.addEventListener('click', () => navigate('/organization/sso'), { signal: this.abortController?.signal });
    }

    this.container.querySelectorAll<HTMLElement>('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          const ref = backdrop.getAttribute('data-ref');
          if (ref) this.closeModal(ref);
        }
      }, { signal: this.abortController?.signal });
    });

    const inviteRoleDropdown = this.container.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-invite-role"]');
    if (inviteRoleDropdown) {
      setupDropdown(inviteRoleDropdown, {
        isSelect: true,
        onSelect: (val: string) => {
          this.selectedInviteRole = val;
        },
      });
    }

    const inviteForm = this.container.querySelector<HTMLFormElement>('[data-ref="form-invite-member"]');
    inviteForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.handleInviteMember();
    }, { signal: this.abortController?.signal });

    const domainForm = this.container.querySelector<HTMLFormElement>('[data-ref="form-add-domain"]');
    domainForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.handleAddDomain();
    }, { signal: this.abortController?.signal });
  }

  private openModal(ref: string): void {
    const backdrop = this.container.querySelector<HTMLElement>(`[data-ref="${ref}"]`);
    if (!backdrop) return;
    backdrop.style.display = 'flex';
    requestAnimationFrame(() => {
      backdrop.classList.add('is-open');
    });
    renderIcons(backdrop);
  }

  private closeModal(ref: string): void {
    const backdrop = this.container.querySelector<HTMLElement>(`[data-ref="${ref}"]`);
    if (!backdrop) return;
    backdrop.classList.remove('is-open');
    setTimeout(() => {
      backdrop.style.display = 'none';
    }, 150);
  }

  private async loadOrganizationData(): Promise<void> {
    const emptyState = this.container.querySelector<HTMLElement>('[data-ref="org-empty-state"]');
    const mainState = this.container.querySelector<HTMLElement>('[data-ref="org-main-state"]');

    try {
      const res = await getApi(API_ROUTES.organization.me);
      if (res.status === 404 || !res.ok) {
        if (emptyState) emptyState.style.display = 'block';
        if (mainState) mainState.style.display = 'none';
        const componentTop = this.container.querySelector<HTMLElement>('[data-ref="component-top"]');
        if (componentTop) componentTop.style.display = 'none';
        return;
      }

      const data = (await res.json()) as OrganizationDetailsResponse;
      this.currentOrg = data;

      if (emptyState) emptyState.style.display = 'none';
      const componentTop = this.container.querySelector<HTMLElement>('[data-ref="component-top"]');
      if (componentTop) componentTop.style.display = 'flex';
      if (mainState) {
        mainState.style.display = 'flex';
        mainState.style.flexDirection = 'column';
        mainState.style.width = '100%';
      }

      this.renderOverview(data);
      this.renderDomains(data.domains || [], data.organization.org_type === 'education');

      if (hasPermission(currentUser, 'org:sso:configure')) {
        await this.loadSsoConfig(data.organization.org_type === 'education');
      } else {
        const btnOpenSso = this.container.querySelector<HTMLElement>('[data-ref="btn-open-sso-modal"]');
        if (btnOpenSso) btnOpenSso.style.display = 'none';
      }

      this.renderCharts(data.activeMembersCount, data.organization.seat_limit, data.organization.org_type === 'education');
      renderIcons(this.container);
    } catch {
      if (emptyState) emptyState.style.display = 'block';
      if (mainState) mainState.style.display = 'none';
      const componentTop = this.container.querySelector<HTMLElement>('[data-ref="component-top"]');
      if (componentTop) componentTop.style.display = 'none';
    }
  }

  private renderOverview(data: OrganizationDetailsResponse): void {
    const isEdu = data.organization.org_type === 'education';
    const nameEl = this.container.querySelector<HTMLElement>('[data-ref="org-name"]');
    const roleBadge = this.container.querySelector<HTMLElement>('[data-ref="org-role-badge"]');
    const planBadge = this.container.querySelector<HTMLElement>('[data-ref="org-plan-badge"]');
    const seatDesc = this.container.querySelector<HTMLElement>('[data-ref="stat-seats-desc"]');
    const seatValue = this.container.querySelector<HTMLElement>('[data-ref="stat-seats-value"]');
    const seatProgressFill = this.container.querySelector<HTMLElement>('[data-ref="seat-progress-fill"]');

    if (nameEl) nameEl.textContent = data.organization.name;
    if (planBadge) planBadge.textContent = isEdu ? 'Campus Educación' : 'Enterprise';
    if (roleBadge) {
      const roleLabel = isEdu
        ? (data.memberRole === 'ORG_OWNER' ? 'Director / Coordinador' : data.memberRole === 'ORG_ADMIN' ? 'Administrador de Campus' : 'Alumno / Docente')
        : (data.memberRole === 'ORG_OWNER' ? 'Propietario' : data.memberRole === 'ORG_ADMIN' ? 'Administrador' : 'Miembro');
      roleBadge.textContent = roleLabel;
    }

    const used = data.activeMembersCount;
    const limit = data.organization.seat_limit;
    const remaining = Math.max(0, limit - used);

    if (seatValue) seatValue.textContent = `${used} / ${limit}`;
    if (seatDesc) {
      seatDesc.textContent = isEdu
        ? `${remaining} licencias académicas disponibles`
        : `${remaining} asientos disponibles para asignar`;
    }

    const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    if (seatProgressFill) {
      seatProgressFill.style.width = `${pct}%`;
      seatProgressFill.style.backgroundColor = pct > 90 ? 'var(--color-error, #d93025)' : 'var(--primary-color, #2563eb)';
    }

    const statMembersTotal = this.container.querySelector<HTMLElement>('[data-ref="stat-members-total"]');
    if (statMembersTotal) statMembersTotal.textContent = String(used);

    const statMembersDesc = this.container.querySelector<HTMLElement>('[data-ref="stat-members-desc"]');
    if (statMembersDesc) {
      statMembersDesc.textContent = isEdu
        ? `${used} alumno${used === 1 ? '' : 's'} o docente${used === 1 ? '' : 's'} activo${used === 1 ? '' : 's'} en el campus`
        : `${used} usuario${used === 1 ? '' : 's'} activo${used === 1 ? '' : 's'} en el equipo`;
    }

    const labelKpiSeats = this.container.querySelector<HTMLElement>('[data-ref="label-kpi-seats"]');
    if (labelKpiSeats) labelKpiSeats.textContent = isEdu ? 'Licencias de Alumnos & Docentes' : 'Asientos & Licencias';

    const labelKpiMembers = this.container.querySelector<HTMLElement>('[data-ref="label-kpi-members"]');
    if (labelKpiMembers) labelKpiMembers.textContent = isEdu ? 'Alumnos y Docentes' : 'Miembros del Equipo';

    const labelKpiSso = this.container.querySelector<HTMLElement>('[data-ref="label-kpi-sso"]');
    if (labelKpiSso) labelKpiSso.textContent = isEdu ? 'Acceso Institucional & SSO' : 'Seguridad & SSO';

    const labelKpiDomains = this.container.querySelector<HTMLElement>('[data-ref="label-kpi-domains"]');
    if (labelKpiDomains) labelKpiDomains.textContent = isEdu ? 'Dominios de la Institución' : 'Dominios Verificados';

    const chartActivityTitle = this.container.querySelector<HTMLElement>('[data-ref="chart-activity-title"]');
    if (chartActivityTitle) chartActivityTitle.textContent = isEdu ? 'Actividad Académica y Procesamiento de Documentos' : 'Actividad y Procesamiento Mensual de Documentos';

    const chartActivitySub = this.container.querySelector<HTMLElement>('[data-ref="chart-activity-sub"]');
    if (chartActivitySub) chartActivitySub.textContent = isEdu ? 'Tareas académicas completadas (unión, conversión, guías y compresión) en los últimos 6 meses' : 'Tareas completadas (unión, conversión, compresión y flujos automáticos) en los últimos 6 meses';

    const chartSeatsTitle = this.container.querySelector<HTMLElement>('[data-ref="chart-seats-title"]');
    if (chartSeatsTitle) chartSeatsTitle.textContent = isEdu ? 'Distribución de Licencias Escolares' : 'Distribución de Licencias';

    const chartSeatsSub = this.container.querySelector<HTMLElement>('[data-ref="chart-seats-sub"]');
    if (chartSeatsSub) chartSeatsSub.textContent = isEdu ? 'Licencias asignadas vs vacantes para estudiantes y docentes' : 'Asientos asignados vs vacantes';

    const chartAuthTitle = this.container.querySelector<HTMLElement>('[data-ref="chart-auth-title"]');
    if (chartAuthTitle) chartAuthTitle.textContent = isEdu ? 'Inicios de Sesión y Accesos al Campus (Últimas 4 Semanas)' : 'Autenticación y Accesos Corporativos (Últimas 4 Semanas)';

    const chartAuthSub = this.container.querySelector<HTMLElement>('[data-ref="chart-auth-sub"]');
    if (chartAuthSub) chartAuthSub.textContent = isEdu ? 'Distribución semanal de inicios vía SSO Educativo vs credenciales directas' : 'Distribución semanal de inicios de sesión vía SSO Corporativo vs credenciales directas';

    const canInvite = hasPermission(currentUser, 'org:members:invite') && remaining > 0;
    const btnOpenInvite = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-open-invite-modal"]');
    if (btnOpenInvite) {
      btnOpenInvite.style.display = canInvite ? 'inline-flex' : 'none';
      btnOpenInvite.setAttribute('data-tooltip', isEdu ? 'Invitar alumno o docente' : 'Invitar miembro');
      btnOpenInvite.setAttribute('aria-label', isEdu ? 'Invitar alumno o docente' : 'Invitar miembro');
    }

    const btnOpenMembers = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-open-members-modal"]');
    if (btnOpenMembers) {
      btnOpenMembers.setAttribute('data-tooltip', isEdu ? `Alumnos y docentes (${used})` : `Miembros del equipo (${used})`);
    }

    const btnOpenSso = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-open-sso-page"]');
    if (btnOpenSso) {
      btnOpenSso.setAttribute('data-tooltip', isEdu ? 'SSO Escolar / Campus' : 'Configuración SSO');
    }

    this.applyModalTexts(isEdu);
  }

  private applyModalTexts(isEdu: boolean): void {
    const inviteTitle = this.container.querySelector<HTMLElement>('[data-ref="title-modal-invite"]');
    if (inviteTitle) inviteTitle.textContent = isEdu ? 'Invitar estudiante o docente' : 'Invitar a un nuevo miembro';

    const inviteDesc = this.container.querySelector<HTMLElement>('[data-ref="desc-modal-invite"]');
    if (inviteDesc) inviteDesc.textContent = isEdu ? 'Otorga una licencia Pro a un alumno, investigador o profesor de tu institución.' : 'Agrega colegas a tu organización corporativa consumiendo un asiento disponible.';

    const inviteEmailLabel = this.container.querySelector<HTMLElement>('[data-ref="label-invite-email"]');
    if (inviteEmailLabel) inviteEmailLabel.textContent = isEdu ? 'Correo institucional (@escuela.edu)' : 'Correo electrónico corporativo';

    const optMemberText = this.container.querySelector<HTMLElement>('[data-ref="opt-invite-role-member"] .menu-item__text');
    if (optMemberText) optMemberText.textContent = isEdu ? 'Alumno / Docente (Licencia Pro)' : 'Miembro (Acceso a herramientas)';

    const optAdminText = this.container.querySelector<HTMLElement>('[data-ref="opt-invite-role-admin"] .menu-item__text');
    if (optAdminText) optAdminText.textContent = isEdu ? 'Administrador de Campus (Gestión de licencias)' : 'Administrador (Gestión de equipo)';

    const selectedRoleText = this.container.querySelector<HTMLElement>('[data-ref="txt-selected-invite-role"]');
    if (selectedRoleText) {
      if (this.selectedInviteRole === 'ORG_ADMIN') {
        selectedRoleText.textContent = isEdu ? 'Administrador de Campus (Gestión de licencias)' : 'Administrador (Gestión de equipo)';
      } else {
        selectedRoleText.textContent = isEdu ? 'Alumno / Docente (Licencia Pro)' : 'Miembro (Acceso a herramientas)';
      }
    }

    const domainsTitle = this.container.querySelector<HTMLElement>('[data-ref="title-modal-domains"]');
    if (domainsTitle) domainsTitle.textContent = isEdu ? 'Dominios de la Institución' : 'Dominios Corporativos';

    const domainsDesc = this.container.querySelector<HTMLElement>('[data-ref="desc-modal-domains"]');
    if (domainsDesc) domainsDesc.textContent = isEdu ? 'Los estudiantes y docentes con correo en estos dominios verificados (@institucion.edu) podrán acceder automáticamente mediante SSO de campus.' : 'Los usuarios con correo en estos dominios verificados podrán acceder automáticamente mediante SSO.';

    const newDomainLabel = this.container.querySelector<HTMLElement>('[data-ref="label-new-domain"]');
    if (newDomainLabel) newDomainLabel.textContent = isEdu ? 'Nuevo dominio escolar (ej. universidad.edu)' : 'Nuevo dominio (ej. miempresa.com)';
  }

  private renderCharts(usedSeats: number, totalSeats: number, isEdu = false): void {
    this.destroyCharts();

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || document.documentElement.classList.contains('dark-theme');
    const textColor = isDark ? '#9ca3af' : '#6b7280';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';

    const activityCanvas = this.container.querySelector<HTMLCanvasElement>('[data-ref="canvas-chart-activity"]');
    if (activityCanvas) {
      const ctx = activityCanvas.getContext('2d');
      if (ctx) {
        const gradient = ctx.createLinearGradient(0, 0, 0, 240);
        gradient.addColorStop(0, 'rgba(37, 99, 235, 0.28)');
        gradient.addColorStop(1, 'rgba(37, 99, 235, 0.00)');

        const activityChart = new Chart(activityCanvas, {
          data: {
            labels: ['May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct'],
            datasets: [
              {
                backgroundColor: gradient,
                borderColor: '#2563eb',
                borderWidth: 2.5,
                data: [142, 235, 320, 480, 690, 940],
                fill: true,
                label: isEdu ? 'Documentos académicos procesados' : 'Documentos y flujos procesados',
                pointBackgroundColor: '#2563eb',
                pointBorderColor: '#ffffff',
                pointHoverRadius: 6,
                pointRadius: 4,
                tension: 0.38,
              },
            ],
          },
          options: {
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: false,
              },
              tooltip: {
                backgroundColor: isDark ? '#1f2937' : '#ffffff',
                borderColor: isDark ? '#374151' : '#e5e7eb',
                borderWidth: 1,
                bodyColor: isDark ? '#f3f4f6' : '#111827',
                padding: 10,
                titleColor: isDark ? '#9ca3af' : '#6b7280',
              },
            },
            responsive: true,
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: textColor, font: { size: 11 } },
              },
              y: {
                beginAtZero: true,
                grid: { color: gridColor },
                ticks: { color: textColor, font: { size: 11 } },
              },
            },
          },
          type: 'line',
        });
        this.charts.push(activityChart);
      }
    }

    const seatsCanvas = this.container.querySelector<HTMLCanvasElement>('[data-ref="canvas-chart-seats"]');
    if (seatsCanvas) {
      const available = Math.max(0, totalSeats - usedSeats);
      const seatsChart = new Chart(seatsCanvas, {
        data: {
          labels: isEdu ? ['Licencias Asignadas', 'Licencias Disponibles'] : ['Asignados', 'Disponibles'],
          datasets: [
            {
              backgroundColor: ['#2563eb', isDark ? '#27272a' : '#e4e4e7'],
              borderColor: isDark ? '#18181b' : '#ffffff',
              borderWidth: 2,
              data: [usedSeats, available],
              hoverOffset: 4,
            },
          ],
        },
        options: {
          cutout: '72%',
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: {
                boxWidth: 12,
                color: textColor,
                font: { size: 12 },
                padding: 14,
              },
              position: 'bottom',
            },
            tooltip: {
              backgroundColor: isDark ? '#1f2937' : '#ffffff',
              borderColor: isDark ? '#374151' : '#e5e7eb',
              borderWidth: 1,
              bodyColor: isDark ? '#f3f4f6' : '#111827',
              titleColor: isDark ? '#9ca3af' : '#6b7280',
            },
          },
          responsive: true,
        },
        type: 'doughnut',
      });
      this.charts.push(seatsChart);
    }

    const authCanvas = this.container.querySelector<HTMLCanvasElement>('[data-ref="canvas-chart-auth"]');
    if (authCanvas) {
      const authChart = new Chart(authCanvas, {
        data: {
          labels: ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'],
          datasets: [
            {
              backgroundColor: '#3b82f6',
              borderRadius: 6,
              data: [36, 54, 68, 92],
              label: isEdu ? 'Inicios vía SSO Institucional' : 'Inicios vía SSO Corporativo',
            },
            {
              backgroundColor: isDark ? '#4b5563' : '#cbd5e1',
              borderRadius: 6,
              data: [14, 11, 7, 3],
              label: isEdu ? 'Acceso Directo (Contraseña)' : 'Autenticación Directa',
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: {
                boxWidth: 12,
                color: textColor,
                font: { size: 12 },
                padding: 14,
              },
              position: 'bottom',
            },
            tooltip: {
              backgroundColor: isDark ? '#1f2937' : '#ffffff',
              borderColor: isDark ? '#374151' : '#e5e7eb',
              borderWidth: 1,
              bodyColor: isDark ? '#f3f4f6' : '#111827',
              titleColor: isDark ? '#9ca3af' : '#6b7280',
            },
          },
          responsive: true,
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: textColor, font: { size: 11 } },
            },
            y: {
              beginAtZero: true,
              grid: { color: gridColor },
              ticks: { color: textColor, font: { size: 11 } },
            },
          },
        },
        type: 'bar',
      });
      this.charts.push(authChart);
    }
  }

  private renderDomains(domains: OrganizationDomain[], isEdu = false): void {
    const list = this.container.querySelector<HTMLElement>('[data-ref="org-domains-list"]');
    if (!list) return;

    const btnOpenDomains = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-open-domains-modal"]');
    if (btnOpenDomains) {
      btnOpenDomains.setAttribute('data-tooltip', isEdu ? `Dominios de la institución (${domains.length})` : `Dominios corporativos (${domains.length})`);
    }

    const statCount = this.container.querySelector<HTMLElement>('[data-ref="stat-domains-count"]');
    if (statCount) statCount.textContent = String(domains.length);

    const statPreview = this.container.querySelector<HTMLElement>('[data-ref="stat-domains-list-preview"]');
    if (statPreview) {
      statPreview.textContent = domains.map((d) => d.domain).join(', ') || (isEdu ? 'Sin dominios escolares' : 'Sin dominios registrados');
    }

    if (!domains.length) {
      list.innerHTML = `<span style="font-size: 13px; color: var(--text-secondary);">${isEdu ? 'No hay dominios escolares registrados.' : 'No hay dominios autorizados registrados.'}</span>`;
      return;
    }

    list.innerHTML = domains
      .map(
        (d) => `
        <div class="component-badge component-badge--neutral" data-ref="domain-badge-${escapeHtml(d.id)}" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; font-size: 13px;">
          <span>${escapeHtml(d.domain)}</span>
          ${
            hasPermission(currentUser, 'org:domains:manage')
              ? `<button type="button" class="component-button component-button--icon-only component-button--h24" data-ref="btn-delete-domain-${escapeHtml(d.id)}" data-domain-id="${escapeHtml(d.id)}" data-domain-name="${escapeHtml(d.domain)}" aria-label="Eliminar dominio" style="width: 20px; height: 20px; min-width: 20px; padding: 0;">
                  <svg class="component-icon" aria-hidden="true" style="width: 14px; height: 14px;"><use href="/icons.svg#close"></use></svg>
                 </button>`
              : ''
          }
        </div>
      `
      )
      .join('');

    renderIcons(list);

    list.querySelectorAll<HTMLButtonElement>('[data-domain-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-domain-id');
        const name = btn.getAttribute('data-domain-name') || '';
        if (id) void this.handleDeleteDomain(id, name);
      }, { signal: this.abortController?.signal });
    });
  }

  private async handleInviteMember(): Promise<void> {
    const banners = createBannerManager(this.container, {
      errorRef: 'invite-member-error',
      successRef: 'invite-member-success',
    });
    banners.hideAll();

    const isEdu = this.currentOrg?.organization.org_type === 'education';
    const emailInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-invite-email"]');
    const submitBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-invite"]');

    const email = emailInput?.value.trim().toLowerCase() || '';
    const role = this.selectedInviteRole || 'ORG_MEMBER';

    if (!email || !email.includes('@')) {
      banners.showError(isEdu ? 'Ingresa un correo electrónico institucional válido.' : 'Ingresa un correo electrónico corporativo válido.');
      return;
    }

    await withButtonLoading(submitBtn, 'Enviando invitación...', async () => {
      try {
        const res = await postApi(API_ROUTES.organization.members, { email, role });
        const data = await res.json();

        if (!res.ok) {
          banners.showError(data.error || (isEdu ? 'No se pudo invitar al usuario.' : 'No se pudo invitar al miembro.'));
          return;
        }

        banners.showSuccess(isEdu ? 'Estudiante o docente agregado correctamente.' : 'Miembro agregado correctamente.');
        showToast(isEdu ? 'Invitación institucional enviada con éxito.' : 'Invitación corporativa enviada con éxito.', 'success');
        if (emailInput) emailInput.value = '';

        setTimeout(() => {
          this.closeModal('modal-invite');
        }, 1200);

        await this.loadOrganizationData();
      } catch {
        banners.showError('Error de red al procesar la invitación.');
      }
    });
  }

  private async handleAddDomain(): Promise<void> {
    const banners = createBannerManager(this.container, {
      errorRef: 'add-domain-error',
      successRef: 'add-domain-success',
    });
    banners.hideAll();

    const isEdu = this.currentOrg?.organization.org_type === 'education';
    const domainInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-new-domain"]');
    const submitBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-domain"]');
    const domain = domainInput?.value.trim().toLowerCase() || '';

    if (!domain || !domain.includes('.') || domain.length < 4) {
      banners.showError(isEdu ? 'Ingresa un dominio escolar válido (ej. universidad.edu).' : 'Ingresa un dominio corporativo válido (ej. miempresa.com).');
      return;
    }

    await withButtonLoading(submitBtn, 'Agregando dominio...', async () => {
      try {
        const res = await postApi(API_ROUTES.organization.domains, { domain });
        const data = await res.json();

        if (!res.ok) {
          banners.showError(data.error || 'No se pudo agregar el dominio.');
          return;
        }

        banners.showSuccess(isEdu ? 'Dominio institucional verificado y añadido con éxito.' : 'Dominio corporativo verificado y añadido con éxito.');
        showToast(isEdu ? 'Dominio institucional añadido correctamente.' : 'Dominio corporativo añadido correctamente.', 'success');
        if (domainInput) domainInput.value = '';

        setTimeout(() => {
          this.closeModal('modal-domains');
        }, 1200);

        await this.loadOrganizationData();
      } catch {
        banners.showError(isEdu ? 'Error de red al registrar el dominio escolar.' : 'Error de red al registrar el dominio corporativo.');
      }
    });
  }

  private async handleDeleteDomain(domainId: string, domainName: string): Promise<void> {
    const isEdu = this.currentOrg?.organization.org_type === 'education';
    const confirmMsg = isEdu
      ? `¿Eliminar el dominio ${domainName}? Los estudiantes y profesores con este dominio ya no podrán usar SSO escolar.`
      : `¿Eliminar el dominio ${domainName}? Los usuarios con este dominio ya no podrán usar SSO corporativo.`;

    if (!confirm(confirmMsg)) {
      return;
    }

    try {
      const res = await deleteApi(API_ROUTES.organization.removeDomain(domainId));
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || 'No se pudo eliminar el dominio.', 'danger');
        return;
      }
      showToast(isEdu ? 'Dominio institucional eliminado correctamente.' : 'Dominio corporativo eliminado correctamente.', 'success');
      await this.loadOrganizationData();
    } catch {
      showToast('Error de conexión al eliminar el dominio.', 'danger');
    }
  }

  private async loadSsoConfig(isEdu = false): Promise<void> {
    const statusBadge = this.container.querySelector<HTMLElement>('[data-ref="sso-status-badge"]');
    const statProvider = this.container.querySelector<HTMLElement>('[data-ref="stat-sso-provider"]');
    const statEnforce = this.container.querySelector<HTMLElement>('[data-ref="stat-sso-enforce"]');

    try {
      const res = await getApi(API_ROUTES.organization.ssoConfig);
      if (!res.ok) return;

      const data = await res.json();
      const ssoConfig = data.config as OrganizationSsoConfig | null;

      if (ssoConfig && ssoConfig.is_enabled) {
        if (statusBadge) {
          statusBadge.textContent = 'Activo';
          statusBadge.style.color = 'var(--color-success, #16a34a)';
          statusBadge.style.background = 'rgba(22, 163, 74, 0.1)';
        }

        const providerNames: Record<string, string> = isEdu
          ? {
              azure: 'Microsoft 365 Educación',
              google: 'Google Workspace for Education',
              saml: 'SAML 2.0 Institucional',
            }
          : {
              azure: 'Microsoft Entra ID',
              google: 'Google Workspace',
              saml: 'SAML 2.0',
            };
        const pName = providerNames[ssoConfig.provider] || ssoConfig.provider.toUpperCase();
        if (statProvider) statProvider.textContent = pName;
        if (statEnforce) {
          statEnforce.textContent = ssoConfig.enforce_sso
            ? (isEdu ? 'SSO de Campus Obligatorio' : 'SSO Obligatorio')
            : (isEdu ? 'SSO de Campus Opcional' : 'SSO Opcional');
        }
      } else {
        if (statusBadge) {
          statusBadge.textContent = 'Inactivo';
          statusBadge.style.color = 'var(--text-secondary)';
          statusBadge.style.background = 'var(--bg-surface-secondary)';
        }
        if (statProvider) statProvider.textContent = 'Inactivo';
        if (statEnforce) statEnforce.textContent = isEdu ? 'Sin SSO escolar configurado' : 'Sin SSO configurado';
      }
    } catch {
      if (statusBadge) {
        statusBadge.textContent = 'Inactivo';
        statusBadge.style.color = 'var(--text-secondary)';
        statusBadge.style.background = 'var(--bg-surface-secondary)';
      }
      if (statProvider) statProvider.textContent = 'Inactivo';
      if (statEnforce) statEnforce.textContent = isEdu ? 'Sin SSO escolar configurado' : 'Sin SSO configurado';
    }
  }
}

export async function createOrganizationView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/settings/organization.html');
  const controller = new OrganizationViewController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
