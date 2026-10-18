import { getFooterHtml, mountSiteFooter } from '../../components/footer.component.js';
import { renderIcons } from '../../services/icon.service.js';
import { loadTemplate } from '../../services/template.service.js';
import { ViewController } from '../../types/common.types.js';

interface FaqItem {
  answer: string;
  category: string;
  id: string;
  question: string;
}

interface FaqGroup {
  id: string;
  title: string;
}

const FAQ_GROUPS: FaqGroup[] = [
  { id: 'security', title: 'Seguridad y Privacidad' },
  { id: 'limits', title: 'Archivos y Límites' },
  { id: 'tools', title: 'Herramientas y Calidad' },
  { id: 'ai', title: 'PDF Intelligence (IA)' },
  { id: 'billing', title: 'Planes y Facturación' },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    answer: 'Tus archivos se almacenan temporalmente en servidores cifrados únicamente durante el tiempo estrictamente necesario para realizar el procesamiento. Una vez descargados o transcurrido un breve período (máximo 2 horas), son eliminados de forma automática y definitiva de nuestros servidores.',
    category: 'security',
    id: 'sec-1',
    question: '¿Qué sucede con mis archivos después de procesarlos?',
  },
  {
    answer: 'Nadie. Todo el proceso es 100% automatizado mediante código seguro y túneles cifrados TLS 1.3 con AES-256. Ningún miembro de nuestro equipo ni agentes externos tienen acceso a inspeccionar o visualizar tus documentos.',
    category: 'security',
    id: 'sec-2',
    question: '¿Quién tiene acceso para ver el contenido de mis documentos?',
  },
  {
    answer: 'No, rotundamente no. Tus documentos nunca son utilizados para entrenar, calibrar o reentrenar ningún modelo de inteligencia artificial propio ni de terceros. La privacidad y confidencialidad de tus datos es nuestro compromiso primordial.',
    category: 'security',
    id: 'sec-3',
    question: '¿Utilizan mis documentos para entrenar modelos de Inteligencia Artificial?',
  },
  {
    answer: 'Sí. Operamos con total apego al Reglamento General de Protección de Datos (GDPR) de la Unión Europea y aplicamos protocolos rigurosos de seguridad basados en las mejores prácticas de la norma ISO 27001.',
    category: 'security',
    id: 'sec-4',
    question: '¿Cumple Aurora con las normativas GDPR y estándares internacionales?',
  },
  {
    answer: 'En el plan gratuito puedes procesar documentos de hasta 500 MB por archivo. Los usuarios de Aurora Pro pueden subir archivos de hasta 5 GB, y para organizaciones disponemos de soluciones empresariales con límites adaptados a sus requerimientos.',
    category: 'limits',
    id: 'lim-1',
    question: '¿Cuál es el tamaño máximo de archivo permitido?',
  },
  {
    answer: 'Sí. Todas nuestras herramientas principales admiten la carga de múltiples archivos a la vez para procesamiento por lotes (batch processing), permitiéndote ahorrar tiempo en tareas repetitivas.',
    category: 'limits',
    id: 'lim-2',
    question: '¿Puedo procesar varios archivos simultáneamente?',
  },
  {
    answer: 'El plan gratuito ofrece un número generoso de tareas diarias estándar. Si necesitas procesamiento continuo de alto volumen y acceso sin colas prioritarias, te recomendamos el plan Aurora Pro.',
    category: 'limits',
    id: 'lim-3',
    question: '¿Cuántos archivos puedo convertir o procesar gratis cada día?',
  },
  {
    answer: 'Sí. Nuestros algoritmos de conversión analizan minuciosamente fuentes tipográficas, hojas de estilo, tablas, columnas e imágenes para reproducir con total fidelidad la maquetación original en el formato resultante.',
    category: 'tools',
    id: 'tool-1',
    question: '¿Se mantiene la calidad y el diseño original al convertir archivos?',
  },
  {
    answer: 'El motor OCR (Reconocimiento Óptico de Caracteres) examina las imágenes escaneadas de tu documento, identificando caracteres en decenas de idiomas y convirtiéndolos en texto digital seleccionable y editable.',
    category: 'tools',
    id: 'tool-2',
    question: '¿Cómo funciona la tecnología OCR para PDFs escaneados?',
  },
  {
    answer: 'No. Tus archivos originales en tu dispositivo nunca son modificados. El archivo resultante procesado se descarga como un nuevo archivo independiente en tu carpeta de descargas.',
    category: 'tools',
    id: 'tool-3',
    question: '¿Se sobreescriben mis archivos originales al editarlos en Aurora?',
  },
  {
    answer: 'El motor de PDF Intelligence puede analizar contratos legales, informes financieros, artículos académicos, manuales técnicos y libros completos, extrayendo conclusiones clave, resúmenes ejecutivos y tablas estructuradas.',
    category: 'ai',
    id: 'ai-1',
    question: '¿Qué tipo de documentos puede analizar la IA de Aurora?',
  },
  {
    answer: 'Soporta más de 40 idiomas, incluyendo español, inglés, francés, alemán, portugués, italiano, chino, japonés y más, conservando la estructura visual y los gráficos del documento original.',
    category: 'ai',
    id: 'ai-2',
    question: '¿En qué idiomas está disponible la traducción inteligente de PDFs?',
  },
  {
    answer: 'Extrae la estructura jerárquica del PDF (títulos, párrafos, listas con viñetas, tablas formateadas y bloques de código) y genera un documento Markdown limpio listo para su uso en LLMs o editores.',
    category: 'ai',
    id: 'ai-3',
    question: '¿Cómo funciona la conversión de PDF a Markdown?',
  },
  {
    answer: 'Sí. Puedes cancelar la renovación automática de tu suscripción en cualquier instante desde Ajustes > Facturación sin penalizaciones ni costes ocultos. Mantendrás todas las ventajas Pro hasta el fin del ciclo ya facturado.',
    category: 'billing',
    id: 'bill-1',
    question: '¿Puedo cancelar mi suscripción en cualquier momento?',
  },
  {
    answer: 'Aceptamos tarjetas de crédito y débito internacionales (Visa, Mastercard, American Express), así como pagos seguros a través de pasarelas certificadas con cifrado bancario de extremo a extremo.',
    category: 'billing',
    id: 'bill-2',
    question: '¿Qué métodos de pago son aceptados?',
  },
  {
    answer: 'Sí. Al realizar tu suscripción o desde tu panel de historial de compras podrás descargar tus facturas fiscales con todos tus datos corporativos y el desglose de impuestos correspondiente.',
    category: 'billing',
    id: 'bill-3',
    question: '¿Ofrecen factura para empresas y profesionales con validez fiscal?',
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
        if (!query) return true;
        return item.question.toLowerCase().includes(query) || item.answer.toLowerCase().includes(query);
      });

      if (items.length === 0) return '';
      renderedCount += items.length;

      const itemsHtml = items.map((item) => `
        <div class="faq-item" data-ref="faq-item-${item.id}">
          <button type="button" class="faq-item__trigger" data-ref="faq-trigger-${item.id}" aria-expanded="false">
            <span>${item.question}</span>
            <svg class="component-icon faq-item__chevron" aria-hidden="true"><use href="/icons.svg#expand_more"></use></svg>
          </button>
          <div class="faq-item__content" data-ref="faq-content-${item.id}">
            <div class="faq-item__inner" data-ref="faq-inner-${item.id}">
              <div class="faq-item__body" data-ref="faq-body-${item.id}">${item.answer}</div>
            </div>
          </div>
        </div>
      `).join('');

      return `
        <div class="faq-group" data-ref="faq-group-${group.id}">
          <div class="faq-group__header" data-ref="faq-group-header-${group.id}">
            <h2 class="faq-group__title" data-ref="faq-group-title-${group.id}">${group.title}</h2>
          </div>
          <div class="faq-accordion" data-ref="faq-accordion-${group.id}">
            ${itemsHtml}
          </div>
        </div>
      `;
    }).join('');

    if (renderedCount === 0) {
      itemsContainer.innerHTML = `
        <div class="faq-group" data-ref="faq-empty-state" style="text-align: center; padding: 48px 24px;">
          <h3 class="faq-group__title" data-ref="faq-empty-title" style="margin-bottom: 8px;">No se encontraron resultados</h3>
          <p class="settings-subtitle" data-ref="faq-empty-desc" style="margin: 0;">Intenta buscar con otras palabras o selecciona otra categoría.</p>
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
