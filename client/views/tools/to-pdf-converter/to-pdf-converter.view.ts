import { navigate } from '../../../app-router.js';
import { API_ROUTES } from '../../../config/api-routes.js';
import { getCurrentUserToolLimits } from '../../../config/tools-limits.config.js';
import { postFormApi } from '../../../services/api.service.js';
import { pickDropboxFiles } from '../../../services/dropbox.service.js';
import { pickGoogleDriveFiles } from '../../../services/google-drive.service.js';
import { renderIcons } from '../../../services/icon.service.js';
import { loadTemplate } from '../../../services/template.service.js';
import { showToast } from '../../../services/toast.service.js';
import { ViewController } from '../../../types/common.types.js';
import { bindFileDropzone, setupToolSidebarModal, ToolSidebarModalController, withButtonLoading } from '../../../utils/dom.util.js';
import { TO_PDF_CONFIGS, ToPdfRouteConfig, ToPdfSourceType } from './to-pdf-converter.types.js';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export class ToPdfConverterController implements ViewController {
  private abortController: AbortController | null = null;
  private config: ToPdfRouteConfig;
  private container: HTMLElement;
  private currentFile: File | null = null;
  private isConverting = false;
  private previewImageUrl: string | null = null;
  private sidebarModal: ToolSidebarModalController | null = null;

  constructor(container: HTMLElement, sourceType?: ToPdfSourceType) {
    this.container = container;
    const currentPath = window.location.pathname;
    this.config = TO_PDF_CONFIGS[currentPath] ||
      Object.values(TO_PDF_CONFIGS).find((c) => c.sourceType === sourceType) ||
      TO_PDF_CONFIGS['/word-to-pdf'];
  }

  public async init(): Promise<void> {
    this.abortController = new AbortController();
    this.applyConfiguration();
    renderIcons(this.container);
    this.bindEvents();
  }

  public destroy(): void {
    if (this.sidebarModal) {
      this.sidebarModal.destroy();
      this.sidebarModal = null;
    }
    if (this.previewImageUrl) {
      URL.revokeObjectURL(this.previewImageUrl);
      this.previewImageUrl = null;
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

    const processingTitleEl = this.container.querySelector<HTMLElement>('[data-ref="converter-processing-title"]');
    if (processingTitleEl) processingTitleEl.textContent = this.config.convertingText;

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-source-file"]');
    if (fileInput) fileInput.accept = this.config.accept;

    const iconBoxUse = this.container.querySelector<SVGElement>('[data-ref="selected-file-symbol"] use');
    if (iconBoxUse) iconBoxUse.setAttribute('href', `/icons.svg#${this.config.icon}`);
  }

  private bindEvents(): void {
    if (!this.abortController) return;
    const { signal } = this.abortController;

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="to-pdf-converter-sidebar"]');
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="tool-sidebar-backdrop"]');
    const dragZone = this.container.querySelector<HTMLElement>('[data-ref="modal-drag-zone"]');
    const closeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-close"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');

    if (sidebar && backdrop && settingsBtn) {
      this.sidebarModal = setupToolSidebarModal({ backdrop, closeBtn, dragZone, settingsBtn, sidebar, signal });
    }

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-source-file"]');
    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="converter-dropzone"]');
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-file"]');
    const heroDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive"]');
    const heroDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox"]');
    const removeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-remove-file"]');
    const convertBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-convert-action"]');

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

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="converter-dropzone-card"]');
    const dropTarget = dropzoneCard || dropzone;
    bindFileDropzone({
      dropTarget,
      visualTarget: dropTarget,
      onFiles: (files) => {
        if (files.length > 0) {
          this.handleFileSelected(files[0]);
        }
      },
      signal,
    });

    convertBtn?.addEventListener('click', () => {
      void this.handleConvert(convertBtn);
    }, { signal });
  }

  private handleFileSelected(file: File): void {
    const limits = getCurrentUserToolLimits('to-pdf-converter');
    const maxSizeBytes = limits.maxFileSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      this.showError(`El archivo supera el límite de ${limits.maxFileSizeMB} MB para tu plan actual. Actualiza tu suscripción para procesar archivos de mayor tamaño.`);
      return;
    }

    this.currentFile = file;
    this.hideError();

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="converter-dropzone-card"]');
    const selectedCard = this.container.querySelector<HTMLElement>('[data-ref="converter-selected-card"]');
    const fileNameEl = this.container.querySelector<HTMLElement>('[data-ref="selected-file-name"]');
    const fileSizeEl = this.container.querySelector<HTMLElement>('[data-ref="selected-file-size"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="to-pdf-converter-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="to-pdf-converter-workspace"]');
    const convertBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-convert-action"]');
    const imgEl = this.container.querySelector<HTMLImageElement>('[data-ref="doc-preview-img"]');
    const iconEl = this.container.querySelector<HTMLElement>('[data-ref="doc-preview-icon"]');

    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileSizeEl) fileSizeEl.textContent = formatBytes(file.size);
    if (convertBtn) convertBtn.disabled = false;

    if (this.previewImageUrl) {
      URL.revokeObjectURL(this.previewImageUrl);
      this.previewImageUrl = null;
    }

    if (file.type.startsWith('image/')) {
      this.previewImageUrl = URL.createObjectURL(file);
      if (imgEl) {
        imgEl.src = this.previewImageUrl;
        imgEl.style.display = 'block';
      }
      if (iconEl) iconEl.style.display = 'none';
    } else {
      if (imgEl) {
        imgEl.removeAttribute('src');
        imgEl.style.display = 'none';
      }
      if (iconEl) iconEl.style.display = 'flex';
    }

    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (selectedCard) selectedCard.style.display = 'flex';

    if (sidebar) sidebar.style.display = 'flex';
    if (settingsBtn) settingsBtn.classList.add('is-visible');
    if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');
  }

  private resetSelectedFile(): void {
    this.currentFile = null;
    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-source-file"]');
    if (fileInput) fileInput.value = '';

    if (this.previewImageUrl) {
      URL.revokeObjectURL(this.previewImageUrl);
      this.previewImageUrl = null;
    }

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="converter-dropzone-card"]');
    const selectedCard = this.container.querySelector<HTMLElement>('[data-ref="converter-selected-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="to-pdf-converter-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="to-pdf-converter-workspace"]');
    const convertBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-convert-action"]');
    const imgEl = this.container.querySelector<HTMLImageElement>('[data-ref="doc-preview-img"]');
    const iconEl = this.container.querySelector<HTMLElement>('[data-ref="doc-preview-icon"]');

    if (imgEl) {
      imgEl.removeAttribute('src');
      imgEl.style.display = 'none';
    }
    if (iconEl) iconEl.style.display = 'flex';

    if (dropzoneCard) dropzoneCard.style.display = '';
    if (selectedCard) selectedCard.style.display = 'none';

    if (sidebar) sidebar.style.display = 'none';
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
    this.sidebarModal?.close();

    if (convertBtn) convertBtn.disabled = true;
    this.hideError();
  }

  private async handleConvert(button: HTMLButtonElement): Promise<void> {
    if (!this.currentFile || this.isConverting) return;
    this.hideError();

    const selectedCard = this.container.querySelector<HTMLElement>('[data-ref="converter-selected-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="converter-processing-card"]');

    this.isConverting = true;
    if (selectedCard) selectedCard.style.display = 'none';
    if (processingCard) processingCard.style.display = '';

    await withButtonLoading(button, async () => {
      try {
        const formData = new FormData();
        formData.append('file', this.currentFile as Blob, this.currentFile?.name);
        formData.append('sourceType', this.config.sourceType);

        const response = await postFormApi(API_ROUTES.tools.toPdfConverter.convert, formData);
        const result = (await response.json()) as {
          data?: { downloadToken: string; downloadUrl: string; fileSize: number; filename: string };
          error?: string;
          success: boolean;
        };

        if (!response.ok || !result.success || !result.data?.downloadUrl) {
          throw new Error(result.error || 'Error procesando la conversión.');
        }

        const token = (result.data as any).downloadToken || (result.data as any).fileId;
        const downloadPayload = {
          downloadUrl: `/api/download/${token}`,
          fileSize: result.data.fileSize,
          filename: result.data.filename,
          returnText: 'Convertir otro archivo',
          returnUrl: window.location.pathname,
          subtitle: `Tu archivo "${this.currentFile?.name}" ha sido transformado exitosamente en PDF.`,
          title: '¡Conversión a PDF completada!',
          token,
        };

        sessionStorage.setItem('download_ready_data', JSON.stringify(downloadPayload));
        showToast('Conversión a PDF completada con éxito.', 'success');
        navigate(`/download/${token}`);
      } catch (err: unknown) {
        this.isConverting = false;
        if (processingCard) processingCard.style.display = 'none';
        if (selectedCard) selectedCard.style.display = '';
        const errorMessage = err instanceof Error ? err.message : 'Error inesperado al procesar la conversión.';
        this.showError(errorMessage);
      }
    });
  }

  private showError(message: string): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="converter-global-error"]');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = '';
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

export async function createToPdfConverterView(sourceType?: ToPdfSourceType): Promise<HTMLElement> {
  const container = await loadTemplate('/views/tools/to-pdf-converter/to-pdf-converter.html');
  const controller = new ToPdfConverterController(container, sourceType);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
