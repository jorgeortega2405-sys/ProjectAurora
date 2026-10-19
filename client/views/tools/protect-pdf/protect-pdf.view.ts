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
import { bindFileDropzone, setupToolSidebarModal, ToolSidebarModalController, withButtonLoading } from '../../../utils/dom.util.js';
import { ProtectPdfResponseData } from './protect-pdf.types.js';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export class ProtectPdfController implements ViewController {
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
    this.pdfDocument = null;
  }

  private bindEvents(): void {
    if (!this.abortController) return;
    const { signal } = this.abortController;

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="protect-pdf-sidebar"]');
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="tool-sidebar-backdrop"]');
    const dragZone = this.container.querySelector<HTMLElement>('[data-ref="modal-drag-zone"]');
    const closeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-close"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');

    if (sidebar && backdrop && settingsBtn) {
      this.sidebarModal = setupToolSidebarModal({ backdrop, closeBtn, dragZone, settingsBtn, sidebar, signal });
    }

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="protect-dropzone"]');
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="protect-dropzone-card"]');
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-pdf"]');
    const heroDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive"]');
    const heroDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox"]');
    const removeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-remove-file"]');
    const passwordInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-password"]');
    const confirmInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-confirm-password"]');
    const togglePasswordBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-password"]');
    const toggleConfirmBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-confirm-password"]');
    const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-protect"]');

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

    toggleConfirmBtn?.addEventListener('click', () => {
      if (!confirmInput) return;
      const isPassword = confirmInput.type === 'password';
      confirmInput.type = isPassword ? 'text' : 'password';
      toggleConfirmBtn.innerHTML = `<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#${isPassword ? 'visibility_off' : 'visibility'}"></use></svg>`;
      renderIcons(toggleConfirmBtn);
    }, { signal });

    const handlePasswordChange = () => {
      this.hideError();
      this.validateInputs();
    };

    passwordInput?.addEventListener('input', handlePasswordChange, { signal });
    confirmInput?.addEventListener('input', handlePasswordChange, { signal });

    executeBtn?.addEventListener('click', () => {
      void this.handleExecuteProtect(executeBtn);
    }, { signal });
  }

  private validateInputs(): boolean {
    const passwordInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-password"]');
    const confirmInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-confirm-password"]');
    const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-protect"]');

    const pass = passwordInput?.value ?? '';
    const confirm = confirmInput?.value ?? '';

    const isValid = Boolean(this.currentFile && pass.length > 0 && pass === confirm);
    if (executeBtn) {
      executeBtn.disabled = !isValid;
    }
    return isValid;
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

    const limits = getCurrentUserToolLimits('protect-pdf');
    if (file.size > limits.maxFileSizeMB * 1024 * 1024) {
      this.showError(`El archivo PDF seleccionado supera el límite permitido de ${limits.maxFileSizeMB} MB.`);
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

      const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="protect-dropzone-card"]');
      const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="protect-workspace-card"]');
      const fileNameEl = this.container.querySelector<HTMLElement>('[data-ref="txt-file-name"]');
      const fileSizeEl = this.container.querySelector<HTMLElement>('[data-ref="txt-file-size"]');
      const sidebar = this.container.querySelector<HTMLElement>('[data-ref="protect-pdf-sidebar"]');
      const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
      const workspace = this.container.querySelector<HTMLElement>('[data-ref="protect-pdf-workspace"]');

      if (dropzoneCard) dropzoneCard.style.display = 'none';
      if (workspaceCard) workspaceCard.style.display = 'flex';

      if (sidebar) sidebar.style.display = 'flex';
      if (settingsBtn) settingsBtn.classList.add('is-visible');
      if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');

      if (fileNameEl) fileNameEl.textContent = file.name;
      if (fileSizeEl) fileSizeEl.textContent = formatBytes(file.size);

      const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
      if (outputNameInput) {
        const base = file.name.replace(/\.[^/.]+$/, '');
        outputNameInput.value = `${base}_protegido.pdf`;
      }

      void this.renderThumbnail();
      this.validateInputs();
    } catch {
      this.showError('No se pudo leer el archivo PDF seleccionado. Asegúrate de que no esté protegido o dañado.');
      this.resetToInitial();
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
      const canvas = this.container.querySelector<HTMLCanvasElement>('[data-ref="protect-doc-canvas"]');
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

  private async handleExecuteProtect(button: HTMLButtonElement): Promise<void> {
    if (!this.currentFile || this.isProcessing) return;
    this.hideError();

    const passwordInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-password"]');
    const confirmInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-confirm-password"]');
    const password = passwordInput?.value ?? '';
    const confirm = confirmInput?.value ?? '';

    if (!password) {
      this.showError('Introduce una contraseña para proteger el documento.');
      return;
    }

    if (password !== confirm) {
      this.showError('Las contraseñas no coinciden. Por favor verifícalas.');
      return;
    }

    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="protect-workspace-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="protect-processing-card"]');

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

        const response = await postFormApi(API_ROUTES.tools.protectPdf.process, formData);
        const result = (await response.json()) as {
          data?: ProtectPdfResponseData;
          error?: string;
          success: boolean;
        };

        if (!response.ok || !result.success || !result.data?.downloadUrl) {
          throw new Error(result.error || 'Ocurrió un error al proteger el documento PDF.');
        }

        const token = result.data.fileId;
        const downloadPayload = {
          downloadUrl: `/api/download/${token}`,
          fileSize: result.data.fileSize,
          filename: customFilename || result.data.filename,
          returnText: 'Proteger otro documento PDF',
          returnUrl: '/protect-pdf',
          subtitle: `Se ha protegido y cifrado exitosamente el documento "${this.currentFile?.name}".`,
          title: '¡PDF protegido con éxito!',
          token,
        };

        sessionStorage.setItem('download_ready_data', JSON.stringify(downloadPayload));
        showToast('PDF protegido correctamente.', 'success');
        navigate(`/download/${token}`);
      } catch (err: unknown) {
        this.isProcessing = false;
        if (processingCard) processingCard.style.display = 'none';
        if (workspaceCard) workspaceCard.style.display = '';
        const errorMessage = err instanceof Error ? err.message : 'Error inesperado al proteger el documento.';
        this.showError(errorMessage);
      }
    });
  }

  private resetToInitial(): void {
    this.currentFile = null;
    this.pdfDocument = null;
    this.isProcessing = false;

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="protect-dropzone-card"]');
    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="protect-workspace-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="protect-processing-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="protect-pdf-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="protect-pdf-workspace"]');
    const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-protect"]');
    const passwordInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-password"]');
    const confirmInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-confirm-password"]');

    if (fileInput) fileInput.value = '';
    if (passwordInput) passwordInput.value = '';
    if (confirmInput) confirmInput.value = '';
    if (dropzoneCard) dropzoneCard.style.display = '';
    if (workspaceCard) workspaceCard.style.display = 'none';
    if (processingCard) processingCard.style.display = 'none';

    if (sidebar) sidebar.style.display = 'none';
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
    const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
    if (outputNameInput) outputNameInput.value = 'documento_protegido.pdf';
    this.sidebarModal?.close();

    if (executeBtn) executeBtn.disabled = true;

    const canvas = this.container.querySelector<HTMLCanvasElement>('[data-ref="protect-doc-canvas"]');
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }

    this.hideError();
  }

  private showError(message: string): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="protect-global-error"]');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = '';
    }
  }

  private hideError(): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="protect-global-error"]');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }
}

export async function createProtectPdfView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/tools/protect-pdf/protect-pdf.html');
  const controller = new ProtectPdfController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
