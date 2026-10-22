import { navigate } from '../../app-router.js';
import { API_ROUTES } from '../../config/api-routes.js';
import { currentUser, getApi, hasPermission, postApi } from '../../services/api.service.js';
import { t, translateElement } from '../../services/i18n.service.js';
import { renderIcons } from '../../services/icon.service.js';
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
    const oidcFields = this.container.querySelector<HTMLElement>('[data-ref="sso-oidc-fields"]');
    const azureFields = this.container.querySelector<HTMLElement>('[data-ref="sso-azure-fields"]');
    const samlFields = this.container.querySelector<HTMLElement>('[data-ref="sso-saml-fields"]');
    const summaryProviderName = this.container.querySelector<HTMLElement>('[data-ref="sso-summary-provider-name"]');
    const summaryProviderDesc = this.container.querySelector<HTMLElement>('[data-ref="desc-summary-provider"]');

    if (summaryProviderName && summaryProviderDesc) {
      if (this.selectedProvider === 'azure') {
        summaryProviderName.textContent = 'Microsoft Entra ID';
        summaryProviderDesc.textContent = 'Azure AD OIDC';
      } else if (this.selectedProvider === 'saml') {
        summaryProviderName.textContent = 'SAML 2.0';
        summaryProviderDesc.textContent = 'Federación SAML 2.0';
      } else {
        summaryProviderName.textContent = 'Google Workspace';
        summaryProviderDesc.textContent = 'OAuth 2.0 / OpenID Connect';
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

      await this.loadSsoConfig();
    } catch {
      navigate('/organization');
    }
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
          summaryStatusDesc.textContent = 'Autenticación corporativa habilitada';
        }

        if (summaryPolicyVal) {
          summaryPolicyVal.textContent = ssoConfig.enforce_sso ? 'SSO Obligatorio' : 'SSO Opcional';
        }
        if (summaryPolicyDesc) {
          summaryPolicyDesc.textContent = ssoConfig.enforce_sso ? 'Contraseña bloqueada para miembros' : 'Inicio tradicional habilitado';
        }

        this.selectedProvider = ssoConfig.provider || 'google';
        const txtProvider = this.container.querySelector<HTMLElement>('[data-ref="txt-selected-sso-provider"]');
        if (txtProvider) {
          const names: Record<string, string> = {
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
          summaryStatusDesc.textContent = 'Sin proveedor activo configurado';
        }
        if (summaryPolicyVal) {
          summaryPolicyVal.textContent = 'SSO Opcional';
        }
        if (summaryPolicyDesc) {
          summaryPolicyDesc.textContent = 'Inicio tradicional habilitado';
        }
      }
      this.handleProviderChange();
    } catch {
      this.handleProviderChange();
    }
  }

  private async handleSaveSsoConfig(): Promise<void> {
    this.bannerManager?.hideAll();

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

        this.bannerManager?.showSuccess('Configuración de SSO corporativo guardada con éxito.');
        showToast('Configuración SSO actualizada con éxito.', 'success');
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
