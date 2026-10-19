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
import { ClientOcrLanguage, OcrResultData } from './ocr-pdf.types.js';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export class OcrPdfController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private currentFile: File | null = null;
  private currentResult: OcrResultData | null = null;
  private isProcessing = false;
  private selectedLanguage: ClientOcrLanguage = 'spa';
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

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="ocr-pdf-sidebar"]');
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="tool-sidebar-backdrop"]');
    const dragZone = this.container.querySelector<HTMLElement>('[data-ref="modal-drag-zone"]');
    const closeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-close"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');

    if (sidebar && backdrop && settingsBtn) {
      this.sidebarModal = setupToolSidebarModal({ backdrop, closeBtn, dragZone, settingsBtn, sidebar, signal });
    }

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="ocr-dropzone"]');
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="ocr-dropzone-card"]');
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-file"]');
    const heroDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive"]');
    const heroDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox"]');
    const removeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-remove-file"]');
    const ocrBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-ocr-action"]');
    const downloadBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-download-result"]');
    const anotherBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-ocr-another"]');

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

    const langOptions = this.container.querySelectorAll<HTMLElement>('.pdf-ocr-lang-option');
    langOptions.forEach((opt) => {
      opt.addEventListener('click', () => {
        const lang = opt.getAttribute('data-lang') as ClientOcrLanguage;
        if (lang) {
          this.selectedLanguage = lang;
          langOptions.forEach((o) => {
            const isMatch = o === opt;
            o.classList.toggle('is-active', isMatch);
            const radio = o.querySelector<HTMLInputElement>('input[type="radio"]');
            if (radio) radio.checked = isMatch;
          });
        }
      }, { signal });
    });

    ocrBtn?.addEventListener('click', () => {
      void this.handleOcr(ocrBtn);
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

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      this.showError('Solo se permiten archivos en formato PDF.');
      return;
    }

    const limits = getCurrentUserToolLimits('ocr-pdf');
    if (file.size > limits.maxFileSizeMB * 1024 * 1024) {
      this.showError(`El archivo excede el límite permitido de ${limits.maxFileSizeMB} MB.`);
      return;
    }

    this.currentFile = file;
    this.renderSelectedState(file);
  }

  private renderSelectedState(file: File): void {
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="ocr-dropzone-card"]');
    const selectedCard = this.container.querySelector<HTMLElement>('[data-ref="ocr-selected-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="ocr-result-card"]');
    const fileNameEl = this.container.querySelector<HTMLElement>('[data-ref="selected-file-name"]');
    const fileSizeEl = this.container.querySelector<HTMLElement>('[data-ref="selected-file-size"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="ocr-pdf-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="ocr-pdf-workspace"]');
    const ocrBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-ocr-action"]');

    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'none';
    if (selectedCard) selectedCard.style.display = 'flex';

    if (sidebar) sidebar.style.display = 'flex';
    if (settingsBtn) settingsBtn.classList.add('is-visible');
    if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');

    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileSizeEl) fileSizeEl.textContent = formatBytes(file.size);
    if (ocrBtn) ocrBtn.disabled = false;

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
      // Ignore preview errors for encrypted/corrupt files
    }
  }

  private resetSelectedFile(): void {
    this.currentFile = null;
    this.currentResult = null;
    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    if (fileInput) fileInput.value = '';

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="ocr-dropzone-card"]');
    const selectedCard = this.container.querySelector<HTMLElement>('[data-ref="ocr-selected-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="ocr-result-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="ocr-pdf-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="ocr-pdf-workspace"]');
    const ocrBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-ocr-action"]');

    if (dropzoneCard) dropzoneCard.style.display = '';
    if (selectedCard) selectedCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'none';

    if (sidebar) sidebar.style.display = 'none';
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
    this.sidebarModal?.close();

    if (ocrBtn) ocrBtn.disabled = true;

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

  private async handleOcr(button: HTMLButtonElement): Promise<void> {
    if (!this.currentFile || this.isProcessing) return;
    this.hideError();

    const selectedCard = this.container.querySelector<HTMLElement>('[data-ref="ocr-selected-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="ocr-processing-card"]');
    const deskewCheckbox = this.container.querySelector<HTMLInputElement>('[data-ref="check-deskew"]');

    this.isProcessing = true;
    if (selectedCard) selectedCard.style.display = 'none';
    if (processingCard) processingCard.style.display = '';

    await withButtonLoading(button, async () => {
      try {
        const formData = new FormData();
        formData.append('pdf', this.currentFile as Blob, this.currentFile?.name);
        formData.append('language', this.selectedLanguage);
        formData.append('deskew', deskewCheckbox?.checked ? 'true' : 'false');

        const response = await postFormApi(API_ROUTES.tools.ocrPdf.process, formData);
        const result = (await response.json()) as { data?: OcrResultData; error?: string; success: boolean };

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error || 'Error al procesar el reconocimiento óptico de texto.');
        }

        this.currentResult = result.data;
        const token = result.data.fileId;
        const downloadPayload = {
          downloadUrl: `/api/download/${token}`,
          fileSize: result.data.processedSize,
          filename: result.data.filename,
          returnText: 'Reconocer texto en otro PDF',
          returnUrl: '/ocr-pdf',
          subtitle: `Se ha aplicado reconocimiento óptico de texto exitosamente a "${this.currentFile?.name}".`,
          title: '¡Texto reconocido con éxito!',
          token,
        };
        sessionStorage.setItem('download_ready_data', JSON.stringify(downloadPayload));
        showToast('Texto reconocido y documento generado con éxito.', 'success');
        navigate(`/download/${token}`);
      } catch (err: unknown) {
        if (selectedCard) selectedCard.style.display = '';
        const errorMessage = err instanceof Error ? err.message : 'Error inesperado al aplicar OCR.';
        this.showError(errorMessage);
      } finally {
        this.isProcessing = false;
        if (processingCard) processingCard.style.display = 'none';
      }
    });
  }

  private renderResultState(data: OcrResultData): void {
    const selectedCard = this.container.querySelector<HTMLElement>('[data-ref="ocr-selected-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="ocr-processing-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="ocr-result-card"]');
    const pagesEl = this.container.querySelector<HTMLElement>('[data-ref="val-ocr-pages"]');
    const langEl = this.container.querySelector<HTMLElement>('[data-ref="val-ocr-lang"]');
    const sizeEl = this.container.querySelector<HTMLElement>('[data-ref="val-ocr-size"]');

    if (selectedCard) selectedCard.style.display = 'none';
    if (processingCard) processingCard.style.display = 'none';
    if (resultCard) resultCard.style.display = '';

    if (pagesEl) pagesEl.textContent = `${data.pageCount} ${data.pageCount === 1 ? 'página' : 'páginas'}`;
    if (langEl) {
      langEl.textContent = data.language === 'eng' ? 'Inglés' : data.language === 'spa+eng' ? 'Español + Inglés' : 'Español';
    }
    if (sizeEl) sizeEl.textContent = formatBytes(data.processedSize);
  }

  private handleDownload(): void {
    if (!this.currentResult?.downloadUrl) return;
    const downloadLink = document.createElement('a');
    downloadLink.href = this.currentResult.downloadUrl;
    downloadLink.download = this.currentResult.filename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    showToast('Iniciando descarga del PDF con OCR...', 'success');
  }

  private showError(message: string): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="ocr-global-error"]');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = '';
    }
  }

  private hideError(): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="ocr-global-error"]');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }
}

export async function createOcrPdfView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/tools/ocr-pdf/ocr-pdf.html');
  const controller = new OcrPdfController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
