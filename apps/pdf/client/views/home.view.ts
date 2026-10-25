import { mountSiteFooter } from '../components/footer.component.js';
import { getLocalizedPath } from '../config/seo.config.js';
import { isToolNew, TOOLS_REGISTRY } from '../config/tools.registry.js';
import { getCurrentLanguage, t } from '../services/i18n.service.js';
import { renderIcons } from '../services/icon.service.js';
import { navigate } from '../services/navigation.service.js';
import { loadTemplate } from '../services/template.service.js';

export class HomeController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private dropdownControllers: Array<{ destroy: () => void }> = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.renderTools();
    renderIcons(this.container);
    this.bindEvents();
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.dropdownControllers.forEach((ctrl) => ctrl.destroy());
    this.dropdownControllers = [];
  }

  private renderTools(): void {
    const grid = this.container.querySelector<HTMLElement>('[data-ref="tools-grid"]');
    if (!grid) return;

    const featuredTools = TOOLS_REGISTRY.filter((tool) => tool.featured).slice(0, 30);
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

    grid.innerHTML = standardToolsHtml;
  }

  private bindEvents(): void {
    const grid = this.container.querySelector<HTMLElement>('[data-ref="tools-grid"]');
    grid?.addEventListener(
      'click',
      (e) => {
        const target = e.target as HTMLElement;
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
}

export async function createHomeView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/home/home.html');
  const controller = new HomeController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
