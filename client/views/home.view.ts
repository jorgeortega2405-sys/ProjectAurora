import { navigate } from '../app-router.js';
import { mountSiteFooter } from '../components/footer.component.js';
import { TOOLS_REGISTRY } from '../config/tools.registry.js';
import { SVG_TOOL_CREATE_WORKFLOW, SVG_TOOL_WORKFLOW } from '../graphics/tool-icons.graphics.js';
import { currentUser, getApi } from '../services/api.service.js';
import { t } from '../services/i18n.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';

interface UserWorkflowItem {
  category: 'pdf' | 'image';
  id: string;
  name: string;
  steps: Array<{ id: string; tool: string }>;
}

export class HomeController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private dropdownControllers: Array<{ destroy: () => void }> = [];
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
        <div class="tool-card__icon-box" data-ref="icon-box-create-workflow">
          ${SVG_TOOL_CREATE_WORKFLOW}
        </div>
        <h3 class="tool-card__title" data-ref="title-create-workflow">Crear flujo de trabajo</h3>
        <p class="tool-card__desc" data-ref="desc-create-workflow">Automatiza tus tareas recurrentes combinando herramientas PDF en un solo paso.</p>
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
          <span class="component-badge component-badge--sm" data-ref="badge-workflow-${wf.id}" style="font-size: 10.5px; position: absolute; right: 20px; top: 20px;">${wf.steps.length} pasos</span>
          <h3 class="tool-card__title" data-ref="title-workflow-${wf.id}">${this.escape(wf.name)}</h3>
          <p class="tool-card__desc" data-ref="desc-workflow-${wf.id}">${this.escape(stepNames || 'Flujo de trabajo personalizado')}</p>
        </div>
      `;
    }).join('');

    const standardToolsHtml = featuredTools.map((tool) => `
      <div class="tool-card" data-ref="card-tool-${tool.id}" data-category="${tool.category}" data-tool-path="${tool.path}">
        <div class="tool-card__icon-box" data-ref="icon-box-${tool.id}">
          ${tool.customSvg || `<svg class="component-icon tool-card__icon" aria-hidden="true"><use href="/icons.svg#${tool.icon}"></use></svg>`}
        </div>
        <h3 class="tool-card__title" data-ref="title-tool-${tool.id}" data-i18n="${tool.nameKey}">${t(tool.nameKey)}</h3>
        <p class="tool-card__desc" data-ref="desc-tool-${tool.id}" data-i18n="${tool.descKey}">${t(tool.descKey)}</p>
      </div>
    `).join('');

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

    const btnAiSummarize = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-ai-summarize"]');
    btnAiSummarize?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        navigate('/summarize-pdf');
      },
      { signal: this.abortController?.signal }
    );

    const btnAiTranslate = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-ai-translate"]');
    btnAiTranslate?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        navigate('/translate-pdf');
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
