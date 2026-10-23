import { currentUser, hasPermission } from '../services/api.service.js';
import { t, translateElement } from '../services/i18n.service.js';
import { renderIcons } from '../services/icon.service.js';
import { navigate } from '../services/navigation.service.js';
import { showToast } from '../services/toast.service.js';
import { loadStylesheet } from '../utils/dom.util.js';

export type UpgradeModalPlanTier = 'pro' | 'enterprise';

let activeUpgradeModal: { close: () => void } | null = null;

export function openUpgradeModal(initialPlan: UpgradeModalPlanTier = 'pro'): { close: () => void } {
  void loadStylesheet('/css/components/component-pricing.css');
  if (activeUpgradeModal) {
    activeUpgradeModal.close();
  }

  const isEnterprise = hasPermission(currentUser, 'subscription:feature:enterprise');
  const isPro = hasPermission(currentUser, 'subscription:feature:pro');

  let selectedPlan: UpgradeModalPlanTier = isEnterprise ? 'enterprise' : (isPro ? 'enterprise' : initialPlan);

  const proTitle = t('upgrade_modal.plan_pro_name') || 'Aurora Pro';
  const enterpriseTitle = t('upgrade_modal.plan_enterprise_name') || 'Aurora Empresas';

  const getPlanName = (p: UpgradeModalPlanTier): string => {
    return p === 'enterprise' ? enterpriseTitle : proTitle;
  };

  const getCtaLabel = (p: UpgradeModalPlanTier): string => {
    if (p === 'enterprise') {
      if (isEnterprise) {
        return t('upgrade_modal.enterprise_current_cta') || 'Plan Corporativo Activo';
      }
      return t('upgrade_modal.contact_sales') || 'Contactar a ventas';
    }
    if (isPro) {
      return t('upgrade_modal.current_plan') || 'Tu plan actual';
    }
    return `${t('upgrade_modal.cta_prefix') || 'Sube de categoría a'} ${getPlanName(p)}`;
  };

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('data-ref', 'modal-upgrade-backdrop');

  backdrop.innerHTML = `
    <div class="modal-container" data-ref="modal-upgrade-container">
      <button type="button" class="modal-close-btn" data-ref="btn-upgrade-modal-close" data-i18n-aria="common.close" aria-label="${t('common.close')}">
        <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#close"></use></svg>
      </button>

      <div class="modal-card modal-card--875x525" data-ref="modal-card-upgrade">
        <div class="modal-card__drag-zone" data-ref="modal-drag-zone" aria-hidden="true">
          <div class="modal-card__drag-handle"></div>
        </div>

        <div class="modal-split__grid" data-ref="modal-split-grid">
          <div class="modal-split__left" data-ref="modal-split-left">
            <div class="modal-split__left-top" data-ref="modal-split-left-top">
              <div class="modal-split__heading" data-ref="modal-split-heading">
                <h2 class="modal-split__title">
                  <span class="modal-split__title-prefix">${t('upgrade_modal.title_prefix') || 'Sube de categoría a'}</span>
                  <span class="modal-split__title-plan" data-ref="plan-title-highlight">${getPlanName(selectedPlan)}</span>
                </h2>
                <p class="modal-split__subtitle">${t('upgrade_modal.choose_plan') || 'Elige tu plan.'}</p>
              </div>

              <div class="modal-split__plans" data-ref="modal-split-plans">
                <div class="modal-split-plan-card upgrade-plan-card${selectedPlan === 'pro' ? ' is-selected' : ''}${isPro ? ' is-current-plan' : ''}" data-ref="card-plan-pro" data-plan="pro">
                  <div class="modal-split-plan-card__radio upgrade-plan-card__radio${isPro ? ' upgrade-plan-card__radio--check' : ''}" data-ref="radio-plan-pro">
                    ${isPro ? `
                      <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#check"></use></svg>
                    ` : `
                      <span class="modal-split-plan-card__dot upgrade-plan-card__dot"></span>
                    `}
                  </div>
                  <div class="modal-split-plan-card__info upgrade-plan-card__info">
                    <div class="modal-split-plan-card__header-row upgrade-plan-card__header-row">
                      <div class="upgrade-plan-card__badge-row">
                        <span class="modal-split-plan-card__name upgrade-plan-card__name">${proTitle}</span>
                        ${isPro ? `
                          <span class="upgrade-plan-card__badge upgrade-plan-card__badge--current">
                            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#check_circle"></use></svg>
                            <span>${t('upgrade_modal.current_plan') || 'Tu plan actual'}</span>
                          </span>
                        ` : ''}
                      </div>
                      <span class="modal-split-plan-card__price upgrade-plan-card__price">${t('upgrade_modal.plan_pro_price') || '$9.99/mes'}</span>
                    </div>
                    <span class="modal-split-plan-card__desc upgrade-plan-card__desc">${t('upgrade_modal.plan_pro_desc') || 'Límites masivos, 2.000 créditos de IA y funciones avanzadas.'}</span>
                  </div>
                </div>

                <div class="modal-split-plan-card upgrade-plan-card${selectedPlan === 'enterprise' ? ' is-selected' : ''}${isEnterprise ? ' is-current-plan' : ''}" data-ref="card-plan-enterprise" data-plan="enterprise">
                  <div class="modal-split-plan-card__radio upgrade-plan-card__radio${isEnterprise ? ' upgrade-plan-card__radio--check' : ''}" data-ref="radio-plan-enterprise">
                    ${isEnterprise ? `
                      <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#check"></use></svg>
                    ` : `
                      <span class="modal-split-plan-card__dot upgrade-plan-card__dot"></span>
                    `}
                  </div>
                  <div class="modal-split-plan-card__info upgrade-plan-card__info">
                    <div class="modal-split-plan-card__header-row upgrade-plan-card__header-row">
                      <div class="upgrade-plan-card__badge-row">
                        <span class="modal-split-plan-card__name upgrade-plan-card__name">${enterpriseTitle}</span>
                        ${isEnterprise ? `
                          <span class="upgrade-plan-card__badge upgrade-plan-card__badge--current">
                            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#check_circle"></use></svg>
                            <span>${t('upgrade_modal.current_plan') || 'Tu plan actual'}</span>
                          </span>
                        ` : ''}
                      </div>
                      <span class="modal-split-plan-card__price upgrade-plan-card__price">${t('upgrade_modal.plan_enterprise_price') || 'A medida'}</span>
                    </div>
                    <span class="modal-split-plan-card__desc upgrade-plan-card__desc">${t('upgrade_modal.plan_enterprise_desc') || 'SSO corporativo, gestión de asientos y 10.000 créditos de IA.'}</span>
                  </div>
                </div>
              </div>

              <button type="button" class="component-button component-button--black component-button--w-full modal-split__btn-cta upgrade-modal__btn-cta" data-ref="btn-upgrade-cta">
                <span class="modal-split__btn-text upgrade-modal__btn-text" data-ref="upgrade-cta-text">${getCtaLabel(selectedPlan)}</span>
              </button>

              <button type="button" class="modal-split__view-all-link upgrade-modal__view-all-link" data-ref="btn-upgrade-view-all">
                <span>${t('upgrade_modal.view_all_link') || 'Ver todos los planes y características'}</span>
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#arrow_forward"></use></svg>
              </button>
            </div>
          </div>

          <div class="modal-split__right" data-ref="modal-split-right">
            <div class="modal-split__table-wrapper upgrade-modal__table-wrapper" data-ref="upgrade-table-wrapper" data-plan="${selectedPlan}">
              <div class="modal-split__active-indicator upgrade-modal__active-indicator" data-ref="active-column-indicator"></div>
              <table class="modal-split__table upgrade-modal__table" data-ref="upgrade-comparison-table">
                <thead>
                  <tr>
                    <th class="col-feature">${t('upgrade_modal.col_benefits') || 'Beneficios'}</th>
                    <th class="col-plan col-plan--pro${selectedPlan === 'pro' ? ' is-active' : ''}" data-ref="th-plan-pro">${t('upgrade_modal.col_pro') || 'Pro'}</th>
                    <th class="col-plan col-plan--enterprise${selectedPlan === 'enterprise' ? ' is-active' : ''}" data-ref="th-plan-enterprise">${t('upgrade_modal.col_enterprise') || 'Empresas'}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="col-feature">
                      <span>${t('upgrade_modal.benefit_ai_credits') || 'Créditos mensuales de IA (tokens)'}</span>
                    </td>
                    <td class="col-plan col-plan--pro${selectedPlan === 'pro' ? ' is-active' : ''}">${t('upgrade_modal.val_ai_pro') || '2.000 / mes'}</td>
                    <td class="col-plan col-plan--enterprise${selectedPlan === 'enterprise' ? ' is-active' : ''}">${t('upgrade_modal.val_ai_enterprise') || '10.000 / mes'}</td>
                  </tr>
                  <tr>
                    <td class="col-feature">
                      <span>${t('upgrade_modal.benefit_batch_files') || 'Archivos por tarea'}</span>
                    </td>
                    <td class="col-plan col-plan--pro${selectedPlan === 'pro' ? ' is-active' : ''}">${t('upgrade_modal.val_batch_pro') || 'Hasta 500 archivos'}</td>
                    <td class="col-plan col-plan--enterprise${selectedPlan === 'enterprise' ? ' is-active' : ''}">${t('upgrade_modal.val_batch_enterprise') || 'Hasta 500 archivos'}</td>
                  </tr>
                  <tr>
                    <td class="col-feature">
                      <span>${t('upgrade_modal.benefit_file_size') || 'Tamaño máx. por archivo'}</span>
                    </td>
                    <td class="col-plan col-plan--pro${selectedPlan === 'pro' ? ' is-active' : ''}">${t('upgrade_modal.val_size_pro') || 'Hasta 1.000 MB'}</td>
                    <td class="col-plan col-plan--enterprise${selectedPlan === 'enterprise' ? ' is-active' : ''}">${t('upgrade_modal.val_size_enterprise') || 'Hasta 1.000 MB'}</td>
                  </tr>
                  <tr>
                    <td class="col-feature">
                      <span>${t('upgrade_modal.benefit_split_size') || 'División por tamaño en MB'}</span>
                    </td>
                    <td class="col-plan col-plan--pro${selectedPlan === 'pro' ? ' is-active' : ''}">${t('upgrade_modal.included') || 'Incluido'}</td>
                    <td class="col-plan col-plan--enterprise${selectedPlan === 'enterprise' ? ' is-active' : ''}">${t('upgrade_modal.included') || 'Incluido'}</td>
                  </tr>
                  <tr>
                    <td class="col-feature">
                      <span>${t('upgrade_modal.benefit_ocr') || 'Reconocimiento OCR multilingüe'}</span>
                    </td>
                    <td class="col-plan col-plan--pro${selectedPlan === 'pro' ? ' is-active' : ''}">${t('upgrade_modal.val_ocr_pro') || 'Alta precisión'}</td>
                    <td class="col-plan col-plan--enterprise${selectedPlan === 'enterprise' ? ' is-active' : ''}">${t('upgrade_modal.val_ocr_enterprise') || 'Alta precisión'}</td>
                  </tr>
                  <tr>
                    <td class="col-feature">
                      <span>${t('upgrade_modal.benefit_compare') || 'Comparador semántico de PDFs'}</span>
                    </td>
                    <td class="col-plan col-plan--pro${selectedPlan === 'pro' ? ' is-active' : ''}">${t('upgrade_modal.val_compare_pro') || 'Visor interactivo'}</td>
                    <td class="col-plan col-plan--enterprise${selectedPlan === 'enterprise' ? ' is-active' : ''}">${t('upgrade_modal.val_compare_enterprise') || 'Visor interactivo'}</td>
                  </tr>
                  <tr>
                    <td class="col-feature">
                      <span>${t('upgrade_modal.benefit_workflows') || 'Flujos de Trabajo'}</span>
                    </td>
                    <td class="col-plan col-plan--pro${selectedPlan === 'pro' ? ' is-active' : ''}">${t('upgrade_modal.val_wf_pro') || 'Hasta 100 flujos'}</td>
                    <td class="col-plan col-plan--enterprise${selectedPlan === 'enterprise' ? ' is-active' : ''}">${t('upgrade_modal.val_wf_enterprise') || 'Hasta 1.000 flujos'}</td>
                  </tr>
                  <tr>
                    <td class="col-feature">
                      <span>${t('upgrade_modal.benefit_redact') || 'Censura confidencial irreversible'}</span>
                    </td>
                    <td class="col-plan col-plan--pro${selectedPlan === 'pro' ? ' is-active' : ''}">${t('upgrade_modal.included') || 'Incluido'}</td>
                    <td class="col-plan col-plan--enterprise${selectedPlan === 'enterprise' ? ' is-active' : ''}">${t('upgrade_modal.included') || 'Incluido'}</td>
                  </tr>
                  <tr>
                    <td class="col-feature">
                      <span>${t('upgrade_modal.benefit_edit') || 'Edición avanzada y conversión'}</span>
                    </td>
                    <td class="col-plan col-plan--pro${selectedPlan === 'pro' ? ' is-active' : ''}">${t('upgrade_modal.val_edit_pro') || 'Suite completa'}</td>
                    <td class="col-plan col-plan--enterprise${selectedPlan === 'enterprise' ? ' is-active' : ''}">${t('upgrade_modal.val_edit_enterprise') || 'Suite completa'}</td>
                  </tr>
                  <tr>
                    <td class="col-feature">
                      <span>${t('upgrade_modal.benefit_sso') || 'Single Sign-On (SSO)'}</span>
                    </td>
                    <td class="col-plan col-plan--pro${selectedPlan === 'pro' ? ' is-active' : ''}">—</td>
                    <td class="col-plan col-plan--enterprise${selectedPlan === 'enterprise' ? ' is-active' : ''}">${t('upgrade_modal.val_sso_enterprise') || 'Google, Azure AD, Okta, SAML'}</td>
                  </tr>
                  <tr>
                    <td class="col-feature">
                      <span>${t('upgrade_modal.benefit_seats') || 'Administración de asientos PBAC'}</span>
                    </td>
                    <td class="col-plan col-plan--pro${selectedPlan === 'pro' ? ' is-active' : ''}">—</td>
                    <td class="col-plan col-plan--enterprise${selectedPlan === 'enterprise' ? ' is-active' : ''}">${t('upgrade_modal.val_seats_enterprise') || 'Consola con altas/bajas'}</td>
                  </tr>
                  <tr>
                    <td class="col-feature">
                      <span>${t('upgrade_modal.benefit_support') || 'Soporte técnico'}</span>
                    </td>
                    <td class="col-plan col-plan--pro${selectedPlan === 'pro' ? ' is-active' : ''}">${t('upgrade_modal.val_support_pro') || 'Prioritario'}</td>
                    <td class="col-plan col-plan--enterprise${selectedPlan === 'enterprise' ? ' is-active' : ''}">${t('upgrade_modal.val_support_enterprise') || 'Dedicado 24/7 y asistencia SSO'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  translateElement(backdrop);
  renderIcons(backdrop);
  document.body.appendChild(backdrop);
  document.body.classList.add('modal-open');

  const card = backdrop.querySelector<HTMLElement>('[data-ref="modal-card-upgrade"]');
  const cardPro = backdrop.querySelector<HTMLElement>('[data-ref="card-plan-pro"]');
  const cardEnterprise = backdrop.querySelector<HTMLElement>('[data-ref="card-plan-enterprise"]');
  const highlightTitle = backdrop.querySelector<HTMLElement>('[data-ref="plan-title-highlight"]');
  const ctaBtn = backdrop.querySelector<HTMLButtonElement>('[data-ref="btn-upgrade-cta"]');
  const ctaTextEl = backdrop.querySelector<HTMLElement>('[data-ref="upgrade-cta-text"]');
  const btnClose = backdrop.querySelector<HTMLButtonElement>('[data-ref="btn-upgrade-modal-close"]');
  const btnViewAll = backdrop.querySelector<HTMLButtonElement>('[data-ref="btn-upgrade-view-all"]');
  const tableWrapper = backdrop.querySelector<HTMLElement>('[data-ref="upgrade-table-wrapper"]');
  const activeIndicator = backdrop.querySelector<HTMLElement>('[data-ref="active-column-indicator"]');
  const dragZone = backdrop.querySelector<HTMLElement>('[data-ref="modal-drag-zone"]');

  let resizeObserver: ResizeObserver | null = null;

  const updateIndicatorPosition = (plan: UpgradeModalPlanTier) => {
    if (!activeIndicator || !tableWrapper) return;
    tableWrapper.setAttribute('data-plan', plan);
    const activeTh = backdrop.querySelector<HTMLElement>(`[data-ref="th-plan-${plan}"]`);
    const table = backdrop.querySelector<HTMLElement>('[data-ref="upgrade-comparison-table"]');
    if (!activeTh || !table) return;

    const thLeft = activeTh.offsetLeft;
    const thWidth = activeTh.offsetWidth;
    const tableLeft = table.offsetLeft;
    const tableTop = table.offsetTop;

    if (thWidth > 0) {
      activeIndicator.style.left = `${tableLeft + thLeft}px`;
      activeIndicator.style.width = `${thWidth}px`;
      activeIndicator.style.top = `${tableTop}px`;
      activeIndicator.style.bottom = '0px';
      activeIndicator.style.height = 'auto';
    } else {
      const wrapperRect = tableWrapper.getBoundingClientRect();
      const thRect = activeTh.getBoundingClientRect();
      const tableRect = table.getBoundingClientRect();
      if (thRect.width > 0 && wrapperRect.width > 0) {
        activeIndicator.style.left = `${thRect.left - wrapperRect.left}px`;
        activeIndicator.style.width = `${thRect.width}px`;
        activeIndicator.style.top = `${tableRect.top - wrapperRect.top}px`;
        activeIndicator.style.bottom = '0px';
        activeIndicator.style.height = 'auto';
      }
    }
  };

  const updateSelectedPlan = (plan: UpgradeModalPlanTier) => {
    selectedPlan = plan;
    cardPro?.classList.toggle('is-selected', plan === 'pro');
    cardEnterprise?.classList.toggle('is-selected', plan === 'enterprise');

    if (highlightTitle) {
      highlightTitle.textContent = getPlanName(plan);
    }
    if (ctaTextEl) {
      ctaTextEl.textContent = getCtaLabel(plan);
    }

    const proCols = backdrop.querySelectorAll<HTMLElement>('.col-plan--pro');
    const enterpriseCols = backdrop.querySelectorAll<HTMLElement>('.col-plan--enterprise');

    proCols.forEach((el) => el.classList.toggle('is-active', plan === 'pro'));
    enterpriseCols.forEach((el) => el.classList.toggle('is-active', plan === 'enterprise'));

    updateIndicatorPosition(plan);
  };

  if (typeof ResizeObserver !== 'undefined' && tableWrapper) {
    resizeObserver = new ResizeObserver(() => {
      updateIndicatorPosition(selectedPlan);
    });
    resizeObserver.observe(tableWrapper);
    const tableEl = backdrop.querySelector<HTMLElement>('[data-ref="upgrade-comparison-table"]');
    if (tableEl) {
      resizeObserver.observe(tableEl);
    }
  }

  requestAnimationFrame(() => {
    backdrop.classList.add('is-visible');
    updateIndicatorPosition(selectedPlan);
  });
  setTimeout(() => updateIndicatorPosition(selectedPlan), 60);
  setTimeout(() => updateIndicatorPosition(selectedPlan), 160);

  const handleResize = () => {
    updateIndicatorPosition(selectedPlan);
  };

  window.addEventListener('resize', handleResize);

  cardPro?.addEventListener('click', () => {
    updateSelectedPlan('pro');
  });

  cardEnterprise?.addEventListener('click', () => {
    updateSelectedPlan('enterprise');
  });

  let isClosing = false;
  let startY = 0;
  let currentY = 0;
  let startTime = 0;
  let isDragging = false;
  let activePointerId: number | null = null;

  const detachPointerListeners = () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (isClosing || !card) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    isDragging = true;
    activePointerId = e.pointerId;
    startY = e.clientY;
    currentY = startY;
    startTime = performance.now();

    try {
      (dragZone || card).setPointerCapture(activePointerId);
    } catch (_) {}

    card.style.transition = 'none';
    backdrop.style.transition = 'none';

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
    currentY = e.clientY;
    const diff = currentY - startY;

    if (card) {
      if (diff > 0) {
        card.style.transform = `translateY(${diff}px)`;
        const progress = Math.min(diff / 240, 1);
        backdrop.style.opacity = `${Math.max(0.2, 1 - progress * 0.8)}`;
      } else {
        const rubberDiff = Math.max(diff * 0.15, -24);
        card.style.transform = `translateY(${rubberDiff}px)`;
      }
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
    isDragging = false;
    detachPointerListeners();

    try {
      if (activePointerId !== null) {
        (dragZone || card)?.releasePointerCapture(activePointerId);
      }
    } catch (_) {}
    activePointerId = null;

    const diff = currentY - startY;
    const elapsed = Math.max(1, performance.now() - startTime);
    const velocity = diff / elapsed;

    if (diff > 80 || (diff > 25 && velocity > 0.45)) {
      closeModal();
    } else {
      backdrop.style.transition = 'opacity 0.25s ease';
      backdrop.style.opacity = '1';
      if (card) {
        card.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
        card.style.transform = '';
      }
    }
  };

  dragZone?.addEventListener('pointerdown', onPointerDown);
  dragZone?.addEventListener('lostpointercapture', onPointerUp);

  const goToUpgrade = (e: MouseEvent) => {
    e.preventDefault();
    closeModal();
    if (selectedPlan === 'enterprise') {
      if (isEnterprise) {
        navigate('/settings');
        return;
      }
      navigate('/business');
    } else {
      if (isPro) {
        navigate('/settings');
        return;
      }
      navigate('/upgrade?plan=pro');
    }
  };

  const goToViewAll = (e: MouseEvent) => {
    e.preventDefault();
    closeModal();
    navigate('/upgrade');
  };

  ctaBtn?.addEventListener('click', goToUpgrade);
  btnViewAll?.addEventListener('click', goToViewAll);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  };

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === backdrop) {
      closeModal();
    }
  };

  const closeModal = () => {
    if (isClosing) return;
    isClosing = true;

    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('resize', handleResize);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    detachPointerListeners();
    dragZone?.removeEventListener('pointerdown', onPointerDown);
    dragZone?.removeEventListener('lostpointercapture', onPointerUp);
    backdrop.removeEventListener('click', handleBackdropClick);

    backdrop.classList.remove('is-visible');
    document.body.classList.remove('modal-open');
    setTimeout(() => {
      backdrop.remove();
      if (activeUpgradeModal && activeUpgradeModal.close === closeModal) {
        activeUpgradeModal = null;
      }
    }, 200);
  };

  btnClose?.addEventListener('click', closeModal);
  backdrop.addEventListener('click', handleBackdropClick);
  window.addEventListener('keydown', handleKeyDown);

  activeUpgradeModal = { close: closeModal };

  return activeUpgradeModal;
}
