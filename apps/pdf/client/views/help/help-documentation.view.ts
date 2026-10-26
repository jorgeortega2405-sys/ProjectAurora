import { getFooterHtml, mountSiteFooter } from '../../components/footer.component.js';
import { ToolItem, TOOLS_REGISTRY } from '../../config/tools.registry.js';
import { t } from '../../services/i18n.service.js';
import { renderIcons } from '../../services/icon.service.js';
import { navigate } from '../../services/navigation.service.js';
import { loadTemplate } from '../../services/template.service.js';
import { ViewController } from '../../types/common.types.js';

interface CategoryDoc {
  descKey: string;
  id: string;
  titleKey: string;
}

const CATEGORY_DOCS: CategoryDoc[] = [
  {
    descKey: 'help.docs.cat_organize_desc',
    id: 'organize',
    titleKey: 'help.docs.cat_organize_title',
  },
  {
    descKey: 'help.docs.cat_optimize_desc',
    id: 'optimize',
    titleKey: 'help.docs.cat_optimize_title',
  },
  {
    descKey: 'help.docs.cat_convert_to_pdf_desc',
    id: 'convert-to-pdf',
    titleKey: 'help.docs.cat_convert_to_pdf_title',
  },
  {
    descKey: 'help.docs.cat_convert_from_pdf_desc',
    id: 'convert-from-pdf',
    titleKey: 'help.docs.cat_convert_from_pdf_title',
  },
  {
    descKey: 'help.docs.cat_edit_desc',
    id: 'edit',
    titleKey: 'help.docs.cat_edit_title',
  },
  {
    descKey: 'help.docs.cat_security_desc',
    id: 'security',
    titleKey: 'help.docs.cat_security_title',
  },
  {
    descKey: 'help.docs.cat_pdf_intelligence_desc',
    id: 'pdf-intelligence',
    titleKey: 'help.docs.cat_pdf_intelligence_title',
  },
];

export class HelpDocumentationController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private footerController: { destroy: () => void } | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.renderCategories();
    this.renderFooter();
    this.bindEvents();
    renderIcons(this.container);
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.footerController) {
      this.footerController.destroy();
      this.footerController = null;
    }
  }

  private renderCategories(): void {
    const categoriesContainer = this.container.querySelector<HTMLElement>('[data-ref="docs-categories-container"]');
    if (!categoriesContainer) return;

    const html = CATEGORY_DOCS.map((cat) => {
      const tools = TOOLS_REGISTRY.filter((tool) => tool.category === cat.id);
      if (tools.length === 0) return '';

      const toolsGridHtml = tools.map((tool) => {
        const toolTitle = t(tool.nameKey);
        const detailedKey = `help.docs.tool_${tool.id.replace(/-/g, '_')}_desc`;
        const toolDesc = t(detailedKey) || t(tool.descKey);
        const openText = t('help.docs.open_tool') || 'Abrir herramienta';

        return `
          <a class="docs-tool-card" data-ref="docs-card-${tool.id}" data-tool-path="${tool.path}" href="${tool.path}">
            <div class="docs-tool-card__top" data-ref="docs-card-top-${tool.id}">
              <div class="docs-tool-card__icon-box ${tool.iconBoxClass}" data-ref="docs-card-icon-${tool.id}">
                ${tool.customSvg || `<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#${tool.icon}"></use></svg>`}
              </div>
              <h3 class="docs-tool-card__title" data-ref="docs-card-title-${tool.id}">${toolTitle}</h3>
            </div>
            <p class="docs-tool-card__desc" data-ref="docs-card-desc-${tool.id}">${toolDesc}</p>
            <span class="docs-tool-card__action" data-ref="docs-card-action-${tool.id}">
              <span>${openText}</span>
              <svg class="component-icon docs-tool-card__action-icon" aria-hidden="true"><use href="/icons.svg#arrow_forward"></use></svg>
            </span>
          </a>
        `;
      }).join('');

      const categoryTitle = t(cat.titleKey) || cat.id;
      const categoryDesc = t(cat.descKey) || '';

      return `
        <section class="docs-category" data-ref="docs-category-${cat.id}">
          <div class="docs-category__header" data-ref="docs-header-${cat.id}">
            <h2 class="docs-category__title" data-ref="docs-title-${cat.id}">${categoryTitle}</h2>
            <p class="docs-category__desc" data-ref="docs-desc-${cat.id}">${categoryDesc}</p>
          </div>
          <div class="docs-tools-grid" data-ref="docs-grid-${cat.id}">
            ${toolsGridHtml}
          </div>
        </section>
      `;
    }).join('');

    categoriesContainer.innerHTML = html;
  }

  private renderFooter(): void {
    const footerContainer = this.container.querySelector<HTMLElement>('[data-ref="docs-footer-section"]');
    if (!footerContainer) return;

    footerContainer.innerHTML = getFooterHtml();
    this.footerController = mountSiteFooter(footerContainer, this.abortController?.signal);
  }

  private bindEvents(): void {
    const cards = this.container.querySelectorAll<HTMLAnchorElement>('.docs-tool-card');
    cards.forEach((card) => {
      card.addEventListener(
        'click',
        (e: MouseEvent) => {
          e.preventDefault();
          const path = card.getAttribute('data-tool-path');
          if (path) {
            navigate(path);
          }
        },
        { signal: this.abortController?.signal }
      );
    });
  }
}

export async function createHelpDocumentationView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/help/documentation.html');
  const controller = new HelpDocumentationController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
