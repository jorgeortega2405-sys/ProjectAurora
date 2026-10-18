import { navigate } from '../app-router.js';
import { checkAuthSession, currentUser, escapeHtml, getApi, postApi } from '../services/api.service.js';
import { t } from '../services/i18n.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';

type BillingCycle = 'monthly' | 'yearly';

interface PlanFeature {
  desc: string;
  icon: string;
  title: string;
}

interface PlanTier {
  badge: string | null;
  buttonHoverText: string;
  buttonText: string;
  features: PlanFeature[];
  id: string;
  isPopular: boolean;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  storage: string | null;
  tagline: string;
}

const TIERS: PlanTier[] = [
  {
    badge: 'Más Popular',
    buttonHoverText: 'Mejorar plan',
    buttonText: 'Obtén Aurora Pro',
    features: [
      {
        desc: 'Tokens para resúmenes avanzados y traducciones de alta fidelidad con Gemini',
        icon: 'auto_awesome',
        title: '2.000 Créditos mensuales de IA',
      },
      {
        desc: 'Une, comprime y gestiona hasta 500 páginas o documentos por operación',
        icon: 'layers',
        title: 'Procesamiento por lote de hasta 500 archivos',
      },
      {
        desc: 'Procesa libros, planos y expedientes pesados de hasta 1 GB sin restricciones',
        icon: 'upload_file',
        title: 'Archivos de gran volumen hasta 1.000 MB',
      },
      {
        desc: 'Segmenta automáticamente documentos según el tamaño en MB especificado',
        icon: 'call_split',
        title: 'División inteligente de PDF por tamaño',
      },
      {
        desc: 'Convierte PDFs escaneados a texto editable en español, inglés o bilingüe',
        icon: 'center_focus_strong',
        title: 'OCR multilingüe de alta precisión',
      },
      {
        desc: 'Detecta diferencias textuales y visuales lado a lado con visor interactivo',
        icon: 'swap_horiz',
        title: 'Comparación semántica y visual de PDFs',
      },
      {
        desc: 'Oculta y elimina de forma definitiva información sensible o datos protegidos',
        icon: 'shield',
        title: 'Censura confidencial irreversible',
      },
      {
        desc: 'Encadena herramientas en pipelines automatizados (hasta 100 flujos guardados)',
        icon: 'account_tree',
        title: 'Hasta 100 flujos de trabajo',
      },
      {
        desc: 'Dibuja, añade texto, marcas de agua, numeración y exporta a Markdown y Office',
        icon: 'picture_as_pdf',
        title: 'Edición avanzada y conversión universal',
      },
    ],
    id: 'pro',
    isPopular: true,
    name: 'Aurora Pro',
    priceMonthly: 9.99,
    priceYearly: 7.99,
    storage: null,
    tagline: 'La suite definitiva para profesionales con límites masivos, tokens de IA y funciones avanzadas.',
  },
  {
    badge: null,
    buttonHoverText: 'Contactar a ventas',
    buttonText: 'Contactar a ventas',
    features: [
      {
        desc: 'Autenticación unificada con Google Workspace, Microsoft Entra ID (Azure AD), Okta y SAML 2.0 / OIDC',
        icon: 'vpn_key',
        title: 'Single Sign-On (SSO) empresarial',
      },
      {
        desc: 'Agrega y administra cuentas de empleados de tu empresa con altas y bajas automáticas',
        icon: 'groups',
        title: 'Administración centralizada de asientos',
      },
      {
        desc: 'Asigna permisos y políticas de acceso a nivel de usuario y roles organizativos',
        icon: 'verified_user',
        title: 'Permisos granulares PBAC',
      },
      {
        desc: 'Bolsa mensual compartida de tokens para resúmenes avanzados y traducción con Gemini',
        icon: 'auto_awesome',
        title: '10.000 Créditos de IA para el equipo',
      },
      {
        desc: 'Límite de 500 archivos por tarea, 1.000 MB por archivo y acceso a las 20+ herramientas',
        icon: 'picture_as_pdf',
        title: 'Suite completa Pro en cada asiento',
      },
      {
        desc: 'Automatiza pipelines documentales a escala corporativa (hasta 1.000 flujos)',
        icon: 'account_tree',
        title: 'Hasta 1.000 flujos corporativos',
      },
      {
        desc: 'Procesamiento en memoria efímera sin retención innecesaria y máxima seguridad de datos',
        icon: 'shield',
        title: 'Cero persistencia residual y cifrado TLS 1.3',
      },
      {
        desc: 'Acompañamiento en configuración de SSO corporativo y atención técnica preferencial',
        icon: 'support_agent',
        title: 'Soporte prioritario y asistencia técnica',
      },
    ],
    id: 'enterprise',
    isPopular: false,
    name: 'Aurora Empresas',
    priceMonthly: 0,
    priceYearly: 0,
    storage: null,
    tagline: 'Control corporativo total con inicio de sesión único (SSO), gestión de asientos y máxima seguridad.',
  },
];

const TIER_HIERARCHY: Record<string, number> = {
  empresas: 2,
  enterprise: 2,
  free: 0,
  none: 0,
  pro: 1,
};

export class UpgradeController {
  private abortController: AbortController | null = null;
  private boundMonthlyClick: (e: MouseEvent) => void;
  private boundYearlyClick: (e: MouseEvent) => void;
  private container: HTMLElement;
  private currentBillingCycle: BillingCycle = 'monthly';

  constructor(container: HTMLElement) {
    this.container = container;
    this.boundMonthlyClick = (e: MouseEvent) => {
      e.preventDefault();
      if (this.currentBillingCycle !== 'monthly') {
        this.handleBillingCycleChange('monthly');
      }
    };
    this.boundYearlyClick = (e: MouseEvent) => {
      e.preventDefault();
      if (this.currentBillingCycle !== 'yearly') {
        this.handleBillingCycleChange('yearly');
      }
    };
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.renderCards();
    renderIcons(this.container);
    this.bindEvents();
    this.handleUrlTargetPlan();
    await this.handlePaymentUrlParams();
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private bindEvents(): void {
    const btnMonthly = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-cycle-monthly"]');
    const btnYearly = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-cycle-yearly"]');

    btnMonthly?.addEventListener('click', this.boundMonthlyClick, { signal: this.abortController?.signal });
    btnYearly?.addEventListener('click', this.boundYearlyClick, { signal: this.abortController?.signal });

    const disclaimerLinks = this.container.querySelectorAll<HTMLAnchorElement>('.component-disclaimer a.link');
    disclaimerLinks.forEach((link) => {
      link.addEventListener(
        'click',
        (e) => {
          const href = link.getAttribute('href');
          if (href && href.startsWith('/')) {
            e.preventDefault();
            navigate(href);
          }
        },
        { signal: this.abortController?.signal }
      );
    });
  }

  private async handlePaymentUrlParams(): Promise<void> {
    const urlParams = new URLSearchParams(window.location.search);
    const payment = urlParams.get('payment');
    const sessionId = urlParams.get('session_id');

    if (payment === 'success' && sessionId) {
      try {
        const res = await getApi(`/api/subscriptions/verify?session_id=${encodeURIComponent(sessionId)}`);
        const data = await res.json();
        if (res.ok && data.success) {
          await checkAuthSession();
          showToast(t('upgrade.payment_success') || '¡Tu suscripción a Aurora Pro se ha activado con éxito!', 'success');
        } else {
          showToast(data.message || 'No se pudo verificar el pago.', 'danger');
        }
      } catch {
        showToast('Error de conexión al verificar suscripción.', 'danger');
      } finally {
        window.history.replaceState({}, document.title, window.location.pathname);
        this.renderCards();
        renderIcons(this.container);
      }
    } else if (payment === 'cancelled') {
      showToast(t('upgrade.payment_cancelled') || 'El proceso de pago fue cancelado.', 'info');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  private handleBillingCycleChange(cycle: BillingCycle): void {
    this.currentBillingCycle = cycle;
    const isYearly = cycle === 'yearly';

    const pill = this.container.querySelector<HTMLElement>('[data-ref="billing-toggle-pill"]');
    if (pill) {
      pill.setAttribute('data-cycle', cycle);
    }

    const btnMonthly = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-cycle-monthly"]');
    const btnYearly = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-cycle-yearly"]');

    if (btnMonthly && btnYearly) {
      btnMonthly.classList.toggle('is-active', !isYearly);
      btnYearly.classList.toggle('is-active', isYearly);
    }

    this.updatePricesDisplay();
  }

  private updatePricesDisplay(): void {
    const isYearly = this.currentBillingCycle === 'yearly';

    TIERS.forEach((tier) => {
      const priceEl = this.container.querySelector<HTMLElement>(`[data-ref="plan-price-${tier.id}"]`);
      const periodEl = this.container.querySelector<HTMLElement>(`[data-ref="plan-period-${tier.id}"]`);

      if (priceEl && periodEl) {
        priceEl.style.opacity = '0';
        periodEl.style.opacity = '0';

        setTimeout(() => {
          priceEl.textContent = isYearly
            ? priceEl.getAttribute('data-yearly') || '0.00'
            : priceEl.getAttribute('data-monthly') || '0.00';
          periodEl.textContent = isYearly
            ? periodEl.getAttribute('data-period-yearly') || t('upgrade.period_yearly')
            : periodEl.getAttribute('data-period-monthly') || t('upgrade.period_monthly');
          priceEl.style.opacity = '1';
          periodEl.style.opacity = '1';
        }, 120);
      }
    });
  }

  private async handlePlanAction(tierId: string): Promise<void> {
    const targetTier = TIERS.find((t) => t.id === tierId);
    if (!targetTier) return;

    if (tierId === 'enterprise') {
      navigate('/business');
      return;
    }

    if (!currentUser) {
      showToast(t('upgrade.login_required') || 'Debes iniciar sesión para suscribirte.', 'info');
      navigate('/login');
      return;
    }

    if (tierId === 'pro') {
      const userTier = (currentUser.subscription_tier || 'free').toLowerCase();
      if (userTier === 'pro') {
        showToast(t('upgrade.already_subscribed') || 'Ya tienes una suscripción activa a este plan.', 'info');
        return;
      }

      const btn = this.container.querySelector<HTMLButtonElement>(`[data-ref="btn-subscribe-${tierId}"]`);
      if (btn) {
        btn.disabled = true;
      }

      try {
        const res = await postApi('/api/subscriptions/checkout', {
          billingPeriod: this.currentBillingCycle,
          planId: 'pro',
        });
        const data = await res.json();
        if (res.ok && data.url) {
          window.location.href = data.url;
          return;
        }
        showToast(data.message || 'No se pudo iniciar el proceso de compra.', 'danger');
      } catch {
        showToast('Error de conexión al iniciar el pago.', 'danger');
      } finally {
        if (btn) {
          btn.disabled = false;
        }
      }
      return;
    }
  }

  private handleToggleFeatures(tierId: string, buttonEl: HTMLElement): void {
    const card = this.container.querySelector<HTMLElement>(`[data-ref="plan-card-${tierId}"]`);
    if (!card) return;

    const hiddenItems = card.querySelectorAll<HTMLElement>('.component-card-feature-item[data-hidden="true"]');
    if (!hiddenItems.length) return;

    const isCurrentlyHidden = hiddenItems[0].classList.contains('component-card-feature-item--hidden');
    if (isCurrentlyHidden) {
      hiddenItems.forEach((item) => item.classList.remove('component-card-feature-item--hidden'));
      buttonEl.textContent = t('upgrade.hide_features');
    } else {
      hiddenItems.forEach((item) => item.classList.add('component-card-feature-item--hidden'));
      buttonEl.textContent = t('upgrade.show_all_features');
    }
  }

  private handleUrlTargetPlan(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const requestedPlan = (urlParams.get('plan') || '').toLowerCase();
    if (!requestedPlan) return;

    let targetId = requestedPlan;
    if (targetId === 'empresas' || targetId === 'business') targetId = 'enterprise';

    setTimeout(() => {
      const card = this.container.querySelector<HTMLElement>(`[data-ref="plan-card-${targetId}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 150);
  }

  private renderCards(): void {
    const grid = this.container.querySelector<HTMLElement>('[data-ref="pricing-grid"]');
    if (!grid) return;

    grid.innerHTML = '';
    const userTier = (currentUser?.subscription_tier || 'free').toLowerCase();
    const userTierLevel = TIER_HIERARCHY[userTier] ?? 0;

    TIERS.forEach((tier, tierIdx) => {
      const isPopular = tier.isPopular;
      const isCurrentPlan = Boolean(currentUser && userTier === tier.id);
      const cardTierLevel = TIER_HIERARCHY[tier.id] ?? 0;
      const isDowngrade = Boolean(currentUser && userTierLevel > cardTierLevel && userTier !== 'free');

      const isYearly = this.currentBillingCycle === 'yearly';
      const initialPrice = Number(isYearly ? tier.priceYearly : tier.priceMonthly).toFixed(2);
      const monthlyPrice = Number(tier.priceMonthly).toFixed(2);
      const yearlyPrice = Number(tier.priceYearly).toFixed(2);

      let featuresHtml = '';
      tier.features.forEach((feat, idx) => {
        if (tierIdx > 0 && idx === 0) {
          featuresHtml += `
            <div class="component-card-feature-divider-container" data-ref="feature-divider-${tier.id}">
              <hr class="component-divider component-card-feature-divider" />
              <p class="component-card-feature-divider-text">${t('upgrade.all_previous_plus')}</p>
            </div>
          `;
        }

        const isHidden = idx > 4;
        featuresHtml += `
          <div class="component-card-feature-item ${isHidden ? 'component-card-feature-item--hidden' : ''}" data-ref="feature-item-${tier.id}-${idx}" data-hidden="${isHidden ? 'true' : 'false'}">
            <svg class="component-icon component-card-feature-icon" aria-hidden="true"><use href="/icons.svg#${escapeHtml(feat.icon)}"></use></svg>
            <div class="component-card-feature-text-container">
              <span class="component-card-feature-title">${escapeHtml(t(`upgrade.plans.${tier.id}.features.${idx}.title`) || feat.title)}</span>
              <span class="component-card-feature-desc">${escapeHtml(t(`upgrade.plans.${tier.id}.features.${idx}.desc`) || feat.desc)}</span>
            </div>
          </div>
        `;
      });

      const card = document.createElement('div');
      card.className = `component-card component-card--grouped component-card--plan ${
        isCurrentPlan
          ? 'component-card--current'
          : (isPopular ? 'component-card--featured' : 'component-card--standard')
      }`;
      card.setAttribute('data-ref', `plan-card-${tier.id}`);
      card.setAttribute('data-tier', tier.id);

      card.innerHTML = `
        <div class="component-card-section component-card-section--header" data-ref="card-header-${tier.id}">
          ${isCurrentPlan ? `
            <div class="component-card-current-badge" data-ref="current-badge-${tier.id}">
              <svg class="component-icon" aria-hidden="true" style="font-size: 14px;"><use href="/icons.svg#check_circle"></use></svg>
              <span>${escapeHtml(t('upgrade.current_plan'))}</span>
            </div>
          ` : (tier.badge ? `
            <div class="component-card-popular-badge" data-ref="popular-badge-${tier.id}">${escapeHtml(t(`upgrade.plans.${tier.id}.badge`) || tier.badge)}</div>
          ` : '')}
          <h2 class="component-card-title" data-ref="card-title-${tier.id}">${escapeHtml(t(`upgrade.plans.${tier.id}.name`) || tier.name)}</h2>
          <p class="component-card-desc" data-ref="card-desc-${tier.id}">${escapeHtml(t(`upgrade.plans.${tier.id}.tagline`) || tier.tagline)}</p>
          ${tier.storage ? `
            <span class="component-card-storage-badge" data-ref="storage-badge-${tier.id}">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#cloud"></use></svg>
              <span>${escapeHtml(t(`upgrade.plans.${tier.id}.storage`) || tier.storage)}</span>
            </span>
          ` : ''}
        </div>

        ${tier.id !== 'enterprise' ? `
          <div class="component-card-section component-card-section--price" data-ref="card-price-${tier.id}">
            <div class="component-card-price-label" data-ref="price-label-${tier.id}">${t('upgrade.price_from')}</div>
            <div class="component-card-price-container" data-ref="price-container-${tier.id}">
              <span class="component-card-price" data-ref="price-val-container-${tier.id}">
                USD $<span data-ref="plan-price-${tier.id}" data-monthly="${monthlyPrice}" data-yearly="${yearlyPrice}">${initialPrice}</span>
              </span>
              <span class="component-card-period" data-ref="plan-period-${tier.id}" data-period-monthly="${t('upgrade.period_monthly')}" data-period-yearly="${t('upgrade.period_yearly')}">${isYearly ? t('upgrade.period_yearly') : t('upgrade.period_monthly')}</span>
            </div>
          </div>
        ` : `
          <div class="component-card-section component-card-section--price component-card-section--price-empty" data-ref="card-price-${tier.id}"></div>
        `}

        <div class="component-card-section component-card-section--action" data-ref="card-action-${tier.id}">
          ${isCurrentPlan ? `
            <button type="button" class="component-button component-button--rounded-pill component-card-button component-card-button--current" data-ref="btn-subscribe-${tier.id}" disabled>
              <svg class="component-icon" aria-hidden="true" style="font-size: 18px; margin-right: 6px;"><use href="/icons.svg#check_circle"></use></svg>
              <span>${escapeHtml(t('upgrade.current_plan'))}</span>
            </button>
          ` : isDowngrade ? `
            <button type="button" class="component-button component-button--rounded-pill component-card-button component-card-button--downgrade" data-ref="btn-subscribe-${tier.id}" disabled>
              <span>${escapeHtml(t('upgrade.current_plan'))}</span>
            </button>
          ` : `
            <button type="button" class="component-button component-button--rounded-pill ${tier.id === 'enterprise' ? '' : 'component-button--hover-text'} component-cursor-pointer component-card-button ${isPopular ? 'component-card-button--featured' : ''}" data-ref="btn-subscribe-${tier.id}" data-action="subscribe" data-tier="${tier.id}">
              <span class="component-button__default-text">
                ${escapeHtml(t(`upgrade.plans.${tier.id}.button`) || tier.buttonText)}
              </span>
              ${tier.id !== 'enterprise' ? `
                <span class="component-button__hover-text">
                  ${escapeHtml(t(`upgrade.plans.${tier.id}.hover_button`) || tier.buttonHoverText)}
                </span>
              ` : ''}
            </button>
          `}
        </div>

        <hr class="component-divider" data-ref="divider-${tier.id}" />

        <div class="component-card-section component-card-section--features" data-ref="card-features-${tier.id}">
          <div class="component-card-features" data-ref="features-container-${tier.id}">
            ${featuresHtml}
            ${tier.features.length > 5 ? `
              <div class="component-card-features-toggle-container">
                <span class="component-card-features-toggle" data-ref="toggle-btn-${tier.id}" data-action="toggle-plan-features">${t('upgrade.show_all_features')}</span>
              </div>
            ` : ''}
          </div>
        </div>
      `;

      const subscribeBtn = card.querySelector<HTMLButtonElement>(`[data-ref="btn-subscribe-${tier.id}"]`);
      if (subscribeBtn && !isCurrentPlan && !isDowngrade) {
        subscribeBtn.addEventListener(
          'click',
          (e) => {
            e.preventDefault();
            this.handlePlanAction(tier.id);
          },
          { signal: this.abortController?.signal }
        );
      }

      const toggleFeaturesBtn = card.querySelector<HTMLElement>(`[data-ref="toggle-btn-${tier.id}"]`);
      if (toggleFeaturesBtn) {
        toggleFeaturesBtn.addEventListener(
          'click',
          (e) => {
            e.preventDefault();
            this.handleToggleFeatures(tier.id, toggleFeaturesBtn);
          },
          { signal: this.abortController?.signal }
        );
      }

      grid.appendChild(card);
    });
  }
}

export async function createUpgradeView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/upgrade/upgrade.html');
  const controller = new UpgradeController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
