import { navigate } from '../../app-router.js';
import { API_ROUTES } from '../../config/api-routes.js';
import { currentUser, deleteApi, escapeHtml, getApi, hasPermission, postApi } from '../../services/api.service.js';
import { t, translateElement } from '../../services/i18n.service.js';
import { renderIcons } from '../../services/icon.service.js';
import { loadTemplate } from '../../services/template.service.js';
import { showToast } from '../../services/toast.service.js';
import { ViewController } from '../../types/common.types.js';
import { OrganizationDetailsResponse, OrganizationDomain, OrganizationMember, OrganizationSsoConfig } from '../../types/enterprise.types.js';
import { bindNavigationLinks, createBannerManager, withButtonLoading } from '../../utils/dom.util.js';

export class OrganizationViewController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private currentOrg: OrganizationDetailsResponse | null = null;

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
  }

  private bindEvents(): void {
    const providerSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="select-sso-provider"]');
    providerSelect?.addEventListener('change', () => this.handleProviderChange(), { signal: this.abortController?.signal });

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

    const ssoForm = this.container.querySelector<HTMLFormElement>('[data-ref="form-sso-config"]');
    ssoForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.handleSaveSsoConfig();
    }, { signal: this.abortController?.signal });
  }

  private handleProviderChange(): void {
    const providerSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="select-sso-provider"]');
    const azureFields = this.container.querySelector<HTMLElement>('[data-ref="sso-azure-fields"]');
    const samlFields = this.container.querySelector<HTMLElement>('[data-ref="sso-saml-fields"]');
    const val = providerSelect?.value || 'google';

    if (azureFields) {
      azureFields.style.display = val === 'azure' ? 'block' : 'none';
    }
    if (samlFields) {
      samlFields.style.display = val === 'saml' ? 'block' : 'none';
    }
  }

  private async loadOrganizationData(): Promise<void> {
    const emptyState = this.container.querySelector<HTMLElement>('[data-ref="org-empty-state"]');
    const mainState = this.container.querySelector<HTMLElement>('[data-ref="org-main-state"]');

    try {
      const res = await getApi(API_ROUTES.organization.me);
      if (res.status === 404 || !res.ok) {
        if (emptyState) emptyState.style.display = 'block';
        if (mainState) mainState.style.display = 'none';
        return;
      }

      const data = (await res.json()) as OrganizationDetailsResponse;
      this.currentOrg = data;

      if (emptyState) emptyState.style.display = 'none';
      if (mainState) mainState.style.display = 'block';

      this.renderOverview(data);
      await this.loadMembers();
      this.renderDomains(data.domains || []);

      if (hasPermission(currentUser, 'org:sso:configure')) {
        await this.loadSsoConfig();
      } else {
        const ssoWrapper = this.container.querySelector<HTMLElement>('[data-ref="item-sso-wrapper"]');
        if (ssoWrapper) ssoWrapper.style.display = 'none';
      }
    } catch {
      if (emptyState) emptyState.style.display = 'block';
      if (mainState) mainState.style.display = 'none';
    }
  }

  private renderOverview(data: OrganizationDetailsResponse): void {
    const nameEl = this.container.querySelector<HTMLElement>('[data-ref="org-name"]');
    const roleBadge = this.container.querySelector<HTMLElement>('[data-ref="org-role-badge"]');
    const seatDesc = this.container.querySelector<HTMLElement>('[data-ref="org-seat-usage-desc"]');
    const seatProgressFill = this.container.querySelector<HTMLElement>('[data-ref="seat-progress-fill"]');

    if (nameEl) nameEl.textContent = data.organization.name;
    if (roleBadge) {
      const isEdu = data.organization.org_type === 'education';
      const prefix = isEdu ? 'Campus Escolar · ' : '';
      const roleLabel = data.memberRole === 'ORG_OWNER' ? `${prefix}Propietario` : data.memberRole === 'ORG_ADMIN' ? `${prefix}Administrador` : `${prefix}Miembro`;
      roleBadge.textContent = roleLabel;
    }

    const used = data.activeMembersCount;
    const limit = data.organization.seat_limit;
    const remaining = Math.max(0, limit - used);

    if (seatDesc) {
      const isEdu = data.organization.org_type === 'education';
      seatDesc.textContent = isEdu
        ? `${used} de ${limit} licencias de campus utilizadas (${remaining} disponibles)`
        : `${used} de ${limit} asientos utilizados (${remaining} disponibles)`;
    }

    if (seatProgressFill) {
      const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
      seatProgressFill.style.width = `${percent}%`;
      seatProgressFill.style.background = percent >= 100 ? 'var(--color-danger, #d93025)' : 'var(--color-primary, #1a73e8)';
    }

    const inviteSection = this.container.querySelector<HTMLElement>('[data-ref="item-invite-member"]');
    if (inviteSection) {
      const canInvite = hasPermission(currentUser, 'org:members:invite');
      inviteSection.style.display = canInvite ? 'block' : 'none';
    }
  }

  private async loadMembers(): Promise<void> {
    const tableBody = this.container.querySelector<HTMLTableSectionElement>('[data-ref="members-table-body"]');
    const countNumber = this.container.querySelector<HTMLElement>('[data-ref="member-count-number"]');
    if (!tableBody) return;

    try {
      const res = await getApi(API_ROUTES.organization.members);
      if (!res.ok) return;

      const data = await res.json();
      const members = (data.members || []) as OrganizationMember[];

      if (countNumber) countNumber.textContent = String(members.length);
      tableBody.innerHTML = '';

      const canRemove = hasPermission(currentUser, 'org:members:remove');

      members.forEach((member) => {
        const row = document.createElement('tr');
        row.className = 'org-table__row';
        row.style.borderBottom = '1px solid var(--border-color, rgba(0,0,0,0.06))';

        const roleText = member.role === 'ORG_OWNER' ? 'Propietario' : member.role === 'ORG_ADMIN' ? 'Administrador' : 'Miembro';
        const isSelf = member.user_id === currentUser?.id;
        const isOwner = member.role === 'ORG_OWNER';

        let dateStr = '-';
        if (member.created_at) {
          try {
            dateStr = new Date(member.created_at).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });
          } catch {}
        }

        row.innerHTML = `
          <td class="org-table__td" style="padding: 12px 8px;">
            <div style="display: flex; flex-direction: column;">
              <span style="font-weight: 600; color: var(--text-primary);">${escapeHtml(member.username || 'Usuario')}</span>
              <span style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(member.email || '')}</span>
            </div>
          </td>
          <td class="org-table__td" style="padding: 12px 8px;">
            <span class="component-badge component-badge--sm">${roleText}</span>
          </td>
          <td class="org-table__td" style="padding: 12px 8px;">
            <span class="component-badge component-badge--sm" style="color: var(--color-success, #1e8e3e);">${member.status}</span>
          </td>
          <td class="org-table__td" style="padding: 12px 8px; color: var(--text-secondary);">
            ${dateStr}
          </td>
          <td class="org-table__td" style="padding: 12px 8px; text-align: right;">
            ${canRemove && !isOwner && !isSelf ? `
              <button type="button" class="component-button component-button--h34 component-button--danger" data-ref="btn-remove-member" data-member-id="${escapeHtml(member.id)}">
                Eliminar
              </button>
            ` : '<span style="color: var(--text-tertiary, #999); font-size: 12px;">-</span>'}
          </td>
        `;

        const removeBtn = row.querySelector<HTMLButtonElement>('[data-ref="btn-remove-member"]');
        if (removeBtn) {
          removeBtn.addEventListener('click', () => {
            void this.handleRemoveMember(member.id, member.username || member.email || 'este usuario');
          }, { signal: this.abortController?.signal });
        }

        tableBody.appendChild(row);
      });
    } catch {}
  }

  private async handleRemoveMember(memberId: string, memberLabel: string): Promise<void> {
    const banners = createBannerManager(this.container, { errorRef: 'members-action-error' });
    banners.hideAll();

    if (!confirm(`¿Estás seguro de que deseas eliminar a ${memberLabel} de la organización? Esta acción liberará un asiento.`)) {
      return;
    }

    try {
      const res = await deleteApi(API_ROUTES.organization.removeMember(memberId));
      const data = await res.json();

      if (!res.ok) {
        banners.showError(data.error || 'No se pudo eliminar al miembro de la organización.');
        return;
      }

      showToast('Miembro eliminado exitosamente.', 'info');
      await this.loadOrganizationData();
    } catch {
      banners.showError('Error de red al eliminar al miembro.');
    }
  }

  private async handleInviteMember(): Promise<void> {
    const banners = createBannerManager(this.container, {
      errorRef: 'invite-member-error',
      successRef: 'invite-member-success',
    });
    banners.hideAll();

    const emailInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-invite-email"]');
    const roleSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="select-invite-role"]');
    const submitBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-invite"]');

    const email = emailInput?.value.trim().toLowerCase() || '';
    const role = roleSelect?.value || 'ORG_MEMBER';

    if (!email || !email.includes('@')) {
      banners.showError('Ingresa un correo electrónico válido para invitar.');
      return;
    }

    await withButtonLoading(submitBtn, 'Invitando...', async () => {
      try {
        const res = await postApi(API_ROUTES.organization.members, { email, role });
        const data = await res.json();

        if (!res.ok) {
          banners.showError(data.error || 'No se pudo invitar al usuario a la organización.');
          return;
        }

        banners.showSuccess('Miembro agregado correctamente a la organización.');
        if (emailInput) emailInput.value = '';
        await this.loadOrganizationData();
      } catch {
        banners.showError('Error de conexión al invitar miembro.');
      }
    });
  }

  private renderDomains(domains: OrganizationDomain[]): void {
    const domainsList = this.container.querySelector<HTMLElement>('[data-ref="org-domains-list"]');
    if (!domainsList) return;

    domainsList.innerHTML = '';
    if (!domains || domains.length === 0) {
      domainsList.innerHTML = '<span style="font-size: 13px; color: var(--text-secondary);">No hay dominios registrados aún.</span>';
      return;
    }

    domains.forEach((d) => {
      const badge = document.createElement('span');
      badge.className = 'component-badge component-badge--sm';
      badge.style.display = 'inline-flex';
      badge.style.alignItems = 'center';
      badge.style.gap = '6px';
      badge.style.padding = '4px 10px';
      badge.style.fontSize = '13px';
      badge.innerHTML = `
        <svg class="component-icon" style="width: 14px; height: 14px;" aria-hidden="true"><use href="/icons.svg#shield"></use></svg>
        @${escapeHtml(d.domain)}
      `;
      domainsList.appendChild(badge);
    });
  }

  private async handleAddDomain(): Promise<void> {
    const banners = createBannerManager(this.container, {
      errorRef: 'add-domain-error',
      successRef: 'add-domain-success',
    });
    banners.hideAll();

    const domainInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-new-domain"]');
    const submitBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-domain"]');

    const domain = domainInput?.value.trim().toLowerCase().replace(/^@+/, '') || '';
    if (!domain || !domain.includes('.')) {
      banners.showError('Ingresa un dominio corporativo válido (ej. acme.com).');
      return;
    }

    await withButtonLoading(submitBtn, 'Agregando...', async () => {
      try {
        const res = await postApi(API_ROUTES.organization.domains, { domain });
        const data = await res.json();

        if (!res.ok) {
          banners.showError(data.error || 'No se pudo agregar el dominio.');
          return;
        }

        banners.showSuccess('Dominio corporativo registrado correctamente.');
        if (domainInput) domainInput.value = '';
        await this.loadOrganizationData();
      } catch {
        banners.showError('Error de red al registrar el dominio corporativo.');
      }
    });
  }

  private async loadSsoConfig(): Promise<void> {
    const ssoWrapper = this.container.querySelector<HTMLElement>('[data-ref="item-sso-wrapper"]');
    if (!ssoWrapper) return;
    ssoWrapper.style.display = 'block';

    const providerSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="select-sso-provider"]');
    const clientIdInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-sso-client-id"]');
    const tenantIdInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-sso-tenant-id"]');
    const samlEntrypointInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-sso-saml-entrypoint"]');
    const samlIssuerInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-sso-saml-issuer"]');
    const enforceCheckbox = this.container.querySelector<HTMLInputElement>('[data-ref="input-sso-enforce"]');
    const statusBadge = this.container.querySelector<HTMLElement>('[data-ref="sso-status-badge"]');

    try {
      const res = await getApi(API_ROUTES.organization.ssoConfig);
      if (!res.ok) return;

      const data = await res.json();
      const ssoConfig = data.config as OrganizationSsoConfig | null;

      if (ssoConfig && ssoConfig.is_enabled) {
        if (statusBadge) {
          statusBadge.textContent = 'Activo';
          statusBadge.style.color = 'var(--color-success, #1e8e3e)';
        }
        if (providerSelect) providerSelect.value = ssoConfig.provider || 'google';
        if (clientIdInput) clientIdInput.value = ssoConfig.client_id || '';
        if (tenantIdInput) tenantIdInput.value = ssoConfig.tenant_id || '';
        if (samlEntrypointInput) samlEntrypointInput.value = ssoConfig.saml_entrypoint || '';
        if (samlIssuerInput) samlIssuerInput.value = ssoConfig.saml_issuer || '';
        if (enforceCheckbox) enforceCheckbox.checked = Boolean(ssoConfig.enforce_sso);

        this.handleProviderChange();
      } else {
        if (statusBadge) {
          statusBadge.textContent = 'Inactivo';
          statusBadge.style.color = 'var(--text-secondary)';
        }
      }
    } catch {}
  }

  private async handleSaveSsoConfig(): Promise<void> {
    const banners = createBannerManager(this.container, {
      errorRef: 'sso-config-error',
      successRef: 'sso-config-success',
    });
    banners.hideAll();

    const providerSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="select-sso-provider"]');
    const clientIdInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-sso-client-id"]');
    const clientSecretInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-sso-client-secret"]');
    const tenantIdInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-sso-tenant-id"]');
    const samlEntrypointInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-sso-saml-entrypoint"]');
    const samlIssuerInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-sso-saml-issuer"]');
    const enforceCheckbox = this.container.querySelector<HTMLInputElement>('[data-ref="input-sso-enforce"]');
    const submitBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-sso-config"]');

    const provider = providerSelect?.value || 'google';
    const clientId = clientIdInput?.value.trim() || '';
    const clientSecret = clientSecretInput?.value.trim() || '';
    const tenantId = tenantIdInput?.value.trim() || undefined;
    const samlEntrypoint = samlEntrypointInput?.value.trim() || undefined;
    const samlIssuer = samlIssuerInput?.value.trim() || undefined;
    const enforceSso = Boolean(enforceCheckbox?.checked);

    if (provider !== 'saml' && (!clientId || !clientSecret)) {
      banners.showError('Ingresa el Client ID y el Client Secret del proveedor SSO.');
      return;
    }

    if (provider === 'azure' && !tenantId) {
      banners.showError('Ingresa el Tenant ID (Directory ID) para Microsoft Azure.');
      return;
    }

    await withButtonLoading(submitBtn, 'Guardando configuración...', async () => {
      try {
        const res = await postApi(API_ROUTES.organization.ssoConfig, {
          clientId,
          clientSecret,
          enforceSso,
          isEnabled: true,
          provider,
          samlEntrypoint,
          samlIssuer,
          tenantId,
        });

        const data = await res.json();
        if (!res.ok) {
          banners.showError(data.error || 'No se pudo guardar la configuración de SSO.');
          return;
        }

        banners.showSuccess('Configuración de SSO guardada y activada correctamente.');
        showToast('SSO corporativo configurado con éxito.', 'success');
        await this.loadSsoConfig();
      } catch {
        banners.showError('Error de red al guardar configuración de SSO.');
      }
    });
  }
}

export async function createOrganizationView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/settings/organization.html');
  const controller = new OrganizationViewController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
