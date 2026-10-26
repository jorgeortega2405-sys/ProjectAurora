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
  private statusManager: ToolStatusManager | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async init(): Promise<void> {
    this.abortController = new AbortController();
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="protect-pdf-workspace"]') || this.container;
    this.statusManager = new ToolStatusManager({
      container: workspace,
      onRetry: () => {
        this.statusManager?.hide();
        if (this.currentFile) {
          const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="protect-dropzone-card"]');
          const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="protect-workspace-card"]');
          const sidebar = this.container.querySelector<HTMLElement>('[data-ref="protect-pdf-sidebar"]');
          const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
          const fabMore = this.container.querySelector<HTMLElement>('[data-ref="tool-fab-more"]');
          const ws = this.container.querySelector<HTMLElement>('[data-ref="protect-pdf-workspace"]');

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
      toolName: 'Proteger PDF',
    });
    renderIcons(this.container);
    this.bindEvents();
    const transferred = consumeTransferFile();
    if (transferred) {
      void this.handleFileSelected(transferred);
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
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-pdf"]');
    const heroDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive"]');
    const heroDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox"]');
    const fabAddMoreBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-fab-add-more"]');
    const fabDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-fab-drive"]');
    const fabDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-fab-dropbox"]');
    const removeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-remove-file"]');
    const passwordInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-password"]');
    const confirmInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-confirm-password"]');
    const togglePasswordBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-password"]');
    const toggleConfirmBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-confirm-password"]');
    const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-protect"]');

    browseBtn?.addEventListener('click', () => fileInput?.click(), { signal });

    fabAddMoreBtn?.addEventListener('click', () => fileInput?.click(), { signal });

    heroDriveBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const files = await pickGoogleDriveFiles({ multiselect: false });
      if (files && files.length > 0) {
        void this.handleFileSelected(files[0]);
      }
    }, { signal });

    fabDriveBtn?.addEventListener('click', async (e) => {
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

    fabDropboxBtn?.addEventListener('click', async (e) => {
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

    if (dropzone) {
      bindFileDropzone({
        dropTarget: dropzone,
        visualTarget: dropzone,
        onFiles: (files) => {
          if (files.length > 0) {
            void this.handleFileSelected(files[0]);
          }
        },
        signal,
      });
    }

    togglePasswordBtn?.addEventListener('click', () => {
      if (!passwordInput) return;
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      const useEl = togglePasswordBtn.querySelector('use');
      if (useEl) {
        useEl.setAttribute('href', isPassword ? '/icons.svg#visibility_off' : '/icons.svg#visibility');
      }
    }, { signal });

    toggleConfirmBtn?.addEventListener('click', () => {
      if (!confirmInput) return;
      const isPassword = confirmInput.type === 'password';
      confirmInput.type = isPassword ? 'text' : 'password';
      const useEl = toggleConfirmBtn.querySelector('use');
      if (useEl) {
        useEl.setAttribute('href', isPassword ? '/icons.svg#visibility_off' : '/icons.svg#visibility');
      }
    }, { signal });

    executeBtn?.addEventListener('click', () => {
      void this.handleExecuteProtect(executeBtn);
    }, { signal });
  }

  private async handleFileSelected(file: File): Promise<void> {
    this.hideError();
    const limits = getCurrentUserToolLimits('protect-pdf');
    if (file.size > limits.maxFileSizeMB * 1024 * 1024) {
      this.showError(`El archivo excede el tamaño máximo permitido (${limits.maxFileSizeMB} MB).`);
      return;
    }

    this.currentFile = file;

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="protect-dropzone-card"]');
    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="protect-workspace-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="protect-pdf-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const fabMore = this.container.querySelector<HTMLElement>('[data-ref="tool-fab-more"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="protect-pdf-workspace"]');
    const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-protect"]');
    const fileNameEl = this.container.querySelector<HTMLElement>('[data-ref="txt-file-name"]');
    const fileSizeEl = this.container.querySelector<HTMLElement>('[data-ref="txt-file-size"]');

    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileSizeEl) fileSizeEl.textContent = formatBytes(file.size);

    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (workspaceCard) workspaceCard.style.display = 'flex';
    if (sidebar) sidebar.style.display = 'flex';
    if (settingsBtn) settingsBtn.classList.add('is-visible');
    if (fabMore) fabMore.style.display = 'block';
    if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');

    if (executeBtn) executeBtn.disabled = false;

    await this.loadDocumentPreview(file);
  }

  private async loadDocumentPreview(file: File): Promise<void> {
    const canvas = this.container.querySelector<HTMLCanvasElement>('[data-ref="protect-doc-canvas"]');
    if (!canvas) return;

    try {
      const pdfjs = await loadPdfJs();
      const buffer = await file.arrayBuffer();

      const loadingTask = pdfjs.getDocument({
        data: buffer,
        password: '',
      });

      this.pdfDocument = await loadingTask.promise;
      await this.renderPageThumbnail(this.pdfDocument, 1, canvas);
    } catch {}
  }

  private async renderPageThumbnail(doc: any, pageNum: number, canvas: HTMLCanvasElement): Promise<void> {
    try {
      const page = await doc.getPage(pageNum);
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
      if (!ctx) return;
      ctx.scale(dpr, dpr);

      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch {}
  }

  private showProcessingState(): void {
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="protect-dropzone-card"]');
    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="protect-workspace-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="protect-pdf-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const fabMore = this.container.querySelector<HTMLElement>('[data-ref="tool-fab-more"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="protect-pdf-workspace"]');

    if (sidebar) sidebar.style.display = 'none';
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    if (fabMore) fabMore.style.display = 'none';
    this.sidebarModal?.close();
    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (workspaceCard) workspaceCard.style.display = 'none';
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
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

    this.isProcessing = true;
    this.showProcessingState();
    this.statusManager?.showUploading(1, 1);

    await withButtonLoading(button, async () => {
      try {
        const formData = new FormData();
        formData.append('file', this.currentFile as Blob, this.currentFile?.name);
        formData.append('options', JSON.stringify({ password }));

        const response = await postFormWithProgress(
          API_ROUTES.tools.protectPdf.process,
          formData,
          (progress) => {
            this.statusManager?.updateUploadProgress(progress);
          }
        );
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
          filename: result.data.filename,
          returnText: 'Proteger otro documento PDF',
          returnUrl: '/protect-pdf',
          subtitle: `Se ha protegido y cifrado exitosamente el documento "${this.currentFile?.name}".`,
          title: '¡PDF protegido con éxito!',
          token,
        };

        sessionStorage.setItem('download_ready_data', JSON.stringify(downloadPayload));
        showToast('PDF protegido correctamente.', 'success');
        navigate(`/download/${token}`);
      } catch {
        this.statusManager?.showError({
          boxText: 'Comprueba que el archivo PDF no esté protegido o dañado y vuelve a intentarlo.',
          boxTitle: 'Error al cifrar el documento',
          desc: 'No se pudo aplicar el cifrado de seguridad al documento PDF. Por favor intenta más tarde.',
          retryText: 'Reintentar Protección',
          title: '¡Oh no! No hemos podido proteger tu archivo.',
        });
      } finally {
        this.isProcessing = false;
      }
    });
  }

  private resetToInitial(): void {
    this.currentFile = null;
    this.pdfDocument = null;
    this.isProcessing = false;
    this.statusManager?.hide();

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="protect-dropzone-card"]');
    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="protect-workspace-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="protect-pdf-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const fabMore = this.container.querySelector<HTMLElement>('[data-ref="tool-fab-more"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="protect-pdf-workspace"]');
    const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-protect"]');
    const passwordInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-password"]');
    const confirmInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-confirm-password"]');

    if (fileInput) fileInput.value = '';
    if (passwordInput) passwordInput.value = '';
    if (confirmInput) confirmInput.value = '';
    if (dropzoneCard) dropzoneCard.style.display = '';
    if (workspaceCard) workspaceCard.style.display = 'none';

    if (sidebar) sidebar.style.display = 'none';
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    if (fabMore) fabMore.style.display = 'none';
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
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
      errorEl.style.display = 'block';
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
