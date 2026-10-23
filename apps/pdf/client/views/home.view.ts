import { navigate } from '../app-router.js';
import { mountSiteFooter } from '../components/footer.component.js';
import { API_ROUTES } from '../config/api-routes.js';
import { getLocalizedPath } from '../config/seo.config.js';
import { isToolNew, TOOLS_REGISTRY } from '../config/tools.registry.js';
import { SVG_TOOL_CREATE_WORKFLOW, SVG_TOOL_WORKFLOW } from '../graphics/tool-icons.graphics.js';
import { checkAuthSession, currentUser, getApi, hasPermission, postApi } from '../services/api.service.js';
import { getCurrentLanguage, t } from '../services/i18n.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { withButtonLoading } from '../utils/dom.util.js';

interface UserWorkflowItem {
  category: 'pdf' | 'image';
  id: string;
  name: string;
  steps: Array<{ id: string; tool: string }>;
}

export class HomeController {
  private abortController: AbortController | null = null;
  private carouselTimer: number | null = null;
  private container: HTMLElement;
  private currentSlideIndex = 0;
  private dropdownControllers: Array<{ destroy: () => void }> = [];
  private eligibleSchoolName = '';
  private isCarouselPaused = false;
  private isEligibleInstant = false;
  private userWorkflows: UserWorkflowItem[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    if (currentUser) {
      await this.loadUserWorkflows();
    }
    this.renderTools();
    renderIcons(this.container);
    this.initCarousel();
    this.bindEvents();
    if (currentUser) {
      void this.checkEducationalEligibility();
    }
  }

  destroy(): void {
    if (this.carouselTimer) {
      window.clearInterval(this.carouselTimer);
      this.carouselTimer = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.dropdownControllers.forEach((ctrl) => ctrl.destroy());
    this.dropdownControllers = [];
  }

  private initCarousel(): void {
    const dots = this.container.querySelectorAll<HTMLButtonElement>('[data-ref^="dot-slide-"]');
    dots.forEach((dot) => {
      dot.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          const slideIdx = parseInt(dot.getAttribute('data-slide-index') || '0', 10);
          this.goToSlide(slideIdx);
        },
        { signal: this.abortController?.signal }
      );
    });

    const carouselEl = this.container.querySelector<HTMLElement>('[data-ref="home-banner-carousel"]');
    if (carouselEl) {
      carouselEl.addEventListener(
        'mouseenter',
        () => {
          this.isCarouselPaused = true;
        },
        { signal: this.abortController?.signal }
      );
      carouselEl.addEventListener(
        'mouseleave',
        () => {
          this.isCarouselPaused = false;
        },
        { signal: this.abortController?.signal }
      );
    }

    this.startCarouselTimer();
  }

  private startCarouselTimer(): void {
    if (this.carouselTimer) {
      window.clearInterval(this.carouselTimer);
    }
    this.carouselTimer = window.setInterval(() => {
      if (!this.isCarouselPaused) {
        const nextIndex = (this.currentSlideIndex + 1) % 2;
        this.goToSlide(nextIndex);
      }
    }, 7000);
  }

  private goToSlide(index: number): void {
    this.currentSlideIndex = index;

    const slides = this.container.querySelectorAll<HTMLElement>('.banner-slide');
    const dots = this.container.querySelectorAll<HTMLButtonElement>('[data-ref^="dot-slide-"]');

    slides.forEach((slide, idx) => {
      slide.classList.toggle('is-active', idx === index);
    });

    dots.forEach((dot, idx) => {
      dot.classList.toggle('is-active', idx === index);
    });

    this.startCarouselTimer();
  }

  private async checkEducationalEligibility(): Promise<void> {
    if (
      !currentUser ||
      currentUser.subscription_tier === 'pro' ||
      currentUser.subscription_tier === 'enterprise' ||
      currentUser.is_student ||
      hasPermission(currentUser, 'subscription:feature:teams') ||
      hasPermission(currentUser, 'subscription:feature:enterprise')
    ) {
      return;
    }

    try {
      const res = await getApi(API_ROUTES.education.status);
      if (!res.ok) return;

      const data = await res.json();
      if (data.isBusinessAccount || !data.isEligibleInstant) return;

      this.isEligibleInstant = true;
      this.eligibleSchoolName = data.eligibleSchoolName || '';

      const schoolBadge = this.container.querySelector<HTMLElement>('[data-ref="edu-banner-badge-text"]');
      const titleText = this.container.querySelector<HTMLElement>('[data-ref="edu-banner-title"]');
      const descText = this.container.querySelector<HTMLElement>('[data-ref="edu-banner-desc"]');
      const actionLabel = this.container.querySelector<HTMLElement>('[data-ref="btn-label-edu-action"]');
      const actionIcon = this.container.querySelector<SVGElement>('[data-ref="btn-icon-edu-action"] use');

      if (schoolBadge && this.eligibleSchoolName) {
        schoolBadge.textContent = this.eligibleSchoolName;
      }
      if (titleText) {
        titleText.textContent = '¡Tu Cuenta es Elegible para 1 Año Pro Gratis!';
      }
      if (descText) {
        descText.textContent = `Detectamos tu correo institucional en ${this.eligibleSchoolName || 'tu institución'}. Obtén y activa tu Plan Pro Estudiantil 100% bonificado con 1 solo clic.`;
      }
      if (actionLabel) {
        actionLabel.textContent = 'Obtener y Activar Plan Pro Estudiantes';
      }
      if (actionIcon) {
        actionIcon.setAttribute('href', '/icons.svg#bolt');
      }

      this.goToSlide(1);
    } catch {}
  }

  private async handleClaimInstantPro(btn: HTMLButtonElement): Promise<void> {
    await withButtonLoading(btn, async () => {
      try {
        const res = await postApi(API_ROUTES.education.claimInstantPro, {});
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast(data.error || 'No fue posible activar el plan estudiantil.', 'danger');
          return;
        }

        showToast(data.message || '¡Plan Pro Estudiantil activado con éxito! Tienes 1 año de acceso total.', 'success');
        this.isEligibleInstant = false;
        const btnLabel = this.container.querySelector<HTMLElement>('[data-ref="btn-label-edu-action"]');
        if (btnLabel) {
          btnLabel.textContent = 'Plan Pro Estudiantil Activo';
        }
        btn.disabled = true;
        await checkAuthSession();
      } catch {
        showToast('Error de red al activar el plan estudiantil.', 'danger');
      }
    });
  }

  private async loadUserWorkflows(): Promise<void> {
    try {
      const res = await getApi('/api/settings/workflows');
      if (res.ok) {
        const data = await res.json();
        this.userWorkflows = Array.isArray(data.workflows) ? data.workflows : [];
      }
    } catch {
      this.userWorkflows = [];
    }
  }

  private renderTools(): void {
    const grid = this.container.querySelector<HTMLElement>('[data-ref="tools-grid"]');
    if (!grid) return;

    const featuredTools = TOOLS_REGISTRY.filter((tool) => tool.featured).slice(0, 30);

    const createWorkflowCardHtml = `
      <div class="tool-card tool-card--create-workflow" data-ref="card-create-workflow" data-category="all organize optimize convert-to-pdf convert-from-pdf edit security pdf-intelligence">
        <div class="tool-card__header-box" data-ref="create-workflow-header">
          <h3 class="tool-card__title" data-ref="title-create-workflow">Crea un flujo de trabajo</h3>
          <p class="tool-card__desc" data-ref="desc-create-workflow">Crea flujos de trabajo personalizados con tus herramientas favoritas y automatiza tareas para reutilizarlas en cualquier momento.</p>
        </div>
        <div class="tool-card__action-link" data-ref="action-create-workflow">
          <span>Crear un flujo de trabajo</span>
          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#arrow_outward"></use></svg>
        </div>
      </div>
    `;

    const userWorkflowsHtml = this.userWorkflows.map((wf) => {
      const stepNames = wf.steps.map((s) => {
        const tool = TOOLS_REGISTRY.find((t) => t.id === s.tool);
        return tool ? t(tool.nameKey) : s.tool;
      }).join(' → ');

      return `
        <div class="tool-card tool-card--workflow" data-ref="card-workflow-${wf.id}" data-category="all organize optimize" data-workflow-id="${wf.id}">
          <div class="tool-card__icon-box" data-ref="icon-box-workflow-${wf.id}">
            ${SVG_TOOL_WORKFLOW}
          </div>
          <span class="component-badge component-badge--sm tool-card__badge" data-ref="badge-workflow-${wf.id}">${wf.steps.length} pasos</span>
          <h3 class="tool-card__title" data-ref="title-workflow-${wf.id}">${this.escape(wf.name)}</h3>
          <p class="tool-card__desc" data-ref="desc-workflow-${wf.id}">${this.escape(stepNames || 'Flujo de trabajo personalizado')}</p>
        </div>
      `;
    }).join('');

    const currentLang = getCurrentLanguage();
    const standardToolsHtml = featuredTools.map((tool) => {
      const isNew = isToolNew(tool);
      const newBadgeHtml = isNew
        ? `<span class="component-badge component-badge--sm tool-card__badge tool-card__badge--new" data-ref="badge-tool-new-${tool.id}" data-i18n="home.badge_new">${t('home.badge_new', 'Nueva')}</span>`
        : '';

      return `
      <div class="tool-card" data-ref="card-tool-${tool.id}" data-category="${tool.category}" data-tool-path="${getLocalizedPath(tool.id, currentLang)}">
        ${newBadgeHtml}
        <div class="tool-card__icon-box" data-ref="icon-box-${tool.id}">
          ${tool.customSvg || `<svg class="component-icon tool-card__icon" aria-hidden="true"><use href="/icons.svg#${tool.icon}"></use></svg>`}
        </div>
        <h3 class="tool-card__title" data-ref="title-tool-${tool.id}" data-i18n="${tool.nameKey}">${t(tool.nameKey)}</h3>
        <p class="tool-card__desc" data-ref="desc-tool-${tool.id}" data-i18n="${tool.descKey}">${t(tool.descKey)}</p>
      </div>
    `;
    }).join('');

    grid.innerHTML = standardToolsHtml + userWorkflowsHtml + createWorkflowCardHtml;
  }

  private bindEvents(): void {
    const grid = this.container.querySelector<HTMLElement>('[data-ref="tools-grid"]');
    grid?.addEventListener(
      'click',
      (e) => {
        const target = e.target as HTMLElement;

        const createCard = target.closest<HTMLElement>('[data-ref="card-create-workflow"]');
        if (createCard) {
          e.preventDefault();
          if (currentUser) {
            navigate('/workflows?new=1');
          } else {
            navigate('/login');
          }
          return;
        }

        const workflowCard = target.closest<HTMLElement>('[data-workflow-id]');
        if (workflowCard) {
          e.preventDefault();
          const wfId = workflowCard.getAttribute('data-workflow-id');
          if (wfId) {
            navigate(`/workflow/${wfId}`);
          }
          return;
        }

        const toolCard = target.closest<HTMLElement>('.tool-card[data-tool-path]');
        if (toolCard) {
          const path = toolCard.getAttribute('data-tool-path');
          if (path) {
            e.preventDefault();
            navigate(path);
          }
        }
      },
      { signal: this.abortController?.signal }
    );

    const pills = this.container.querySelectorAll<HTMLButtonElement>('[data-ref^="pill-cat-"]');
    const cards = this.container.querySelectorAll<HTMLElement>('.tool-card');

    pills.forEach((pill) => {
      pill.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          pills.forEach((p) => p.classList.remove('is-active'));
          pill.classList.add('is-active');

          const category = pill.getAttribute('data-category') || 'all';
          this.filterCards(category, cards);
        },
        { signal: this.abortController?.signal }
      );
    });

    const btnHomePro = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-home-pro"]');
    btnHomePro?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        navigate('/upgrade');
      },
      { signal: this.abortController?.signal }
    );

    const btnHomeEdu = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-home-edu-action"]');
    btnHomeEdu?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.isEligibleInstant) {
          void this.handleClaimInstantPro(btnHomeEdu);
        } else {
          navigate('/education/verify');
        }
      },
      { signal: this.abortController?.signal }
    );

    const footerEl = this.container.querySelector<HTMLElement>('[data-ref="home-footer-section"]');
    if (footerEl) {
      const footerCtrl = mountSiteFooter(footerEl, this.abortController?.signal);
      this.dropdownControllers.push(footerCtrl);
    }
  }

  private filterCards(category: string, cards: NodeListOf<HTMLElement>): void {
    cards.forEach((card) => {
      if (category === 'all') {
        card.classList.remove('is-hidden');
        return;
      }
      const cardCategories = (card.getAttribute('data-category') || '').split(' ');
      if (cardCategories.includes(category)) {
        card.classList.remove('is-hidden');
      } else {
        card.classList.add('is-hidden');
      }
    });
  }

  private escape(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export async function createHomeView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/home/home.html');
  const controller = new HomeController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
