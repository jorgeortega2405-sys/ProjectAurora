import { API_ROUTES } from '../../../config/api-routes.js';
import { getCurrentUserToolLimits } from '../../../config/tools-limits.config.js';
import { postFormApi } from '../../../services/api.service.js';
import { pickDropboxFiles } from '../../../services/dropbox.service.js';
import { pickGoogleDriveFiles } from '../../../services/google-drive.service.js';
import { renderIcons } from '../../../services/icon.service.js';
import { navigate } from '../../../services/navigation.service.js';
import { loadPdfJs } from '../../../services/pdf-loader.service.js';
import { loadTemplate } from '../../../services/template.service.js';
import { showToast } from '../../../services/toast.service.js';
import { ViewController } from '../../../types/common.types.js';
import { bindFileDropzone, setupToolSidebarModal, ToolSidebarModalController, withButtonLoading } from '../../../utils/dom.util.js';
import { UnlockPdfResponseData } from './unlock-pdf.types.js';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export class UnlockPdfController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private currentFile: File | null = null;
  private isProcessing = false;
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
    if (this.sidebarModal) {
      this.sidebarModal.destroy();
      this.sidebarModal = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.pdfDocument) {
      try {
        void this.pdfDocument.destroy();
      } catch {}
      this.pdfDocument = null;
    }
  }

  private bindEvents(): void {
    if (!this.abortController) return;
    const { signal } = this.abortController;

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="unlock-pdf-sidebar"]');
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="tool-sidebar-backdrop"]');
    const dragZone = this.container.querySelector<HTMLElement>('[data-ref="modal-drag-zone"]');
    const closeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-close"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');

    if (sidebar && backdrop && settingsBtn) {
      this.sidebarModal = setupToolSidebarModal({ backdrop, closeBtn, dragZone, settingsBtn, sidebar, signal });
    }

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="unlock-dropzone"]');
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="unlock-dropzone-card"]');
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-pdf"]');
    const heroDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive"]');
    const heroDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox"]');
    const removeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-remove-file"]');
    const passwordInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-unlock-password"]');
    const togglePasswordBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-password"]');
    const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-unlock"]');

    browseBtn?.addEventListener('click', () => fileInput?.click(), { signal });

    heroDriveBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const files = await pickGoogleDriveFiles({ multiselect: false });
      if (files && files.length > 0) {
        void this.handleFileSelected(files[0]);
      }
    }, { signal });

    heroDropboxBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const files = await pickDropboxFiles({ multiselect: false });
      if (files && files.length > 0) {
        void this.handleFileSelected(files[0]);
      }
    }, { signal });

    dropzone?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      fileInput?.click();
    }, { signal });

    removeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resetToInitial();
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

    togglePasswordBtn?.addEventListener('click', () => {
      if (!passwordInput) return;
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      togglePasswordBtn.innerHTML = `<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#${isPassword ? 'visibility_off' : 'visibility'}"></use></svg>`;
      renderIcons(togglePasswordBtn);
    }, { signal });

    passwordInput?.addEventListener('input', () => {
      this.hideError();
    }, { signal });

    executeBtn?.addEventListener('click', () => {
      void this.handleExecuteUnlock(executeBtn);
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

    const limits = getCurrentUserToolLimits('unlock-pdf');
    if (file.size > limits.maxFileSizeMB * 1024 * 1024) {
      this.showError(`El archivo PDF seleccionado supera el límite permitido de ${limits.maxFileSizeMB} MB.`);
      return;
    }

    this.currentFile = file;

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="unlock-dropzone-card"]');
    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="unlock-workspace-card"]');
    const fileNameEl = this.container.querySelector<HTMLElement>('[data-ref="txt-file-name"]');
    const fileSizeEl = this.container.querySelector<HTMLElement>('[data-ref="txt-file-size"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="unlock-pdf-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="unlock-pdf-workspace"]');
    const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-unlock"]');
    const canvas = this.container.querySelector<HTMLCanvasElement>('[data-ref="unlock-doc-canvas"]');
    const lockedPlaceholder = this.container.querySelector<HTMLElement>('[data-ref="unlock-locked-placeholder"]');

    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (workspaceCard) workspaceCard.style.display = 'flex';

    if (sidebar) sidebar.style.display = 'flex';
    if (settingsBtn) settingsBtn.classList.add('is-visible');
    if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');

    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileSizeEl) fileSizeEl.textContent = formatBytes(file.size);
    if (executeBtn) executeBtn.disabled = false;

    const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
    if (outputNameInput) {
      const base = file.name.replace(/\.[^/.]+$/, '');
      outputNameInput.value = `${base}_desbloqueado.pdf`;
    }

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
      if (canvas) canvas.style.display = '';
      if (lockedPlaceholder) lockedPlaceholder.style.display = 'none';
      void this.renderThumbnail();
    } catch {
      if (canvas) canvas.style.display = 'none';
      if (lockedPlaceholder) lockedPlaceholder.style.display = 'flex';
      renderIcons(this.container);
    }
  }

  private async renderThumbnail(): Promise<void> {
    if (!this.pdfDocument) return;
    try {
      const page = await this.pdfDocument.getPage(1);
      const targetWidth = 180;
      const origViewport = page.getViewport({ scale: 1 });
      const scale = targetWidth / origViewport.width;
      const viewport = page.getViewport({ scale });
      const dpr = window.devicePixelRatio || 1;
      const canvas = this.container.querySelector<HTMLCanvasElement>('[data-ref="unlock-doc-canvas"]');
      if (!canvas) return;

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);

      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch {}
  }

  private async handleExecuteUnlock(button: HTMLButtonElement): Promise<void> {
    if (!this.currentFile || this.isProcessing) return;
    this.hideError();

    const passwordInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-unlock-password"]');
    const password = passwordInput?.value.trim() ?? '';

    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="unlock-workspace-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="unlock-processing-card"]');

    this.isProcessing = true;
    if (workspaceCard) workspaceCard.style.display = 'none';
    if (processingCard) processingCard.style.display = '';

    await withButtonLoading(button, async () => {
      try {
        const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
        const customFilename = outputNameInput?.value.trim();

        const formData = new FormData();
        formData.append('file', this.currentFile as Blob, this.currentFile?.name);
        formData.append('options', JSON.stringify({ password }));
        if (customFilename) {
          formData.append('filename', customFilename);
        }

        const response = await postFormApi(API_ROUTES.tools.unlockPdf.process, formData);
        const result = (await response.json()) as {
          data?: UnlockPdfResponseData;
          error?: string;
          requiresPassword?: boolean;
          success: boolean;
        };

        if (!response.ok || !result.success || !result.data?.downloadUrl) {
          throw new Error(result.error || 'Ocurrió un error al desbloquear el documento PDF.');
        }

        const token = result.data.fileId;
        const downloadPayload = {
          downloadUrl: `/api/download/${token}`,
          fileSize: result.data.fileSize,
          filename: customFilename || result.data.filename,
          returnText: 'Desbloquear otro documento PDF',
          returnUrl: '/unlock-pdf',
          subtitle: `Se han eliminado exitosamente las restricciones del documento "${this.currentFile?.name}".`,
          title: '¡PDF desbloqueado con éxito!',
          token,
        };

        sessionStorage.setItem('download_ready_data', JSON.stringify(downloadPayload));
        showToast('PDF desbloqueado correctamente.', 'success');
        navigate(`/download/${token}`);
      } catch (err: unknown) {
        this.isProcessing = false;
        if (processingCard) processingCard.style.display = 'none';
        if (workspaceCard) workspaceCard.style.display = '';
        const errorMessage = err instanceof Error ? err.message : 'Error inesperado al desbloquear el documento.';
        this.showError(errorMessage);
      }
    });
  }

  private resetToInitial(): void {
    this.currentFile = null;
    this.pdfDocument = null;
    this.isProcessing = false;

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="unlock-dropzone-card"]');
    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="unlock-workspace-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="unlock-processing-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="unlock-pdf-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="unlock-pdf-workspace"]');
    const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-unlock"]');
    const passwordInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-unlock-password"]');

    if (fileInput) fileInput.value = '';
    if (passwordInput) passwordInput.value = '';
    if (dropzoneCard) dropzoneCard.style.display = '';
    if (workspaceCard) workspaceCard.style.display = 'none';
    if (processingCard) processingCard.style.display = 'none';

    if (sidebar) sidebar.style.display = 'none';
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
    const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
    if (outputNameInput) outputNameInput.value = 'documento_desbloqueado.pdf';
    this.sidebarModal?.close();

    if (executeBtn) executeBtn.disabled = true;

    const canvas = this.container.querySelector<HTMLCanvasElement>('[data-ref="unlock-doc-canvas"]');
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }

    this.hideError();
  }

  private showError(message: string): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="unlock-global-error"]');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = '';
    }
  }

  private hideError(): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="unlock-global-error"]');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }
}

export async function createUnlockPdfView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/tools/unlock-pdf/unlock-pdf.html');
  const controller = new UnlockPdfController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
