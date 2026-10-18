import { navigate } from '../../../app-router.js';
import { API_ROUTES } from '../../../config/api-routes.js';
import { postFormApi } from '../../../services/api.service.js';
import { pickDropboxFiles } from '../../../services/dropbox.service.js';
import { pickGoogleDriveFiles } from '../../../services/google-drive.service.js';
import { renderIcons } from '../../../services/icon.service.js';
import { loadPdfJs } from '../../../services/pdf-loader.service.js';
import { loadTemplate } from '../../../services/template.service.js';
import { showToast } from '../../../services/toast.service.js';
import { ViewController } from '../../../types/common.types.js';
import { setupDropdown, setupToolSidebarModal, ToolSidebarModalController, withButtonLoading } from '../../../utils/dom.util.js';
import { PageThumbnailItem, WatermarkPdfResponseData, WatermarkPosition, WatermarkType } from './watermark-pdf.types.js';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

export class WatermarkPdfController implements ViewController {
  private abortController: AbortController | null = null;
  private activeTab: WatermarkType = 'text';
  private container: HTMLElement;
  private currentFile: File | null = null;
  private dropdownControllers: Array<{ destroy: () => void }> = [];
  private fontFamily = 'Helvetica';
  private fontSize = 36;
  private isMosaic = false;
  private isProcessing = false;
  private layer: 'over' | 'under' = 'over';
  private pages: PageThumbnailItem[] = [];
  private pdfDocument: any = null;
  private position: WatermarkPosition = 'center';
  private rotation = 0;
  private sidebarModal: ToolSidebarModalController | null = null;
  private transparency = 0;
  private watermarkImageFile: File | null = null;

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
    const imageInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-watermark-image"]');
    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="wm-dropzone"]');
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-pdf"]');
    const heroDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive"]');
    const heroDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const sidebarBackdrop = this.container.querySelector<HTMLElement>('[data-ref="tool-sidebar-backdrop"]');
    const sidebarCloseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-close"]');
    const sidebarDragZone = this.container.querySelector<HTMLElement>('[data-ref="modal-drag-zone"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="watermark-pdf-sidebar"]');
    const changeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-change-pdf"]');
    const pickImageBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-pick-image"]');
    const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-watermark"]');

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

    const tabText = this.container.querySelector<HTMLButtonElement>('[data-ref="tab-text"]');
    const tabImage = this.container.querySelector<HTMLButtonElement>('[data-ref="tab-image"]');
    const secText = this.container.querySelector<HTMLElement>('[data-ref="section-text-options"]');
    const secImage = this.container.querySelector<HTMLElement>('[data-ref="section-image-options"]');

    const checkMosaic = this.container.querySelector<HTMLInputElement>('[data-ref="check-mosaic"]');
    const layerOver = this.container.querySelector<HTMLElement>('[data-ref="layer-card-over"]');
    const layerUnder = this.container.querySelector<HTMLElement>('[data-ref="layer-card-under"]');

    browseBtn?.addEventListener('click', () => fileInput?.click(), { signal });
    changeBtn?.addEventListener('click', () => fileInput?.click(), { signal });

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

    tabText?.addEventListener('click', () => {
      this.activeTab = 'text';
      tabText.classList.add('is-active');
      tabImage?.classList.remove('is-active');
      if (secText) secText.style.display = '';
      if (secImage) secImage.style.display = 'none';
    }, { signal });

    tabImage?.addEventListener('click', () => {
      this.activeTab = 'image';
      tabImage.classList.add('is-active');
      tabText?.classList.remove('is-active');
      if (secText) secText.style.display = 'none';
      if (secImage) secImage.style.display = '';
    }, { signal });

    pickImageBtn?.addEventListener('click', () => imageInput?.click(), { signal });

    imageInput?.addEventListener('change', () => {
      const img = imageInput.files?.[0];
      if (img) {
        this.watermarkImageFile = img;
        const txtEl = this.container.querySelector<HTMLElement>('[data-ref="txt-picked-image"]');
        if (txtEl) txtEl.textContent = `Imagen: ${img.name}`;
      }
    }, { signal });

    const posCells = this.container.querySelectorAll<HTMLElement>('.wm-position-cell[data-pos]');
    posCells.forEach((cell) => {
      cell.addEventListener('click', () => {
        posCells.forEach((c) => c.classList.remove('is-selected'));
        cell.classList.add('is-selected');
        this.position = (cell.getAttribute('data-pos') as WatermarkPosition) || 'center';
        this.updateIndicators();
      }, { signal });
    });

    checkMosaic?.addEventListener('change', () => {
      this.isMosaic = checkMosaic.checked;
      this.updateIndicators();
    }, { signal });

    layerOver?.addEventListener('click', () => {
      this.layer = 'over';
      layerOver.classList.add('is-selected');
      layerUnder?.classList.remove('is-selected');
    }, { signal });

    layerUnder?.addEventListener('click', () => {
      this.layer = 'under';
      layerUnder.classList.add('is-selected');
      layerOver?.classList.remove('is-selected');
    }, { signal });

    const wrapperFont = this.container.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-wm-font"]');
    if (wrapperFont) {
      const ctrl = setupDropdown(wrapperFont, {
        onSelect: (val: string) => {
          this.fontFamily = val || 'Helvetica';
        },
      });
      this.dropdownControllers.push(ctrl);
    }

    const wrapperSize = this.container.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-wm-size"]');
    if (wrapperSize) {
      const ctrl = setupDropdown(wrapperSize, {
        onSelect: (val: string) => {
          this.fontSize = Number(val) || 36;
        },
      });
      this.dropdownControllers.push(ctrl);
    }

    const wrapperTransparency = this.container.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-transparency"]');
    if (wrapperTransparency) {
      const ctrl = setupDropdown(wrapperTransparency, {
        onSelect: (val: string) => {
          this.transparency = Number(val) || 0;
        },
      });
      this.dropdownControllers.push(ctrl);
    }

    const wrapperRotation = this.container.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-rotation"]');
    if (wrapperRotation) {
      const ctrl = setupDropdown(wrapperRotation, {
        onSelect: (val: string) => {
          this.rotation = Number(val) || 0;
        },
      });
      this.dropdownControllers.push(ctrl);
    }

    executeBtn?.addEventListener('click', () => {
      if (this.currentFile) {
        void this.handleExecuteWatermark(executeBtn);
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

    if (file.size > MAX_FILE_SIZE) {
      this.showError('El archivo PDF supera el tamaño máximo permitido de 50 MB.');
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
        id: `wm-page-${i + 1}`,
        originalIndex: i,
        pageNum: i + 1,
      }));

      const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="wm-dropzone-card"]');
      const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="wm-workspace-card"]');
      const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-watermark"]');
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

      const sidebar = this.container.querySelector<HTMLElement>('[data-ref="watermark-pdf-sidebar"]');
      const settingsBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
      const workspace = this.container.querySelector<HTMLElement>('[data-ref="watermark-pdf-workspace"]');
      if (sidebar) sidebar.style.display = 'flex';
      if (settingsBtn) settingsBtn.classList.add('is-visible');
      if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');

      this.renderPagesGrid();
    } catch {
      this.showError('No se pudo procesar el archivo PDF. Asegúrate de que no esté dañado ni protegido.');
      this.resetToInitial();
    }
  }

  private renderPagesGrid(): void {
    const grid = this.container.querySelector<HTMLElement>('[data-ref="wm-pages-grid"]');
    if (!grid) return;

    grid.innerHTML = this.pages.map((p) => `
      <div class="wm-page-card" data-ref="card-page-${p.id}">
        <div class="wm-page-card__preview">
          <span class="wm-page-card__badge">${p.pageNum}</span>
          ${this.isMosaic
            ? `<div class="wm-mosaic-overlay" data-ref="mosaic-${p.id}">
                 ${Array.from({ length: 9 }).map(() => '<div class="wm-mosaic-dot"></div>').join('')}
               </div>`
            : `<div class="wm-indicator-dot is-pos-${this.position}" data-ref="dot-${p.id}"></div>`
          }
          <canvas class="wm-page-card__canvas" data-ref="canvas-${p.id}"></canvas>
        </div>
      </div>
    `).join('');

    for (const page of this.pages) {
      void this.renderThumbnail(page);
    }
  }

  private updateIndicators(): void {
    this.renderPagesGrid();
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

  private async handleExecuteWatermark(button: HTMLButtonElement): Promise<void> {
    if (!this.currentFile || this.isProcessing) return;
    this.hideError();

    if (this.activeTab === 'image' && !this.watermarkImageFile) {
      this.showError('Por favor selecciona una imagen para usarla como marca de agua.');
      return;
    }

    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="wm-workspace-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="wm-processing-card"]');

    const textInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-wm-text"]');
    const fromPageInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-from-page"]');
    const toPageInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-to-page"]');

    const optionsPayload = {
      fontFamily: this.fontFamily,
      fontSize: this.fontSize,
      fromPage: Math.max(1, Number(fromPageInput?.value) || 1),
      layer: this.layer,
      mosaic: this.isMosaic,
      position: this.position,
      rotation: this.rotation,
      text: textInput?.value || 'CONFIDENCIAL',
      toPage: Math.max(1, Number(toPageInput?.value) || this.pages.length),
      transparency: this.transparency,
      type: this.activeTab,
    };

    this.isProcessing = true;
    if (workspaceCard) workspaceCard.style.display = 'none';
    if (processingCard) processingCard.style.display = '';

    await withButtonLoading(button, async () => {
      try {
        const formData = new FormData();
        formData.append('file', this.currentFile as Blob, this.currentFile?.name);
        if (this.activeTab === 'image' && this.watermarkImageFile) {
          formData.append('watermarkImage', this.watermarkImageFile, this.watermarkImageFile.name);
        }
        formData.append('options', JSON.stringify(optionsPayload));

        const response = await postFormApi(API_ROUTES.tools.watermarkPdf.process, formData);
        const result = (await response.json()) as {
          data?: WatermarkPdfResponseData;
          error?: string;
          success: boolean;
        };

        if (!response.ok || !result.success || !result.data?.downloadUrl) {
          throw new Error(result.error || 'Ocurrió un error al insertar la marca de agua.');
        }

        const token = result.data.fileId;
        const downloadPayload = {
          downloadUrl: `/api/download/${token}`,
          fileSize: result.data.fileSize,
          filename: result.data.filename,
          returnText: 'Insertar otra marca de agua',
          returnUrl: '/watermark-pdf',
          subtitle: `Se ha aplicado exitosamente la marca de agua en "${this.currentFile?.name}".`,
          title: '¡Marca de agua insertada!',
          token,
        };

        sessionStorage.setItem('download_ready_data', JSON.stringify(downloadPayload));
        showToast('Marca de agua insertada con éxito.', 'success');
        navigate(`/download/${token}`);
      } catch (err: unknown) {
        this.isProcessing = false;
        if (processingCard) processingCard.style.display = 'none';
        if (workspaceCard) workspaceCard.style.display = '';
        const errorMessage = err instanceof Error ? err.message : 'Error inesperado al insertar la marca de agua.';
        this.showError(errorMessage);
      }
    });
  }

  private resetToInitial(): void {
    this.currentFile = null;
    this.pages = [];
    this.pdfDocument = null;
    this.isProcessing = false;
    this.watermarkImageFile = null;

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const imageInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-watermark-image"]');
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="wm-dropzone-card"]');
    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="wm-workspace-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="wm-processing-card"]');
    const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-watermark"]');
    const txtImgEl = this.container.querySelector<HTMLElement>('[data-ref="txt-picked-image"]');

    if (fileInput) fileInput.value = '';
    if (imageInput) imageInput.value = '';
    if (dropzoneCard) dropzoneCard.style.display = '';
    if (workspaceCard) workspaceCard.style.display = 'none';
    if (processingCard) processingCard.style.display = 'none';
    if (executeBtn) executeBtn.disabled = true;
    if (txtImgEl) txtImgEl.textContent = 'Añadir Imagen (PNG/JPG)';

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="watermark-pdf-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="watermark-pdf-workspace"]');
    if (sidebar) sidebar.style.display = 'none';
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
    if (this.sidebarModal) this.sidebarModal.close();
    this.hideError();
  }

  private showError(message: string): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="wm-global-error"]');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = '';
    }
  }

  private hideError(): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="wm-global-error"]');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }
}

export async function createWatermarkPdfView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/tools/watermark-pdf/watermark-pdf.html');
  const controller = new WatermarkPdfController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
