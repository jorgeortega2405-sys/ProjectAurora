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
import { bindFileDropzone, setupDropdown, setupToolSidebarModal, ToolSidebarModalController, withButtonLoading } from '../../../utils/dom.util.js';
import { TranslatePdfResultData } from './translate-pdf.types.js';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export class TranslatePdfViewController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private currentFile: File | null = null;
  private dropdownControllers: Array<{ destroy: () => void }> = [];
  private isProcessing = false;
  private sidebarModal: ToolSidebarModalController | null = null;
  private sourceLang: string = '';
  private statusManager: ToolStatusManager | null = null;
  private targetLang: string = 'ES';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async init(): Promise<void> {
    this.abortController = new AbortController();
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="translate-pdf-workspace"]');
    this.statusManager = new ToolStatusManager(workspace || this.container);
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
    this.dropdownControllers.forEach((ctrl) => ctrl.destroy());
    this.dropdownControllers = [];
    this.currentFile = null;
  }

  private bindEvents(): void {
    if (!this.abortController) return;
    const { signal } = this.abortController;

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="translate-pdf-sidebar"]');
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="tool-sidebar-backdrop"]');
    const dragZone = this.container.querySelector<HTMLElement>('[data-ref="translate-sidebar-drag-zone"]');
    const closeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-close"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');

    if (sidebar && backdrop) {
      this.sidebarModal = setupToolSidebarModal({ backdrop, closeBtn, dragZone, settingsBtn, sidebar, signal });
    }

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="translate-dropzone"]');
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="translate-dropzone-card"]');
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-file"]');
    const fabAddBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-translate-fab-add"]');
    const heroDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive"]');
    const heroDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox"]');
    const removeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-remove-file"]');
    const translateBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-translate-action"]');

    browseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput?.click();
    }, { signal });

    fabAddBtn?.addEventListener('click', (e) => {
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

    if (dropzoneCard) {
      bindFileDropzone({
        dropTarget: dropzoneCard,
        onFiles: (files) => {
          if (files.length > 0) this.handleFileSelected(files[0]);
        },
        signal,
        visualTarget: dropzoneCard,
      });
    }

    const wrapperSource = this.container.querySelector<HTMLElement>('[data-ref="wrapper-source-lang"]');
    if (wrapperSource) {
      const ctrl = setupDropdown(wrapperSource, {
        onSelect: (val: string) => {
          this.sourceLang = val || '';
        },
      });
      this.dropdownControllers.push(ctrl);
    }

    const wrapperTarget = this.container.querySelector<HTMLElement>('[data-ref="wrapper-target-lang"]');
    if (wrapperTarget) {
      const ctrl = setupDropdown(wrapperTarget, {
        onSelect: (val: string) => {
          this.targetLang = val || 'ES';
        },
      });
      this.dropdownControllers.push(ctrl);
    }

    translateBtn?.addEventListener('click', () => {
      void this.handleTranslate(translateBtn);
    }, { signal });
  }

  private handleFileSelected(file: File): void {
    this.hideError();

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      this.showError('Solo se permiten documentos en formato PDF.');
      return;
    }

    const limits = getCurrentUserToolLimits('translate-pdf');
    if (file.size > limits.maxFileSizeMB * 1024 * 1024) {
      this.showError(`El archivo PDF excede el límite máximo de ${limits.maxFileSizeMB} MB.`);
      return;
    }

    this.currentFile = file;
    this.renderSelectedState(file);
  }

  private renderSelectedState(file: File): void {
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="translate-dropzone-card"]');
    const selectedCard = this.container.querySelector<HTMLElement>('[data-ref="translate-selected-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="translate-processing-card"]');
    const fileNameEl = this.container.querySelector<HTMLElement>('[data-ref="selected-file-name"]');
    const fileSizeEl = this.container.querySelector<HTMLElement>('[data-ref="selected-file-size"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="translate-pdf-sidebar"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="translate-pdf-workspace"]');
    const translateBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-translate-action"]');

    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (processingCard) processingCard.style.display = 'none';
    if (selectedCard) selectedCard.style.display = 'flex';

    if (sidebar) sidebar.style.display = 'flex';
    if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');

    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileSizeEl) fileSizeEl.textContent = formatBytes(file.size);
    if (translateBtn) translateBtn.disabled = false;

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
    this.statusManager?.hide();
    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    if (fileInput) fileInput.value = '';

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="translate-dropzone-card"]');
    const selectedCard = this.container.querySelector<HTMLElement>('[data-ref="translate-selected-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="translate-pdf-sidebar"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="translate-pdf-workspace"]');
    const translateBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-translate-action"]');

    if (dropzoneCard) dropzoneCard.style.display = '';
    if (selectedCard) selectedCard.style.display = 'none';

    if (sidebar) sidebar.style.display = 'none';
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
    if (translateBtn) translateBtn.disabled = true;

    this.hideError();
  }

  private async handleTranslate(button: HTMLButtonElement): Promise<void> {
    if (!this.currentFile || this.isProcessing) return;
    this.hideError();

    this.isProcessing = true;
    const selectedCard = this.container.querySelector<HTMLElement>('[data-ref="translate-selected-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="translate-pdf-sidebar"]');
    if (selectedCard) selectedCard.style.display = 'none';
    if (sidebar) sidebar.style.display = 'none';
    this.statusManager?.showUploading(1, 1);

    await withButtonLoading(button, async () => {
      try {
        const formData = new FormData();
        formData.append('pdf', this.currentFile as Blob, this.currentFile?.name);
        formData.append('targetLang', this.targetLang);
        if (this.sourceLang) {
          formData.append('sourceLang', this.sourceLang);
        }

        const response = await postFormWithProgress(
          API_ROUTES.tools.translatePdf.translate,
          formData,
          (progress) => {
            this.statusManager?.updateUploadProgress(progress);
          }
        );
        const res = (await response.json()) as { data?: TranslatePdfResultData; error?: string; success: boolean };

        this.statusManager?.showProcessingState({
          subtitle: 'Conservando formato, tipografía y tablas en el idioma de destino',
          title: 'Traduciendo documento...',
        });

        if (!response.ok || !res.success || !res.data) {
          throw new Error(res.error || 'Error al traducir el documento PDF.');
        }

        const token = res.data.fileId;
        const downloadPayload = {
          downloadUrl: `/api/download/${token}`,
          fileSize: res.data.size,
          filename: res.data.filename,
          returnText: 'Traducir otro documento',
          returnUrl: '/translate-pdf',
          subtitle: `Se ha traducido exitosamente "${this.currentFile?.name}".`,
          title: '¡PDF traducido con éxito!',
          token,
        };
        sessionStorage.setItem('download_ready_data', JSON.stringify(downloadPayload));
        showToast('Documento traducido con éxito.', 'success');
        navigate(`/download/${token}`);
      } catch (err: unknown) {
        if (selectedCard) selectedCard.style.display = 'flex';
        if (sidebar) sidebar.style.display = 'flex';
        const errorMessage = err instanceof Error ? err.message : 'Error al conectar con el servidor.';
        this.statusManager?.showError(errorMessage, () => {
          this.statusManager?.hide();
        });
        this.showError(errorMessage);
      } finally {
        this.isProcessing = false;
      }
    });
  }

  private showError(message: string): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="translate-error-banner"]');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = '';
    }
  }

  private hideError(): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="translate-error-banner"]');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }
}

export async function createTranslatePdfView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/tools/translate-pdf/translate-pdf.html');
  const controller = new TranslatePdfViewController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
