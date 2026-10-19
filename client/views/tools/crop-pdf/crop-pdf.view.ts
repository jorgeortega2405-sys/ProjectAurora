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
import { setupToolSidebarModal, ToolSidebarModalController, withButtonLoading } from '../../../utils/dom.util.js';
import { CropBoxPercent, CropPdfResponseData } from './crop-pdf.types.js';

export class CropPdfController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private cropPercent: CropBoxPercent = { height: 90, width: 90, x: 5, y: 5 };
  private currentFile: File | null = null;
  private currentPage = 1;
  private isProcessing = false;
  private pdfDocument: any = null;
  private sidebarModal: ToolSidebarModalController | null = null;
  private totalPages = 1;

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
    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="crop-dropzone"]');
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-pdf"]');
    const heroDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive"]');
    const heroDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const sidebarBackdrop = this.container.querySelector<HTMLElement>('[data-ref="tool-sidebar-backdrop"]');
    const sidebarCloseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-close"]');
    const sidebarDragZone = this.container.querySelector<HTMLElement>('[data-ref="modal-drag-zone"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="crop-pdf-sidebar"]');
    const resetBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-reset-crop"]');
    const prevPageBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-prev-page"]');
    const nextPageBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-next-page"]');
    const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-crop"]');

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

    prevPageBtn?.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        void this.renderCurrentPage();
      }
    }, { signal });

    nextPageBtn?.addEventListener('click', () => {
      if (this.currentPage < this.totalPages) {
        this.currentPage++;
        void this.renderCurrentPage();
      }
    }, { signal });

    resetBtn?.addEventListener('click', () => {
      this.cropPercent = { height: 100, width: 100, x: 0, y: 0 };
      this.updateCropDisplay();
    }, { signal });

    this.bindCropInteractions(signal);

    executeBtn?.addEventListener('click', () => {
      if (this.currentFile) {
        void this.handleExecuteCrop(executeBtn);
      }
    }, { signal });
  }

  private bindCropInteractions(signal: AbortSignal): void {
    const wrap = this.container.querySelector<HTMLElement>('[data-ref="crop-preview-wrap"]');
    const cropBox = this.container.querySelector<HTMLElement>('[data-ref="crop-box"]');
    const overlay = this.container.querySelector<HTMLElement>('[data-ref="crop-overlay"]');
    if (!wrap || !cropBox || !overlay) return;

    let isDraggingBox = false;
    let isResizing = false;
    let isDrawing = false;
    let activeHandle = '';
    let startX = 0;
    let startY = 0;
    let startCrop = { ...this.cropPercent };

    cropBox.addEventListener('pointerdown', (e) => {
      const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-handle]');
      if (handle) {
        isResizing = true;
        activeHandle = handle.getAttribute('data-handle') || '';
      } else {
        isDraggingBox = true;
      }
      startX = e.clientX;
      startY = e.clientY;
      startCrop = { ...this.cropPercent };
      cropBox.setPointerCapture(e.pointerId);
      e.stopPropagation();
    }, { signal });

    overlay.addEventListener('pointerdown', (e) => {
      const rect = wrap.getBoundingClientRect();
      isDrawing = true;
      startX = e.clientX;
      startY = e.clientY;
      const xPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const yPct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
      this.cropPercent = { height: 1, width: 1, x: xPct, y: yPct };
      startCrop = { ...this.cropPercent };
      this.updateCropDisplay();
      overlay.setPointerCapture(e.pointerId);
    }, { signal });

    const handlePointerMove = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const deltaXPct = ((e.clientX - startX) / rect.width) * 100;
      const deltaYPct = ((e.clientY - startY) / rect.height) * 100;

      if (isDraggingBox) {
        let newX = startCrop.x + deltaXPct;
        let newY = startCrop.y + deltaYPct;
        newX = Math.max(0, Math.min(100 - startCrop.width, newX));
        newY = Math.max(0, Math.min(100 - startCrop.height, newY));
        this.cropPercent.x = newX;
        this.cropPercent.y = newY;
        this.updateCropDisplay();
      } else if (isResizing) {
        let x = startCrop.x;
        let y = startCrop.y;
        let w = startCrop.width;
        let h = startCrop.height;

        if (activeHandle.includes('e')) w = Math.max(5, Math.min(100 - x, startCrop.width + deltaXPct));
        if (activeHandle.includes('s')) h = Math.max(5, Math.min(100 - y, startCrop.height + deltaYPct));
        if (activeHandle.includes('w')) {
          const maxLeftShift = startCrop.x + startCrop.width - 5;
          const shift = Math.max(-startCrop.x, Math.min(maxLeftShift, deltaXPct));
          x = startCrop.x + shift;
          w = startCrop.width - shift;
        }
        if (activeHandle.includes('n')) {
          const maxTopShift = startCrop.y + startCrop.height - 5;
          const shift = Math.max(-startCrop.y, Math.min(maxTopShift, deltaYPct));
          y = startCrop.y + shift;
          h = startCrop.height - shift;
        }

        this.cropPercent = { height: h, width: w, x, y };
        this.updateCropDisplay();
      } else if (isDrawing) {
        const currentXPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        const currentYPct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
        const minX = Math.min(startCrop.x, currentXPct);
        const minY = Math.min(startCrop.y, currentYPct);
        const maxX = Math.max(startCrop.x, currentXPct);
        const maxY = Math.max(startCrop.y, currentYPct);
        this.cropPercent = {
          height: Math.max(5, maxY - minY),
          width: Math.max(5, maxX - minX),
          x: minX,
          y: minY,
        };
        this.updateCropDisplay();
      }
    };

    const handlePointerUp = () => {
      isDraggingBox = false;
      isResizing = false;
      isDrawing = false;
    };

    wrap.addEventListener('pointermove', handlePointerMove, { signal });
    wrap.addEventListener('pointerup', handlePointerUp, { signal });
    wrap.addEventListener('pointercancel', handlePointerUp, { signal });
  }

  private updateCropDisplay(): void {
    const cropBox = this.container.querySelector<HTMLElement>('[data-ref="crop-box"]');
    const maskTop = this.container.querySelector<HTMLElement>('[data-ref="mask-top"]');
    const maskBottom = this.container.querySelector<HTMLElement>('[data-ref="mask-bottom"]');
    const maskLeft = this.container.querySelector<HTMLElement>('[data-ref="mask-left"]');
    const maskRight = this.container.querySelector<HTMLElement>('[data-ref="mask-right"]');
    if (!cropBox || !maskTop || !maskBottom || !maskLeft || !maskRight) return;

    const { height, width, x, y } = this.cropPercent;

    cropBox.style.left = `${x}%`;
    cropBox.style.top = `${y}%`;
    cropBox.style.width = `${width}%`;
    cropBox.style.height = `${height}%`;

    maskTop.style.height = `${y}%`;
    maskBottom.style.top = `${y + height}%`;
    maskBottom.style.height = `${100 - (y + height)}%`;

    maskLeft.style.top = `${y}%`;
    maskLeft.style.height = `${height}%`;
    maskLeft.style.width = `${x}%`;

    maskRight.style.top = `${y}%`;
    maskRight.style.height = `${height}%`;
    maskRight.style.left = `${x + width}%`;
    maskRight.style.width = `${100 - (x + width)}%`;
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

    const limits = getCurrentUserToolLimits('crop-pdf');
    if (file.size > limits.maxFileSizeMB * 1024 * 1024) {
      this.showError(`El archivo PDF supera el tamaño máximo permitido de ${limits.maxFileSizeMB} MB.`);
      return;
    }

    this.currentFile = file;
    this.currentPage = 1;
    this.cropPercent = { height: 90, width: 90, x: 5, y: 5 };

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
      this.totalPages = this.pdfDocument.numPages || 1;

      const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="crop-dropzone-card"]');
      const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="crop-workspace-card"]');
      const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-crop"]');

      if (dropzoneCard) dropzoneCard.style.display = 'none';
      if (workspaceCard) workspaceCard.style.display = '';
      if (executeBtn) executeBtn.disabled = false;

      const sidebar = this.container.querySelector<HTMLElement>('[data-ref="crop-pdf-sidebar"]');
      const settingsBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
      const workspace = this.container.querySelector<HTMLElement>('[data-ref="crop-pdf-workspace"]');
      if (sidebar) sidebar.style.display = 'flex';
      if (settingsBtn) settingsBtn.classList.add('is-visible');
      if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');

      await this.renderCurrentPage();
      this.updateCropDisplay();
    } catch {
      this.showError('No se pudo leer el archivo PDF seleccionado. Asegúrate de que no esté dañado ni protegido.');
      this.resetToInitial();
    }
  }

  private async renderCurrentPage(): Promise<void> {
    if (!this.pdfDocument) return;

    const pageInfoEl = this.container.querySelector<HTMLElement>('[data-ref="txt-page-info"]');
    if (pageInfoEl) {
      pageInfoEl.textContent = `Página ${this.currentPage} de ${this.totalPages}`;
    }

    try {
      const page = await this.pdfDocument.getPage(this.currentPage);
      const viewport = page.getViewport({ scale: 1.2 });
      const canvas = this.container.querySelector<HTMLCanvasElement>('[data-ref="crop-canvas"]');
      if (!canvas) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch {}
  }

  private async handleExecuteCrop(button: HTMLButtonElement): Promise<void> {
    if (!this.currentFile || this.isProcessing) return;
    this.hideError();

    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="crop-workspace-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="crop-processing-card"]');
    const radioAll = this.container.querySelector<HTMLInputElement>('[data-ref="radio-all-pages"]');

    const optionsPayload = {
      applyToAll: radioAll?.checked !== false,
      cropBox: this.cropPercent,
      targetPageIndex: this.currentPage - 1,
    };

    this.isProcessing = true;
    if (workspaceCard) workspaceCard.style.display = 'none';
    if (processingCard) processingCard.style.display = '';

    await withButtonLoading(button, async () => {
      try {
        const formData = new FormData();
        formData.append('file', this.currentFile as Blob, this.currentFile?.name);
        formData.append('options', JSON.stringify(optionsPayload));

        const response = await postFormApi(API_ROUTES.tools.cropPdf.process, formData);
        const result = (await response.json()) as {
          data?: CropPdfResponseData;
          error?: string;
          success: boolean;
        };

        if (!response.ok || !result.success || !result.data?.downloadUrl) {
          throw new Error(result.error || 'Ocurrió un error al recortar el documento.');
        }

        const token = result.data.fileId;
        const downloadPayload = {
          downloadUrl: `/api/download/${token}`,
          fileSize: result.data.fileSize,
          filename: result.data.filename,
          returnText: 'Recortar otro documento PDF',
          returnUrl: '/crop-pdf',
          subtitle: `Se ha aplicado exitosamente el área de recorte a "${this.currentFile?.name}".`,
          title: '¡PDF recortado con éxito!',
          token,
        };

        sessionStorage.setItem('download_ready_data', JSON.stringify(downloadPayload));
        showToast('PDF recortado correctamente.', 'success');
        navigate(`/download/${token}`);
      } catch (err: unknown) {
        this.isProcessing = false;
        if (processingCard) processingCard.style.display = 'none';
        if (workspaceCard) workspaceCard.style.display = '';
        const errorMessage = err instanceof Error ? err.message : 'Error inesperado al recortar el documento.';
        this.showError(errorMessage);
      }
    });
  }

  private resetToInitial(): void {
    this.currentFile = null;
    this.pdfDocument = null;
    this.isProcessing = false;
    this.currentPage = 1;
    this.totalPages = 1;
    this.cropPercent = { height: 90, width: 90, x: 5, y: 5 };

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="crop-dropzone-card"]');
    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="crop-workspace-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="crop-processing-card"]');
    const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-crop"]');

    if (fileInput) fileInput.value = '';
    if (dropzoneCard) dropzoneCard.style.display = '';
    if (workspaceCard) workspaceCard.style.display = 'none';
    if (processingCard) processingCard.style.display = 'none';
    if (executeBtn) executeBtn.disabled = true;

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="crop-pdf-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="crop-pdf-workspace"]');
    if (sidebar) sidebar.style.display = 'none';
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
    if (this.sidebarModal) this.sidebarModal.close();
    this.hideError();
  }

  private showError(message: string): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="crop-global-error"]');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = '';
    }
  }

  private hideError(): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="crop-global-error"]');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }
}

export async function createCropPdfView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/tools/crop-pdf/crop-pdf.html');
  const controller = new CropPdfController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
