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
import { RepairResultData } from './repair-pdf.types.js';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export class RepairPdfController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private currentFile: File | null = null;
  private currentResult: RepairResultData | null = null;
  private isProcessing = false;
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
    if (this.sidebarModal) {
      this.sidebarModal.destroy();
      this.sidebarModal = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private bindEvents(): void {
    if (!this.abortController) return;
    const { signal } = this.abortController;

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="repair-pdf-sidebar"]');
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="tool-sidebar-backdrop"]');
    const dragZone = this.container.querySelector<HTMLElement>('[data-ref="modal-drag-zone"]');
    const closeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-close"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');

    if (sidebar && backdrop && settingsBtn) {
      this.sidebarModal = setupToolSidebarModal({ backdrop, closeBtn, dragZone, settingsBtn, sidebar, signal });
    }

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="repair-dropzone"]');
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-file"]');
    const heroDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive"]');
    const heroDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox"]');
    const changeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-change-file"]');
    const repairBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-repair-action"]');
    const downloadBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-download-result"]');
    const anotherBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-repair-another"]');

    browseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput?.click();
    }, { signal });

    heroDriveBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const files = await pickGoogleDriveFiles({ multiselect: false });
      if (files && files.length > 0) {
        this.handleFileSelected(files[0]);
      }
    }, { signal });

    heroDropboxBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const files = await pickDropboxFiles({ multiselect: false });
      if (files && files.length > 0) {
        this.handleFileSelected(files[0]);
      }
    }, { signal });

    dropzone?.addEventListener('click', () => {
      fileInput?.click();
    }, { signal });

    changeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resetSelectedFile();
      fileInput?.click();
    }, { signal });

    fileInput?.addEventListener('change', () => {
      const files = fileInput.files;
      if (files && files.length > 0) {
        this.handleFileSelected(files[0]);
      }
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
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          this.handleFileSelected(files[0]);
        }
      }, { signal });
    }

    repairBtn?.addEventListener('click', () => {
      void this.handleRepair(repairBtn);
    }, { signal });

    downloadBtn?.addEventListener('click', () => {
      this.handleDownload();
    }, { signal });

    anotherBtn?.addEventListener('click', () => {
      this.resetToDropzone();
    }, { signal });
  }

  private handleFileSelected(file: File): void {
    this.hideError();

    const limits = getCurrentUserToolLimits('repair-pdf');
    const maxSizeBytes = limits.maxFileSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      this.showError(`El archivo supera el límite de ${limits.maxFileSizeMB} MB para tu plan actual. Actualiza tu suscripción para procesar archivos de mayor tamaño.`);
      return;
    }

    this.currentFile = file;
    this.renderSelectedState(file);
  }

  private renderSelectedState(file: File): void {
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="repair-dropzone-card"]');
    const selectedCard = this.container.querySelector<HTMLElement>('[data-ref="repair-selected-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="repair-result-card"]');
    const fileNameEl = this.container.querySelector<HTMLElement>('[data-ref="selected-file-name"]');
    const fileSizeEl = this.container.querySelector<HTMLElement>('[data-ref="selected-file-size"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="repair-pdf-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="repair-pdf-workspace"]');
    const repairBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-repair-action"]');

    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'none';
    if (selectedCard) selectedCard.style.display = '';

    if (sidebar) sidebar.style.display = 'flex';
    if (settingsBtn) settingsBtn.classList.add('is-visible');
    if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');

    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileSizeEl) fileSizeEl.textContent = formatBytes(file.size);
    if (repairBtn) repairBtn.disabled = false;

    const canvas = this.container.querySelector<HTMLCanvasElement>('[data-ref="doc-preview-canvas"]');
    if (canvas) {
      void this.renderThumbnail(file, canvas);
    }
  }

  private async renderThumbnail(file: File, canvas: HTMLCanvasElement): Promise<void> {
    try {
      const pdfjs = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const targetWidth = 180;
      const origViewport = page.getViewport({ scale: 1 });
      const scale = targetWidth / origViewport.width;
      const viewport = page.getViewport({ scale });
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        await page.render({ canvasContext: ctx, viewport }).promise;
      }
    } catch {
      // Ignore preview errors for corrupted files
    }
  }

  private resetSelectedFile(): void {
    this.currentFile = null;
    this.currentResult = null;
    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    if (fileInput) fileInput.value = '';

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="repair-dropzone-card"]');
    const selectedCard = this.container.querySelector<HTMLElement>('[data-ref="repair-selected-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="repair-result-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="repair-pdf-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="repair-pdf-workspace"]');
    const repairBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-repair-action"]');

    if (dropzoneCard) dropzoneCard.style.display = '';
    if (selectedCard) selectedCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'none';

    if (sidebar) sidebar.style.display = 'none';
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
    this.sidebarModal?.close();

    if (repairBtn) repairBtn.disabled = true;

    const canvas = this.container.querySelector<HTMLCanvasElement>('[data-ref="doc-preview-canvas"]');
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }

    this.hideError();
  }

  private resetToDropzone(): void {
    this.resetSelectedFile();
  }

  private async handleRepair(button: HTMLButtonElement): Promise<void> {
    if (!this.currentFile || this.isProcessing) return;
    this.hideError();

    const selectedCard = this.container.querySelector<HTMLElement>('[data-ref="repair-selected-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="repair-processing-card"]');

    this.isProcessing = true;
    if (selectedCard) selectedCard.style.display = 'none';
    if (processingCard) processingCard.style.display = '';

    await withButtonLoading(button, async () => {
      try {
        const formData = new FormData();
        formData.append('pdf', this.currentFile as Blob, this.currentFile?.name);

        const response = await postFormApi(API_ROUTES.tools.repairPdf.repair, formData);
        const result = (await response.json()) as { data?: RepairResultData; error?: string; success: boolean };

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error || 'Error al reparar el archivo PDF.');
        }

        this.currentResult = result.data;
        const token = result.data.fileId;
        const downloadPayload = {
          downloadUrl: `/api/download/${token}`,
          fileSize: result.data.repairedSize,
          filename: result.data.filename,
          returnText: 'Reparar otro documento PDF',
          returnUrl: '/repair-pdf',
          subtitle: `Se ha reparado exitosamente el archivo "${this.currentFile?.name}".`,
          title: '¡PDF reparado con éxito!',
          token,
        };
        sessionStorage.setItem('download_ready_data', JSON.stringify(downloadPayload));
        showToast('PDF reparado con éxito.', 'success');
        navigate(`/download/${token}`);
      } catch (err: unknown) {
        if (selectedCard) selectedCard.style.display = '';
        const errorMessage = err instanceof Error ? err.message : 'Error inesperado al reparar el PDF.';
        this.showError(errorMessage);
      } finally {
        this.isProcessing = false;
        if (processingCard) processingCard.style.display = 'none';
      }
    });
  }

  private renderResultState(data: RepairResultData): void {
    const selectedCard = this.container.querySelector<HTMLElement>('[data-ref="repair-selected-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="repair-processing-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="repair-result-card"]');
    const pagesEl = this.container.querySelector<HTMLElement>('[data-ref="val-recovered-pages"]');
    const sizeEl = this.container.querySelector<HTMLElement>('[data-ref="val-repaired-size"]');

    if (selectedCard) selectedCard.style.display = 'none';
    if (processingCard) processingCard.style.display = 'none';
    if (resultCard) resultCard.style.display = '';

    if (pagesEl) pagesEl.textContent = `${data.pageCount} ${data.pageCount === 1 ? 'página' : 'páginas'}`;
    if (sizeEl) sizeEl.textContent = formatBytes(data.repairedSize);
  }

  private handleDownload(): void {
    if (!this.currentResult?.downloadUrl) return;
    const downloadLink = document.createElement('a');
    downloadLink.href = this.currentResult.downloadUrl;
    downloadLink.download = this.currentResult.filename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    showToast('Iniciando descarga del PDF reparado...', 'success');
  }

  private showError(message: string): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="repair-global-error"]');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = '';
    }
  }

  private hideError(): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="repair-global-error"]');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }
}

export async function createRepairPdfView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/tools/repair-pdf/repair-pdf.html');
  const controller = new RepairPdfController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
