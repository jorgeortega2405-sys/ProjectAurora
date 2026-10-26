import { ToolStatusManager } from '../../../components/tool-status.component.js';
import { API_ROUTES } from '../../../config/api-routes.js';
import { getCurrentUserToolLimits } from '../../../config/tools-limits.config.js';
import { postFormApi, postFormWithProgress } from '../../../services/api.service.js';
import { pickDropboxFiles } from '../../../services/dropbox.service.js';
import { pickGoogleDriveFiles } from '../../../services/google-drive.service.js';
import { renderIcons } from '../../../services/icon.service.js';
import { navigate } from '../../../services/navigation.service.js';
import { loadPdfJs } from '../../../services/pdf-loader.service.js';
import { loadTemplate } from '../../../services/template.service.js';
import { showToast } from '../../../services/toast.service.js';
import { ViewController } from '../../../types/common.types.js';
import { bindFileDropzone, setupToolSidebarModal, ToolSidebarModalController, withButtonLoading } from '../../../utils/dom.util.js';
import { RotatePageItem, RotatePdfResponseData } from './rotate-pdf.types.js';

export class RotatePdfController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private currentFile: File | null = null;
  private isProcessing = false;
  private pages: RotatePageItem[] = [];
  private pdfDocument: any = null;
  private sidebarModal: ToolSidebarModalController | null = null;
  private statusManager: ToolStatusManager | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async init(): Promise<void> {
    this.abortController = new AbortController();
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="rotate-pdf-workspace"]') || this.container;
    this.statusManager = new ToolStatusManager({
      container: workspace,
      onRetry: () => {
        this.statusManager?.hide();
        if (this.currentFile) {
          const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="rotate-dropzone-card"]');
          const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="rotate-workspace-card"]');
          const sidebar = this.container.querySelector<HTMLElement>('[data-ref="rotate-pdf-sidebar"]');
          const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
          const fabMore = this.container.querySelector<HTMLElement>('[data-ref="tool-fab-more"]');
          const ws = this.container.querySelector<HTMLElement>('[data-ref="rotate-pdf-workspace"]');

          if (dropzoneCard) dropzoneCard.style.display = 'none';
          if (workspaceCard) workspaceCard.style.display = 'flex';
          if (sidebar) sidebar.style.display = 'flex';
          if (settingsBtn) settingsBtn.classList.add('is-visible');
          if (fabMore) fabMore.style.display = 'block';
          if (ws) ws.classList.add('tool-layout__workspace--top-aligned');
        } else {
          this.resetToInitial();
        }
      },
      toolName: 'Rotar PDF',
    });
    renderIcons(this.container);
    this.bindEvents();
  }

  public destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.statusManager) {
      this.statusManager.destroy();
      this.statusManager = null;
    }
    if (this.sidebarModal) {
      this.sidebarModal.destroy();
      this.sidebarModal = null;
    }
    if (this.pdfDocument) {
      try {
        void this.pdfDocument.destroy();
      } catch {}
      this.pdfDocument = null;
    }
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
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="rotate-dropzone-card"]');
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-pdf"]');
    const heroDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive"]');
    const heroDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const sidebarBackdrop = this.container.querySelector<HTMLElement>('[data-ref="tool-sidebar-backdrop"]');
    const sidebarCloseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-close"]');
    const sidebarDragZone = this.container.querySelector<HTMLElement>('[data-ref="modal-drag-zone"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="rotate-pdf-sidebar"]');

    this.sidebarModal = setupToolSidebarModal({
      backdrop: sidebarBackdrop,
      closeBtn: sidebarCloseBtn,
      dragZone: sidebarDragZone,
      settingsBtn,
      sidebar,
      signal,
    });

    browseBtn?.addEventListener('click', () => fileInput?.click(), { signal });

    const fabAddMoreBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-fab-add-more"]');
    const fabDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-fab-drive"]');
    const fabDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-fab-dropbox"]');

    fabAddMoreBtn?.addEventListener('click', () => fileInput?.click(), { signal });
    fabDriveBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.handleDriveImport();
    }, { signal });
    fabDropboxBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.handleDropboxImport();
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
    const rotateAllRightBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-rotate-all-right"]');
    const rotateAllLeftBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-rotate-all-left"]');
    const sidebarRotateRightBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-rotate-right"]');
    const sidebarRotateLeftBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-rotate-left"]');
    const resetRotationsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-reset-rotations"]');
    const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-rotate"]');
    const pagesGrid = this.container.querySelector<HTMLElement>('[data-ref="rotate-pages-grid"]');

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

    if (dropzoneCard) {
      bindFileDropzone({
        dropTarget: dropzoneCard,
        onFiles: (files) => {
          if (files.length > 0) void this.handleFileSelected(files[0]);
        },
        signal,
        visualTarget: dropzoneCard,
      });
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
      if (workspaceCard) workspaceCard.style.display = 'flex';
      if (executeBtn) executeBtn.disabled = false;

      const countBadge = this.container.querySelector<HTMLElement>('[data-ref="pdf-count-badge"]');
      if (countBadge) countBadge.textContent = String(count);

      const sidebar = this.container.querySelector<HTMLElement>('[data-ref="rotate-pdf-sidebar"]');
      const settingsBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
      const workspace = this.container.querySelector<HTMLElement>('[data-ref="rotate-pdf-workspace"]');
      const topActions = this.container.querySelector<HTMLElement>('[data-ref="rotate-top-actions"]');
      const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
      if (sidebar) sidebar.style.display = 'flex';
      if (settingsBtn) settingsBtn.classList.add('is-visible');
      const fabMore = this.container.querySelector<HTMLElement>('[data-ref="tool-fab-more"]');
      if (fabMore) fabMore.style.display = 'block';
      if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');
      if (topActions) topActions.style.display = 'flex';
      if (outputNameInput) {
        const base = file.name.replace(/\.[^/.]+$/, '');
        outputNameInput.value = `${base}_rotado.pdf`;
      }

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

  private showProcessingState(): void {
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="rotate-dropzone-card"]');
    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="rotate-workspace-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="rotate-pdf-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const fabMore = this.container.querySelector<HTMLElement>('[data-ref="tool-fab-more"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="rotate-pdf-workspace"]');

    if (sidebar) sidebar.style.display = 'none';
    if (fabMore) fabMore.style.display = 'none';
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    this.sidebarModal?.close();
    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (workspaceCard) workspaceCard.style.display = 'none';
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
  }

  private async handleExecuteRotate(button: HTMLButtonElement): Promise<void> {
    if (!this.currentFile || this.isProcessing) return;
    this.hideError();

    this.isProcessing = true;
    this.showProcessingState();
    this.statusManager?.showUploading(1, 1);

    await withButtonLoading(button, async () => {
      try {
        const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
        const customFilename = outputNameInput?.value.trim();

        const formData = new FormData();
        formData.append('file', this.currentFile as Blob, this.currentFile?.name);
        if (customFilename) {
          formData.append('filename', customFilename);
        }

        const optionsPayload = {
          pages: this.pages.map((p) => ({
            pageIndex: p.originalIndex,
            rotation: p.rotation,
          })),
        };

        formData.append('options', JSON.stringify(optionsPayload));

        const response = await postFormWithProgress(
          API_ROUTES.tools.rotatePdf.process,
          formData,
          (progress) => {
            this.statusManager?.updateUploadProgress(progress);
          }
        );
        const result = (await response.json()) as {
          data?: RotatePdfResponseData;
          error?: string;
          success: boolean;
        };

        this.statusManager?.showProcessing('Rotando páginas del PDF...');

        if (!response.ok || !result.success || !result.data?.downloadUrl) {
          throw new Error(result.error || 'Ocurrió un error al procesar la rotación del documento.');
        }

        const token = result.data.fileId;
        const downloadPayload = {
          downloadUrl: `/api/download/${token}`,
          fileSize: result.data.fileSize,
          filename: customFilename || result.data.filename,
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
        const errorMessage = err instanceof Error ? err.message : 'Error inesperado al rotar el documento.';
        this.statusManager?.showError(errorMessage, () => {
          this.statusManager?.hide();
        });
        this.showError(errorMessage);
      }
    });
  }

  private resetToInitial(): void {
    this.currentFile = null;
    this.pages = [];
    this.pdfDocument = null;
    this.isProcessing = false;
    this.statusManager?.hide();

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
    const topActions = this.container.querySelector<HTMLElement>('[data-ref="rotate-top-actions"]');
    const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
    if (sidebar) sidebar.style.display = 'none';
    const fabMore = this.container.querySelector<HTMLElement>('[data-ref="tool-fab-more"]');
    if (fabMore) fabMore.style.display = 'none';
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
    if (topActions) topActions.style.display = 'none';
    if (outputNameInput) outputNameInput.value = 'documento_rotado.pdf';
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
