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
import { setupToolSidebarModal, ToolSidebarModalController, withButtonLoading } from '../../../utils/dom.util.js';
import { ClientRedactionBox, ClientRedactTool, RedactPdfResultData } from './redact-pdf.types.js';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export class RedactPdfController implements ViewController {
  private abortController: AbortController | null = null;
  private activePageIndex = 0;
  private container: HTMLElement;
  private currentFile: File | null = null;
  private currentTool: ClientRedactTool = 'select-text';
  private fullPageRedactions: Set<number> = new Set();
  private isProcessing = false;
  private pageDimensions: Array<{ height: number; width: number }> = [];
  private pageScales: number[] = [];
  private pageTextItems: Array<Array<{ height: number; str: string; width: number; x: number; y: number }>> = [];
  private pdfDocument: any = null;
  private redactionBoxes: ClientRedactionBox[] = [];
  private sidebarModal: ToolSidebarModalController | null = null;
  private statusManager: ToolStatusManager | null = null;
  private zoomLevel = 1.0;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async init(): Promise<void> {
    this.abortController = new AbortController();
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="redact-pdf-workspace"]');
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

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="redact-pdf-sidebar"]');
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="tool-sidebar-backdrop"]');
    const dragZone = this.container.querySelector<HTMLElement>('[data-ref="redact-sidebar-drag-zone"]');
    const closeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-close"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');

    if (sidebar && backdrop && settingsBtn) {
      this.sidebarModal = setupToolSidebarModal({ backdrop, closeBtn, dragZone, settingsBtn, sidebar, signal });
    }

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="redact-dropzone"]');
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-file"]');
    const heroDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive"]');
    const heroDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox"]');
    const clearAllBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-clear-redactions"]');
    const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-redact"]');

    const toolSelectBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-select"]');
    const toolDrawBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-draw"]');

    const zoomInBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-zoom-in"]');
    const zoomOutBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-zoom-out"]');

    const searchBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-search-redact"]');
    const searchInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-search-phrase"]');

    if (browseBtn && fileInput) {
      browseBtn.addEventListener('click', () => fileInput.click(), { signal });
    }

    if (fileInput) {
      fileInput.addEventListener('change', async () => {
        if (fileInput.files && fileInput.files.length > 0) {
          await this.handleFileSelected(fileInput.files[0]);
        }
      }, { signal });
    }

    if (dropzone) {
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('is-dragover');
      }, { signal });

      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('is-dragover');
      }, { signal });

      dropzone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropzone.classList.remove('is-dragover');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          await this.handleFileSelected(e.dataTransfer.files[0]);
        }
      }, { signal });
    }

    if (heroDriveBtn) {
      heroDriveBtn.addEventListener('click', async () => {
        await this.handleDriveImport();
      }, { signal });
    }

    if (heroDropboxBtn) {
      heroDropboxBtn.addEventListener('click', async () => {
        await this.handleDropboxImport();
      }, { signal });
    }

    if (toolSelectBtn) {
      toolSelectBtn.addEventListener('click', () => {
        this.switchTool('select-text');
      }, { signal });
    }

    if (toolDrawBtn) {
      toolDrawBtn.addEventListener('click', () => {
        this.switchTool('draw-box');
      }, { signal });
    }

    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        this.changeZoom(0.15);
      }, { signal });
    }

    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        this.changeZoom(-0.15);
      }, { signal });
    }

    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        this.clearAllRedactions();
      }, { signal });
    }

    if (searchBtn && searchInput) {
      searchBtn.addEventListener('click', () => {
        this.handleSearchAndRedact(searchInput.value);
      }, { signal });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleSearchAndRedact(searchInput.value);
        }
      }, { signal });
    }

    if (executeBtn) {
      executeBtn.addEventListener('click', async () => {
        await this.executeRedaction();
      }, { signal });
    }
  }

  private switchTool(tool: ClientRedactTool): void {
    this.currentTool = tool;
    const toolSelectBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-select"]');
    const toolDrawBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-draw"]');

    if (toolSelectBtn && toolDrawBtn) {
      toolSelectBtn.classList.toggle('is-active', tool === 'select-text');
      toolDrawBtn.classList.toggle('is-active', tool === 'draw-box');
    }

    const drawingSurfaces = this.container.querySelectorAll<HTMLElement>('.pdf-redact-drawing-surface');
    drawingSurfaces.forEach((surf) => {
      surf.style.pointerEvents = tool === 'draw-box' ? 'auto' : 'none';
    });

    const textLayers = this.container.querySelectorAll<HTMLElement>('.pdf-redact-text-layer');
    textLayers.forEach((layer) => {
      layer.style.pointerEvents = tool === 'select-text' ? 'auto' : 'none';
    });
  }

  private changeZoom(delta: number): void {
    const newZoom = Math.min(2.0, Math.max(0.6, Math.round((this.zoomLevel + delta) * 100) / 100));
    if (newZoom === this.zoomLevel) return;
    this.zoomLevel = newZoom;

    const zoomLabel = this.container.querySelector<HTMLElement>('[data-ref="val-zoom-level"]');
    if (zoomLabel) {
      zoomLabel.textContent = `${Math.round(this.zoomLevel * 100)}%`;
    }

    this.renderDocumentPages();
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

  private async handleFileSelected(file: File): Promise<void> {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      this.showError('Por favor selecciona un archivo PDF válido.');
      return;
    }
    const limits = getCurrentUserToolLimits('redact-pdf');
    const maxSizeBytes = limits.maxFileSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      this.showError(`El archivo supera el límite de ${limits.maxFileSizeMB} MB para tu plan actual. Actualiza tu suscripción para procesar archivos de mayor tamaño.`);
      return;
    }

    this.hideError();
    this.currentFile = file;
    this.redactionBoxes = [];
    this.fullPageRedactions.clear();

    const docNamePill = this.container.querySelector<HTMLElement>('[data-ref="val-doc-title"]');
    if (docNamePill) docNamePill.textContent = file.name;

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="redact-dropzone-card"]');
    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="redact-workspace-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="redact-pdf-sidebar"]');

    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (workspaceCard) workspaceCard.style.display = 'flex';
    if (sidebar) sidebar.style.display = 'flex';

    const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
    if (outputNameInput) {
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      outputNameInput.value = `${baseName}_censurado.pdf`;
    }
    const topControls = this.container.querySelector<HTMLElement>('[data-ref="redact-top-controls"]');
    const topActions = this.container.querySelector<HTMLElement>('[data-ref="redact-top-actions"]');
    const settingsBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
    if (topControls) topControls.style.display = 'flex';
    if (topActions) topActions.style.display = 'flex';
    if (settingsBtn) settingsBtn.classList.add('is-visible');

    try {
      const pdfjsLib = await loadPdfJs();
      const buffer = await file.arrayBuffer();
      this.pdfDocument = await pdfjsLib.getDocument({ data: buffer }).promise;

      this.pageDimensions = [];
      this.pageScales = [];
      this.pageTextItems = [];

      const numPages = this.pdfDocument.numPages;
      for (let i = 1; i <= numPages; i++) {
        const page = await this.pdfDocument.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        this.pageDimensions.push({ height: vp.height, width: vp.width });
      }

      const pagesBadge = this.container.querySelector<HTMLElement>('[data-ref="pages-count-badge"]');
      if (pagesBadge) pagesBadge.textContent = `${numPages}`;

      await this.renderThumbnails();
      await this.renderDocumentPages();
      this.updateSidebarSummary();
    } catch {
      this.showError('Error al leer el archivo PDF. Verifica que no esté dañado o protegido con contraseña.');
      this.resetSelectedFile();
    }
  }

  private resetSelectedFile(): void {
    this.currentFile = null;
    this.pdfDocument = null;
    this.redactionBoxes = [];
    this.fullPageRedactions.clear();
    this.statusManager?.hide();

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="redact-dropzone-card"]');
    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="redact-workspace-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="redact-pdf-sidebar"]');
    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');

    if (fileInput) fileInput.value = '';
    if (dropzoneCard) dropzoneCard.style.display = '';
    if (workspaceCard) workspaceCard.style.display = 'none';
    if (sidebar) sidebar.style.display = 'none';

    const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
    if (outputNameInput) {
      outputNameInput.value = 'documento_censurado.pdf';
    }
    const topControls = this.container.querySelector<HTMLElement>('[data-ref="redact-top-controls"]');
    const topActions = this.container.querySelector<HTMLElement>('[data-ref="redact-top-actions"]');
    const settingsBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
    if (topControls) topControls.style.display = 'none';
    if (topActions) topActions.style.display = 'none';
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
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
      thumbItem.className = `redact-thumbnail ${pageIndex === this.activePageIndex ? 'is-active' : ''} ${this.fullPageRedactions.has(pageIndex) ? 'is-full-redacted' : ''}`;
      thumbItem.setAttribute('data-ref', `thumb-page-${pageIndex}`);

      const sheet = document.createElement('div');
      sheet.className = 'redact-thumbnail__sheet';

      const canvas = document.createElement('canvas');
      canvas.className = 'redact-thumbnail__canvas';
      sheet.appendChild(canvas);

      const badge = document.createElement('span');
      badge.className = 'redact-thumbnail__badge';
      badge.textContent = `#${i}`;

      const count = this.redactionBoxes.filter((b) => b.pageIndex === pageIndex).length;
      if (count > 0 && !this.fullPageRedactions.has(pageIndex)) {
        const censorPill = document.createElement('span');
        censorPill.className = 'redact-thumbnail__censor-pill';
        censorPill.textContent = `${count}`;
        sheet.appendChild(censorPill);
      }

      thumbItem.appendChild(sheet);
      thumbItem.appendChild(badge);
      container.appendChild(thumbItem);

      thumbItem.addEventListener('click', () => {
        this.activePageIndex = pageIndex;
        this.container.querySelectorAll('.redact-thumbnail').forEach((t) => t.classList.remove('is-active'));
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
        const dpr = window.devicePixelRatio || 1;

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

  private async renderDocumentPages(): Promise<void> {
    if (!this.pdfDocument) return;
    const pagesWrapper = this.container.querySelector<HTMLElement>('[data-ref="pages-wrapper"]');
    if (!pagesWrapper) return;
    pagesWrapper.innerHTML = '';

    const numPages = this.pdfDocument.numPages;

    for (let i = 1; i <= numPages; i++) {
      const pageIndex = i - 1;
      const page = await this.pdfDocument.getPage(i);
      const dims = this.pageDimensions[pageIndex];

      const baseWidth = 760 * this.zoomLevel;
      const displayScale = baseWidth / dims.width;
      this.pageScales[pageIndex] = displayScale;

      const displayWidth = Math.floor(baseWidth);
      const displayHeight = Math.floor((dims.height / dims.width) * baseWidth);

      const pageCard = document.createElement('div');
      pageCard.className = 'pdf-redact-page-card';
      pageCard.setAttribute('data-page-index', `${pageIndex}`);

      const header = document.createElement('div');
      header.className = 'pdf-redact-page-card__header';
      header.style.width = `${displayWidth}px`;

      const title = document.createElement('span');
      title.className = 'pdf-redact-page-card__title';
      title.textContent = `Página ${i}`;
      header.appendChild(title);

      const togglePageBtn = document.createElement('button');
      togglePageBtn.type = 'button';
      togglePageBtn.className = 'component-button component-button--secondary component-button--h36';
      togglePageBtn.setAttribute('data-ref', `btn-toggle-page-${pageIndex}`);

      const isFull = this.fullPageRedactions.has(pageIndex);
      togglePageBtn.innerHTML = isFull
        ? '<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#undo"></use></svg><span>Restaurar página</span>'
        : '<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#visibility_off"></use></svg><span>Censurar página completa</span>';

      togglePageBtn.addEventListener('click', () => {
        this.toggleFullPageRedact(pageIndex);
      });
      header.appendChild(togglePageBtn);
      pageCard.appendChild(header);

      const viewportEl = document.createElement('div');
      viewportEl.className = 'pdf-redact-viewport';
      viewportEl.setAttribute('data-viewport-page', `${pageIndex}`);
      viewportEl.style.width = `${displayWidth}px`;
      viewportEl.style.height = `${displayHeight}px`;

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-redact-canvas';
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(displayWidth * dpr);
      canvas.height = Math.floor(displayHeight * dpr);
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        const viewport = page.getViewport({ scale: displayScale });
        await page.render({ canvasContext: ctx, viewport }).promise;
      }
      viewportEl.appendChild(canvas);

      const textLayer = document.createElement('div');
      textLayer.className = 'pdf-redact-text-layer';
      textLayer.setAttribute('data-textlayer-page', `${pageIndex}`);
      textLayer.style.pointerEvents = this.currentTool === 'select-text' ? 'auto' : 'none';
      viewportEl.appendChild(textLayer);

      await this.extractAndRenderTextItems(page, displayScale, textLayer, pageIndex);

      textLayer.addEventListener('mouseup', () => {
        if (this.currentTool !== 'select-text') return;
        this.handleTextSelection(pageIndex, viewportEl, displayScale);
      });

      const drawingSurface = document.createElement('div');
      drawingSurface.className = 'pdf-redact-drawing-surface';
      drawingSurface.setAttribute('data-drawing-page', `${pageIndex}`);
      drawingSurface.style.pointerEvents = this.currentTool === 'draw-box' ? 'auto' : 'none';
      viewportEl.appendChild(drawingSurface);

      this.bindDrawingSurfaceInteractions(drawingSurface, pageIndex, viewportEl, displayScale);

      const overlay = document.createElement('div');
      overlay.className = 'pdf-redactions-layer';
      overlay.setAttribute('data-overlay-page', `${pageIndex}`);
      viewportEl.appendChild(overlay);

      pageCard.appendChild(viewportEl);
      pagesWrapper.appendChild(pageCard);

      this.renderPageRedactions(pageIndex);
    }
  }

  private async extractAndRenderTextItems(
    page: any,
    scale: number,
    textLayer: HTMLElement,
    pageIndex: number
  ): Promise<void> {
    try {
      const textContent = await page.getTextContent();
      const dims = this.pageDimensions[pageIndex];
      const viewport = page.getViewport({ scale });
      const itemsList: Array<{ height: number; str: string; width: number; x: number; y: number }> = [];

      if (textContent.items && textContent.items.length > 0) {
        textContent.items.forEach((item: any) => {
          if (!item.str || item.str.trim().length === 0) return;

          const tx = (window as any).pdfjsLib?.Util?.transform
            ? (window as any).pdfjsLib.Util.transform(viewport.transform, item.transform)
            : [scale, 0, 0, scale, item.transform[4] * scale, (dims.height - item.transform[5]) * scale];

          const itemH = item.height * scale || 14;
          const itemX = tx[4];
          const itemY = tx[5] - itemH;
          const itemW = item.width * scale;
          const fontSize = Math.max(10, Math.round(itemH));

          itemsList.push({
            height: item.height || 14,
            str: item.str,
            width: item.width,
            x: item.transform[4],
            y: item.transform[5],
          });

          const span = document.createElement('span');
          span.className = 'pdf-redact-text-item';
          span.style.left = `${itemX}px`;
          span.style.top = `${itemY}px`;
          span.style.width = `${Math.max(itemW, 8)}px`;
          span.style.height = `${itemH}px`;
          span.style.fontSize = `${fontSize}px`;
          span.textContent = item.str;

          textLayer.appendChild(span);
        });
      }

      this.pageTextItems[pageIndex] = itemsList;
    } catch {}
  }

  private handleTextSelection(pageIndex: number, viewportEl: HTMLElement, scale: number): void {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const selectedText = selection.toString().trim();
    if (!selectedText) return;

    const range = selection.getRangeAt(0);
    const clientRects = range.getClientRects();
    if (clientRects.length === 0) return;

    const vpRect = viewportEl.getBoundingClientRect();
    let addedCount = 0;

    for (let i = 0; i < clientRects.length; i++) {
      const rect = clientRects[i];
      const relX = Math.round((rect.left - vpRect.left) / scale);
      const relY = Math.round((rect.top - vpRect.top) / scale);
      const relW = Math.round(rect.width / scale);
      const relH = Math.round(rect.height / scale);

      if (relW > 2 && relH > 2) {
        this.redactionBoxes.push({
          height: relH,
          id: crypto.randomUUID(),
          pageIndex,
          text: selectedText,
          width: relW,
          x: relX,
          y: relY,
        });
        addedCount++;
      }
    }

    selection.removeAllRanges();

    if (addedCount > 0) {
      this.renderPageRedactions(pageIndex);
      this.updateSidebarSummary();
      this.renderThumbnails();
      showToast('Texto censurado correctamente.', 'success');
    }
  }

  private bindDrawingSurfaceInteractions(
    surface: HTMLElement,
    pageIndex: number,
    viewportEl: HTMLElement,
    scale: number
  ): void {
    let startX = 0;
    let startY = 0;
    let isDrawing = false;
    let previewBox: HTMLElement | null = null;

    surface.addEventListener('mousedown', (e: MouseEvent) => {
      if (this.currentTool !== 'draw-box') return;
      const vpRect = viewportEl.getBoundingClientRect();
      startX = e.clientX - vpRect.left;
      startY = e.clientY - vpRect.top;
      isDrawing = true;

      previewBox = document.createElement('div');
      previewBox.className = 'pdf-redact-preview-box';
      previewBox.style.left = `${startX}px`;
      previewBox.style.top = `${startY}px`;
      previewBox.style.width = '0px';
      previewBox.style.height = '0px';
      viewportEl.appendChild(previewBox);

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDrawing || !previewBox) return;
        const curX = ev.clientX - vpRect.left;
        const curY = ev.clientY - vpRect.top;

        const left = Math.min(startX, curX);
        const top = Math.min(startY, curY);
        const width = Math.abs(curX - startX);
        const height = Math.abs(curY - startY);

        previewBox.style.left = `${left}px`;
        previewBox.style.top = `${top}px`;
        previewBox.style.width = `${width}px`;
        previewBox.style.height = `${height}px`;
      };

      const onMouseUp = (ev: MouseEvent) => {
        if (!isDrawing) return;
        isDrawing = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        if (previewBox && previewBox.parentElement) {
          previewBox.parentElement.removeChild(previewBox);
          previewBox = null;
        }

        const curX = ev.clientX - vpRect.left;
        const curY = ev.clientY - vpRect.top;

        const left = Math.min(startX, curX);
        const top = Math.min(startY, curY);
        const width = Math.abs(curX - startX);
        const height = Math.abs(curY - startY);

        const pdfX = Math.round(left / scale);
        const pdfY = Math.round(top / scale);
        const pdfW = Math.round(width / scale);
        const pdfH = Math.round(height / scale);

        if (pdfW > 4 && pdfH > 4) {
          this.redactionBoxes.push({
            height: pdfH,
            id: crypto.randomUUID(),
            pageIndex,
            width: pdfW,
            x: pdfX,
            y: pdfY,
          });

          this.renderPageRedactions(pageIndex);
          this.updateSidebarSummary();
          this.renderThumbnails();
          showToast('Área de censura añadida.', 'success');
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  private toggleFullPageRedact(pageIndex: number): void {
    if (this.fullPageRedactions.has(pageIndex)) {
      this.fullPageRedactions.delete(pageIndex);
      showToast(`Página ${pageIndex + 1} restaurada.`, 'info');
    } else {
      this.fullPageRedactions.add(pageIndex);
      showToast(`Página ${pageIndex + 1} censurada por completo.`, 'warning');
    }

    const toggleBtn = this.container.querySelector<HTMLButtonElement>(`[data-ref="btn-toggle-page-${pageIndex}"]`);
    if (toggleBtn) {
      const isFull = this.fullPageRedactions.has(pageIndex);
      toggleBtn.innerHTML = isFull
        ? '<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#undo"></use></svg><span>Restaurar página</span>'
        : '<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#visibility_off"></use></svg><span>Censurar página completa</span>';
    }

    this.renderPageRedactions(pageIndex);
    this.updateSidebarSummary();
    this.renderThumbnails();
  }

  private renderPageRedactions(pageIndex: number): void {
    const overlay = this.container.querySelector<HTMLElement>(`[data-overlay-page="${pageIndex}"]`);
    if (!overlay) return;
    overlay.innerHTML = '';

    const scale = this.pageScales[pageIndex] || 1;

    if (this.fullPageRedactions.has(pageIndex)) {
      const fullOverlay = document.createElement('div');
      fullOverlay.className = 'page-redaction-overlay--full';

      const badge = document.createElement('div');
      badge.className = 'page-redaction-overlay--full__badge';
      badge.innerHTML = '<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#visibility_off"></use></svg><span>Página censurada por completo</span>';
      fullOverlay.appendChild(badge);

      const restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.className = 'component-button component-button--secondary component-button--h36';
      restoreBtn.innerHTML = '<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#undo"></use></svg><span>Restaurar</span>';
      restoreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleFullPageRedact(pageIndex);
      });
      fullOverlay.appendChild(restoreBtn);

      overlay.appendChild(fullOverlay);
      return;
    }

    const boxes = this.redactionBoxes.filter((b) => b.pageIndex === pageIndex);
    boxes.forEach((box) => {
      const boxEl = document.createElement('div');
      boxEl.className = 'redaction-box';
      boxEl.setAttribute('data-box-id', box.id);
      boxEl.style.left = `${box.x * scale}px`;
      boxEl.style.top = `${box.y * scale}px`;
      boxEl.style.width = `${box.width * scale}px`;
      boxEl.style.height = `${box.height * scale}px`;
      boxEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.container.querySelectorAll('.redaction-box').forEach((b) => b.classList.remove('is-selected'));
        boxEl.classList.add('is-selected');
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'redaction-box__remove-btn';
      removeBtn.setAttribute('data-tooltip', 'Eliminar censura');
      removeBtn.setAttribute('aria-label', 'Eliminar censura');
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeRedactionBox(box.id);
      });

      boxEl.appendChild(removeBtn);
      overlay.appendChild(boxEl);
    });
  }

  private removeRedactionBox(id: string): void {
    const box = this.redactionBoxes.find((b) => b.id === id);
    if (!box) return;
    const pageIndex = box.pageIndex;
    this.redactionBoxes = this.redactionBoxes.filter((b) => b.id !== id);

    this.renderPageRedactions(pageIndex);
    this.updateSidebarSummary();
    this.renderThumbnails();
  }

  private clearAllRedactions(): void {
    if (this.redactionBoxes.length === 0 && this.fullPageRedactions.size === 0) return;
    this.redactionBoxes = [];
    this.fullPageRedactions.clear();

    const numPages = this.pdfDocument?.numPages || 0;
    for (let i = 0; i < numPages; i++) {
      const toggleBtn = this.container.querySelector<HTMLButtonElement>(`[data-ref="btn-toggle-page-${i}"]`);
      if (toggleBtn) {
        toggleBtn.innerHTML = '<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#visibility_off"></use></svg><span>Censurar página completa</span>';
      }
      this.renderPageRedactions(i);
    }

    this.updateSidebarSummary();
    this.renderThumbnails();
    showToast('Se eliminaron todas las censuras.', 'info');
  }

  private handleSearchAndRedact(phrase: string): void {
    const query = phrase.trim().toLowerCase();
    if (!query) {
      showToast('Introduce una palabra o frase para buscar.', 'warning');
      return;
    }

    let matchesCount = 0;
    const numPages = this.pdfDocument?.numPages || 0;

    for (let p = 0; p < numPages; p++) {
      const items = this.pageTextItems[p] || [];
      const dims = this.pageDimensions[p];
      if (!dims) continue;

      items.forEach((item) => {
        if (item.str.toLowerCase().includes(query)) {
          const charWidth = item.width / item.str.length;
          const startIndex = item.str.toLowerCase().indexOf(query);
          const matchWidth = Math.max(8, charWidth * query.length);
          const matchX = Math.round(item.x + (charWidth * startIndex));
          const matchY = Math.round(dims.height - item.y - item.height);

          this.redactionBoxes.push({
            height: Math.round(item.height || 14),
            id: crypto.randomUUID(),
            pageIndex: p,
            text: query,
            width: Math.round(matchWidth),
            x: matchX,
            y: matchY,
          });

          matchesCount++;
        }
      });

      this.renderPageRedactions(p);
    }

    if (matchesCount > 0) {
      this.updateSidebarSummary();
      this.renderThumbnails();
      showToast(`Se censuraron ${matchesCount} coincidencias de "${query}".`, 'success');
    } else {
      showToast(`No se encontraron coincidencias para "${query}".`, 'info');
    }
  }

  private updateSidebarSummary(): void {
    const totalRedactions = this.redactionBoxes.length;
    const fullPagesCount = this.fullPageRedactions.size;

    const executeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-execute-redact"]');
    if (executeBtn) {
      executeBtn.disabled = (totalRedactions === 0 && fullPagesCount === 0);
    }

    const listContainer = this.container.querySelector<HTMLElement>('[data-ref="redactions-list-container"]');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (totalRedactions === 0 && fullPagesCount === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.className = 'redact-items-list__empty';
      emptyMsg.setAttribute('data-ref', 'redactions-empty-msg');
      emptyMsg.textContent = 'No has añadido ninguna censura todavía. Selecciona texto en el documento o dibuja un área.';
      listContainer.appendChild(emptyMsg);
      return;
    }

    this.fullPageRedactions.forEach((pageIdx) => {
      const row = document.createElement('div');
      row.className = 'redact-item-row';

      const badge = document.createElement('span');
      badge.className = 'redact-item-row__badge';
      badge.textContent = `Pág. ${pageIdx + 1}`;
      row.appendChild(badge);

      const text = document.createElement('span');
      text.className = 'redact-item-row__text';
      text.textContent = 'Página completa censurada';
      row.appendChild(text);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'redact-item-row__remove';
      removeBtn.setAttribute('data-tooltip', 'Restaurar página');
      removeBtn.setAttribute('aria-label', 'Restaurar página');
      removeBtn.innerHTML = '<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#delete"></use></svg>';
      removeBtn.addEventListener('click', () => {
        this.toggleFullPageRedact(pageIdx);
      });
      row.appendChild(removeBtn);

      listContainer.appendChild(row);
    });

    this.redactionBoxes.forEach((box) => {
      const row = document.createElement('div');
      row.className = 'redact-item-row';

      const badge = document.createElement('span');
      badge.className = 'redact-item-row__badge';
      badge.textContent = `Pág. ${box.pageIndex + 1}`;
      row.appendChild(badge);

      const text = document.createElement('span');
      text.className = 'redact-item-row__text';
      text.textContent = box.text ? `"${box.text}"` : `Área [${box.width}×${box.height}]`;
      row.appendChild(text);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'redact-item-row__remove';
      removeBtn.setAttribute('data-tooltip', 'Eliminar censura');
      removeBtn.setAttribute('aria-label', 'Eliminar censura');
      removeBtn.innerHTML = '<svg class="component-icon" aria-hidden="true"><use href="/icons.svg#delete"></use></svg>';
      removeBtn.addEventListener('click', () => {
        this.removeRedactionBox(box.id);
      });
      row.appendChild(removeBtn);

      listContainer.appendChild(row);
    });

    renderIcons(listContainer);
  }

  private async executeRedaction(): Promise<void> {
    if (this.isProcessing || !this.currentFile) return;

    const totalRedactions = this.redactionBoxes.length;
    const fullPagesCount = this.fullPageRedactions.size;

    if (totalRedactions === 0 && fullPagesCount === 0) {
      showToast('Añade al menos una censura de texto, área o página completa.', 'warning');
      return;
    }

    this.isProcessing = true;
    this.hideError();
    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="redact-workspace-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="redact-pdf-sidebar"]');
    if (workspaceCard) workspaceCard.style.display = 'none';
    if (sidebar) sidebar.style.display = 'none';
    this.statusManager?.showUploading(1, 1);

    try {
      const numPages = this.pdfDocument?.numPages || 0;
      const pageRedactions: any[] = [];

      for (let i = 0; i < numPages; i++) {
        const isFull = this.fullPageRedactions.has(i);
        const boxes = this.redactionBoxes.filter((b) => b.pageIndex === i);

        if (isFull || boxes.length > 0) {
          pageRedactions.push({
            boxes: isFull ? [] : boxes.map((b) => ({
              height: b.height,
              text: b.text,
              width: b.width,
              x: b.x,
              y: b.y,
            })),
            fullPage: isFull,
            pageIndex: i,
          });
        }
      }

      const formData = new FormData();
      formData.append('file', this.currentFile);
      formData.append('redactions', JSON.stringify(pageRedactions));
      formData.append('sanitizeMetadata', 'true');

      const response = await postFormWithProgress(
        API_ROUTES.tools.redactPdf.redact,
        formData,
        (progress) => {
          this.statusManager?.updateUploadProgress(progress);
        }
      );
      const result = (await response.json()) as {
        data?: RedactPdfResultData;
        error?: string;
        message?: string;
        success: boolean;
      };

      this.statusManager?.showProcessingState({
        subtitle: 'Eliminando texto internamente y aplicando marcas de censura permanentes',
        title: 'Censurando y purgando contenido...',
      });

      if (response.ok && result.success && result.data) {
        const token = result.data.fileId;
        const downloadPayload = {
          downloadUrl: `/api/download/${token}`,
          fileSize: result.data.fileSize,
          filename: result.data.filename || `${this.currentFile.name.replace(/\.pdf$/i, '')}_censurado.pdf`,
          returnText: 'Censurar otro documento PDF',
          returnUrl: '/redact-pdf',
          subtitle: `Se ha censurado y protegido exitosamente el documento "${this.currentFile?.name}".`,
          title: '¡PDF censurado con éxito!',
          token,
        };

        sessionStorage.setItem('download_ready_data', JSON.stringify(downloadPayload));
        showToast('Documento censurado con éxito.', 'success');
        navigate(`/download/${token}`);
      } else {
        throw new Error(result.error || result.message || 'Error al censurar el documento PDF.');
      }
    } catch (err: any) {
      if (workspaceCard) workspaceCard.style.display = 'flex';
      if (sidebar) sidebar.style.display = 'flex';
      const message = err?.message || 'Ha ocurrido un error inesperado al procesar el archivo PDF.';
      this.statusManager?.showError(message, () => {
        this.statusManager?.hide();
      });
      this.showError(message);
    } finally {
      this.isProcessing = false;
    }
  }

  private showError(msg: string): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="redact-global-error"]');
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.style.display = '';
    }
  }

  private hideError(): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="redact-global-error"]');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }
}

export async function createRedactPdfView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/tools/redact-pdf/redact-pdf.html');
  const controller = new RedactPdfController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
