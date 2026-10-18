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
import { RotatePageItem, RotatePdfResponseData } from './rotate-pdf.types.js';

export class RotatePdfController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private currentFile: File | null = null;
  private isProcessing = false;
  private pages: RotatePageItem[] = [];
  private pdfDocument: any = null;
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
    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="rotate-dropzone"]');
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-pdf"]');
    const heroDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive"]');
    const heroDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const sidebarBackdrop = this.container.querySelector<HTMLElement>('[data-ref="tool-sidebar-backdrop"]');
    const sidebarCloseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-close"]');
    const sidebarDragZone = this.container.querySelector<HTMLElement>('[data-ref="modal-drag-zone"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="rotate-pdf-sidebar"]');
    const changeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-change-pdf"]');

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
    const rotateAllRightBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-rotate-all-right"]');
    const rotateAllLeftBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-rotate-all-left"]');
    const sidebarRotateRightBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-rotate-right"]');
    const sidebarRotateLeftBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-rotate-left"]');
    const resetRotationsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-reset-rotations"]');
    const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-rotate"]');
    const pagesGrid = this.container.querySelector<HTMLElement>('[data-ref="rotate-pages-grid"]');

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

    rotateAllRightBtn?.addEventListener('click', () => this.rotateAll(90), { signal });
    rotateAllLeftBtn?.addEventListener('click', () => this.rotateAll(-90), { signal });
    sidebarRotateRightBtn?.addEventListener('click', () => this.rotateAll(90), { signal });
    sidebarRotateLeftBtn?.addEventListener('click', () => this.rotateAll(-90), { signal });
    resetRotationsBtn?.addEventListener('click', () => this.resetRotations(), { signal });

    pagesGrid?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const rightBtn = target.closest<HTMLElement>('[data-ref="btn-card-rotate-right"]');
      const leftBtn = target.closest<HTMLElement>('[data-ref="btn-card-rotate-left"]');
      const card = target.closest<HTMLElement>('[data-page-id]');
      if (!card) return;

      const pageId = card.getAttribute('data-page-id');
      if (!pageId) return;

      if (rightBtn) {
        e.stopPropagation();
        this.rotateSinglePage(pageId, 90);
      } else if (leftBtn) {
        e.stopPropagation();
        this.rotateSinglePage(pageId, -90);
      }
    }, { signal });

    executeBtn?.addEventListener('click', () => {
      if (this.currentFile) {
        void this.handleExecuteRotate(executeBtn);
      }
    }, { signal });
  }

  private async handleFileSelected(file: File): Promise<void> {
    if (this.isProcessing) return;
    this.hideError();

    const isPdfExt = file.name.toLowerCase().endsWith('.pdf');
    const isPdfMime = file.type === 'application/pdf' || file.type === 'application/x-pdf';
    if (!isPdfExt && !isPdfMime) {
      this.showError('Selecciona únicamente un documento en formato PDF.');
      return;
    }

    const limits = getCurrentUserToolLimits('rotate-pdf');
    const maxSizeBytes = limits.maxFileSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      this.showError(`El archivo supera el límite de ${limits.maxFileSizeMB} MB para tu plan actual. Actualiza tu suscripción para procesar archivos de mayor tamaño.`);
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
        id: `rot-page-${i + 1}`,
        originalIndex: i,
        pageNum: i + 1,
        rotation: 0,
      }));

      const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="rotate-dropzone-card"]');
      const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="rotate-workspace-card"]');
      const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-rotate"]');

      if (dropzoneCard) dropzoneCard.style.display = 'none';
      if (workspaceCard) workspaceCard.style.display = '';
      if (executeBtn) executeBtn.disabled = false;

      const sidebar = this.container.querySelector<HTMLElement>('[data-ref="rotate-pdf-sidebar"]');
      const settingsBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
      const workspace = this.container.querySelector<HTMLElement>('[data-ref="rotate-pdf-workspace"]');
      if (sidebar) sidebar.style.display = 'flex';
      if (settingsBtn) settingsBtn.classList.add('is-visible');
      if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');

      this.renderPagesGrid();

      for (const page of this.pages) {
        void this.renderThumbnail(page);
      }
    } catch {
      this.showError('No se pudo leer el archivo PDF seleccionado. Asegúrate de que no esté protegido o dañado.');
      this.resetToInitial();
    }
  }

  private renderPagesGrid(): void {
    const grid = this.container.querySelector<HTMLElement>('[data-ref="rotate-pages-grid"]');
    if (!grid) return;

    grid.innerHTML = this.pages.map((p) => `
      <div class="rotate-page-card" data-ref="card-page-${p.id}" data-page-id="${p.id}">
        <div class="rotate-page-card__preview">
          <span class="rotate-page-card__badge">${p.pageNum}</span>
          <canvas class="rotate-page-card__canvas" data-ref="canvas-${p.id}" style="transform: rotate(${p.rotation}deg);"></canvas>
        </div>
        <div class="rotate-page-card__actions">
          <button type="button" class="rotate-card-btn" data-ref="btn-card-rotate-left" title="Girar 90° a la izquierda">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#rotate_left"></use></svg>
          </button>
          <button type="button" class="rotate-card-btn" data-ref="btn-card-rotate-right" title="Girar 90° a la derecha">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#rotate_right"></use></svg>
          </button>
        </div>
      </div>
    `).join('');

    renderIcons(grid);
  }

  private async renderThumbnail(item: RotatePageItem): Promise<void> {
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

  private rotateSinglePage(pageId: string, delta: number): void {
    const page = this.pages.find((p) => p.id === pageId);
    if (!page) return;

    page.rotation = ((page.rotation + delta) % 360 + 360) % 360;
    const canvas = this.container.querySelector<HTMLCanvasElement>(`[data-ref="canvas-${page.id}"]`);
    if (canvas) {
      canvas.style.transform = `rotate(${page.rotation}deg)`;
    }
  }

  private rotateAll(delta: number): void {
    for (const page of this.pages) {
      page.rotation = ((page.rotation + delta) % 360 + 360) % 360;
      const canvas = this.container.querySelector<HTMLCanvasElement>(`[data-ref="canvas-${page.id}"]`);
      if (canvas) {
        canvas.style.transform = `rotate(${page.rotation}deg)`;
      }
    }
  }

  private resetRotations(): void {
    for (const page of this.pages) {
      page.rotation = 0;
      const canvas = this.container.querySelector<HTMLCanvasElement>(`[data-ref="canvas-${page.id}"]`);
      if (canvas) {
        canvas.style.transform = 'rotate(0deg)';
      }
    }
  }

  private async handleExecuteRotate(button: HTMLButtonElement): Promise<void> {
    if (!this.currentFile || this.isProcessing) return;
    this.hideError();

    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="rotate-workspace-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="rotate-processing-card"]');

    this.isProcessing = true;
    if (workspaceCard) workspaceCard.style.display = 'none';
    if (processingCard) processingCard.style.display = '';

    await withButtonLoading(button, async () => {
      try {
        const formData = new FormData();
        formData.append('file', this.currentFile as Blob, this.currentFile?.name);

        const optionsPayload = {
          pages: this.pages.map((p) => ({
            pageIndex: p.originalIndex,
            rotation: p.rotation,
          })),
        };

        formData.append('options', JSON.stringify(optionsPayload));

        const response = await postFormApi(API_ROUTES.tools.rotatePdf.process, formData);
        const result = (await response.json()) as {
          data?: RotatePdfResponseData;
          error?: string;
          success: boolean;
        };

        if (!response.ok || !result.success || !result.data?.downloadUrl) {
          throw new Error(result.error || 'Ocurrió un error al procesar la rotación del documento.');
        }

        const token = result.data.fileId;
        const downloadPayload = {
          downloadUrl: `/api/download/${token}`,
          fileSize: result.data.fileSize,
          filename: result.data.filename,
          returnText: 'Rotar otro archivo PDF',
          returnUrl: '/rotate-pdf',
          subtitle: `Las orientaciones de página para "${this.currentFile?.name}" se han aplicado correctamente.`,
          title: '¡PDF rotado con éxito!',
          token,
        };

        sessionStorage.setItem('download_ready_data', JSON.stringify(downloadPayload));
        showToast('PDF rotado correctamente.', 'success');
        navigate(`/download/${token}`);
      } catch (err: unknown) {
        this.isProcessing = false;
        if (processingCard) processingCard.style.display = 'none';
        if (workspaceCard) workspaceCard.style.display = '';
        const errorMessage = err instanceof Error ? err.message : 'Error inesperado al rotar el documento.';
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
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="rotate-dropzone-card"]');
    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="rotate-workspace-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="rotate-processing-card"]');
    const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-rotate"]');

    if (fileInput) fileInput.value = '';
    if (dropzoneCard) dropzoneCard.style.display = '';
    if (workspaceCard) workspaceCard.style.display = 'none';
    if (processingCard) processingCard.style.display = 'none';
    if (executeBtn) executeBtn.disabled = true;

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="rotate-pdf-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="rotate-pdf-workspace"]');
    if (sidebar) sidebar.style.display = 'none';
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
    if (this.sidebarModal) this.sidebarModal.close();
    this.hideError();
  }

  private showError(message: string): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="rotate-global-error"]');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = '';
    }
  }

  private hideError(): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="rotate-global-error"]');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }
}

export async function createRotatePdfView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/tools/rotate-pdf/rotate-pdf.html');
  const controller = new RotatePdfController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
