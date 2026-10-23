import { getFooterHtml, mountSiteFooter } from '../../components/footer.component.js';
import { ToolItem, TOOLS_REGISTRY } from '../../config/tools.registry.js';
import { t } from '../../services/i18n.service.js';
import { renderIcons } from '../../services/icon.service.js';
import { navigate } from '../../services/navigation.service.js';
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

const DETAILED_TOOL_DESCRIPTIONS: Record<string, string> = {
  'compare-pdf': 'Compara visual y textualmente dos versiones de un documento PDF para identificar al instante páginas añadidas, textos modificados o diferencias de maquetación entre ambas revisiones.',
  'compress-pdf': 'Reduce el peso de tus documentos PDF optimizando fuentes incrustadas e imágenes internas sin sacrificar legibilidad. Ideal para compartir por correo o subir a portales con restricciones estrictas de tamaño.',
  'crop-pdf': 'Recorta los márgenes o encuadra secciones específicas de tus páginas PDF para eliminar bordes sobrantes de escaneo o ajustar el formato para lectura en dispositivos móviles.',
  'edit-pdf': 'Añade anotaciones, cuadros de texto, formas geométricas y firmas digitales sobre cualquier página de tu documento mediante nuestro lienzo interactivo en línea sin marcas de agua.',
  'excel-to-pdf': 'Transforma hojas de cálculo de Microsoft Excel (XLS, XLSX) en documentos PDF limpios y proporcionados, preservando celdas, formatos numéricos y tablas ordenadas.',
  'extract-pdf-pages': 'Extrae páginas seleccionadas o rangos personalizados de un documento extenso para generar un nuevo archivo PDF independiente manteniendo la fidelidad tipográfica intacta.',
  'html-to-pdf': 'Convierte páginas web y fragmentos de código HTML en documentos PDF de alta fidelidad con preservación exacta de estilos CSS, imágenes y enlaces interactivos.',
  'jpg-to-pdf': 'Convierte imágenes JPG, PNG, WEBP o TIFF en un único documento PDF con ajuste automático de orientación, márgenes uniformes y compresión equilibrada.',
  'merge-pdf': 'Une múltiples documentos PDF en un solo archivo continuo. Carga tus archivos desde tu equipo, reordena las páginas arrastrando las miniaturas interactivas y descarga tu PDF consolidado.',
  'ocr-pdf': 'Aplica reconocimiento óptico neuronal de caracteres para transformar documentos escaneados e imágenes de baja resolución en texto seleccionable, editable y listo para búsqueda.',
  'organize-pdf': 'Estructura tus documentos organizando páginas en minutos. Sube tus archivos, elimina hojas innecesarias, gira orientaciones y arrastra las miniaturas para ordenar la secuencia a tu gusto.',
  'page-numbers': 'Inserta números correlativos en tus archivos PDF con control total sobre posición (encabezado o pie), estilo numérico, tamaño de tipografía y rango de páginas aplicable.',
  'pdf-to-excel': 'Extrae tablas de datos, balances contables y listados desde archivos PDF hacia hojas de cálculo de Excel (XLSX) estructuradas y listas para análisis financiero.',
  'pdf-to-jpg': 'Exporta cada página de tu archivo PDF como imágenes independientes en formato JPG o PNG de alta resolución, o extrae todas las fotografías incrustadas en un solo clic.',
  'pdf-to-markdown': 'Exporta el contenido y estructura de tus archivos PDF a sintaxis Markdown limpia, facilitando la integración de apuntes y documentación en Obsidian, Notion o GitHub.',
  'pdf-to-pdfa': 'Transforma documentos PDF al formato de archivado estándar PDF/A (ISO 19005), asegurando preservación a largo plazo y validez legal inmutable en trámites oficiales.',
  'pdf-to-powerpoint': 'Convierte diapositivas PDF en presentaciones editables de PowerPoint (PPTX), permitiendo modificar bloques de texto, diagramas y estilos con facilidad.',
  'pdf-to-word': 'Convierte archivos PDF a documentos de Microsoft Word (DOCX) con máxima preservación de párrafos, tablas, columnas y estilos visuales para facilitar su edición posterior.',
  'powerpoint-to-pdf': 'Convierte tus presentaciones de PowerPoint (PPT, PPTX) en archivos PDF profesionales listos para enviar a clientes o proyectar sin desconfiguración de tipografías.',
  'protect-pdf': 'Cifra documentos confidenciales mediante contraseña y algoritmos avanzados AES de 256 bits, restringiendo lectura, copia o impresión no autorizada.',
  'redact-pdf': 'Oculta y elimina permanentemente datos confidenciales, números de documento y claves de tus archivos PDF sin posibilidad de recuperación a través de metadatos.',
  'remove-pdf-pages': 'Elimina con precisión hojas duplicadas, páginas en blanco o información no requerida de tu PDF simplemente marcando las miniaturas que deseas descartar.',
  'repair-pdf': 'Analiza y repara documentos PDF dañados o corruptos, restaurando la tabla de referencias cruzadas y rescatando el contenido visual legible para volver a usarlos.',
  'rotate-pdf': 'Gira páginas desalineadas en ángulos de 90°, 180° o 270° tanto de manera individual como en todo el documento para garantizar una lectura perfectamente orientada.',
  'split-pdf': 'Separa un documento PDF extenso en archivos individuales por rangos específicos de páginas o divide cada hoja en un archivo independiente con máxima rapidez.',
  'summarize-pdf': 'Sintetiza documentos extensos mediante Inteligencia Artificial, extrayendo los puntos clave, conclusiones principales y resúmenes ejecutivos en breves segundos.',
  'translate-pdf': 'Traduce documentos PDF a más de 30 idiomas conservando de manera precisa la maquetación original, tipografía y disposición de tablas y gráficos.',
  'unlock-pdf': 'Elimina contraseñas de protección y restricciones de edición de tus documentos PDF para habilitar libre lectura, copiado de texto e impresión sin trabas.',
  'watermark-pdf': 'Estampa marcas de agua de texto o logotipos gráficos sobre tus páginas PDF, personalizando tipografía, transparencia, tamaño y ángulo de inclinación.',
  'word-to-pdf': 'Convierte archivos de Microsoft Word (DOC, DOCX) a documentos PDF profesionales con renderizado perfecto de fuentes, márgenes, tablas e hipervínculos.',
};

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
          <p class="docs-tool-card__desc" data-ref="docs-card-desc-${tool.id}">${DETAILED_TOOL_DESCRIPTIONS[tool.id] || t(tool.descKey)}</p>
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
