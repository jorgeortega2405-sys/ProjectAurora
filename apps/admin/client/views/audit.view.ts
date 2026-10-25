import { hasPermission } from '../services/auth.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { toast } from '../services/toast.service.js';
import { adminWsService } from '../services/websocket.service.js';
import { ViewController } from '../types/common.types.js';
import { debounce, escapeHtml } from '../utils/dom.util.js';

export interface AdminAuditItem {
  action: string;
  actorEmail: string;
  actorId: string;
  actorRole: string;
  actorUsername: string;
  checksum: string;
  createdAt: string;
  details: Record<string, unknown> | null;
  eventDate: string;
  ipAddress: string;
  logId: string;
  status: 'failure' | 'success';
  targetId: string;
  targetName: string;
  targetType: string;
  userAgent: string;
}

export interface AdminActiveSessionItem {
  createdAt: string;
  email: string;
  ip: string;
  lastActivityAt: string;
  role: string;
  sessionId: string;
  status: 'active' | 'revoked';
  userAgent: string;
  userId: string;
  username: string;
}

export interface SecurityAccessItem {
  accessId: string;
  checksum: string;
  createdAt: string;
  eventDate: string;
  eventType: string;
  failureReason: string | null;
  identifier: string;
  ipAddress: string;
  isSuspicious: boolean;
  riskScore: number;
  userAgent: string;
  userId: string | null;
}

export class AuditController implements ViewController {
  private abortController: AbortController | null = null;
  private accessLogs: SecurityAccessItem[] = [];
  private activeSessions: AdminActiveSessionItem[] = [];
  private activeTab: 'access' | 'audit' | 'sessions' = 'audit';
  private auditLogs: AdminAuditItem[] = [];
  private container: HTMLElement;
  private currentSearch = '';
  private currentTargetType = 'all';
  private sessionToRevoke: { id: string; username: string } | null = null;
  private wsUnsubscribe: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    renderIcons(this.container);
    this.bindEvents();
    this.setupWebSocket();
    await Promise.all([
      this.loadStats(),
      this.loadAuditLogs(),
    ]);
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.wsUnsubscribe) {
      this.wsUnsubscribe();
      this.wsUnsubscribe = null;
    }
  }

  private bindEvents(): void {
    const btnToggleSearch = this.container.querySelector<HTMLElement>('[data-ref="btn-toggle-search"]');
    const searchToolbar = this.container.querySelector<HTMLElement>('[data-ref="search-toolbar"]');
    const searchInput = this.container.querySelector<HTMLInputElement>('[data-ref="audit-search-input"]');
    const btnClearSearch = this.container.querySelector<HTMLElement>('[data-ref="btn-clear-search"]');
    const btnRefresh = this.container.querySelector<HTMLElement>('[data-ref="btn-refresh-audit"]');
    const selectTarget = this.container.querySelector<HTMLSelectElement>('[data-ref="select-target-type"]');

    const tabAudit = this.container.querySelector<HTMLElement>('[data-ref="tab-btn-audit-trail"]');
    const tabSessions = this.container.querySelector<HTMLElement>('[data-ref="tab-btn-active-sessions"]');
    const tabAccess = this.container.querySelector<HTMLElement>('[data-ref="tab-btn-access-logs"]');

    const btnCloseDetail = this.container.querySelector<HTMLElement>('[data-ref="btn-close-audit-detail"]');
    const btnModalCloseDetail = this.container.querySelector<HTMLElement>('[data-ref="btn-modal-close-audit"]');
    const detailBackdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-audit-detail-backdrop"]');

    const btnCloseRevoke = this.container.querySelector<HTMLElement>('[data-ref="btn-close-revoke-modal"]');
    const btnCancelRevoke = this.container.querySelector<HTMLElement>('[data-ref="btn-cancel-revoke"]');
    const btnConfirmRevoke = this.container.querySelector<HTMLElement>('[data-ref="btn-confirm-revoke"]');
    const revokeBackdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-revoke-confirm-backdrop"]');

    btnToggleSearch?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        const isHidden = searchToolbar?.classList.contains('is-hidden');
        if (isHidden) {
          searchToolbar?.classList.remove('is-hidden');
          searchInput?.focus();
        } else {
          searchToolbar?.classList.add('is-hidden');
        }
      },
      { signal: this.abortController?.signal }
    );

    const onSearch = debounce(() => {
      this.currentSearch = (searchInput?.value || '').trim().toLowerCase();
      if (btnClearSearch) {
        btnClearSearch.style.display = this.currentSearch ? 'inline-flex' : 'none';
      }
      this.applyCurrentFilter();
    }, 250);

    searchInput?.addEventListener('input', onSearch, { signal: this.abortController?.signal });

    btnClearSearch?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        if (btnClearSearch) btnClearSearch.style.display = 'none';
        this.currentSearch = '';
        this.applyCurrentFilter();
      },
      { signal: this.abortController?.signal }
    );

    btnRefresh?.addEventListener(
      'click',
      async (e) => {
        e.preventDefault();
        await this.loadStats();
        if (this.activeTab === 'audit') await this.loadAuditLogs();
        else if (this.activeTab === 'sessions') await this.loadActiveSessions();
        else if (this.activeTab === 'access') await this.loadAccessLogs();
        toast.success('Auditoría y sesiones actualizadas.');
      },
      { signal: this.abortController?.signal }
    );

    selectTarget?.addEventListener(
      'change',
      async () => {
        this.currentTargetType = selectTarget.value;
        await this.loadAuditLogs();
      },
      { signal: this.abortController?.signal }
    );

    tabAudit?.addEventListener(
      'click',
      () => {
        this.switchTab('audit');
      },
      { signal: this.abortController?.signal }
    );

    tabSessions?.addEventListener(
      'click',
      () => {
        this.switchTab('sessions');
      },
      { signal: this.abortController?.signal }
    );

    tabAccess?.addEventListener(
      'click',
      () => {
        this.switchTab('access');
      },
      { signal: this.abortController?.signal }
    );

    const closeDetail = () => {
      if (detailBackdrop) detailBackdrop.style.display = 'none';
    };
    btnCloseDetail?.addEventListener('click', closeDetail, { signal: this.abortController?.signal });
    btnModalCloseDetail?.addEventListener('click', closeDetail, { signal: this.abortController?.signal });

    const closeRevoke = () => {
      if (revokeBackdrop) revokeBackdrop.style.display = 'none';
      this.sessionToRevoke = null;
    };
    btnCloseRevoke?.addEventListener('click', closeRevoke, { signal: this.abortController?.signal });
    btnCancelRevoke?.addEventListener('click', closeRevoke, { signal: this.abortController?.signal });

    btnConfirmRevoke?.addEventListener(
      'click',
      async () => {
        if (!this.sessionToRevoke) return;
        await this.executeRevoke(this.sessionToRevoke.id);
      },
      { signal: this.abortController?.signal }
    );
  }

  private setupWebSocket(): void {
    this.wsUnsubscribe = adminWsService.subscribe('admin_support', (event: any) => {
      if (event?.type === 'admin_session_revoked') {
        if (this.activeTab === 'sessions') {
          void this.loadActiveSessions();
        }
        void this.loadStats();
      }
    });
  }

  private switchTab(tab: 'access' | 'audit' | 'sessions'): void {
    this.activeTab = tab;

    const tabAudit = this.container.querySelector<HTMLElement>('[data-ref="tab-btn-audit-trail"]');
    const tabSessions = this.container.querySelector<HTMLElement>('[data-ref="tab-btn-active-sessions"]');
    const tabAccess = this.container.querySelector<HTMLElement>('[data-ref="tab-btn-access-logs"]');

    const panelAudit = this.container.querySelector<HTMLElement>('[data-ref="panel-audit-trail"]');
    const panelSessions = this.container.querySelector<HTMLElement>('[data-ref="panel-active-sessions"]');
    const panelAccess = this.container.querySelector<HTMLElement>('[data-ref="panel-access-logs"]');
    const filterControls = this.container.querySelector<HTMLElement>('[data-ref="audit-filter-controls"]');

    const setActiveStyle = (el: HTMLElement | null, active: boolean) => {
      if (!el) return;
      el.classList.toggle('is-active', active);
      el.style.borderBottomColor = active ? 'var(--primary, #0ea5e9)' : 'transparent';
      el.style.color = active ? 'var(--primary, #0ea5e9)' : 'var(--text-secondary, #6b7280)';
    };

    setActiveStyle(tabAudit, tab === 'audit');
    setActiveStyle(tabSessions, tab === 'sessions');
    setActiveStyle(tabAccess, tab === 'access');

    if (panelAudit) panelAudit.style.display = tab === 'audit' ? 'flex' : 'none';
    if (panelSessions) panelSessions.style.display = tab === 'sessions' ? 'flex' : 'none';
    if (panelAccess) panelAccess.style.display = tab === 'access' ? 'flex' : 'none';
    if (filterControls) filterControls.style.display = tab === 'audit' ? 'flex' : 'none';

    if (tab === 'audit' && this.auditLogs.length === 0) {
      void this.loadAuditLogs();
    } else if (tab === 'sessions' && this.activeSessions.length === 0) {
      void this.loadActiveSessions();
    } else if (tab === 'access' && this.accessLogs.length === 0) {
      void this.loadAccessLogs();
    }
  }

  private async loadStats(): Promise<void> {
    try {
      const res = await fetch('/api/admin/security/stats', { signal: this.abortController?.signal });
      if (!res.ok) return;

      const data = await res.json();
      if (!data.success || !data.stats) return;

      const { actionsToday, activeSessionsCount, failedLogins24h, suspiciousEventsCount } = data.stats;

      const elActions = this.container.querySelector<HTMLElement>('[data-ref="metric-actions-today"]');
      const elSessions = this.container.querySelector<HTMLElement>('[data-ref="metric-active-sessions"]');
      const elFailed = this.container.querySelector<HTMLElement>('[data-ref="metric-failed-logins"]');
      const elSuspicious = this.container.querySelector<HTMLElement>('[data-ref="metric-suspicious-count"]');

      if (elActions) elActions.textContent = String(actionsToday ?? 0);
      if (elSessions) elSessions.textContent = String(activeSessionsCount ?? 0);
      if (elFailed) elFailed.textContent = String(failedLogins24h ?? 0);
      if (elSuspicious) elSuspicious.textContent = String(suspiciousEventsCount ?? 0);
    } catch {
      // Ignored if aborted
    }
  }

  private async loadAuditLogs(): Promise<void> {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="audit-tbody"]');
    const badge = this.container.querySelector<HTMLElement>('[data-ref="audit-count-badge"]');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Cargando registros inmutables de auditoría desde Cassandra...</td></tr>';
    }

    try {
      const targetQuery = this.currentTargetType !== 'all' ? `&targetType=${encodeURIComponent(this.currentTargetType)}` : '';
      const res = await fetch(`/api/admin/security/audit-logs?limit=200${targetQuery}`, { signal: this.abortController?.signal });
      if (!res.ok) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 48px 16px; color: var(--danger, #ef4444);">Error al cargar registros de auditoría desde Cassandra.</td></tr>';
        return;
      }

      const data = await res.json();
      this.auditLogs = (data.logs || []) as AdminAuditItem[];
      if (badge) badge.textContent = String(this.auditLogs.length);
      this.renderAuditLogs(this.auditLogs);
    } catch {
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Consulta cancelada.</td></tr>';
    }
  }

  private async loadActiveSessions(): Promise<void> {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="sessions-tbody"]');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Consultando sesiones activas en Redis...</td></tr>';
    }

    try {
      const res = await fetch('/api/admin/security/sessions', { signal: this.abortController?.signal });
      if (!res.ok) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 48px 16px; color: var(--danger, #ef4444);">Error al consultar sesiones en Redis.</td></tr>';
        return;
      }

      const data = await res.json();
      this.activeSessions = (data.sessions || []) as AdminActiveSessionItem[];
      this.renderActiveSessions(this.activeSessions);
    } catch {
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Consulta cancelada.</td></tr>';
    }
  }

  private async loadAccessLogs(): Promise<void> {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="access-tbody"]');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Consultando logs de acceso en Cassandra...</td></tr>';
    }

    try {
      const res = await fetch('/api/admin/security/access-logs?limit=200', { signal: this.abortController?.signal });
      if (!res.ok) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 48px 16px; color: var(--danger, #ef4444);">Error al cargar logs de acceso.</td></tr>';
        return;
      }

      const data = await res.json();
      this.accessLogs = (data.logs || []) as SecurityAccessItem[];
      this.renderAccessLogs(this.accessLogs);
    } catch {
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">Consulta cancelada.</td></tr>';
    }
  }

  private applyCurrentFilter(): void {
    if (this.activeTab === 'audit') {
      const filtered = this.auditLogs.filter((item) => {
        if (!this.currentSearch) return true;
        return (
          item.action.toLowerCase().includes(this.currentSearch) ||
          item.actorUsername.toLowerCase().includes(this.currentSearch) ||
          item.targetName.toLowerCase().includes(this.currentSearch) ||
          item.ipAddress.toLowerCase().includes(this.currentSearch) ||
          item.checksum.toLowerCase().includes(this.currentSearch)
        );
      });
      this.renderAuditLogs(filtered);
    } else if (this.activeTab === 'sessions') {
      const filtered = this.activeSessions.filter((s) => {
        if (!this.currentSearch) return true;
        return (
          s.username.toLowerCase().includes(this.currentSearch) ||
          s.email.toLowerCase().includes(this.currentSearch) ||
          s.ip.toLowerCase().includes(this.currentSearch) ||
          s.role.toLowerCase().includes(this.currentSearch)
        );
      });
      this.renderActiveSessions(filtered);
    } else if (this.activeTab === 'access') {
      const filtered = this.accessLogs.filter((a) => {
        if (!this.currentSearch) return true;
        return (
          a.eventType.toLowerCase().includes(this.currentSearch) ||
          a.identifier.toLowerCase().includes(this.currentSearch) ||
          a.ipAddress.toLowerCase().includes(this.currentSearch)
        );
      });
      this.renderAccessLogs(filtered);
    }
  }

  private renderAuditLogs(items: AdminAuditItem[]): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="audit-tbody"]');
    if (!tbody) return;

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">No se encontraron eventos de auditoría administrativa registrados.</td></tr>';
      return;
    }

    tbody.innerHTML = items
      .map((item, idx) => {
        const timeFormatted = new Date(item.createdAt).toLocaleString();
        const actionBadge = this.getActionBadge(item.action);
        const statusBadge = item.status === 'success'
          ? '<span style="color: #10b981; font-weight: 600; font-size: 11px;">Éxito</span>'
          : '<span style="color: #ef4444; font-weight: 600; font-size: 11px;">Fallo</span>';

        return `
          <tr class="component-table__row" data-ref="row-audit-${idx}">
            <td style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(timeFormatted)}</td>
            <td>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="font-weight: 600; font-size: 13px;">${escapeHtml(item.actorUsername)}</div>
                <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: rgba(14, 165, 233, 0.1); color: var(--primary, #0ea5e9); text-transform: uppercase;">${escapeHtml(item.actorRole)}</span>
              </div>
            </td>
            <td>${actionBadge}</td>
            <td style="font-size: 12px; font-weight: 500;">
              <div>${escapeHtml(item.targetName || item.targetId || '-')}</div>
              <div style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase;">${escapeHtml(item.targetType)}</div>
            </td>
            <td style="font-family: monospace; font-size: 11px; color: var(--text-secondary);">${escapeHtml(item.ipAddress)}</td>
            <td>${statusBadge}</td>
            <td style="text-align: right;">
              <button type="button" class="component-button component-button--h30" data-ref="btn-detail-${idx}" style="font-size: 11px; padding: 0 8px;">
                <svg class="component-icon" aria-hidden="true" style="width: 12px; height: 12px; margin-right: 4px;"><use href="/icons.svg#visibility"></use></svg>
                Verificar
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    items.forEach((item, idx) => {
      const btn = tbody.querySelector<HTMLElement>(`[data-ref="btn-detail-${idx}"]`);
      btn?.addEventListener(
        'click',
        () => {
          this.openAuditDetailModal(item);
        },
        { signal: this.abortController?.signal }
      );
    });

    renderIcons(tbody);
  }

  private renderActiveSessions(sessions: AdminActiveSessionItem[]): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="sessions-tbody"]');
    if (!tbody) return;

    if (sessions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">No hay sesiones administrativas activas registradas en Redis.</td></tr>';
      return;
    }

    const canManage = hasPermission('admin:security:manage');

    tbody.innerHTML = sessions
      .map((s, idx) => {
        const createdFormatted = new Date(s.createdAt).toLocaleString();
        const activityFormatted = new Date(s.lastActivityAt).toLocaleTimeString();
        const revokeBtn = canManage
          ? `<button type="button" class="component-button component-button--h30 component-button--danger" data-ref="btn-revoke-${idx}" style="font-size: 11px; padding: 0 8px;">Revocar</button>`
          : '<span style="font-size: 11px; color: var(--text-secondary);">Sin permiso</span>';

        return `
          <tr class="component-table__row" data-ref="row-session-${idx}">
            <td>
              <div style="font-weight: 600; font-size: 13px;">${escapeHtml(s.username)}</div>
              <div style="font-size: 11px; color: var(--text-secondary);">${escapeHtml(s.email)}</div>
            </td>
            <td>
              <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: rgba(14, 165, 233, 0.1); color: var(--primary, #0ea5e9); text-transform: uppercase;">${escapeHtml(s.role)}</span>
            </td>
            <td style="font-family: monospace; font-size: 12px;">${escapeHtml(s.ip)}</td>
            <td style="font-size: 11px; color: var(--text-secondary); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(s.userAgent)}">${escapeHtml(s.userAgent)}</td>
            <td style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(createdFormatted)}</td>
            <td style="font-size: 12px; font-weight: 500;">${escapeHtml(activityFormatted)}</td>
            <td style="text-align: right;">${revokeBtn}</td>
          </tr>
        `;
      })
      .join('');

    if (canManage) {
      sessions.forEach((s, idx) => {
        const btn = tbody.querySelector<HTMLElement>(`[data-ref="btn-revoke-${idx}"]`);
        btn?.addEventListener(
          'click',
          () => {
            this.openRevokeModal(s.sessionId, s.username);
          },
          { signal: this.abortController?.signal }
        );
      });
    }

    renderIcons(tbody);
  }

  private renderAccessLogs(logs: SecurityAccessItem[]): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="access-tbody"]');
    if (!tbody) return;

    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">No se registraron intentos de acceso recientes.</td></tr>';
      return;
    }

    tbody.innerHTML = logs
      .map((log, idx) => {
        const timeFormatted = new Date(log.createdAt).toLocaleString();
        let eventBadge = '';
        if (log.eventType === 'login_success') {
          eventBadge = '<span style="color: #10b981; font-weight: 600; font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(16, 185, 129, 0.1);">Login Exitoso</span>';
        } else if (log.eventType === 'brute_force_blocked') {
          eventBadge = '<span style="color: #ef4444; font-weight: 700; font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(239, 68, 68, 0.1);">Fuerza Bruta Bloqueada</span>';
        } else {
          eventBadge = '<span style="color: #f59e0b; font-weight: 600; font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(245, 158, 11, 0.1);">Login Fallido</span>';
        }

        let riskBadge = '';
        if (log.riskScore >= 70) {
          riskBadge = `<span style="color: #ef4444; font-weight: 700; font-size: 11px;">Crítico (${log.riskScore}%)</span>`;
        } else if (log.riskScore >= 40) {
          riskBadge = `<span style="color: #f59e0b; font-weight: 600; font-size: 11px;">Medio (${log.riskScore}%)</span>`;
        } else {
          riskBadge = `<span style="color: #10b981; font-weight: 500; font-size: 11px;">Bajo (${log.riskScore}%)</span>`;
        }

        return `
          <tr class="component-table__row" data-ref="row-access-${idx}">
            <td style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(timeFormatted)}</td>
            <td>${eventBadge}</td>
            <td style="font-weight: 600; font-size: 12px;">${escapeHtml(log.identifier)}</td>
            <td style="font-family: monospace; font-size: 12px;">${escapeHtml(log.ipAddress)}</td>
            <td>${riskBadge}</td>
            <td style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(log.failureReason || 'Acceso legítimo')}</td>
          </tr>
        `;
      })
      .join('');

    renderIcons(tbody);
  }

  private getActionBadge(action: string): string {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      'backup.create': { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', label: 'Crear Backup' },
      'backup.delete': { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', label: 'Eliminar Backup' },
      'backup.download': { bg: 'rgba(16, 185, 129, 0.1)', color: '#10b981', label: 'Descargar Backup' },
      'backup.restore': { bg: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', label: 'Restaurar Backup' },
      'education.approve': { bg: 'rgba(16, 185, 129, 0.1)', color: '#10b981', label: 'Aprobar Estudiante' },
      'education.reject': { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', label: 'Rechazar Estudiante' },
      'inquiry.update': { bg: 'rgba(14, 165, 233, 0.1)', color: '#0ea5e9', label: 'Actualizar Lead' },
      'organization.update': { bg: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', label: 'Actualizar Org' },
      'session.revoke': { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', label: 'Revocar Sesión' },
      'user.activate': { bg: 'rgba(16, 185, 129, 0.1)', color: '#10b981', label: 'Activar Usuario' },
      'user.suspend': { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', label: 'Suspender Usuario' },
      'user.update_role': { bg: 'rgba(236, 72, 153, 0.1)', color: '#ec4899', label: 'Cambio de Rol' },
    };

    const conf = map[action] || { bg: 'rgba(107, 114, 128, 0.1)', color: '#6b7280', label: action };
    return `<span style="font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; background: ${conf.bg}; color: ${conf.color}; white-space: nowrap;">${escapeHtml(conf.label)}</span>`;
  }

  private openAuditDetailModal(item: AdminAuditItem): void {
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-audit-detail-backdrop"]');
    if (!backdrop) return;

    const elLogId = backdrop.querySelector<HTMLElement>('[data-ref="detail-log-id"]');
    const elTime = backdrop.querySelector<HTMLElement>('[data-ref="detail-timestamp"]');
    const elActor = backdrop.querySelector<HTMLElement>('[data-ref="detail-actor"]');
    const elAction = backdrop.querySelector<HTMLElement>('[data-ref="detail-action"]');
    const elTarget = backdrop.querySelector<HTMLElement>('[data-ref="detail-target"]');
    const elIp = backdrop.querySelector<HTMLElement>('[data-ref="detail-ip"]');
    const elAgent = backdrop.querySelector<HTMLElement>('[data-ref="detail-user-agent"]');
    const elPayload = backdrop.querySelector<HTMLElement>('[data-ref="detail-payload"]');
    const elChecksum = backdrop.querySelector<HTMLElement>('[data-ref="detail-checksum"]');

    if (elLogId) elLogId.textContent = item.logId;
    if (elTime) elTime.textContent = new Date(item.createdAt).toLocaleString();
    if (elActor) elActor.textContent = `${item.actorUsername} (${item.actorRole})`;
    if (elAction) elAction.innerHTML = this.getActionBadge(item.action);
    if (elTarget) elTarget.textContent = `${item.targetType.toUpperCase()}: ${item.targetName || item.targetId}`;
    if (elIp) elIp.textContent = item.ipAddress;
    if (elAgent) elAgent.textContent = item.userAgent || 'No registrado';
    if (elPayload) elPayload.textContent = JSON.stringify(item.details || {}, null, 2);
    if (elChecksum) elChecksum.textContent = item.checksum || 'N/A';

    backdrop.style.display = 'flex';
  }

  private openRevokeModal(sessionId: string, username: string): void {
    this.sessionToRevoke = { id: sessionId, username };
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-revoke-confirm-backdrop"]');
    const textEl = backdrop?.querySelector<HTMLElement>('[data-ref="revoke-confirm-text"]');
    const errEl = backdrop?.querySelector<HTMLElement>('[data-ref="revoke-modal-error"]');

    if (textEl) {
      textEl.textContent = `¿Estás seguro de que deseas revocar la sesión activa del usuario "${username}"? El administrador será desconectado de inmediato.`;
    }
    if (errEl) errEl.style.display = 'none';
    if (backdrop) backdrop.style.display = 'flex';
  }

  private async executeRevoke(sessionId: string): Promise<void> {
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="modal-revoke-confirm-backdrop"]');
    const btnConfirm = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-confirm-revoke"]');
    const errEl = this.container.querySelector<HTMLElement>('[data-ref="revoke-modal-error"]');

    if (btnConfirm) btnConfirm.disabled = true;

    try {
      const res = await fetch(`/api/admin/security/sessions/${encodeURIComponent(sessionId)}/revoke`, {
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errEl) {
          errEl.textContent = errData.error || 'No se pudo revocar la sesión.';
          errEl.style.display = 'block';
        }
        return;
      }

      toast.success('Sesión revocada exitosamente en tiempo real.');
      if (backdrop) backdrop.style.display = 'none';
      this.sessionToRevoke = null;

      await Promise.all([
        this.loadActiveSessions(),
        this.loadStats(),
      ]);
    } catch {
      if (errEl) {
        errEl.textContent = 'Error de conexión al procesar la revocación.';
        errEl.style.display = 'block';
      }
    } finally {
      if (btnConfirm) btnConfirm.disabled = false;
    }
  }
}

export async function createAuditView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/audit/audit.html');
  const controller = new AuditController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
