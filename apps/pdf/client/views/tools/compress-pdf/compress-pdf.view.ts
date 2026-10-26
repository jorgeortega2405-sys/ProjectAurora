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
import { consumeTransferFile } from '../../../services/transfer.service.js';
import { ViewController } from '../../../types/common.types.js';
import { bindFileDropzone, setupToolSidebarModal, ToolSidebarModalController, withButtonLoading } from '../../../utils/dom.util.js';
import { ClientPdfCompressLevel, CompressResultData } from './compress-pdf.types.js';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export class CompressPdfController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private currentFile: File | null = null;
  private currentResult: CompressResultData | null = null;
  private isProcessing = false;
  private selectedLevel: ClientPdfCompressLevel = 'recommended';
  private sidebarModal: ToolSidebarModalController | null = null;
  private statusManager: ToolStatusManager | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async init(): Promise<void> {
    this.abortController = new AbortController();
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="compress-pdf-workspace"]') || this.container;
    this.statusManager = new ToolStatusManager({
      container: workspace,
      onRetry: () => {
        this.statusManager?.hide();
        if (this.currentFile) {
          const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="compress-dropzone-card"]');
          const selectedCard = this.container.querySelector<HTMLElement>('[data-ref="compress-selected-card"]');
          const sidebar = this.container.querySelector<HTMLElement>('[data-ref="compress-pdf-sidebar"]');
          const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
          const fabMore = this.container.querySelector<HTMLElement>('[data-ref="tool-fab-more"]');
          const ws = this.container.querySelector<HTMLElement>('[data-ref="compress-pdf-workspace"]');

          if (dropzoneCard) dropzoneCard.style.display = 'none';
          if (selectedCard) selectedCard.style.display = 'flex';
          if (sidebar) sidebar.style.display = 'flex';
          if (settingsBtn) settingsBtn.classList.add('is-visible');
          if (fabMore) fabMore.style.display = 'block';
          if (ws) ws.classList.add('tool-layout__workspace--top-aligned');
        } else {
          this.resetSelectedFile();
        }
      },
      toolName: 'Comprimir PDF',
    });
    renderIcons(this.container);
    this.bindEvents();
    const transferred = consumeTransferFile();
    if (transferred) {
      this.handleFileSelected(transferred);
    }
  }

  public destroy(): void {
    if (this.sidebarModal) {
      this.sidebarModal.destroy();
      this.sidebarModal = null;
    }
    if (this.statusManager) {
      this.statusManager.destroy();
      this.statusManager = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private bindEvents(): void {
    if (!this.abortController) return;
    const { signal } = this.abortController;

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="compress-pdf-sidebar"]');
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="tool-sidebar-backdrop"]');
    const dragZone = this.container.querySelector<HTMLElement>('[data-ref="modal-drag-zone"]');
    const closeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-close"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');

    if (sidebar && backdrop && settingsBtn) {
      this.sidebarModal = setupToolSidebarModal({ backdrop, closeBtn, dragZone, settingsBtn, sidebar, signal });
    }

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="compress-dropzone"]');
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-file"]');
    const heroDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive"]');
    const heroDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox"]');
    const fabAddMoreBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-fab-add-more"]');
    const fabDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-fab-drive"]');
    const fabDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-fab-dropbox"]');
    const removeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-remove-file"]');
    const compressBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-compress-action"]');
    const downloadBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-download-result"]');
    const anotherBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-compress-another"]');

    browseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput?.click();
    }, { signal });

    fabAddMoreBtn?.addEventListener('click', (e) => {
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

    fabDriveBtn?.addEventListener('click', async (e) => {
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

    fabDropboxBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const files = await pickDropboxFiles({ multiselect: false });
      if (files && files.length > 0) {
        this.handleFileSelected(files[0]);
      }
    }, { signal });

    dropzone?.addEventListener('click', () => {
      fileInput?.click();
    }, { signal });

    removeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resetSelectedFile();
    }, { signal });

    fileInput?.addEventListener('change', () => {
      const files = fileInput.files;
      if (files && files.length > 0) {
        this.handleFileSelected(files[0]);
      }
    }, { signal });

    if (dropzone) {
      bindFileDropzone({
        dropTarget: dropzone,
        visualTarget: dropzone,
        onFiles: (files) => {
          if (files.length > 0) {
            this.handleFileSelected(files[0]);
          }
        },
        signal,
      });
    }

    const optionsContainer = this.container.querySelector<HTMLElement>('[data-ref="compress-options-container"]');
    optionsContainer?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const optionLabel = target.closest<HTMLLabelElement>('.pdf-compress-option');
      if (!optionLabel) return;

      const level = optionLabel.getAttribute('data-level') as ClientPdfCompressLevel;
      if (level) {
        this.selectedLevel = level;
        this.updateActiveLevelOption(level);
      }
    }, { signal });

    compressBtn?.addEventListener('click', () => {
      void this.handleCompress(compressBtn);
    }, { signal });

    downloadBtn?.addEventListener('click', () => {
      if (this.currentResult?.downloadUrl) {
        window.location.href = this.currentResult.downloadUrl;
      }
    }, { signal });

    anotherBtn?.addEventListener('click', () => {
      this.resetToDropzone();
    }, { signal });
  }

  private updateActiveLevelOption(level: ClientPdfCompressLevel): void {
    const options = this.container.querySelectorAll<HTMLLabelElement>('.pdf-compress-option');
    options.forEach((opt) => {
      const optLevel = opt.getAttribute('data-level');
      const radio = opt.querySelector<HTMLInputElement>('input[type="radio"]');
      if (optLevel === level) {
        opt.classList.add('is-active');
        if (radio) radio.checked = true;
      } else {
        opt.classList.remove('is-active');
        if (radio) radio.checked = false;
      }
    });
  }

  private handleFileSelected(file: File): void {
    this.hideError();
    const limits = getCurrentUserToolLimits('compress-pdf');
    if (file.size > limits.maxFileSizeMB * 1024 * 1024) {
      this.showError(`El archivo excede el tamaño máximo permitido (${limits.maxFileSizeMB} MB).`);
      return;
    }

    this.currentFile = file;

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="compress-dropzone-card"]');
    const selectedCard = this.container.querySelector<HTMLElement>('[data-ref="compress-selected-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="compress-result-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="compress-pdf-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const fabMore = this.container.querySelector<HTMLElement>('[data-ref="tool-fab-more"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="compress-pdf-workspace"]');
    const fileNameEl = this.container.querySelector<HTMLElement>('[data-ref="selected-file-name"]');
    const fileSizeEl = this.container.querySelector<HTMLElement>('[data-ref="selected-file-size"]');
    const compressBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-compress-action"]');

    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileSizeEl) fileSizeEl.textContent = formatBytes(file.size);
    if (compressBtn) compressBtn.disabled = false;

    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'none';
    if (selectedCard) selectedCard.style.display = 'flex';

    if (sidebar) sidebar.style.display = 'flex';
    if (settingsBtn) settingsBtn.classList.add('is-visible');
    if (fabMore) fabMore.style.display = 'block';
    if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');

    const canvas = this.container.querySelector<HTMLCanvasElement>('[data-ref="doc-preview-canvas"]');
    if (canvas) {
      void this.renderThumbnail(file, canvas);
    }
  }

  private async renderThumbnail(file: File, canvas: HTMLCanvasElement): Promise<void> {
    let pdf: any = null;
    try {
      const pdfjs = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
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
    } finally {
      try {
        if (pdf) await pdf.destroy();
      } catch {}
    }
  }

  private resetSelectedFile(): void {
    this.currentFile = null;
    this.currentResult = null;
    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    if (fileInput) fileInput.value = '';

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="compress-dropzone-card"]');
    const selectedCard = this.container.querySelector<HTMLElement>('[data-ref="compress-selected-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="compress-result-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="compress-pdf-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const fabMore = this.container.querySelector<HTMLElement>('[data-ref="tool-fab-more"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="compress-pdf-workspace"]');
    const compressBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-compress-action"]');

    if (dropzoneCard) dropzoneCard.style.display = '';
    if (selectedCard) selectedCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'none';

    if (sidebar) sidebar.style.display = 'none';
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    if (fabMore) fabMore.style.display = 'none';
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
    this.sidebarModal?.close();

    if (compressBtn) compressBtn.disabled = true;

    const canvas = this.container.querySelector<HTMLCanvasElement>('[data-ref="doc-preview-canvas"]');
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }

    this.statusManager?.hide();
    this.hideError();
  }

  private resetToDropzone(): void {
    this.resetSelectedFile();
  }

  private showProcessingState(): void {
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="compress-dropzone-card"]');
    const selectedCard = this.container.querySelector<HTMLElement>('[data-ref="compress-selected-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="compress-result-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="compress-pdf-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const fabMore = this.container.querySelector<HTMLElement>('[data-ref="tool-fab-more"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="compress-pdf-workspace"]');

    if (sidebar) sidebar.style.display = 'none';
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    if (fabMore) fabMore.style.display = 'none';
    this.sidebarModal?.close();
    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (selectedCard) selectedCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'none';
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
  }

  private async handleCompress(button: HTMLButtonElement): Promise<void> {
    if (!this.currentFile || this.isProcessing) return;
    this.hideError();

    this.isProcessing = true;
    this.showProcessingState();
    this.statusManager?.showUploading(1, 1);

    await withButtonLoading(button, async () => {
      try {
        const formData = new FormData();
        formData.append('pdf', this.currentFile as Blob, this.currentFile?.name);
        formData.append('level', this.selectedLevel);

        const response = await postFormWithProgress(
          API_ROUTES.tools.compressPdf.compress,
          formData,
          (progress) => {
            this.statusManager?.updateUploadProgress(progress, 1);
          },
          this.abortController?.signal
        );
        const result = (await response.json()) as { data?: CompressResultData; error?: string; success: boolean };

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error || 'Error al comprimir el archivo PDF.');
        }

        this.currentResult = result.data;
        const token = result.data.fileId;
        const downloadPayload = {
          downloadUrl: `/api/download/${token}`,
          fileSize: result.data.compressedSize,
          filename: result.data.filename,
          returnText: 'Comprimir otro documento PDF',
          returnUrl: '/compress-pdf',
          subtitle: `El archivo "${this.currentFile?.name}" se ha comprimido exitosamente.`,
          title: '¡PDF comprimido con éxito!',
          token,
        };
        sessionStorage.setItem('download_ready_data', JSON.stringify(downloadPayload));
        showToast('PDF comprimido con éxito.', 'success');
        this.statusManager?.hide();
        navigate(`/download/${token}`);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Error inesperado al comprimir el PDF.';
        this.statusManager?.showError({
          boxText: 'Comprueba que el documento no esté protegido con contraseña o dañado.',
          boxTitle: 'Error de compresión',
          desc: errorMessage,
          retryText: 'Reintentar Comprimir PDF',
          title: '¡Oh no! No hemos podido comprimir tu archivo.',
        });
      } finally {
        this.isProcessing = false;
      }
    });
  }

  private showError(msg: string): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="compress-global-error"]');
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    }
  }

  private hideError(): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="compress-global-error"]');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }
}

export async function createCompressPdfView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/tools/compress-pdf/compress-pdf.html');
  const controller = new CompressPdfController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
