import { API_ROUTES } from '../../config/api-routes.js';
import { currentUser, getApi, hasPermission, postApi } from '../../services/api.service.js';
import { t, translateElement } from '../../services/i18n.service.js';
import { renderIcons } from '../../services/icon.service.js';
import { navigate } from '../../services/navigation.service.js';
import { loadTemplate } from '../../services/template.service.js';
import { showToast } from '../../services/toast.service.js';
import { ViewController } from '../../types/common.types.js';
import { OrganizationDetailsResponse, OrganizationSsoConfig } from '../../types/enterprise.types.js';
import { createBannerManager, setupDropdown, withButtonLoading } from '../../utils/dom.util.js';

export class OrganizationSsoViewController implements ViewController {
  private abortController: AbortController | null = null;
  private bannerManager: ReturnType<typeof createBannerManager> | null = null;
  private container: HTMLElement;
  private currentOrg: OrganizationDetailsResponse | null = null;
  private selectedProvider = 'google';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async init(): Promise<void> {
    this.abortController = new AbortController();
    translateElement(this.container);
    renderIcons(this.container);

    this.bannerManager = createBannerManager(this.container, {
      errorRef: 'sso-config-error',
      successRef: 'sso-config-success',
    });

    this.bindEvents();
    await this.loadData();
  }

  public destroy(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  private bindEvents(): void {
    const providerDropdown = this.container.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-sso-provider"]');
    if (providerDropdown) {
      setupDropdown(providerDropdown, {
        isSelect: true,
        onSelect: (val: string) => {
          this.selectedProvider = val;
          this.handleProviderChange();
        },
      });
    }

    const form = this.container.querySelector<HTMLFormElement>('[data-ref="form-sso-config"]');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.handleSaveSsoConfig();
    }, { signal: this.abortController?.signal });

    const copyAcsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-copy-acs"]');
    copyAcsBtn?.addEventListener('click', () => {
      const code = this.container.querySelector<HTMLElement>('[data-ref="code-saml-acs-url"]');
      if (code?.textContent) {
        void navigator.clipboard.writeText(code.textContent.trim()).then(() => {
          showToast(t('common.copied', 'Copiado al portapapeles'), 'success');
        });
      }
    }, { signal: this.abortController?.signal });

    const copyEntityBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-copy-entity-id"]');
    copyEntityBtn?.addEventListener('click', () => {
      const code = this.container.querySelector<HTMLElement>('[data-ref="code-saml-sp-entity-id"]');
      if (code?.textContent) {
        void navigator.clipboard.writeText(code.textContent.trim()).then(() => {
          showToast(t('common.copied', 'Copiado al portapapeles'), 'success');
        });
      }
    }, { signal: this.abortController?.signal });

    const copyMetaBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-copy-metadata"]');
    copyMetaBtn?.addEventListener('click', () => {
      const code = this.container.querySelector<HTMLElement>('[data-ref="code-saml-sp-metadata"]');
      if (code?.textContent) {
        void navigator.clipboard.writeText(code.textContent.trim()).then(() => {
          showToast(t('common.copied', 'Copiado al portapapeles'), 'success');
        });
      }
    }, { signal: this.abortController?.signal });

    this.handleProviderChange();
  }

  private handleProviderChange(): void {
    const isEdu = this.currentOrg?.organization.org_type === 'education';
    const oidcFields = this.container.querySelector<HTMLElement>('[data-ref="sso-oidc-fields"]');
    const azureFields = this.container.querySelector<HTMLElement>('[data-ref="sso-azure-fields"]');
    const samlFields = this.container.querySelector<HTMLElement>('[data-ref="sso-saml-fields"]');
    const summaryProviderName = this.container.querySelector<HTMLElement>('[data-ref="sso-summary-provider-name"]');
    const summaryProviderDesc = this.container.querySelector<HTMLElement>('[data-ref="desc-summary-provider"]');

    if (summaryProviderName && summaryProviderDesc) {
      if (this.selectedProvider === 'azure') {
        summaryProviderName.textContent = isEdu ? 'Microsoft 365 Educación' : 'Microsoft Entra ID';
        summaryProviderDesc.textContent = isEdu ? 'Azure AD / Entra ID Educativo' : 'Azure AD OIDC';
      } else if (this.selectedProvider === 'saml') {
        summaryProviderName.textContent = isEdu ? 'SAML 2.0 Institucional' : 'SAML 2.0';
        summaryProviderDesc.textContent = isEdu ? 'Federación SAML 2.0 / Shibboleth' : 'Federación SAML 2.0';
      } else {
        summaryProviderName.textContent = isEdu ? 'Google Workspace for Education' : 'Google Workspace';
        summaryProviderDesc.textContent = isEdu ? 'OAuth 2.0 / Google Classroom' : 'OAuth 2.0 / OpenID Connect';
      }
    }

    if (!oidcFields || !azureFields || !samlFields) return;

    if (this.selectedProvider === 'saml') {
      oidcFields.style.display = 'none';
      azureFields.style.display = 'none';
      samlFields.style.display = 'flex';
    } else if (this.selectedProvider === 'azure') {
      oidcFields.style.display = 'flex';
      azureFields.style.display = 'block';
      samlFields.style.display = 'none';
    } else {
      oidcFields.style.display = 'flex';
      azureFields.style.display = 'none';
      samlFields.style.display = 'none';
    }
  }

  private async loadData(): Promise<void> {
    try {
      const resOrg = await getApi(API_ROUTES.organization.me);
      if (!resOrg.ok) {
        navigate('/organization');
        return;
      }
      this.currentOrg = (await resOrg.json()) as OrganizationDetailsResponse;

      if (!hasPermission(currentUser, 'org:sso:configure')) {
        navigate('/organization');
        return;
      }

      const isEdu = this.currentOrg?.organization.org_type === 'education';
      this.applyEducationTexts(isEdu);
      await this.loadSsoConfig();
    } catch {
      navigate('/organization');
    }
  }

  private applyEducationTexts(isEdu: boolean): void {
    const titleEl = this.container.querySelector<HTMLElement>('[data-ref="sso-page-title"]');
    if (titleEl) titleEl.textContent = isEdu ? 'Configuración de SSO Educativo / Campus' : 'Configuración de SSO Corporativo';

    const lblStatus = this.container.querySelector<HTMLElement>('[data-ref="label-kpi-status"]');
    if (lblStatus) lblStatus.textContent = isEdu ? 'Estado SSO Institucional' : 'Estado de SSO';

    const lblProvider = this.container.querySelector<HTMLElement>('[data-ref="label-kpi-provider"]');
    if (lblProvider) lblProvider.textContent = isEdu ? 'Proveedor de Identidad' : 'Proveedor Activo';

    const lblPolicy = this.container.querySelector<HTMLElement>('[data-ref="label-kpi-policy"]');
    if (lblPolicy) lblPolicy.textContent = isEdu ? 'Política de Acceso de Campus' : 'Política de Acceso';

    const lblDomains = this.container.querySelector<HTMLElement>('[data-ref="label-kpi-domains"]');
    if (lblDomains) lblDomains.textContent = isEdu ? 'Dominios Escolares Protegidos' : 'Dominios Protegidos';

    const optGoogle = this.container.querySelector<HTMLElement>('[data-ref="opt-sso-google"] .menu-item__text');
    if (optGoogle) optGoogle.textContent = isEdu ? 'Google Workspace for Education (OAuth 2.0 / OIDC)' : 'Google Workspace (OAuth 2.0 / OIDC)';

    const optAzure = this.container.querySelector<HTMLElement>('[data-ref="opt-sso-azure"] .menu-item__text');
    if (optAzure) optAzure.textContent = isEdu ? 'Microsoft 365 Educación (Azure AD OIDC)' : 'Microsoft Entra ID (Azure AD OIDC)';

    const optSaml = this.container.querySelector<HTMLElement>('[data-ref="opt-sso-saml"] .menu-item__text');
    if (optSaml) optSaml.textContent = isEdu ? 'SAML 2.0 Institucional (Shibboleth, Okta, etc.)' : 'SAML 2.0 (Okta, MockSAML, Ping, etc.)';

    const descProvider = this.container.querySelector<HTMLElement>('[data-ref="desc-sso-provider"]');
    if (descProvider) descProvider.textContent = isEdu ? 'Selecciona tu Identity Provider e ingresa las credenciales escolares generadas en su consola de administración.' : 'Selecciona tu Identity Provider e ingresa las credenciales generadas en su consola de administración.';

    const titleRules = this.container.querySelector<HTMLElement>('[data-ref="title-sso-rules"]');
    if (titleRules) titleRules.textContent = isEdu ? '3. Reglas de Acceso para Estudiantes y Docentes' : '3. Reglas de Autenticación y Dominios';

    const descRules = this.container.querySelector<HTMLElement>('[data-ref="desc-sso-rules"]');
    if (descRules) descRules.textContent = isEdu ? 'Controla si el inicio de sesión vía SSO de campus es obligatorio para proteger las cuentas de tu institución.' : 'Controla si el inicio de sesión vía SSO es obligatorio para proteger las cuentas de tu organización.';

    const textEnforce = this.container.querySelector<HTMLElement>('[data-ref="text-sso-enforce"]');
    if (textEnforce) textEnforce.textContent = isEdu ? 'Exigir SSO institucional obligatorio para todos los estudiantes y docentes' : 'Exigir SSO obligatorio para todos los usuarios corporativos';

    const textHint = this.container.querySelector<HTMLElement>('[data-ref="text-domains-hint"]');
    if (textHint) textHint.textContent = isEdu ? 'Asegúrate de tener registrados los dominios escolares (@escuela.edu) en la sección de Dominios para que el acceso automático funcione.' : 'Asegúrate de tener registrados tus dominios en la sección de Dominios Corporativos para que el enrutamiento automático de login funcione.';

    const descGuide = this.container.querySelector<HTMLElement>('[data-ref="desc-sso-guide"]');
    if (descGuide) descGuide.textContent = isEdu ? 'Sigue esta secuencia para desplegar el acceso institucional a alumnos y docentes sin interrupciones:' : 'Sigue esta secuencia para evitar bloquear el acceso de tu personal corporativo:';
  }

  private async loadSsoConfig(): Promise<void> {
    const clientIdInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-sso-client-id"]');
    const tenantIdInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-sso-tenant-id"]');
    const samlEntrypointInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-sso-saml-entrypoint"]');
    const samlIssuerInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-sso-saml-issuer"]');
    const samlCertInput = this.container.querySelector<HTMLTextAreaElement>('[data-ref="input-sso-saml-cert"]');
    const enforceCheckbox = this.container.querySelector<HTMLInputElement>('[data-ref="input-sso-enforce"]');
    const statusBadge = this.container.querySelector<HTMLElement>('[data-ref="sso-status-badge"]');
    const summaryStatusVal = this.container.querySelector<HTMLElement>('[data-ref="sso-summary-status-val"]');
    const summaryStatusBadge = this.container.querySelector<HTMLElement>('[data-ref="sso-summary-status-badge"]');
    const summaryStatusDesc = this.container.querySelector<HTMLElement>('[data-ref="desc-summary-status"]');
    const summaryPolicyVal = this.container.querySelector<HTMLElement>('[data-ref="sso-summary-policy-val"]');
    const summaryPolicyDesc = this.container.querySelector<HTMLElement>('[data-ref="desc-summary-policy"]');
    const summaryDomainsCount = this.container.querySelector<HTMLElement>('[data-ref="sso-summary-domains-count"]');
    const summaryDomainsPreview = this.container.querySelector<HTMLElement>('[data-ref="sso-summary-domains-preview"]');

    const acsCode = this.container.querySelector<HTMLElement>('[data-ref="code-saml-acs-url"]');
    const spEntityCode = this.container.querySelector<HTMLElement>('[data-ref="code-saml-sp-entity-id"]');
    const spMetaCode = this.container.querySelector<HTMLElement>('[data-ref="code-saml-sp-metadata"]');
    const oidcRedirectCode = this.container.querySelector<HTMLElement>('[data-ref="code-oidc-redirect-url"]');
    const origin = window.location.origin;

    if (acsCode) acsCode.textContent = `${origin}/api/auth/sso/saml/callback`;
    if (spEntityCode) spEntityCode.textContent = `${origin}/api/auth/sso/saml/metadata`;
    if (spMetaCode) spMetaCode.textContent = `${origin}/api/auth/sso/saml/metadata`;
    if (oidcRedirectCode) oidcRedirectCode.textContent = `${origin}/api/auth/sso/google/callback`;

    if (summaryDomainsCount && summaryDomainsPreview && this.currentOrg) {
      const domains = this.currentOrg.domains || [];
      summaryDomainsCount.textContent = String(domains.length);
      summaryDomainsPreview.textContent = domains.length > 0 ? domains.map((d) => `@${d.domain}`).join(', ') : 'Sin dominios registrados';
    }

    try {
      const res = await getApi(API_ROUTES.organization.ssoConfig);
      if (!res.ok) return;

      const data = await res.json();
      const ssoConfig = data.config as OrganizationSsoConfig | null;
      const isEdu = this.currentOrg?.organization.org_type === 'education';

      if (ssoConfig && ssoConfig.is_enabled) {
        if (statusBadge) {
          statusBadge.textContent = 'Activo';
          statusBadge.style.color = 'var(--color-success, #16a34a)';
          statusBadge.style.background = 'rgba(22, 163, 74, 0.1)';
        }
        if (summaryStatusVal) {
          summaryStatusVal.textContent = 'Activo';
        }
        if (summaryStatusBadge) {
          summaryStatusBadge.textContent = 'Activo';
          summaryStatusBadge.style.color = 'var(--color-success, #16a34a)';
          summaryStatusBadge.style.background = 'rgba(22, 163, 74, 0.1)';
        }
        if (summaryStatusDesc) {
          summaryStatusDesc.textContent = isEdu ? 'Autenticación escolar habilitada' : 'Autenticación corporativa habilitada';
        }

        if (summaryPolicyVal) {
          summaryPolicyVal.textContent = ssoConfig.enforce_sso ? (isEdu ? 'SSO de Campus Obligatorio' : 'SSO Obligatorio') : (isEdu ? 'SSO Institucional Opcional' : 'SSO Opcional');
        }
        if (summaryPolicyDesc) {
          summaryPolicyDesc.textContent = ssoConfig.enforce_sso
            ? (isEdu ? 'Acceso exclusivo con cuenta institucional' : 'Contraseña bloqueada para miembros')
            : (isEdu ? 'Contraseña o SSO institucional' : 'Inicio tradicional habilitado');
        }

        this.selectedProvider = ssoConfig.provider || 'google';
        const txtProvider = this.container.querySelector<HTMLElement>('[data-ref="txt-selected-sso-provider"]');
        if (txtProvider) {
          const names: Record<string, string> = isEdu
            ? {
                azure: 'Microsoft 365 Educación (Azure AD OIDC)',
                google: 'Google Workspace for Education (OAuth 2.0 / OIDC)',
                saml: 'SAML 2.0 Institucional (Shibboleth, Okta, etc.)',
              }
            : {
                azure: 'Microsoft Entra ID (Azure AD OIDC)',
                google: 'Google Workspace (OAuth 2.0 / OIDC)',
                saml: 'SAML 2.0 (Okta, MockSAML, Ping, etc.)',
              };
          txtProvider.textContent = names[this.selectedProvider] || this.selectedProvider;
        }
        this.container.querySelectorAll<HTMLElement>('[data-ref^="opt-sso-"]').forEach((btn) => {
          btn.classList.toggle('is-active', btn.getAttribute('data-value') === this.selectedProvider);
        });

        if (clientIdInput) clientIdInput.value = ssoConfig.client_id || '';
        if (tenantIdInput) tenantIdInput.value = ssoConfig.tenant_id || '';
        if (samlEntrypointInput) samlEntrypointInput.value = ssoConfig.saml_entrypoint || '';
        if (samlIssuerInput) samlIssuerInput.value = ssoConfig.saml_issuer || '';
        if (samlCertInput) samlCertInput.value = ssoConfig.saml_cert || '';
        if (enforceCheckbox) enforceCheckbox.checked = Boolean(ssoConfig.enforce_sso);
      } else {
        if (statusBadge) {
          statusBadge.textContent = 'Inactivo';
          statusBadge.style.color = 'var(--text-secondary)';
          statusBadge.style.background = 'var(--bg-surface-secondary)';
        }
        if (summaryStatusVal) {
          summaryStatusVal.textContent = 'Inactivo';
        }
        if (summaryStatusBadge) {
          summaryStatusBadge.textContent = 'Inactivo';
          summaryStatusBadge.style.color = 'var(--text-secondary)';
          summaryStatusBadge.style.background = 'var(--bg-surface-secondary)';
        }
        if (summaryStatusDesc) {
          summaryStatusDesc.textContent = isEdu ? 'Sin IdP de campus enlazado' : 'Sin proveedor activo configurado';
        }
        if (summaryPolicyVal) {
          summaryPolicyVal.textContent = isEdu ? 'SSO Institucional Opcional' : 'SSO Opcional';
        }
        if (summaryPolicyDesc) {
          summaryPolicyDesc.textContent = isEdu ? 'Inicio de sesión estándar habilitado' : 'Inicio tradicional habilitado';
        }
      }
      this.handleProviderChange();
    } catch {
      this.handleProviderChange();
    }
  }

  private async handleSaveSsoConfig(): Promise<void> {
    this.bannerManager?.hideAll();

    const isEdu = this.currentOrg?.organization.org_type === 'education';
    const clientIdInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-sso-client-id"]');
    const clientSecretInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-sso-client-secret"]');
    const tenantIdInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-sso-tenant-id"]');
    const samlEntrypointInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-sso-saml-entrypoint"]');
    const samlIssuerInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-sso-saml-issuer"]');
    const samlCertInput = this.container.querySelector<HTMLTextAreaElement>('[data-ref="input-sso-saml-cert"]');
    const enforceCheckbox = this.container.querySelector<HTMLInputElement>('[data-ref="input-sso-enforce"]');
    const submitBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-sso-config"]');

    const provider = this.selectedProvider || 'google';
    const clientId = clientIdInput?.value.trim() || '';
    const clientSecret = clientSecretInput?.value.trim() || '';
    const tenantId = tenantIdInput?.value.trim() || undefined;
    const samlEntrypoint = samlEntrypointInput?.value.trim() || undefined;
    const samlIssuer = samlIssuerInput?.value.trim() || undefined;
    const samlCert = samlCertInput?.value.trim() || undefined;
    const enforceSso = Boolean(enforceCheckbox?.checked);

    if (provider !== 'saml' && (!clientId || !clientSecret)) {
      this.bannerManager?.showError('Ingresa el Client ID y el Client Secret del proveedor SSO.');
      return;
    }

    if (provider === 'azure' && !tenantId) {
      this.bannerManager?.showError('Ingresa el Tenant ID de Microsoft Entra.');
      return;
    }

    if (provider === 'saml' && !samlEntrypoint) {
      this.bannerManager?.showError('Ingresa el SAML Single Sign-On URL (Entrypoint).');
      return;
    }

    await withButtonLoading(submitBtn, async () => {
      try {
        const res = await postApi(API_ROUTES.organization.ssoConfig, {
          clientId: provider !== 'saml' ? clientId : undefined,
          clientSecret: provider !== 'saml' ? clientSecret : undefined,
          enforceSso,
          provider,
          samlCert: provider === 'saml' ? samlCert : undefined,
          samlEntrypoint: provider === 'saml' ? samlEntrypoint : undefined,
          samlIssuer: provider === 'saml' ? samlIssuer : undefined,
          tenantId: provider === 'azure' ? tenantId : undefined,
        });

        const data = await res.json();
        if (!res.ok) {
          this.bannerManager?.showError(data.error || 'No se pudo guardar la configuración SSO.');
          return;
        }

        this.bannerManager?.showSuccess(isEdu ? 'Configuración de SSO institucional guardada con éxito.' : 'Configuración de SSO corporativo guardada con éxito.');
        showToast(isEdu ? 'Configuración SSO de campus actualizada con éxito.' : 'Configuración SSO actualizada con éxito.', 'success');
        await this.loadSsoConfig();
      } catch {
        this.bannerManager?.showError('Error de red al actualizar la configuración SSO.');
      }
    });
  }
}

export async function createOrganizationSsoView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/settings/organization-sso.html');
  const controller = new OrganizationSsoViewController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
