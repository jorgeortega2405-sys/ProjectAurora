import { navigate } from '../../../app-router.js';
import { API_ROUTES } from '../../../config/api-routes.js';
import { getCurrentUserToolLimits } from '../../../config/tools-limits.config.js';
import { postFormApi } from '../../../services/api.service.js';
import { pickDropboxFiles } from '../../../services/dropbox.service.js';
import { pickGoogleDriveFiles } from '../../../services/google-drive.service.js';
import { renderIcons } from '../../../services/icon.service.js';
import { loadPdfJs } from '../../../services/pdf-loader.service.js';
import { loadTemplate } from '../../../services/template.service.js';
import { showToast } from '../../../services/toast.service.js';
import { ViewController } from '../../../types/common.types.js';
import { setupDropdown, setupToolSidebarModal, ToolSidebarModalController, withButtonLoading } from '../../../utils/dom.util.js';
import { PageNumberMargin, PageNumberMode, PageNumberPosition, PageNumberResponseData, PageThumbnailItem } from './page-numbers.types.js';

export class PageNumbersController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private currentFile: File | null = null;
  private dropdownControllers: Array<{ destroy: () => void }> = [];
  private firstPageIsCover = false;
  private fontFamily = 'Helvetica';
  private fontSize = 11;
  private format = '{n}';
  private isProcessing = false;
  private margin: PageNumberMargin = 'recommended';
  private mode: PageNumberMode = 'single';
  private pages: PageThumbnailItem[] = [];
  private pdfDocument: any = null;
  private position: PageNumberPosition = 'bottom-right';
  private sidebarModal: ToolSidebarModalController | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async init(): Promise<void> {
    this.abortController = new AbortController();
    renderIcons(this.container);
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
    this.dropdownControllers.forEach((ctrl) => ctrl.destroy());
    this.dropdownControllers = [];
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
    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="pn-dropzone"]');
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-pdf"]');
    const heroDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive"]');
    const heroDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const sidebarBackdrop = this.container.querySelector<HTMLElement>('[data-ref="tool-sidebar-backdrop"]');
    const sidebarCloseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-close"]');
    const sidebarDragZone = this.container.querySelector<HTMLElement>('[data-ref="modal-drag-zone"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="page-numbers-sidebar"]');
    const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-page-numbers"]');

    this.sidebarModal = setupToolSidebarModal({
      backdrop: sidebarBackdrop,
      closeBtn: sidebarCloseBtn,
      dragZone: sidebarDragZone,
      settingsBtn,
      sidebar,
      signal,
    });

    browseBtn?.addEventListener('click', () => fileInput?.click(), { signal });

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

    const radioSingle = this.container.querySelector<HTMLInputElement>('[data-ref="radio-mode-single"]');
    const radioDouble = this.container.querySelector<HTMLInputElement>('[data-ref="radio-mode-double"]');
    const checkCover = this.container.querySelector<HTMLInputElement>('[data-ref="check-cover"]');
    const customTextBox = this.container.querySelector<HTMLElement>('[data-ref="box-custom-text"]');

    dropzone?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      fileInput?.click();
    }, { signal });

    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) {
        void this.handleFileSelected(file);
      }
      fileInput.value = '';
    }, { signal });

    if (dropzone) {
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('tool-dropzone--active');
      }, { signal });

      dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropzone.classList.remove('tool-dropzone--active');
      }, { signal });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('tool-dropzone--active');
        const file = e.dataTransfer?.files?.[0];
        if (file) {
          void this.handleFileSelected(file);
        }
      }, { signal });
    }

    radioSingle?.addEventListener('change', () => {
      if (radioSingle.checked) {
        this.mode = 'single';
        this.renderPagesGrid();
      }
    }, { signal });

    radioDouble?.addEventListener('change', () => {
      if (radioDouble.checked) {
        this.mode = 'double';
        this.renderPagesGrid();
      }
    }, { signal });

    checkCover?.addEventListener('change', () => {
      this.firstPageIsCover = checkCover.checked;
      this.updateIndicators();
    }, { signal });

    const wrapperMargin = this.container.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-margin"]');
    if (wrapperMargin) {
      const ctrl = setupDropdown(wrapperMargin, {
        onSelect: (val: string) => {
          this.margin = (val as PageNumberMargin) || 'recommended';
        },
      });
      this.dropdownControllers.push(ctrl);
    }

    const wrapperFormat = this.container.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-format"]');
    if (wrapperFormat) {
      const ctrl = setupDropdown(wrapperFormat, {
        onSelect: (val: string) => {
          this.format = val || '{n}';
          if (customTextBox) {
            customTextBox.style.display = val === 'custom' ? '' : 'none';
          }
        },
      });
      this.dropdownControllers.push(ctrl);
    }

    const wrapperFontFamily = this.container.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-font-family"]');
    if (wrapperFontFamily) {
      const ctrl = setupDropdown(wrapperFontFamily, {
        onSelect: (val: string) => {
          this.fontFamily = val || 'Helvetica';
        },
      });
      this.dropdownControllers.push(ctrl);
    }

    const wrapperFontSize = this.container.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-font-size"]');
    if (wrapperFontSize) {
      const ctrl = setupDropdown(wrapperFontSize, {
        onSelect: (val: string) => {
          this.fontSize = Number(val) || 11;
        },
      });
      this.dropdownControllers.push(ctrl);
    }

    const posCells = this.container.querySelectorAll<HTMLElement>('.pn-position-cell[data-pos]');
    posCells.forEach((cell) => {
      cell.addEventListener('click', () => {
        posCells.forEach((c) => c.classList.remove('is-selected'));
        cell.classList.add('is-selected');
        this.position = (cell.getAttribute('data-pos') as PageNumberPosition) || 'bottom-right';
        this.updateIndicators();
      }, { signal });
    });

    executeBtn?.addEventListener('click', () => {
      if (this.currentFile) {
        void this.handleExecutePageNumbers(executeBtn);
      }
    }, { signal });
  }

  private async handleFileSelected(file: File): Promise<void> {
    if (this.isProcessing) return;
    this.hideError();

    const isPdfExt = file.name.toLowerCase().endsWith('.pdf');
    const isPdfMime = file.type === 'application/pdf' || file.type === 'application/x-pdf';
    if (!isPdfExt && !isPdfMime) {
      this.showError('Selecciona únicamente un archivo PDF válido.');
      return;
    }

    const limits = getCurrentUserToolLimits('page-numbers');
    if (file.size > limits.maxFileSizeMB * 1024 * 1024) {
      this.showError(`El archivo PDF supera el tamaño máximo permitido de ${limits.maxFileSizeMB} MB.`);
      return;
    }

    this.currentFile = file;

    try {
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const task = pdfjsLib.getDocument({
        cMapPacked: true,
        cMapUrl: '/vendor/pdfjs/cmaps/',
        data: new Uint8Array(arrayBuffer),
        standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
      });

      this.pdfDocument = await task.promise;
      const count = this.pdfDocument.numPages || 1;

      this.pages = Array.from({ length: count }, (_, i) => ({
        id: `pn-page-${i + 1}`,
        originalIndex: i,
        pageNum: i + 1,
      }));

      const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="pn-dropzone-card"]');
      const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="pn-workspace-card"]');
      const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-page-numbers"]');
      const toPageInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-to-page"]');

      if (toPageInput) {
        toPageInput.value = String(count);
        toPageInput.max = String(count);
      }

      const fromPageInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-from-page"]');
      if (fromPageInput) {
        fromPageInput.max = String(count);
      }

      if (dropzoneCard) dropzoneCard.style.display = 'none';
      if (workspaceCard) workspaceCard.style.display = '';
      if (executeBtn) executeBtn.disabled = false;

      const sidebar = this.container.querySelector<HTMLElement>('[data-ref="page-numbers-sidebar"]');
      const settingsBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
      const workspace = this.container.querySelector<HTMLElement>('[data-ref="page-numbers-workspace"]');
      if (sidebar) sidebar.style.display = 'flex';
      if (settingsBtn) settingsBtn.classList.add('is-visible');
      if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');

      this.renderPagesGrid();
    } catch {
      this.showError('No se pudo procesar el archivo PDF. Asegúrate de que no esté dañado ni protegido por contraseña.');
      this.resetToInitial();
    }
  }

  private renderPagesGrid(): void {
    const grid = this.container.querySelector<HTMLElement>('[data-ref="pn-pages-grid"]');
    if (!grid) return;

    if (this.mode === 'single') {
      grid.className = 'pn-pages-grid';
      grid.innerHTML = this.pages.map((p) => `
        <div class="pn-page-card" data-ref="card-page-${p.id}" data-page-num="${p.pageNum}">
          <div class="pn-page-card__preview">
            <span class="pn-page-card__badge">${p.pageNum}</span>
            <span class="pn-page-card__cover-badge" data-ref="cover-badge-${p.id}" style="${this.firstPageIsCover && p.pageNum === 1 ? '' : 'display: none;'}">Portada</span>
            <div class="pn-indicator-dot ${this.resolveDotClass(p.pageNum)}" data-ref="dot-${p.id}"></div>
            <canvas class="pn-page-card__canvas" data-ref="canvas-${p.id}"></canvas>
          </div>
        </div>
      `).join('');
    } else {
      grid.className = 'pn-pages-grid pn-pages-grid--double';
      let html = '';

      for (let i = 0; i < this.pages.length; i += 2) {
        const leftPage = this.pages[i];
        const rightPage = this.pages[i + 1];

        html += `<div class="pn-spread-pair">`;

        html += `
          <div class="pn-page-card" data-ref="card-page-${leftPage.id}" data-page-num="${leftPage.pageNum}" style="width: 170px;">
            <div class="pn-page-card__preview">
              <span class="pn-page-card__badge">${leftPage.pageNum}</span>
              <span class="pn-page-card__cover-badge" data-ref="cover-badge-${leftPage.id}" style="${this.firstPageIsCover && leftPage.pageNum === 1 ? '' : 'display: none;'}">Portada</span>
              <div class="pn-indicator-dot ${this.resolveDotClass(leftPage.pageNum)}" data-ref="dot-${leftPage.id}"></div>
              <canvas class="pn-page-card__canvas" data-ref="canvas-${leftPage.id}"></canvas>
            </div>
          </div>
        `;

        if (rightPage) {
          html += `
            <div class="pn-page-card" data-ref="card-page-${rightPage.id}" data-page-num="${rightPage.pageNum}" style="width: 170px;">
              <div class="pn-page-card__preview">
                <span class="pn-page-card__badge">${rightPage.pageNum}</span>
                <span class="pn-page-card__cover-badge" data-ref="cover-badge-${rightPage.id}" style="display: none;">Portada</span>
                <div class="pn-indicator-dot ${this.resolveDotClass(rightPage.pageNum)}" data-ref="dot-${rightPage.id}"></div>
                <canvas class="pn-page-card__canvas" data-ref="canvas-${rightPage.id}"></canvas>
              </div>
            </div>
          `;
        }

        html += `</div>`;
      }

      grid.innerHTML = html;
    }

    for (const page of this.pages) {
      void this.renderThumbnail(page);
    }
  }

  private resolveDotClass(pageNum: number): string {
    if (this.firstPageIsCover && pageNum === 1) {
      return 'is-hidden';
    }

    if (this.mode === 'single') {
      return `is-pos-${this.position}`;
    }

    const isLeftPage = pageNum % 2 === 0;

    if (this.position === 'bottom-center' || this.position === 'top-center') {
      return `is-pos-${this.position}`;
    }

    if (isLeftPage) {
      return this.position.startsWith('top') ? 'is-pos-top-left' : 'is-pos-bottom-left';
    } else {
      return this.position.startsWith('top') ? 'is-pos-top-right' : 'is-pos-bottom-right';
    }
  }

  private updateIndicators(): void {
    for (const page of this.pages) {
      const dot = this.container.querySelector<HTMLElement>(`[data-ref="dot-${page.id}"]`);
      const coverBadge = this.container.querySelector<HTMLElement>(`[data-ref="cover-badge-${page.id}"]`);

      if (dot) {
        dot.className = `pn-indicator-dot ${this.resolveDotClass(page.pageNum)}`;
      }
      if (coverBadge && page.pageNum === 1) {
        coverBadge.style.display = this.firstPageIsCover ? '' : 'none';
      }
    }
  }

  private async renderThumbnail(item: PageThumbnailItem): Promise<void> {
    if (!this.pdfDocument) return;
    try {
      const page = await this.pdfDocument.getPage(item.originalIndex + 1);
      const viewport = page.getViewport({ scale: 0.5 });
      const canvas = this.container.querySelector<HTMLCanvasElement>(`[data-ref="canvas-${item.id}"]`);
      if (!canvas) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch {}
  }

  private async handleExecutePageNumbers(button: HTMLButtonElement): Promise<void> {
    if (!this.currentFile || this.isProcessing) return;
    this.hideError();

    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="pn-workspace-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="pn-processing-card"]');

    const startNumberInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-start-number"]');
    const fromPageInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-from-page"]');
    const toPageInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-to-page"]');
    const customTextInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-custom-text"]');

    let format = this.format;
    if (format === 'custom') {
      format = customTextInput?.value.trim() || 'Página {n} de {p}';
    }

    const optionsPayload = {
      firstPageIsCover: this.firstPageIsCover,
      fontFamily: this.fontFamily,
      fontSize: this.fontSize,
      format,
      fromPage: Math.max(1, Number(fromPageInput?.value) || 1),
      margin: this.margin,
      mode: this.mode,
      position: this.position,
      startNumber: Math.max(1, Number(startNumberInput?.value) || 1),
      toPage: Math.max(1, Number(toPageInput?.value) || this.pages.length),
    };

    this.isProcessing = true;
    if (workspaceCard) workspaceCard.style.display = 'none';
    if (processingCard) processingCard.style.display = '';

    await withButtonLoading(button, async () => {
      try {
        const formData = new FormData();
        formData.append('file', this.currentFile as Blob, this.currentFile?.name);
        formData.append('options', JSON.stringify(optionsPayload));

        const response = await postFormApi(API_ROUTES.tools.pageNumbers.process, formData);
        const result = (await response.json()) as {
          data?: PageNumberResponseData;
          error?: string;
          success: boolean;
        };

        if (!response.ok || !result.success || !result.data?.downloadUrl) {
          throw new Error(result.error || 'Ocurrió un error al insertar números de página.');
        }

        const token = result.data.fileId;
        const downloadPayload = {
          downloadUrl: `/api/download/${token}`,
          fileSize: result.data.fileSize,
          filename: result.data.filename,
          returnText: 'Numerar otro documento PDF',
          returnUrl: '/page-numbers',
          subtitle: `Se han insertado exitosamente los números de página en "${this.currentFile?.name}".`,
          title: '¡Números de página insertados!',
          token,
        };

        sessionStorage.setItem('download_ready_data', JSON.stringify(downloadPayload));
        showToast('Números de página insertados con éxito.', 'success');
        navigate(`/download/${token}`);
      } catch (err: unknown) {
        this.isProcessing = false;
        if (processingCard) processingCard.style.display = 'none';
        if (workspaceCard) workspaceCard.style.display = '';
        const errorMessage = err instanceof Error ? err.message : 'Error inesperado al numerar el documento.';
        this.showError(errorMessage);
      }
    });
  }

  private resetToInitial(): void {
    this.currentFile = null;
    this.pages = [];
    this.pdfDocument = null;
    this.isProcessing = false;

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="pn-dropzone-card"]');
    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="pn-workspace-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="pn-processing-card"]');
    const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-page-numbers"]');

    if (fileInput) fileInput.value = '';
    if (dropzoneCard) dropzoneCard.style.display = '';
    if (workspaceCard) workspaceCard.style.display = 'none';
    if (processingCard) processingCard.style.display = 'none';
    if (executeBtn) executeBtn.disabled = true;

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="page-numbers-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="page-numbers-workspace"]');
    if (sidebar) sidebar.style.display = 'none';
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
    if (this.sidebarModal) this.sidebarModal.close();
    this.hideError();
  }

  private showError(message: string): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="pn-global-error"]');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = '';
    }
  }

  private hideError(): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="pn-global-error"]');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }
}

export async function createPageNumbersView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/tools/page-numbers/page-numbers.html');
  const controller = new PageNumbersController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
