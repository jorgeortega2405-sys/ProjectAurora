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
import { animateTypewriter, bindFileDropzone, setupToolSidebarModal, ToolSidebarModalController, withButtonLoading } from '../../../utils/dom.util.js';
import { SummarizePdfResultData } from './summarize-pdf.types.js';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function renderSimpleMarkdown(md: string): string {
  const lines = md.split('\n');
  let html = '';
  let inList = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      continue;
    }

    if (line.startsWith('# ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h1>${escapeHtml(line.slice(2))}</h1>`;
      continue;
    }
    if (line.startsWith('## ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h2>${escapeHtml(line.slice(3))}</h2>`;
      continue;
    }
    if (line.startsWith('### ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h3>${escapeHtml(line.slice(4))}</h3>`;
      continue;
    }

    if (line.startsWith('* ') || line.startsWith('- ') || /^\d+\.\s/.test(line)) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      const itemText = line.replace(/^(\*|-|\d+\.)\s+/, '');
      html += `<li>${formatInlineMarkdown(escapeHtml(itemText))}</li>`;
      continue;
    }

    if (inList) {
      html += '</ul>';
      inList = false;
    }

    html += `<p>${formatInlineMarkdown(escapeHtml(line))}</p>`;
  }

  if (inList) {
    html += '</ul>';
  }

  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

export class SummarizePdfController implements ViewController {
  private abortController: AbortController | null = null;
  private activePageIndex = 0;
  private container: HTMLElement;
  private currentFile: File | null = null;
  private currentResult: SummarizePdfResultData | null = null;
  private isProcessing = false;
  private isRenderingPages = false;
  private pdfDocument: any = null;
  private sidebarModal: ToolSidebarModalController | null = null;
  private statusManager: ToolStatusManager | null = null;
  private zoomScale = 1.0;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async init(): Promise<void> {
    this.abortController = new AbortController();
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="summarize-pdf-workspace"]');
    this.statusManager = new ToolStatusManager(workspace || this.container);
    renderIcons(this.container);
    this.bindEvents();
  }

  public destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.sidebarModal) {
      this.sidebarModal.destroy();
      this.sidebarModal = null;
    }
    if (this.statusManager) {
      this.statusManager.destroy();
      this.statusManager = null;
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

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="summarize-dropzone"]');
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-file"]');
    const actionBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-summarize-action"]');
    const copyBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-copy-summary"]');
    const zoomInBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-zoom-in"]');
    const zoomOutBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-zoom-out"]');
    const heroDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive"]');
    const heroDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const sidebarBackdrop = this.container.querySelector<HTMLElement>('[data-ref="tool-sidebar-backdrop"]');
    const sidebarCloseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-close"]');
    const sidebarDragZone = this.container.querySelector<HTMLElement>('[data-ref="summarize-sidebar-drag-zone"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="summarize-pdf-sidebar"]');

    this.sidebarModal = setupToolSidebarModal({
      backdrop: sidebarBackdrop,
      closeBtn: sidebarCloseBtn,
      dragZone: sidebarDragZone,
      settingsBtn,
      sidebar,
      signal,
    });

    browseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput?.click();
    }, { signal });

    dropzone?.addEventListener('click', () => {
      fileInput?.click();
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

    fileInput?.addEventListener('change', () => {
      const files = fileInput.files;
      if (files && files.length > 0) {
        void this.handleFileSelected(files[0]);
      }
    }, { signal });

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="summarize-dropzone-card"]');
    const dropTarget = dropzoneCard || dropzone;
    bindFileDropzone({
      dropTarget,
      visualTarget: dropTarget,
      onFiles: (files) => {
        if (files.length > 0) {
          void this.handleFileSelected(files[0]);
        }
      },
      signal,
    });

    zoomInBtn?.addEventListener('click', () => {
      if (this.zoomScale < 2.0) {
        this.zoomScale = Math.min(2.0, this.zoomScale + 0.15);
        this.updateZoomDisplay();
        void this.renderAllPages();
      }
    }, { signal });

    zoomOutBtn?.addEventListener('click', () => {
      if (this.zoomScale > 0.5) {
        this.zoomScale = Math.max(0.5, this.zoomScale - 0.15);
        this.updateZoomDisplay();
        void this.renderAllPages();
      }
    }, { signal });

    actionBtn?.addEventListener('click', () => {
      void this.handleSummarize(actionBtn);
    }, { signal });

    copyBtn?.addEventListener('click', () => {
      this.handleCopySummary();
    }, { signal });
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

  private updateZoomDisplay(): void {
    const zoomEl = this.container.querySelector<HTMLElement>('[data-ref="viewer-zoom-level"]');
    if (zoomEl) {
      zoomEl.textContent = `${Math.round(this.zoomScale * 100)}%`;
    }
  }

  public async handleFileSelected(file: File): Promise<void> {
    this.hideError();

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      this.showError('Solo se permiten documentos en formato PDF.');
      return;
    }

    const limits = getCurrentUserToolLimits('summarize-pdf');
    if (file.size > limits.maxFileSizeMB * 1024 * 1024) {
      this.showError(`El archivo PDF excede el límite máximo de ${limits.maxFileSizeMB} MB.`);
      return;
    }

    this.currentFile = file;

    try {
      const pdfjsLib = await loadPdfJs();
      const buffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: buffer });
      this.pdfDocument = await loadingTask.promise;

      this.renderViewerState(file);
      await this.renderThumbnails();
      await this.renderAllPages();
    } catch {
      this.showError('No se pudo leer el archivo PDF seleccionado. Asegúrate de que no esté protegido o dañado.');
      this.resetSelectedFile();
    }
  }

  private renderViewerState(file: File): void {
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="summarize-dropzone-card"]');
    const viewerCard = this.container.querySelector<HTMLElement>('[data-ref="summarize-viewer-card"]');
    const fileNameEl = this.container.querySelector<HTMLElement>('[data-ref="viewer-file-name"]');
    const pageCountEl = this.container.querySelector<HTMLElement>('[data-ref="viewer-page-count"]');
    const pagesCountBadge = this.container.querySelector<HTMLElement>('[data-ref="pages-count-badge"]');
    const actionBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-summarize-action"]');
    const settingsBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="summarize-pdf-sidebar"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="summarize-pdf-workspace"]');

    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (viewerCard) viewerCard.style.display = 'flex';
    if (sidebar) sidebar.style.display = 'flex';
    if (settingsBtn) settingsBtn.classList.add('is-visible');
    if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');

    const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
    if (outputNameInput) {
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      outputNameInput.value = `${baseName}_resumen.pdf`;
    }
    const zoomActions = this.container.querySelector<HTMLElement>('[data-ref="toolbar-actions-group"]');
    if (zoomActions) zoomActions.style.display = 'flex';

    const numPages = this.pdfDocument?.numPages || 1;
    if (fileNameEl) fileNameEl.textContent = file.name;
    if (pageCountEl) pageCountEl.textContent = `${numPages} página${numPages === 1 ? '' : 's'}`;
    if (pagesCountBadge) pagesCountBadge.textContent = `${numPages}`;
    if (actionBtn) actionBtn.disabled = false;
  }

  private async renderThumbnails(): Promise<void> {
    if (!this.pdfDocument) return;
    const container = this.container.querySelector<HTMLElement>('[data-ref="thumbnails-container"]');
    if (!container) return;
    container.innerHTML = '';

    const numPages = this.pdfDocument.numPages;
    for (let i = 1; i <= numPages; i++) {
      const pageIndex = i - 1;
      const thumbItem = document.createElement('div');
      thumbItem.className = `pdf-viewer-thumbnail ${pageIndex === this.activePageIndex ? 'is-active' : ''}`;
      thumbItem.setAttribute('data-ref', `thumb-page-${pageIndex}`);

      const sheet = document.createElement('div');
      sheet.className = 'pdf-viewer-thumbnail__sheet';

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-viewer-thumbnail__canvas';
      sheet.appendChild(canvas);

      const badge = document.createElement('span');
      badge.className = 'pdf-viewer-thumbnail__badge';
      badge.textContent = `#${i}`;

      thumbItem.appendChild(sheet);
      thumbItem.appendChild(badge);
      container.appendChild(thumbItem);

      thumbItem.addEventListener('click', () => {
        this.activePageIndex = pageIndex;
        this.container.querySelectorAll('.pdf-viewer-thumbnail').forEach((t) => t.classList.remove('is-active'));
        thumbItem.classList.add('is-active');

        const targetPageCard = this.container.querySelector<HTMLElement>(`[data-page-index="${pageIndex}"]`);
        if (targetPageCard) {
          targetPageCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });

      try {
        const page = await this.pdfDocument.getPage(i);
        const origVp = page.getViewport({ scale: 1 });
        const thumbScale = 100 / origVp.width;
        const vp = page.getViewport({ scale: thumbScale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.floor(vp.width * dpr);
        canvas.height = Math.floor(vp.height * dpr);
        canvas.style.width = `${vp.width}px`;
        canvas.style.height = `${vp.height}px`;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(dpr, dpr);
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
        }
      } catch {}
    }
  }

  private async renderAllPages(): Promise<void> {
    if (!this.pdfDocument || this.isRenderingPages) return;
    this.isRenderingPages = true;

    const scrollContainer = this.container.querySelector<HTMLElement>('[data-ref="viewer-scroll-container"]');
    const pagesWrapper = this.container.querySelector<HTMLElement>('[data-ref="pages-wrapper"]') || scrollContainer;
    if (!pagesWrapper) {
      this.isRenderingPages = false;
      return;
    }

    pagesWrapper.innerHTML = '';
    const numPages = this.pdfDocument.numPages;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const pageIndex = pageNum - 1;
      const pageCard = document.createElement('div');
      pageCard.className = 'pdf-viewer-page-card';
      pageCard.setAttribute('data-ref', `page-card-${pageNum}`);
      pageCard.setAttribute('data-page-index', `${pageIndex}`);

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-viewer-page-canvas';
      canvas.setAttribute('data-ref', `page-canvas-${pageNum}`);
      pageCard.appendChild(canvas);

      const footer = document.createElement('span');
      footer.className = 'pdf-viewer-page-card__footer';
      footer.textContent = `Pág. ${pageNum} de ${numPages}`;
      pageCard.appendChild(footer);

      pagesWrapper.appendChild(pageCard);

      try {
        const page = await this.pdfDocument.getPage(pageNum);
        const baseViewport = page.getViewport({ scale: 1 });
        const pageWidth = baseViewport.width;
        const pageHeight = baseViewport.height;

        const containerWidth = scrollContainer ? (scrollContainer.clientWidth > 100 ? scrollContainer.clientWidth : 700) : 700;
        const baseDisplayWidth = Math.min(680, Math.max(300, containerWidth - 48));
        const displayWidth = Math.round(baseDisplayWidth * this.zoomScale);
        const displayHeight = Math.round((pageHeight / pageWidth) * displayWidth);

        pageCard.style.width = `${displayWidth}px`;
        pageCard.style.height = `${displayHeight}px`;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(displayWidth * dpr);
        canvas.height = Math.round(displayHeight * dpr);
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;

        const renderScale = (displayWidth / pageWidth) * dpr;
        const viewport = page.getViewport({ scale: renderScale });

        const ctx = canvas.getContext('2d');
        if (ctx) {
          await page.render({
            canvasContext: ctx,
            viewport,
          }).promise;
        }
      } catch {}
    }

    this.isRenderingPages = false;
  }

  private resetSelectedFile(): void {
    this.currentFile = null;
    this.currentResult = null;
    this.pdfDocument = null;
    this.zoomScale = 1.0;
    this.activePageIndex = 0;
    this.statusManager?.hide();
    this.updateZoomDisplay();

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    if (fileInput) fileInput.value = '';

    const scrollContainer = this.container.querySelector<HTMLElement>('[data-ref="viewer-scroll-container"]');
    const pagesWrapper = this.container.querySelector<HTMLElement>('[data-ref="pages-wrapper"]');
    const thumbnailsContainer = this.container.querySelector<HTMLElement>('[data-ref="thumbnails-container"]');
    if (pagesWrapper) pagesWrapper.innerHTML = '';
    else if (scrollContainer) scrollContainer.innerHTML = '';
    if (thumbnailsContainer) thumbnailsContainer.innerHTML = '';

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="summarize-dropzone-card"]');
    const viewerCard = this.container.querySelector<HTMLElement>('[data-ref="summarize-viewer-card"]');
    const resultSection = this.container.querySelector<HTMLElement>('[data-ref="section-summary-result"]');
    const processingSection = this.container.querySelector<HTMLElement>('[data-ref="section-processing"]');
    const actionBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-summarize-action"]');
    const settingsBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="summarize-pdf-sidebar"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="summarize-pdf-workspace"]');

    if (dropzoneCard) dropzoneCard.style.display = '';
    if (viewerCard) viewerCard.style.display = 'none';
    if (sidebar) sidebar.style.display = 'none';
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
    if (scrollContainer) scrollContainer.innerHTML = '';
    if (resultSection) resultSection.style.display = 'none';
    if (processingSection) processingSection.style.display = 'none';
    const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
    if (outputNameInput) {
      outputNameInput.value = 'resumen.pdf';
    }
    const zoomActions = this.container.querySelector<HTMLElement>('[data-ref="toolbar-actions-group"]');
    if (zoomActions) zoomActions.style.display = 'none';
    this.sidebarModal?.close();

    if (actionBtn) actionBtn.disabled = true;
    this.hideError();
  }

  private async handleSummarize(button: HTMLButtonElement): Promise<void> {
    if (!this.currentFile || this.isProcessing) return;
    this.hideError();

    this.isProcessing = true;
    this.statusManager?.showUploading(1, 1);

    await withButtonLoading(button, async () => {
      try {
        const formData = new FormData();
        formData.append('pdf', this.currentFile as Blob, this.currentFile?.name);

        const response = await postFormWithProgress(
          API_ROUTES.tools.summarizePdf.summarize,
          formData,
          (progress) => {
            this.statusManager?.updateUploadProgress(progress);
          }
        );
        const result = (await response.json()) as { data?: SummarizePdfResultData; error?: string; success: boolean };

        this.statusManager?.showProcessingState({
          subtitle: 'Leyendo documento y sintetizando puntos clave con IA',
          title: 'Resumiendo documento PDF...',
        });

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error || 'Error al generar el resumen del documento.');
        }

        this.currentResult = result.data;
        this.statusManager?.hide();
        showToast('Resumen generado exitosamente.', 'success');
        this.renderSummaryResult(result.data);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Error inesperado al resumir el PDF.';
        this.statusManager?.showError(errorMessage, () => {
          this.statusManager?.hide();
        });
        this.showError(errorMessage);
      } finally {
        this.isProcessing = false;
      }
    });
  }

  private renderSummaryResult(data: SummarizePdfResultData): void {
    const resultSection = this.container.querySelector<HTMLElement>('[data-ref="section-summary-result"]');
    const renderedTextEl = this.container.querySelector<HTMLElement>('[data-ref="summary-rendered-text"]');
    const modelBadge = this.container.querySelector<HTMLElement>('[data-ref="summary-badge-model"]');
    const wordsBadge = this.container.querySelector<HTMLElement>('[data-ref="summary-badge-words"]');

    if (resultSection) resultSection.style.display = 'block';
    if (modelBadge) modelBadge.textContent = 'BoardPDF AI';
    if (wordsBadge) wordsBadge.textContent = `${data.wordCount} palabras`;

    if (renderedTextEl) {
      renderedTextEl.scrollTop = 0;
      void animateTypewriter(renderedTextEl, data.summary, {
        onChunk: () => {
          renderedTextEl.scrollTop = renderedTextEl.scrollHeight;
        },
        renderHtml: renderSimpleMarkdown,
        signal: this.abortController?.signal
      });
    }
  }

  private handleCopySummary(): void {
    if (!this.currentResult?.summary) return;
    navigator.clipboard.writeText(this.currentResult.summary)
      .then(() => {
        showToast('Resumen copiado al portapapeles.', 'success');
      })
      .catch(() => {
        showToast('No se pudo copiar el resumen.', 'error');
      });
  }

  private showError(message: string): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="summarize-global-error"]');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
  }

  private hideError(): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="summarize-global-error"]');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }
}

export async function createSummarizePdfView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/tools/summarize-pdf/summarize-pdf.html');
  const controller = new SummarizePdfController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
