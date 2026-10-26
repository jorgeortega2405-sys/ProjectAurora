import { getFooterHtml, mountSiteFooter } from '../../components/footer.component.js';
import { t } from '../../services/i18n.service.js';
import { renderIcons } from '../../services/icon.service.js';
import { loadTemplate } from '../../services/template.service.js';
import { ViewController } from '../../types/common.types.js';

interface FaqItem {
  answerKey: string;
  category: string;
  id: string;
  questionKey: string;
}

interface FaqGroup {
  id: string;
  titleKey: string;
}

const FAQ_GROUPS: FaqGroup[] = [
  { id: 'security', titleKey: 'help.faq.cat_security' },
  { id: 'limits', titleKey: 'help.faq.cat_limits' },
  { id: 'tools', titleKey: 'help.faq.cat_tools' },
  { id: 'ai', titleKey: 'help.faq.cat_ai' },
  { id: 'billing', titleKey: 'help.faq.cat_billing' },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    answerKey: 'help.faq.item_sec_1_a',
    category: 'security',
    id: 'sec-1',
    questionKey: 'help.faq.item_sec_1_q',
  },
  {
    answerKey: 'help.faq.item_sec_2_a',
    category: 'security',
    id: 'sec-2',
    questionKey: 'help.faq.item_sec_2_q',
  },
  {
    answerKey: 'help.faq.item_sec_3_a',
    category: 'security',
    id: 'sec-3',
    questionKey: 'help.faq.item_sec_3_q',
  },
  {
    answerKey: 'help.faq.item_sec_4_a',
    category: 'security',
    id: 'sec-4',
    questionKey: 'help.faq.item_sec_4_q',
  },
  {
    answerKey: 'help.faq.item_sec_5_a',
    category: 'security',
    id: 'sec-5',
    questionKey: 'help.faq.item_sec_5_q',
  },
  {
    answerKey: 'help.faq.item_lim_1_a',
    category: 'limits',
    id: 'lim-1',
    questionKey: 'help.faq.item_lim_1_q',
  },
  {
    answerKey: 'help.faq.item_lim_2_a',
    category: 'limits',
    id: 'lim-2',
    questionKey: 'help.faq.item_lim_2_q',
  },
  {
    answerKey: 'help.faq.item_lim_3_a',
    category: 'limits',
    id: 'lim-3',
    questionKey: 'help.faq.item_lim_3_q',
  },
  {
    answerKey: 'help.faq.item_tool_1_a',
    category: 'tools',
    id: 'tool-1',
    questionKey: 'help.faq.item_tool_1_q',
  },
  {
    answerKey: 'help.faq.item_tool_2_a',
    category: 'tools',
    id: 'tool-2',
    questionKey: 'help.faq.item_tool_2_q',
  },
  {
    answerKey: 'help.faq.item_tool_3_a',
    category: 'tools',
    id: 'tool-3',
    questionKey: 'help.faq.item_tool_3_q',
  },
  {
    answerKey: 'help.faq.item_ai_1_a',
    category: 'ai',
    id: 'ai-1',
    questionKey: 'help.faq.item_ai_1_q',
  },
  {
    answerKey: 'help.faq.item_ai_2_a',
    category: 'ai',
    id: 'ai-2',
    questionKey: 'help.faq.item_ai_2_q',
  },
  {
    answerKey: 'help.faq.item_ai_3_a',
    category: 'ai',
    id: 'ai-3',
    questionKey: 'help.faq.item_ai_3_q',
  },
  {
    answerKey: 'help.faq.item_bill_1_a',
    category: 'billing',
    id: 'bill-1',
    questionKey: 'help.faq.item_bill_1_q',
  },
  {
    answerKey: 'help.faq.item_bill_2_a',
    category: 'billing',
    id: 'bill-2',
    questionKey: 'help.faq.item_bill_2_q',
  },
  {
    answerKey: 'help.faq.item_bill_3_a',
    category: 'billing',
    id: 'bill-3',
    questionKey: 'help.faq.item_bill_3_q',
  },
];

export class HelpFaqController implements ViewController {
  private abortController: AbortController | null = null;
  private activeCategory = 'all';
  private container: HTMLElement;
  private footerController: { destroy: () => void } | null = null;
  private searchQuery = '';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    const searchInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-faq-search"]');
    if (searchInput) {
      searchInput.placeholder = t('help.faq.search_placeholder') || 'Buscar preguntas frecuentes...';
    }
    this.renderFaqItems();
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

  private renderFaqItems(): void {
    const itemsContainer = this.container.querySelector<HTMLElement>('[data-ref="faq-items-container"]');
    if (!itemsContainer) return;

    const query = this.searchQuery.toLowerCase().trim();
    const filteredGroups = FAQ_GROUPS.filter((group) => {
      if (this.activeCategory !== 'all' && group.id !== this.activeCategory) {
        return false;
      }
      return true;
    });

    let renderedCount = 0;
    const html = filteredGroups.map((group) => {
      const items = FAQ_ITEMS.filter((item) => {
        if (item.category !== group.id) return false;
        const q = t(item.questionKey).toLowerCase();
        const a = t(item.answerKey).toLowerCase();
        if (!query) return true;
        return q.includes(query) || a.includes(query);
      });

      if (items.length === 0) return '';
      renderedCount += items.length;

      const itemsHtml = items.map((item) => {
        const question = t(item.questionKey);
        const answer = t(item.answerKey);

        return `
          <div class="faq-item" data-ref="faq-item-${item.id}">
            <button type="button" class="faq-item__trigger" data-ref="faq-trigger-${item.id}" aria-expanded="false">
              <span>${question}</span>
              <svg class="component-icon faq-item__chevron" aria-hidden="true"><use href="/icons.svg#expand_more"></use></svg>
            </button>
            <div class="faq-item__content" data-ref="faq-content-${item.id}">
              <div class="faq-item__inner" data-ref="faq-inner-${item.id}">
                <div class="faq-item__body" data-ref="faq-body-${item.id}">${answer}</div>
              </div>
            </div>
          </div>
        `;
      }).join('');

      const groupTitle = t(group.titleKey) || group.id;

      return `
        <div class="faq-group" data-ref="faq-group-${group.id}">
          <div class="faq-group__header" data-ref="faq-group-header-${group.id}">
            <h2 class="faq-group__title" data-ref="faq-group-title-${group.id}">${groupTitle}</h2>
          </div>
          <div class="faq-accordion" data-ref="faq-accordion-${group.id}">
            ${itemsHtml}
          </div>
        </div>
      `;
    }).join('');

    if (renderedCount === 0) {
      itemsContainer.innerHTML = `
        <div class="faq-group" data-ref="faq-empty-state" style="padding: 48px 24px; text-align: center;">
          <h3 class="faq-group__title" data-ref="faq-empty-title" style="margin-bottom: 8px;">${t('help.faq.empty_title') || 'No se encontraron resultados'}</h3>
          <p class="settings-subtitle" data-ref="faq-empty-desc" style="margin: 0;">${t('help.faq.empty_desc') || 'Intenta buscar con otras palabras o selecciona otra categoría.'}</p>
        </div>
      `;
    } else {
      itemsContainer.innerHTML = html;
    }

    renderIcons(itemsContainer);
  }

  private renderFooter(): void {
    const footerContainer = this.container.querySelector<HTMLElement>('[data-ref="faq-footer-section"]');
    if (!footerContainer) return;

    footerContainer.innerHTML = getFooterHtml();
    this.footerController = mountSiteFooter(footerContainer, this.abortController?.signal);
  }

  private bindEvents(): void {
    const searchInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-faq-search"]');
    searchInput?.addEventListener(
      'input',
      (e: Event) => {
        this.searchQuery = (e.target as HTMLInputElement).value;
        this.renderFaqItems();
      },
      { signal: this.abortController?.signal }
    );

    const pills = this.container.querySelectorAll<HTMLButtonElement>('.faq-pill');
    pills.forEach((pill) => {
      pill.addEventListener(
        'click',
        () => {
          pills.forEach((p) => p.classList.remove('is-active'));
          pill.classList.add('is-active');
          this.activeCategory = pill.getAttribute('data-category') || 'all';
          this.renderFaqItems();
        },
        { signal: this.abortController?.signal }
      );
    });

    const itemsContainer = this.container.querySelector<HTMLElement>('[data-ref="faq-items-container"]');
    itemsContainer?.addEventListener(
      'click',
      (e: MouseEvent) => {
        const trigger = (e.target as HTMLElement).closest<HTMLButtonElement>('.faq-item__trigger');
        if (!trigger) return;

        const item = trigger.closest<HTMLElement>('.faq-item');
        if (!item) return;

        const isOpen = item.classList.contains('is-open');
        item.classList.toggle('is-open', !isOpen);
        trigger.setAttribute('aria-expanded', String(!isOpen));
      },
      { signal: this.abortController?.signal }
    );
  }
}

export async function createHelpFaqView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/help/faq.html');
  const controller = new HelpFaqController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
