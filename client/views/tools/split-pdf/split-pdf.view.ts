import { navigate } from '../../../app-router.js';
import { API_ROUTES } from '../../../config/api-routes.js';
import { postFormApi } from '../../../services/api.service.js';
import { pickDropboxFiles } from '../../../services/dropbox.service.js';
import { pickGoogleDriveFiles } from '../../../services/google-drive.service.js';
import { t } from '../../../services/i18n.service.js';
import { renderIcons } from '../../../services/icon.service.js';
import { loadPdfJs } from '../../../services/pdf-loader.service.js';
import { loadTemplate } from '../../../services/template.service.js';
import { showToast } from '../../../services/toast.service.js';
import { ViewController } from '../../../types/common.types.js';
import { setupToolSidebarModal, ToolSidebarModalController } from '../../../utils/dom.util.js';
import { PageItem, RangeItem, SplitMode, SplitPdfResponseData } from './split-pdf.types.js';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function parsePageNumbers(raw: string, maxPages: number): number[] {
  const result = new Set<number>();
  const parts = raw.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        const from = Math.max(1, Math.min(start, end));
        const to = Math.min(maxPages, Math.max(start, end));
        for (let i = from; i <= to; i++) {
          result.add(i);
        }
      }
    } else {
      const page = parseInt(trimmed, 10);
      if (!isNaN(page) && page >= 1 && page <= maxPages) {
        result.add(page);
      }
    }
  }
  return Array.from(result).sort((a, b) => a - b);
}

function formatPageNumbers(pages: number[]): string {
  if (pages.length === 0) return '';
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    if (curr === prev + 1) {
      prev = curr;
    } else {
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = curr;
      prev = curr;
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
  return ranges.join(', ');
}

export class SplitPdfController implements ViewController {
  private abortController: AbortController | null = null;
  private activeMode: SplitMode = 'range';
  private container: HTMLElement;
  private currentFile: File | null = null;
  private currentResult: SplitPdfResponseData | null = null;
  private fixedPageBlock = 1;
  private isProcessing = false;
  private pages: PageItem[] = [];
  private pagesSubmode: 'all' | 'custom' = 'all';
  private pdfDocument: any = null;
  private rangeSubmode: 'custom' | 'fixed' = 'custom';
  private ranges: RangeItem[] = [];
  private selectedPages: Set<number> = new Set();
  private sidebarModal: ToolSidebarModalController | null = null;
  private sizeLimitValue = 200;
  private sizeUnit: 'KB' | 'MB' = 'KB';

  constructor(container: HTMLElement, initialMode: SplitMode = 'range') {
    this.container = container;
    this.activeMode = initialMode;
  }

  public async init(): Promise<void> {
    this.abortController = new AbortController();
    renderIcons(this.container);
    if (this.activeMode !== 'range') {
      this.switchMode(this.activeMode);
      if (this.activeMode === 'pages') {
        const heroTitle = this.container.querySelector<HTMLElement>('[data-ref="pdf-hero-title"]');
        const heroSubtitle = this.container.querySelector<HTMLElement>('[data-ref="pdf-hero-subtitle"]');
        if (heroTitle) heroTitle.textContent = t('home.tool_extract_pdf_pages_title') || 'Extraer páginas';
        if (heroSubtitle) heroSubtitle.textContent = t('home.tool_extract_pdf_pages_desc') || 'Extrae páginas seleccionadas de tu documento PDF.';
      }
    }
    this.bindEvents();
  }

  public destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.sidebarModal) {
      this.sidebarModal.destroy();
      this.sidebarModal = null;
    }
    this.pdfDocument = null;
  }

  private async handleDriveImport(): Promise<void> {
    if (this.isProcessing) return;
    this.hideError();
    try {
      const files = await pickGoogleDriveFiles({ multiselect: false });
      if (files.length > 0) {
        await this.handleFileSelected(files[0]);
      }
    } catch (err: any) {
      this.showError(err?.message || 'Error al importar archivo desde Google Drive.');
    }
  }

  private async handleDropboxImport(): Promise<void> {
    if (this.isProcessing) return;
    this.hideError();
    try {
      const files = await pickDropboxFiles({ multiselect: false });
      if (files.length > 0) {
        await this.handleFileSelected(files[0]);
      }
    } catch (err: any) {
      this.showError(err?.message || 'Error al importar archivo desde Dropbox.');
    }
  }

  private bindEvents(): void {
    if (!this.abortController) return;
    const { signal } = this.abortController;

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="pdf-dropzone"]');
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-pdf"]');
    const heroDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive"]');
    const heroDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const sidebarBackdrop = this.container.querySelector<HTMLElement>('[data-ref="tool-sidebar-backdrop"]');
    const sidebarCloseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-close"]');
    const sidebarDragZone = this.container.querySelector<HTMLElement>('[data-ref="modal-drag-zone"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="pdf-splitter-sidebar"]');
    const changeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-change-pdf"]');
    const mainActionBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-main-action"]');
    const sidebarResetBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-reset"]');
    const downloadResultBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-download-result"]');
    const restartSplitBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-restart-split"]');
    const pagesGrid = this.container.querySelector<HTMLElement>('[data-ref="split-pages-grid"]');

    this.sidebarModal = setupToolSidebarModal({
      backdrop: sidebarBackdrop,
      closeBtn: sidebarCloseBtn,
      dragZone: sidebarDragZone,
      settingsBtn,
      sidebar,
      signal,
    });

    browseBtn?.addEventListener('click', () => {
      fileInput?.click();
    }, { signal });

    heroDriveBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void this.handleDriveImport();
    }, { signal });

    heroDropboxBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void this.handleDropboxImport();
    }, { signal });

    changeBtn?.addEventListener('click', () => {
      fileInput?.click();
    }, { signal });

    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('is-dragover');
    }, { signal });

    dropzone?.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
    }, { signal });

    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        void this.handleFileSelected(files[0]);
      }
    }, { signal });

    fileInput?.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        void this.handleFileSelected(fileInput.files[0]);
      }
    }, { signal });

    mainActionBtn?.addEventListener('click', () => {
      if (this.currentResult) {
        this.downloadSplitResult();
      } else if (!this.currentFile) {
        fileInput?.click();
      } else {
        void this.startSplitProcess();
      }
    }, { signal });

    sidebarResetBtn?.addEventListener('click', () => {
      this.resetToInitial();
    }, { signal });

    downloadResultBtn?.addEventListener('click', () => {
      this.downloadSplitResult();
    }, { signal });

    restartSplitBtn?.addEventListener('click', () => {
      this.resetToInitial();
    }, { signal });

    const tabRange = this.container.querySelector<HTMLButtonElement>('[data-ref="tab-range"]');
    const tabPages = this.container.querySelector<HTMLButtonElement>('[data-ref="tab-pages"]');
    const tabSize = this.container.querySelector<HTMLButtonElement>('[data-ref="tab-size"]');

    tabRange?.addEventListener('click', () => this.switchMode('range'), { signal });
    tabPages?.addEventListener('click', () => this.switchMode('pages'), { signal });
    tabSize?.addEventListener('click', () => this.switchMode('size'), { signal });

    const btnRangeCustom = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-range-submode-custom"]');
    const btnRangeFixed = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-range-submode-fixed"]');

    btnRangeCustom?.addEventListener('click', () => {
      this.rangeSubmode = 'custom';
      btnRangeCustom.classList.add('is-active');
      btnRangeFixed?.classList.remove('is-active');
      this.updateSubmodeViews();
      this.renderPagesWorkspace();
      this.updateSummary();
    }, { signal });

    btnRangeFixed?.addEventListener('click', () => {
      this.rangeSubmode = 'fixed';
      btnRangeFixed.classList.add('is-active');
      btnRangeCustom?.classList.remove('is-active');
      this.updateSubmodeViews();
      this.renderPagesWorkspace();
      this.updateSummary();
    }, { signal });

    const btnAddRange = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-add-range"]');
    btnAddRange?.addEventListener('click', () => {
      this.addNewRange();
    }, { signal });

    const inputFixedPages = this.container.querySelector<HTMLInputElement>('[data-ref="input-fixed-pages"]');
    inputFixedPages?.addEventListener('input', () => {
      const val = parseInt(inputFixedPages.value, 10);
      this.fixedPageBlock = isNaN(val) || val < 1 ? 1 : Math.min(val, this.pages.length || 1);
      this.updateSummary();
    }, { signal });

    const checkMergeRanges = this.container.querySelector<HTMLInputElement>('[data-ref="check-merge-ranges"]');
    checkMergeRanges?.addEventListener('change', () => {
      this.updateSummary();
    }, { signal });

    const btnPagesAll = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-pages-submode-all"]');
    const btnPagesCustom = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-pages-submode-custom"]');

    btnPagesAll?.addEventListener('click', () => {
      this.pagesSubmode = 'all';
      btnPagesAll.classList.add('is-active');
      btnPagesCustom?.classList.remove('is-active');
      this.updateSubmodeViews();
      this.renderPagesWorkspace();
      this.updateSummary();
    }, { signal });

    btnPagesCustom?.addEventListener('click', () => {
      this.pagesSubmode = 'custom';
      btnPagesCustom.classList.add('is-active');
      btnPagesAll?.classList.remove('is-active');
      this.updateSubmodeViews();
      this.renderPagesWorkspace();
      this.updateSummary();
    }, { signal });

    const inputPagesSelection = this.container.querySelector<HTMLInputElement>('[data-ref="input-pages-selection"]');
    inputPagesSelection?.addEventListener('input', () => {
      const parsed = parsePageNumbers(inputPagesSelection.value, this.pages.length);
      this.selectedPages = new Set(parsed);
      this.renderPagesWorkspace();
      this.updateSummary();
    }, { signal });

    const checkMergePages = this.container.querySelector<HTMLInputElement>('[data-ref="check-merge-pages"]');
    checkMergePages?.addEventListener('change', () => {
      this.updateSummary();
    }, { signal });

    const inputMaxSize = this.container.querySelector<HTMLInputElement>('[data-ref="input-max-size"]');
    inputMaxSize?.addEventListener('input', () => {
      const val = parseInt(inputMaxSize.value, 10);
      this.sizeLimitValue = isNaN(val) || val < 10 ? 10 : val;
      this.updateSizeNotice();
      this.updateSummary();
    }, { signal });

    const btnUnitKb = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-unit-kb"]');
    const btnUnitMb = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-unit-mb"]');

    btnUnitKb?.addEventListener('click', () => {
      this.sizeUnit = 'KB';
      btnUnitKb.classList.add('is-active');
      btnUnitMb?.classList.remove('is-active');
      this.updateSizeNotice();
      this.updateSummary();
    }, { signal });

    btnUnitMb?.addEventListener('click', () => {
      this.sizeUnit = 'MB';
      btnUnitMb.classList.add('is-active');
      btnUnitKb?.classList.remove('is-active');
      this.updateSizeNotice();
      this.updateSummary();
    }, { signal });

    pagesGrid?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const card = target.closest<HTMLElement>('.split-page-card[data-page]');
      if (!card) return;

      const pageNum = parseInt(card.getAttribute('data-page') || '', 10);
      if (isNaN(pageNum)) return;

      if (this.activeMode === 'pages') {
        if (this.pagesSubmode === 'all') {
          this.pagesSubmode = 'custom';
          btnPagesCustom?.click();
        }
        if (this.selectedPages.has(pageNum)) {
          this.selectedPages.delete(pageNum);
        } else {
          this.selectedPages.add(pageNum);
        }
        if (inputPagesSelection) {
          inputPagesSelection.value = formatPageNumbers(Array.from(this.selectedPages));
        }
        this.renderPagesWorkspace();
        this.updateSummary();
      }
    }, { signal });
  }

  public async handleFileSelected(file: File): Promise<void> {
    if (this.isProcessing) return;
    this.hideError();

    const isPdfExt = file.name.toLowerCase().endsWith('.pdf');
    const isPdfMime = file.type === 'application/pdf' || file.type === 'application/x-pdf';
    if (!isPdfExt && !isPdfMime) {
      this.showError('Selecciona únicamente un documento en formato PDF.');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      this.showError('El archivo PDF seleccionado supera el límite permitido de 50 MB.');
      return;
    }

    this.currentFile = file;

    try {
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({
        cMapPacked: true,
        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/cmaps/',
        data: new Uint8Array(arrayBuffer),
        standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/standard_fonts/',
      });
      this.pdfDocument = await loadingTask.promise;
      const count = this.pdfDocument.numPages || 1;

      this.pages = Array.from({ length: count }, (_, i) => ({
        id: `page-${i + 1}`,
        num: i + 1,
      }));

      this.ranges = [
        {
          from: 1,
          id: `range-${Date.now()}-1`,
          to: count,
        },
      ];

      this.selectedPages = new Set(this.pages.map((p) => p.num));
      const inputPagesSelection = this.container.querySelector<HTMLInputElement>('[data-ref="input-pages-selection"]');
      if (inputPagesSelection) {
        inputPagesSelection.value = formatPageNumbers(Array.from(this.selectedPages));
      }

      const defaultOutput = file.name.replace(/\.pdf$/i, '') + '_dividido.pdf';
      const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
      if (outputNameInput) {
        outputNameInput.value = defaultOutput;
      }

      this.renderFilesView();
      this.renderRangesInputs();
      this.updateSizeNotice();
      this.updateSummary();

      for (const page of this.pages) {
        void this.generatePageThumbnail(page);
      }
    } catch {
      this.showError('No se pudo leer el archivo PDF seleccionado. Asegúrate de que no esté dañado o protegido.');
      this.resetToInitial();
    }
  }

  private async generatePageThumbnail(item: PageItem): Promise<void> {
    if (!this.pdfDocument) return;
    try {
      const page = await this.pdfDocument.getPage(item.num);
      const origViewport = page.getViewport({ scale: 1 });
      const targetWidth = 220;
      const scale = targetWidth / Math.max(origViewport.width, 1);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({
          canvas,
          canvasContext: ctx,
          viewport,
        }).promise;

        item.thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.85);

        const sheets = this.container.querySelectorAll<HTMLElement>(`[data-ref="sheet-page-${item.num}"]`);
        sheets.forEach((sheet) => {
          sheet.innerHTML = `<img class="split-page-card__preview-img" data-ref="img-page-${item.num}" src="${item.thumbnailDataUrl}" alt="Página ${item.num}" />`;
        });
      }
    } catch {}
  }

  private switchMode(mode: SplitMode): void {
    this.activeMode = mode;

    const tabRange = this.container.querySelector<HTMLButtonElement>('[data-ref="tab-range"]');
    const tabPages = this.container.querySelector<HTMLButtonElement>('[data-ref="tab-pages"]');
    const tabSize = this.container.querySelector<HTMLButtonElement>('[data-ref="tab-size"]');

    tabRange?.classList.toggle('is-active', mode === 'range');
    tabPages?.classList.toggle('is-active', mode === 'pages');
    tabSize?.classList.toggle('is-active', mode === 'size');

    const panelRange = this.container.querySelector<HTMLElement>('[data-ref="panel-mode-range"]');
    const panelPages = this.container.querySelector<HTMLElement>('[data-ref="panel-mode-pages"]');
    const panelSize = this.container.querySelector<HTMLElement>('[data-ref="panel-mode-size"]');

    if (panelRange) panelRange.style.display = mode === 'range' ? 'block' : 'none';
    if (panelPages) panelPages.style.display = mode === 'pages' ? 'block' : 'none';
    if (panelSize) panelSize.style.display = mode === 'size' ? 'block' : 'none';

    const hint = this.container.querySelector<HTMLElement>('[data-ref="split-instruction-text"]');
    if (hint) {
      if (mode === 'range') {
        hint.textContent = 'Configura los rangos de páginas que deseas extraer a la derecha.';
      } else if (mode === 'pages') {
        hint.textContent = 'Haz clic en las tarjetas de página o especifica los números a extraer en el panel.';
      } else {
        hint.textContent = 'Define el peso máximo de cada segmento para dividir el documento equitativamente.';
      }
    }

    this.renderPagesWorkspace();
    this.updateSummary();
  }

  private updateSubmodeViews(): void {
    const rangeCustom = this.container.querySelector<HTMLElement>('[data-ref="section-range-custom"]');
    const rangeFixed = this.container.querySelector<HTMLElement>('[data-ref="section-range-fixed"]');
    if (rangeCustom) rangeCustom.style.display = this.rangeSubmode === 'custom' ? 'block' : 'none';
    if (rangeFixed) rangeFixed.style.display = this.rangeSubmode === 'fixed' ? 'block' : 'none';

    const pagesCustom = this.container.querySelector<HTMLElement>('[data-ref="section-pages-custom"]');
    const notice = this.container.querySelector<HTMLElement>('[data-ref="txt-pages-info-notice"]');
    if (pagesCustom) pagesCustom.style.display = this.pagesSubmode === 'custom' ? 'block' : 'none';
    if (notice) {
      notice.textContent = this.pagesSubmode === 'all'
        ? `Cada una de las ${this.pages.length} páginas se extraerá como un archivo PDF individual.`
        : 'Las páginas seleccionadas se extraerán según la opción seleccionada.';
    }
  }

  private updateSizeNotice(): void {
    const notice = this.container.querySelector<HTMLElement>('[data-ref="txt-size-info-notice"]');
    if (notice) {
      notice.textContent = `Este PDF se dividirá en archivos de no más de ${this.sizeLimitValue} ${this.sizeUnit} cada uno.`;
    }
  }

  private addNewRange(): void {
    const total = this.pages.length || 1;
    let nextStart = 1;
    if (this.ranges.length > 0) {
      const last = this.ranges[this.ranges.length - 1];
      nextStart = Math.min(total, last.to + 1);
    }

    this.ranges.push({
      from: nextStart,
      id: `range-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      to: total,
    });

    this.renderRangesInputs();
    this.renderPagesWorkspace();
    this.updateSummary();
  }

  private removeRange(id: string): void {
    if (this.ranges.length <= 1) return;
    this.ranges = this.ranges.filter((r) => r.id !== id);
    this.renderRangesInputs();
    this.renderPagesWorkspace();
    this.updateSummary();
  }

  private renderRangesInputs(): void {
    const container = this.container.querySelector<HTMLElement>('[data-ref="split-ranges-list"]');
    if (!container) return;

    const total = this.pages.length || 1;

    container.innerHTML = this.ranges.map((range, index) => {
      const canDelete = this.ranges.length > 1;
      return `
        <div class="split-range-card" data-ref="range-card-${range.id}" data-id="${range.id}">
          <div class="split-range-card__header">
            <span class="split-range-card__title">Rango ${index + 1}</span>
            ${canDelete ? `
              <button type="button" class="split-range-card__btn-delete" data-ref="btn-delete-range" data-id="${range.id}" title="Eliminar rango">
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#close"></use></svg>
              </button>
            ` : ''}
          </div>
          <div class="split-range-card__inputs">
            <label class="field" data-ref="field-range-from-${range.id}">
              <input class="field__input" data-ref="input-range-from" data-id="${range.id}" type="number" min="1" max="${total}" value="${range.from}" />
              <span class="field__label">Desde pág.</span>
            </label>
            <label class="field" data-ref="field-range-to-${range.id}">
              <input class="field__input" data-ref="input-range-to" data-id="${range.id}" type="number" min="1" max="${total}" value="${range.to}" />
              <span class="field__label">Hasta pág.</span>
            </label>
          </div>
        </div>
      `;
    }).join('');

    renderIcons(container);

    container.querySelectorAll<HTMLButtonElement>('[data-ref="btn-delete-range"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (id) this.removeRange(id);
      });
    });

    container.querySelectorAll<HTMLInputElement>('[data-ref="input-range-from"]').forEach((input) => {
      input.addEventListener('input', () => {
        const id = input.getAttribute('data-id');
        const found = this.ranges.find((r) => r.id === id);
        if (found) {
          const val = parseInt(input.value, 10);
          found.from = isNaN(val) ? 1 : Math.max(1, Math.min(total, val));
          this.renderPagesWorkspace();
          this.updateSummary();
        }
      });
    });

    container.querySelectorAll<HTMLInputElement>('[data-ref="input-range-to"]').forEach((input) => {
      input.addEventListener('input', () => {
        const id = input.getAttribute('data-id');
        const found = this.ranges.find((r) => r.id === id);
        if (found) {
          const val = parseInt(input.value, 10);
          found.to = isNaN(val) ? total : Math.max(1, Math.min(total, val));
          this.renderPagesWorkspace();
          this.updateSummary();
        }
      });
    });
  }

  private renderFilesView(): void {
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-dropzone-card"]');
    const itemsCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-items-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-processing-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-result-card"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="pdf-splitter-workspace"]');
    const badge = this.container.querySelector<HTMLElement>('[data-ref="pdf-count-badge"]');
    const title = this.container.querySelector<HTMLElement>('[data-ref="pdf-file-title"]');

    if (!itemsCard) return;

    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (processingCard) processingCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'none';
    if (itemsCard) itemsCard.style.display = 'flex';
    if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="pdf-splitter-sidebar"]');
    if (sidebar) sidebar.style.display = 'flex';
    const settingsBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
    if (settingsBtn) settingsBtn.classList.add('is-visible');

    if (badge) badge.textContent = `${this.pages.length} págs.`;
    if (title && this.currentFile) {
      title.innerHTML = `${this.currentFile.name} (<span data-ref="pdf-count-badge">${this.pages.length} págs.</span>)`;
    }

    const valOrigBytes = this.container.querySelector<HTMLElement>('[data-ref="val-size-orig-bytes"]');
    const valOrigPages = this.container.querySelector<HTMLElement>('[data-ref="val-size-orig-pages"]');
    if (valOrigBytes && this.currentFile) valOrigBytes.textContent = formatBytes(this.currentFile.size);
    if (valOrigPages) valOrigPages.textContent = this.pages.length.toString();

    this.renderPagesWorkspace();
    this.updateActionButtons();
  }

  private renderPagesWorkspace(): void {
    const grid = this.container.querySelector<HTMLElement>('[data-ref="split-pages-grid"]');
    if (!grid) return;

    if (this.activeMode === 'range' && this.rangeSubmode === 'custom') {
      grid.innerHTML = this.ranges.map((range, idx) => {
        const from = Math.max(1, range.from);
        const to = Math.min(this.pages.length, Math.max(from, range.to));
        const pagesInRange = this.pages.filter((p) => p.num >= from && p.num <= to);

        return `
          <div class="split-range-block" data-ref="range-block-${range.id}">
            <div class="split-range-block__header">
              <span>Rango ${idx + 1} (Páginas ${from} a ${to})</span>
              <span class="tool-badge">${pagesInRange.length} ${pagesInRange.length === 1 ? 'pág.' : 'págs.'}</span>
            </div>
            <div class="split-range-block__pages">
              ${pagesInRange.map((p) => this.renderPageCardHtml(p, false)).join('')}
            </div>
          </div>
        `;
      }).join('');
    } else {
      grid.innerHTML = `
        <div class="split-pages-plain-grid">
          ${this.pages.map((p) => {
            let isSelected = false;
            let isDimmed = false;
            if (this.activeMode === 'pages') {
              isSelected = this.pagesSubmode === 'all' || this.selectedPages.has(p.num);
              isDimmed = this.pagesSubmode === 'custom' && !this.selectedPages.has(p.num);
            }
            return this.renderPageCardHtml(p, isSelected, isDimmed);
          }).join('')}
        </div>
      `;
    }

    renderIcons(grid);
  }

  private renderPageCardHtml(page: PageItem, isSelected: boolean, isDimmed = false): string {
    const sheetContent = page.thumbnailDataUrl
      ? `<img class="split-page-card__preview-img" data-ref="img-page-${page.num}" src="${page.thumbnailDataUrl}" alt="Página ${page.num}" />`
      : `
        <div class="split-page-card__placeholder">
          <svg class="component-icon split-page-card__placeholder-icon" aria-hidden="true"><use href="/icons.svg#picture_as_pdf"></use></svg>
          <span style="font-size: 0.75rem; color: var(--text-tertiary);">${page.num}</span>
        </div>
      `;

    const selectedClass = isSelected ? 'is-selected' : '';
    const dimmedClass = isDimmed ? 'is-dimmed' : '';

    return `
      <div class="split-page-card ${selectedClass} ${dimmedClass}" data-ref="card-page-${page.num}" data-page="${page.num}">
        <div class="split-page-card__order-badge">#${page.num}</div>
        <div class="split-page-card__check-badge">
          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#check"></use></svg>
        </div>
        <div class="split-page-card__sheet-wrapper">
          <div class="split-page-card__sheet" data-ref="sheet-page-${page.num}">
            ${sheetContent}
          </div>
        </div>
        <span class="split-page-card__page-num">Página ${page.num}</span>
      </div>
    `;
  }

  private updateSummary(): void {
    const summaryFilesEl = this.container.querySelector<HTMLElement>('[data-ref="val-summary-files"]');
    const summaryPagesEl = this.container.querySelector<HTMLElement>('[data-ref="val-summary-pages"]');
    const summarySizeEl = this.container.querySelector<HTMLElement>('[data-ref="val-summary-size"]');

    const totalPages = this.pages.length;
    let expectedFiles = 1;

    if (this.activeMode === 'range') {
      if (this.rangeSubmode === 'fixed') {
        const blockSize = Math.max(1, this.fixedPageBlock);
        expectedFiles = Math.ceil(totalPages / blockSize);
      } else {
        const checkMerge = this.container.querySelector<HTMLInputElement>('[data-ref="check-merge-ranges"]');
        if (checkMerge?.checked) {
          expectedFiles = 1;
        } else {
          expectedFiles = this.ranges.length;
        }
      }
    } else if (this.activeMode === 'pages') {
      const checkMerge = this.container.querySelector<HTMLInputElement>('[data-ref="check-merge-pages"]');
      if (this.pagesSubmode === 'all') {
        expectedFiles = checkMerge?.checked ? 1 : totalPages;
      } else {
        expectedFiles = checkMerge?.checked ? 1 : Math.max(1, this.selectedPages.size);
      }
    } else {
      expectedFiles = Math.max(1, Math.ceil(totalPages / 2));
    }

    if (summaryFilesEl) {
      summaryFilesEl.textContent = expectedFiles === 1 ? '1 archivo (PDF)' : `${expectedFiles} archivos (ZIP)`;
    }
    if (summaryPagesEl) {
      summaryPagesEl.textContent = `${totalPages} ${totalPages === 1 ? 'página' : 'páginas'}`;
    }
    if (summarySizeEl && this.currentFile) {
      summarySizeEl.textContent = formatBytes(this.currentFile.size);
    }

    this.updateActionButtons();
  }

  private updateActionButtons(): void {
    const mainBtnText = this.container.querySelector<HTMLElement>('[data-ref="txt-main-action"]');
    const mainBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-main-action"]');
    const resetBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-reset"]');

    if (!mainBtnText || !mainBtn) return;

    if (this.currentResult) {
      mainBtnText.textContent = t('tools.split_pdf_btn_download') || 'Descargar PDF(s) Dividido(s)';
      if (resetBtn) resetBtn.style.display = '';
    } else if (this.currentFile) {
      mainBtnText.textContent = t('tools.split_pdf_btn_split') || 'Dividir PDF';
      if (resetBtn) resetBtn.style.display = '';
    } else {
      mainBtnText.textContent = t('tools.split_pdf_btn_select') || 'Seleccionar PDF';
      if (resetBtn) resetBtn.style.display = 'none';
    }
  }

  private async startSplitProcess(): Promise<void> {
    if (this.isProcessing || !this.currentFile) return;

    this.isProcessing = true;
    this.hideError();
    this.showProcessingState();

    try {
      const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
      let customFilename = outputNameInput?.value.trim() || 'documento_dividido.pdf';

      const checkMergeRanges = this.container.querySelector<HTMLInputElement>('[data-ref="check-merge-ranges"]');
      const checkMergePages = this.container.querySelector<HTMLInputElement>('[data-ref="check-merge-pages"]');

      let optionsPayload: any = {
        filename: customFilename,
        mode: this.activeMode,
      };

      if (this.activeMode === 'range') {
        optionsPayload = {
          ...optionsPayload,
          fixedPageCount: this.fixedPageBlock,
          mergeSelected: checkMergeRanges?.checked || false,
          ranges: this.ranges.map((r) => ({ from: r.from, to: r.to })),
          submode: this.rangeSubmode,
        };
      } else if (this.activeMode === 'pages') {
        optionsPayload = {
          ...optionsPayload,
          mergeSelected: checkMergePages?.checked || false,
          selectedPages: Array.from(this.selectedPages),
          submode: this.pagesSubmode,
        };
      } else if (this.activeMode === 'size') {
        const multiplier = this.sizeUnit === 'MB' ? 1024 * 1024 : 1024;
        optionsPayload = {
          ...optionsPayload,
          maxSizeBytes: this.sizeLimitValue * multiplier,
        };
      }

      const formData = new FormData();
      formData.append('pdf', this.currentFile, this.currentFile.name);
      formData.append('options', JSON.stringify(optionsPayload));

      const response = await postFormApi(API_ROUTES.tools.splitPdf.split, formData);
      const json = await response.json();

      if (!response.ok || !json.success) {
        const errorMsg = json.error || 'No se pudo dividir el documento PDF. Intenta nuevamente.';
        this.showError(errorMsg);
        this.renderFilesView();
        return;
      }

      this.currentResult = json.data as SplitPdfResponseData;
      const token = this.currentResult.fileId;
      const downloadPayload = {
        downloadUrl: `/api/download/${token}`,
        fileSize: this.currentResult.fileSize,
        filename: this.currentResult.filename,
        returnText: 'Dividir otro documento PDF',
        returnUrl: '/split-pdf',
        subtitle: `Se ha dividido exitosamente "${this.currentFile?.name}".`,
        title: '¡PDF dividido con éxito!',
        token,
      };
      sessionStorage.setItem('download_ready_data', JSON.stringify(downloadPayload));
      showToast('¡Documento PDF dividido exitosamente!', 'success');
      navigate(`/download/${token}`);
    } catch {
      this.showError('Ha ocurrido un error inesperado al procesar el archivo. Por favor intenta más tarde.');
      this.renderFilesView();
    } finally {
      this.isProcessing = false;
    }
  }

  private showProcessingState(): void {
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-dropzone-card"]');
    const itemsCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-items-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-processing-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-result-card"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="pdf-splitter-workspace"]');

    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (itemsCard) itemsCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'none';
    if (processingCard) processingCard.style.display = 'flex';
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
  }

  private renderResultState(result: SplitPdfResponseData): void {
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-dropzone-card"]');
    const itemsCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-items-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-processing-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-result-card"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="pdf-splitter-workspace"]');

    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (itemsCard) itemsCard.style.display = 'none';
    if (processingCard) processingCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'flex';
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');

    const nameEl = this.container.querySelector<HTMLElement>('[data-ref="result-file-name"]');
    const partsEl = this.container.querySelector<HTMLElement>('[data-ref="result-parts-count"]');
    const pagesEl = this.container.querySelector<HTMLElement>('[data-ref="result-total-pages"]');
    const sizeEl = this.container.querySelector<HTMLElement>('[data-ref="result-file-size"]');
    const downloadTxt = this.container.querySelector<HTMLElement>('[data-ref="txt-download-result"]');

    if (nameEl) nameEl.textContent = result.filename;
    if (partsEl) partsEl.textContent = `${result.partsCount} ${result.partsCount === 1 ? 'archivo' : 'archivos'}`;
    if (pagesEl) pagesEl.textContent = `${result.totalPages} ${result.totalPages === 1 ? 'página' : 'páginas'}`;
    if (sizeEl) sizeEl.textContent = formatBytes(result.fileSize);
    if (downloadTxt) {
      downloadTxt.textContent = result.isZip ? 'Descargar Archivos (.ZIP)' : 'Descargar PDF Dividido';
    }

    this.updateActionButtons();
    renderIcons(this.container);
  }

  private downloadSplitResult(): void {
    if (!this.currentResult) return;
    const downloadUrl = this.currentResult.downloadUrl || API_ROUTES.tools.splitPdf.download(this.currentResult.fileId);
    const filename = this.currentResult.filename || 'documento_dividido.zip';

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast('Iniciando descarga del archivo...', 'success');
  }

  private resetToInitial(): void {
    this.currentFile = null;
    this.currentResult = null;
    this.isProcessing = false;
    this.pages = [];
    this.ranges = [];
    this.selectedPages.clear();
    this.pdfDocument = null;

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-dropzone-card"]');
    const itemsCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-items-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-processing-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-result-card"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="pdf-splitter-workspace"]');
    const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');

    if (fileInput) fileInput.value = '';
    if (outputNameInput) outputNameInput.value = 'documento_dividido.pdf';

    if (processingCard) processingCard.style.display = 'none';
    if (itemsCard) itemsCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'none';
    if (dropzoneCard) dropzoneCard.style.display = 'flex';
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="pdf-splitter-sidebar"]');
    if (sidebar) sidebar.style.display = 'none';
    const settingsBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    if (this.sidebarModal) this.sidebarModal.close();

    this.updateSummary();
    this.updateActionButtons();
    this.hideError();
  }

  private showError(msg: string): void {
    const banner = this.container.querySelector<HTMLElement>('[data-ref="split-pdf-error"]');
    if (banner) {
      banner.textContent = msg;
      banner.style.display = '';
    }
  }

  private hideError(): void {
    const banner = this.container.querySelector<HTMLElement>('[data-ref="split-pdf-error"]');
    if (banner) {
      banner.textContent = '';
      banner.style.display = 'none';
    }
  }
}

export async function createSplitPdfView(initialMode: SplitMode = 'range'): Promise<HTMLElement> {
  const container = await loadTemplate('/views/tools/split-pdf/split-pdf.html');
  const controller = new SplitPdfController(container, initialMode);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
