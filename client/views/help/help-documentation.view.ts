import { navigate } from '../../app-router.js';
import { getFooterHtml, mountSiteFooter } from '../../components/footer.component.js';
import { ToolItem, TOOLS_REGISTRY } from '../../config/tools.registry.js';
import { t } from '../../services/i18n.service.js';
import { renderIcons } from '../../services/icon.service.js';
import { loadTemplate } from '../../services/template.service.js';
import { ViewController } from '../../types/common.types.js';

interface CategoryDoc {
  desc: string;
  id: string;
  title: string;
}

const CATEGORY_DOCS: CategoryDoc[] = [
  {
    desc: 'Combina, separa, reordena y elimina páginas para estructurar tus documentos según tus necesidades.',
    id: 'organize',
    title: 'Organizar PDF',
  },
  {
    desc: 'Reduce el peso de tus archivos, repara documentos dañados o aplica OCR para convertir imágenes escaneadas en texto seleccionable.',
    id: 'optimize',
    title: 'Optimizar PDF',
  },
  {
    desc: 'Transforma imágenes, documentos de Word, hojas de cálculo de Excel, diapositivas de PowerPoint y código HTML a formato PDF profesional.',
    id: 'convert-to-pdf',
    title: 'Convertir a PDF',
  },
  {
    desc: 'Exporta tus PDFs a formatos totalmente editables como Word, Excel, PowerPoint, imágenes JPG o el estándar de archivado PDF/A.',
    id: 'convert-from-pdf',
    title: 'Convertir desde PDF',
  },
  {
    desc: 'Gira páginas desalineadas, añade numeración continua, estampa marcas de agua protectoras, recorta márgenes y modifica contenido.',
    id: 'edit',
    title: 'Editar PDF',
  },
  {
    desc: 'Protege tus archivos con contraseñas seguras, elimina restricciones de lectura, redacta datos confidenciales o compara dos versiones.',
    id: 'security',
    title: 'Seguridad PDF',
  },
  {
    desc: 'Aprovecha modelos avanzados de Inteligencia Artificial para resumir informes, traducir documentos conservando el diseño y exportar a Markdown.',
    id: 'pdf-intelligence',
    title: 'PDF Intelligence (IA)',
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

      const toolsGridHtml = tools.map((tool) => `
        <a class="docs-tool-card" data-ref="docs-card-${tool.id}" data-tool-path="${tool.path}" href="${tool.path}">
          <div class="docs-tool-card__top" data-ref="docs-card-top-${tool.id}">
            <div class="docs-tool-card__icon-box ${tool.iconBoxClass}" data-ref="docs-card-icon-${tool.id}">
              ${tool.customSvg || `<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#${tool.icon}"></use></svg>`}
            </div>
            <h3 class="docs-tool-card__title" data-ref="docs-card-title-${tool.id}">${t(tool.nameKey)}</h3>
          </div>
          <p class="docs-tool-card__desc" data-ref="docs-card-desc-${tool.id}">${t(tool.descKey)}</p>
          <span class="docs-tool-card__action" data-ref="docs-card-action-${tool.id}">
            <span>Abrir herramienta</span>
            <svg class="component-icon docs-tool-card__action-icon" aria-hidden="true"><use href="/icons.svg#arrow_forward"></use></svg>
          </span>
        </a>
      `).join('');

      return `
        <section class="docs-category" data-ref="docs-category-${cat.id}">
          <div class="docs-category__header" data-ref="docs-header-${cat.id}">
            <h2 class="docs-category__title" data-ref="docs-title-${cat.id}">${cat.title}</h2>
            <p class="docs-category__desc" data-ref="docs-desc-${cat.id}">${cat.desc}</p>
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
