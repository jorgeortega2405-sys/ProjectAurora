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
  storage: string;
  tagline: string;
}

const TIERS: PlanTier[] = [
  {
    badge: 'Más Popular',
    buttonHoverText: 'Mejorar plan',
    buttonText: 'Obtén Aurora Pro',
    features: [
      {
        desc: 'Máxima resolución y tasa de cuadros sin límites diarios de descarga',
        icon: 'download',
        title: 'Descargas en Ultra HD 4K y 60 FPS',
      },
      {
        desc: 'Convierte cualquier video a audio de alta fidelidad al instante',
        icon: 'bolt',
        title: 'Extracción de audio MP3 de 320 kbps',
      },
      {
        desc: 'Soporte avanzado para formatos modernos AVIF, WebP, H.265 y HEVC',
        icon: 'speed',
        title: 'Compresión ultra con IA sin pérdida visual',
      },
      {
        desc: 'Procesa documentos de cientos de páginas con OCR y renderizado veloz',
        icon: 'picture_as_pdf',
        title: 'Edición y fusión de PDFs ilimitada',
      },
      {
        desc: 'Exportación en SVG y PDF de alta resolución con marcos y logotipos',
        icon: 'brush',
        title: 'Códigos QR vectoriales y logos personalizados',
      },
      {
        desc: 'Tus archivos entran directo a la cola prioritaria sin esperas',
        icon: 'rocket_launch',
        title: 'Procesamiento acelerado en GPU dedicada',
      },
      {
        desc: 'Comprime o descarga hasta 50 archivos simultáneamente en un solo clic',
        icon: 'layers',
        title: 'Procesamiento masivo por lotes',
      },
      {
        desc: 'Vuelve a descargar tus conversiones desde cualquier lugar sin caducidad inmediata',
        icon: 'cloud',
        title: '30 días de historial y almacenamiento seguro',
      },
    ],
    id: 'pro',
    isPopular: true,
    name: 'Aurora Pro',
    priceMonthly: 9.99,
    priceYearly: 7.99,
    storage: '5 GB por archivo',
    tagline: 'El plan más equilibrado para profesionales, creadores de contenido y alta demanda.',
  },
  {
    badge: 'Para Empresas',
    buttonHoverText: 'Hablar con el equipo',
    buttonText: 'Obtén Aurora Empresas',
    features: [
      {
        desc: 'Añade miembros con gestión de roles, permisos PBAC y proyectos compartidos',
        icon: 'groups',
        title: 'Espacio de trabajo y colaboración de equipos',
      },
      {
        desc: 'Integra nuestro motor de compresión y conversión en tus propios sistemas',
        icon: 'vpn_key',
        title: 'API REST dedicada y automatización con Webhooks',
      },
      {
        desc: 'Capacidad de cómputo aislada para garantizar latencia mínima en grandes volúmenes',
        icon: 'speed',
        title: 'Servidores dedicados con 10 Gbps de ancho de banda',
      },
      {
        desc: 'Aplica la identidad visual de tu empresa automáticamente en cada exportación',
        icon: 'palette',
        title: 'Kits de marca y marcas de agua corporativas',
      },
      {
        desc: 'Acceso unificado con Google Workspace, Azure AD, Okta y registros de auditoría',
        icon: 'shield',
        title: 'Seguridad empresarial, SSO y SAML 2.0',
      },
      {
        desc: 'Respaldo centralizado de todas las operaciones con retención configurable',
        icon: 'cloud',
        title: 'Almacenamiento cloud permanente con cifrado TLS 1.3',
      },
      {
        desc: 'Atención técnica especializada inmediata por canales dedicados y gestor asignado',
        icon: 'support_agent',
        title: 'Soporte prioritario 24/7 y SLA del 99.9%',
      },
    ],
    id: 'enterprise',
    isPopular: false,
    name: 'Aurora Empresas',
    priceMonthly: 29.99,
    priceYearly: 23.99,
    storage: 'Archivos ilimitados',
    tagline: 'Máxima potencia, capacidad masiva, seguridad corporativa y flujos de trabajo en equipo.',
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

    if (tierId === 'enterprise') {
      window.location.href = 'mailto:ventas@projectaurora.com?subject=Consulta%20Plan%20Empresas';
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
          <span class="component-card-storage-badge" data-ref="storage-badge-${tier.id}">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#cloud"></use></svg>
            <span>${escapeHtml(t(`upgrade.plans.${tier.id}.storage`) || tier.storage)}</span>
          </span>
        </div>

        <div class="component-card-section component-card-section--price" data-ref="card-price-${tier.id}">
          <div class="component-card-price-label" data-ref="price-label-${tier.id}">${t('upgrade.price_from')}</div>
          <div class="component-card-price-container" data-ref="price-container-${tier.id}">
            <span class="component-card-price" data-ref="price-val-container-${tier.id}">
              USD $<span data-ref="plan-price-${tier.id}" data-monthly="${monthlyPrice}" data-yearly="${yearlyPrice}">${initialPrice}</span>
            </span>
            <span class="component-card-period" data-ref="plan-period-${tier.id}" data-period-monthly="${t('upgrade.period_monthly')}" data-period-yearly="${t('upgrade.period_yearly')}">${isYearly ? t('upgrade.period_yearly') : t('upgrade.period_monthly')}</span>
          </div>
        </div>

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
            <button type="button" class="component-button component-button--rounded-pill component-button--hover-text component-cursor-pointer component-card-button ${isPopular ? 'component-card-button--featured' : ''}" data-ref="btn-subscribe-${tier.id}" data-action="subscribe" data-tier="${tier.id}">
              <span class="component-button__default-text">
                ${escapeHtml(t(`upgrade.plans.${tier.id}.button`) || tier.buttonText)}
              </span>
              <span class="component-button__hover-text">
                ${escapeHtml(t(`upgrade.plans.${tier.id}.hover_button`) || tier.buttonHoverText)}
              </span>
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
