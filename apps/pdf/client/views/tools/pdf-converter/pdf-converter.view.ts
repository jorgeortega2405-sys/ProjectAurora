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
import { CONVERSION_CONFIGS, ConversionRouteConfig } from './pdf-converter.types.js';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export class PdfConverterController implements ViewController {
  private abortController: AbortController | null = null;
  private config: ConversionRouteConfig;
  private container: HTMLElement;
  private currentFile: File | null = null;
  private isConverting = false;
  private sidebarModal: ToolSidebarModalController | null = null;
  private statusManager: ToolStatusManager | null = null;

  constructor(container: HTMLElement, targetType?: string) {
    this.container = container;
    const currentPath = window.location.pathname;
    this.config = CONVERSION_CONFIGS[currentPath] ||
      Object.values(CONVERSION_CONFIGS).find((c) => c.targetType === targetType) ||
      CONVERSION_CONFIGS['/pdf-to-word'];
  }

  public async init(): Promise<void> {
    this.abortController = new AbortController();
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="pdf-converter-workspace"]') || this.container;
    this.statusManager = new ToolStatusManager({
      container: workspace,
      onRetry: () => {
        this.statusManager?.hide();
        if (this.currentFile) {
          const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="converter-dropzone-card"]');
          const selectedCard = this.container.querySelector<HTMLElement>('[data-ref="converter-selected-card"]');
          const sidebar = this.container.querySelector<HTMLElement>('[data-ref="pdf-converter-sidebar"]');
          const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
          const fabMore = this.container.querySelector<HTMLElement>('[data-ref="tool-fab-more"]');
          const ws = this.container.querySelector<HTMLElement>('[data-ref="pdf-converter-workspace"]');

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
      toolName: this.config.title,
    });
    this.applyConfiguration();
    renderIcons(this.container);
    this.bindEvents();
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

  private applyConfiguration(): void {
    const heroTitleEl = this.container.querySelector<HTMLElement>('[data-ref="converter-dropzone-title"]');
    if (heroTitleEl) heroTitleEl.textContent = this.config.title;

    const heroDescEl = this.container.querySelector<HTMLElement>('[data-ref="converter-dropzone-desc"]');
    if (heroDescEl) heroDescEl.textContent = this.config.subtitle;

    const titleEl = this.container.querySelector<HTMLElement>('[data-ref="converter-sidebar-title"]');
    if (titleEl) titleEl.textContent = this.config.title;

    const subtitleEl = this.container.querySelector<HTMLElement>('[data-ref="converter-sidebar-subtitle"]');
    if (subtitleEl) subtitleEl.textContent = this.config.subtitle;

    const actionTextEl = this.container.querySelector<HTMLElement>('[data-ref="txt-convert-action"]');
    if (actionTextEl) actionTextEl.textContent = this.config.actionText;
  }

  private bindEvents(): void {
    if (!this.abortController) return;
    const { signal } = this.abortController;

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="pdf-converter-sidebar"]');
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="tool-sidebar-backdrop"]');
    const dragZone = this.container.querySelector<HTMLElement>('[data-ref="modal-drag-zone"]');
    const closeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-close"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');

    if (sidebar && backdrop && settingsBtn) {
      this.sidebarModal = setupToolSidebarModal({ backdrop, closeBtn, dragZone, settingsBtn, sidebar, signal });
    }

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="converter-dropzone"]');
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-file"]');
    const heroDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive"]');
    const heroDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox"]');
    const fabAddMoreBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-fab-add-more"]');
    const fabDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-fab-drive"]');
    const fabDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-fab-dropbox"]');
    const removeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-remove-file"]');
    const convertBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-convert-action"]');

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

    convertBtn?.addEventListener('click', () => {
      void this.handleConvert(convertBtn);
    }, { signal });
  }

  private handleFileSelected(file: File): void {
    this.hideError();
    const limits = getCurrentUserToolLimits('pdf-converter');
    if (file.size > limits.maxFileSizeMB * 1024 * 1024) {
      this.showError(`El archivo excede el tamaño máximo permitido (${limits.maxFileSizeMB} MB).`);
      return;
    }

    this.currentFile = file;

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="converter-dropzone-card"]');
    const selectedCard = this.container.querySelector<HTMLElement>('[data-ref="converter-selected-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="pdf-converter-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const fabMore = this.container.querySelector<HTMLElement>('[data-ref="tool-fab-more"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="pdf-converter-workspace"]');
    const fileNameEl = this.container.querySelector<HTMLElement>('[data-ref="selected-file-name"]');
    const fileSizeEl = this.container.querySelector<HTMLElement>('[data-ref="selected-file-size"]');
    const convertBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-convert-action"]');

    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileSizeEl) fileSizeEl.textContent = formatBytes(file.size);
    if (convertBtn) convertBtn.disabled = false;

    if (dropzoneCard) dropzoneCard.style.display = 'none';
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
    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    if (fileInput) fileInput.value = '';

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="converter-dropzone-card"]');
    const selectedCard = this.container.querySelector<HTMLElement>('[data-ref="converter-selected-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="pdf-converter-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const fabMore = this.container.querySelector<HTMLElement>('[data-ref="tool-fab-more"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="pdf-converter-workspace"]');
    const convertBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-convert-action"]');

    if (dropzoneCard) dropzoneCard.style.display = '';
    if (selectedCard) selectedCard.style.display = 'none';

    if (sidebar) sidebar.style.display = 'none';
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    if (fabMore) fabMore.style.display = 'none';
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
    this.sidebarModal?.close();

    if (convertBtn) convertBtn.disabled = true;

    const canvas = this.container.querySelector<HTMLCanvasElement>('[data-ref="doc-preview-canvas"]');
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }

    this.statusManager?.hide();
    this.hideError();
  }

  private showProcessingState(): void {
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="converter-dropzone-card"]');
    const selectedCard = this.container.querySelector<HTMLElement>('[data-ref="converter-selected-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="pdf-converter-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const fabMore = this.container.querySelector<HTMLElement>('[data-ref="tool-fab-more"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="pdf-converter-workspace"]');

    if (sidebar) sidebar.style.display = 'none';
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    if (fabMore) fabMore.style.display = 'none';
    this.sidebarModal?.close();
    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (selectedCard) selectedCard.style.display = 'none';
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
  }

  private async handleConvert(button: HTMLButtonElement): Promise<void> {
    if (!this.currentFile || this.isConverting) return;
    this.hideError();

    this.isConverting = true;
    this.showProcessingState();
    this.statusManager?.showUploading(1, 1);

    await withButtonLoading(button, async () => {
      try {
        const formData = new FormData();
        formData.append('file', this.currentFile as Blob, this.currentFile?.name);
        formData.append('targetType', this.config.targetType);

        const response = await postFormWithProgress(
          API_ROUTES.tools.pdfConverter.convert,
          formData,
          (progress) => {
            this.statusManager?.updateUploadProgress(progress, 1);
          },
          this.abortController?.signal
        );
        const result = (await response.json()) as { data?: { downloadToken: string }; error?: string; success: boolean };

        if (!response.ok || !result.success || !result.data?.downloadToken) {
          throw new Error(result.error || 'Error procesando la conversión.');
        }

        const token = result.data.downloadToken;
        sessionStorage.setItem(
          'download_ready_data',
          JSON.stringify({
            downloadUrl: `/api/download/${token}`,
            fileSize: this.currentFile?.size || 0,
            filename: `${(this.currentFile?.name || 'documento').replace(/\.[^/.]+$/, '')}${this.config.targetExtension}`,
            returnText: this.config.title,
            returnUrl: window.location.pathname,
            subtitle: `Tu documento PDF ha sido convertido a formato ${this.config.targetBadge} con total precisión.`,
            title: `¡${this.config.title} completada con éxito!`,
            token,
          })
        );

        showToast('Documento convertido exitosamente', 'success');
        navigate(`/download/${token}`);
      } catch {
        this.statusManager?.showError({
          boxText: 'Comprueba que el documento PDF sea válido, no esté bloqueado o protegido por contraseña, y vuelve a intentarlo.',
          boxTitle: 'Error en la conversión',
          desc: 'Ha ocurrido un error inesperado al convertir el documento. Por favor intenta más tarde.',
          retryText: 'Reintentar Conversión',
          title: '¡Oh no! No hemos podido convertir tu archivo.',
        });
      } finally {
        this.isConverting = false;
      }
    });
  }

  private showError(msg: string): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="converter-global-error"]');
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    }
  }

  private hideError(): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="converter-global-error"]');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }
}

export async function createPdfConverterView(targetType?: string): Promise<HTMLElement> {
  const container = await loadTemplate('/views/tools/pdf-converter/pdf-converter.html');
  const controller = new PdfConverterController(container, targetType);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
