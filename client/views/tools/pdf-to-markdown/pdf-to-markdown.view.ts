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
import { setupToolSidebarModal, ToolSidebarModalController, withButtonLoading } from '../../../utils/dom.util.js';
import { ClientMarkdownMode, PdfToMarkdownResultData } from './pdf-to-markdown.types.js';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
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
    .replace(/~~(.*?)~~/g, '<del>$1</del>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function renderMarkdownToHtml(md: string): string {
  const lines = md.split('\n');
  let html = '';
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let inList = false;
  let listType: 'ol' | 'ul' = 'ul';
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        html += `<pre><code>${escapeHtml(codeBlockLines.join('\n'))}</code></pre>`;
        inCodeBlock = false;
        codeBlockLines = [];
      } else {
        if (inList) {
          html += listType === 'ul' ? '</ul>' : '</ol>';
          inList = false;
        }
        if (inTable) {
          html += '</tbody></table>';
          inTable = false;
        }
        inCodeBlock = true;
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (inList) {
        html += listType === 'ul' ? '</ul>' : '</ol>';
        inList = false;
      }
      const cells = trimmed.slice(1, -1).split('|').map((c) => c.trim());
      const isDivider = cells.every((c) => /^:?-+:?$/.test(c));

      if (isDivider) {
        continue;
      }

      if (!inTable) {
        inTable = true;
        html += '<table><thead><tr>';
        for (const cell of cells) {
          html += `<th>${formatInlineMarkdown(escapeHtml(cell))}</th>`;
        }
        html += '</tr></thead><tbody>';
        continue;
      }

      html += '<tr>';
      for (const cell of cells) {
        html += `<td>${formatInlineMarkdown(escapeHtml(cell))}</td>`;
      }
      html += '</tr>';
      continue;
    } else if (inTable) {
      html += '</tbody></table>';
      inTable = false;
    }

    if (!trimmed) {
      if (inList) {
        html += listType === 'ul' ? '</ul>' : '</ol>';
        inList = false;
      }
      continue;
    }

    if (trimmed.startsWith('# ')) {
      if (inList) { html += listType === 'ul' ? '</ul>' : '</ol>'; inList = false; }
      html += `<h1>${formatInlineMarkdown(escapeHtml(trimmed.slice(2)))}</h1>`;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      if (inList) { html += listType === 'ul' ? '</ul>' : '</ol>'; inList = false; }
      html += `<h2>${formatInlineMarkdown(escapeHtml(trimmed.slice(3)))}</h2>`;
      continue;
    }
    if (trimmed.startsWith('### ')) {
      if (inList) { html += listType === 'ul' ? '</ul>' : '</ol>'; inList = false; }
      html += `<h3>${formatInlineMarkdown(escapeHtml(trimmed.slice(4)))}</h3>`;
      continue;
    }
    if (trimmed.startsWith('#### ')) {
      if (inList) { html += listType === 'ul' ? '</ul>' : '</ol>'; inList = false; }
      html += `<h4>${formatInlineMarkdown(escapeHtml(trimmed.slice(5)))}</h4>`;
      continue;
    }

    if (trimmed.startsWith('> ')) {
      if (inList) { html += listType === 'ul' ? '</ul>' : '</ol>'; inList = false; }
      html += `<blockquote>${formatInlineMarkdown(escapeHtml(trimmed.slice(2)))}</blockquote>`;
      continue;
    }

    if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
      if (!inList || listType !== 'ul') {
        if (inList) html += listType === 'ul' ? '</ul>' : '</ol>';
        html += '<ul>';
        inList = true;
        listType = 'ul';
      }
      const itemText = trimmed.replace(/^(\*|-)\s+/, '');
      html += `<li>${formatInlineMarkdown(escapeHtml(itemText))}</li>`;
      continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      if (!inList || listType !== 'ol') {
        if (inList) html += listType === 'ul' ? '</ul>' : '</ol>';
        html += '<ol>';
        inList = true;
        listType = 'ol';
      }
      const itemText = trimmed.replace(/^\d+\.\s+/, '');
      html += `<li>${formatInlineMarkdown(escapeHtml(itemText))}</li>`;
      continue;
    }

    if (inList) {
      html += listType === 'ul' ? '</ul>' : '</ol>';
      inList = false;
    }

    html += `<p>${formatInlineMarkdown(escapeHtml(trimmed))}</p>`;
  }

  if (inCodeBlock) {
    html += `<pre><code>${escapeHtml(codeBlockLines.join('\n'))}</code></pre>`;
  }
  if (inTable) {
    html += '</tbody></table>';
  }
  if (inList) {
    html += listType === 'ul' ? '</ul>' : '</ol>';
  }

  return html;
}

export class PdfToMarkdownController implements ViewController {
  private abortController: AbortController | null = null;
  private activePageIndex = 0;
  private activeWorkspaceTab: 'markdown' | 'pdf' = 'pdf';
  private container: HTMLElement;
  private currentFile: File | null = null;
  private currentResult: PdfToMarkdownResultData | null = null;
  private isProcessing = false;
  private isRenderingPages = false;
  private pdfDocument: any = null;
  private selectedMode: ClientMarkdownMode = 'structured';
  private sidebarModal: ToolSidebarModalController | null = null;
  private zoomScale = 1.0;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async init(): Promise<void> {
    this.abortController = new AbortController();
    this.setupSidebarModal();
    this.bindEvents();
    renderIcons(this.container);
  }

  public destroy(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.sidebarModal?.destroy();
    this.sidebarModal = null;
    this.currentFile = null;
    this.currentResult = null;
    if (this.pdfDocument) {
      try {
        void this.pdfDocument.destroy();
      } catch {}
      this.pdfDocument = null;
    }
  }

  private setupSidebarModal(): void {
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="pdf-to-markdown-sidebar"]');
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="tool-sidebar-backdrop"]');
    const closeBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-sidebar-close"]');
    const dragZone = this.container.querySelector<HTMLElement>('[data-ref="modal-drag-zone"]');
    const settingsBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
    const signal = this.abortController?.signal;

    if (!sidebar || !backdrop || !closeBtn) return;

    this.sidebarModal = setupToolSidebarModal({
      backdrop,
      closeBtn,
      dragZone,
      settingsBtn,
      sidebar,
      signal,
    });
  }

  private bindEvents(): void {
    const signal = this.abortController?.signal;

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="markdown-dropzone"]');
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-file"]');
    const heroDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive"]');
    const heroDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox"]');
    const zoomInBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-zoom-in"]');
    const zoomOutBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-zoom-out"]');
    const actionBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-convert-action"]');

    const tabViewPdf = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tab-view-pdf"]');
    const tabViewMarkdown = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tab-view-markdown"]');
    const subtabPreview = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-subtab-preview"]');
    const subtabRaw = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-subtab-raw"]');

    const workspaceCopyBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-workspace-copy"]');
    const workspaceDownloadBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-workspace-download"]');
    const sidebarCopyBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-copy"]');
    const sidebarDownloadBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-download"]');

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

    if (dropzone) {
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('is-dragover');
      }, { signal });

      dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropzone.classList.remove('is-dragover');
      }, { signal });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('is-dragover');
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          void this.handleFileSelected(files[0]);
        }
      }, { signal });
    }

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
      void this.handleConvert(actionBtn);
    }, { signal });

    tabViewPdf?.addEventListener('click', () => {
      this.switchWorkspaceTab('pdf');
    }, { signal });

    tabViewMarkdown?.addEventListener('click', () => {
      this.switchWorkspaceTab('markdown');
    }, { signal });

    subtabPreview?.addEventListener('click', () => {
      this.switchMarkdownSubtab('preview');
    }, { signal });

    subtabRaw?.addEventListener('click', () => {
      this.switchMarkdownSubtab('raw');
    }, { signal });

    workspaceCopyBtn?.addEventListener('click', () => {
      this.handleCopyMarkdown();
    }, { signal });

    workspaceDownloadBtn?.addEventListener('click', () => {
      this.handleDownloadMarkdown();
    }, { signal });

    sidebarCopyBtn?.addEventListener('click', () => {
      this.handleCopyMarkdown();
    }, { signal });

    sidebarDownloadBtn?.addEventListener('click', () => {
      this.handleDownloadMarkdown();
    }, { signal });
  }

  private async handleFileSelected(file: File): Promise<void> {
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      this.showError('Formato no compatible. Por favor selecciona un documento en formato PDF.');
      return;
    }

    const limits = getCurrentUserToolLimits('pdf-to-markdown');
    if (file.size > limits.maxFileSizeMB * 1024 * 1024) {
      this.showError(`El archivo PDF supera el tamaño máximo permitido de ${limits.maxFileSizeMB} MB.`);
      return;
    }

    this.hideError();
    this.currentFile = file;
    this.currentResult = null;

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
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="markdown-dropzone-card"]');
    const viewerCard = this.container.querySelector<HTMLElement>('[data-ref="markdown-viewer-card"]');
    const fileNameEl = this.container.querySelector<HTMLElement>('[data-ref="viewer-file-name"]');
    const pageCountEl = this.container.querySelector<HTMLElement>('[data-ref="viewer-page-count"]');
    const pagesCountBadge = this.container.querySelector<HTMLElement>('[data-ref="pages-count-badge"]');
    const actionBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-convert-action"]');
    const settingsBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="pdf-to-markdown-sidebar"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="pdf-to-markdown-workspace"]');

    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (viewerCard) viewerCard.style.display = 'flex';
    if (sidebar) sidebar.style.display = 'flex';
    if (settingsBtn) settingsBtn.classList.add('is-visible');
    if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');

    const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
    if (outputNameInput) {
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      outputNameInput.value = `${baseName}.md`;
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
    this.activeWorkspaceTab = 'pdf';
    this.updateZoomDisplay();

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    if (fileInput) fileInput.value = '';

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="markdown-dropzone-card"]');
    const viewerCard = this.container.querySelector<HTMLElement>('[data-ref="markdown-viewer-card"]');
    const scrollContainer = this.container.querySelector<HTMLElement>('[data-ref="viewer-scroll-container"]');
    const pagesWrapper = this.container.querySelector<HTMLElement>('[data-ref="pages-wrapper"]');
    const thumbnailsContainer = this.container.querySelector<HTMLElement>('[data-ref="thumbnails-container"]');
    const previewWorkspace = this.container.querySelector<HTMLElement>('[data-ref="markdown-preview-workspace"]');
    const workspaceTabs = this.container.querySelector<HTMLElement>('[data-ref="toolbar-workspace-tabs"]');
    const resultSection = this.container.querySelector<HTMLElement>('[data-ref="section-markdown-result"]');
    const processingSection = this.container.querySelector<HTMLElement>('[data-ref="section-processing"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="pdf-to-markdown-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="pdf-to-markdown-workspace"]');
    const actionBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-convert-action"]');

    if (dropzoneCard) dropzoneCard.style.display = '';
    if (viewerCard) viewerCard.style.display = 'none';
    if (sidebar) sidebar.style.display = 'none';
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
    if (pagesWrapper) pagesWrapper.innerHTML = '';
    else if (scrollContainer) scrollContainer.innerHTML = '';
    if (thumbnailsContainer) thumbnailsContainer.innerHTML = '';
    if (previewWorkspace) previewWorkspace.style.display = 'none';
    if (workspaceTabs) workspaceTabs.style.display = 'none';
    if (resultSection) resultSection.style.display = 'none';
    if (processingSection) processingSection.style.display = 'none';
    const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
    if (outputNameInput) {
      outputNameInput.value = 'documento.md';
    }
    const zoomActions = this.container.querySelector<HTMLElement>('[data-ref="toolbar-actions-group"]');
    if (zoomActions) zoomActions.style.display = 'none';
    this.sidebarModal?.close();

    if (actionBtn) actionBtn.disabled = true;
    this.hideError();
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

  private switchWorkspaceTab(tab: 'markdown' | 'pdf'): void {
    this.activeWorkspaceTab = tab;
    const tabPdf = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tab-view-pdf"]');
    const tabMd = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tab-view-markdown"]');
    const scrollContainer = this.container.querySelector<HTMLElement>('[data-ref="viewer-scroll-container"]');
    const previewWorkspace = this.container.querySelector<HTMLElement>('[data-ref="markdown-preview-workspace"]');
    const zoomActions = this.container.querySelector<HTMLElement>('[data-ref="toolbar-actions-group"]');

    if (tab === 'pdf') {
      tabPdf?.classList.add('is-active');
      tabMd?.classList.remove('is-active');
      if (scrollContainer) scrollContainer.style.display = 'flex';
      if (previewWorkspace) previewWorkspace.style.display = 'none';
      if (zoomActions) zoomActions.style.display = 'flex';
    } else {
      tabMd?.classList.add('is-active');
      tabPdf?.classList.remove('is-active');
      if (scrollContainer) scrollContainer.style.display = 'none';
      if (previewWorkspace) previewWorkspace.style.display = 'flex';
      if (zoomActions) zoomActions.style.display = 'none';
    }
  }

  private switchMarkdownSubtab(tab: 'preview' | 'raw'): void {
    const btnPreview = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-subtab-preview"]');
    const btnRaw = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-subtab-raw"]');
    const contentRendered = this.container.querySelector<HTMLElement>('[data-ref="markdown-workspace-rendered"]');
    const contentRaw = this.container.querySelector<HTMLElement>('[data-ref="markdown-workspace-raw"]');

    if (tab === 'preview') {
      btnPreview?.classList.add('is-active');
      btnRaw?.classList.remove('is-active');
      if (contentRendered) contentRendered.style.display = 'block';
      if (contentRaw) contentRaw.style.display = 'none';
    } else {
      btnRaw?.classList.add('is-active');
      btnPreview?.classList.remove('is-active');
      if (contentRaw) contentRaw.style.display = 'block';
      if (contentRendered) contentRendered.style.display = 'none';
    }
  }

  private async handleConvert(button: HTMLButtonElement): Promise<void> {
    if (!this.currentFile || this.isProcessing) return;
    this.hideError();

    const processingSection = this.container.querySelector<HTMLElement>('[data-ref="section-processing"]');
    const resultSection = this.container.querySelector<HTMLElement>('[data-ref="section-markdown-result"]');
    const promptInput = this.container.querySelector<HTMLTextAreaElement>('[data-ref="input-custom-prompt"]');
    const chkLatex = this.container.querySelector<HTMLInputElement>('[data-ref="chk-include-latex"]');
    const chkHeaders = this.container.querySelector<HTMLInputElement>('[data-ref="chk-remove-headers"]');
    const chkTables = this.container.querySelector<HTMLInputElement>('[data-ref="chk-preserve-tables"]');

    this.isProcessing = true;
    if (processingSection) processingSection.style.display = 'block';
    if (resultSection) resultSection.style.display = 'none';

    await withButtonLoading(button, async () => {
      try {
        const formData = new FormData();
        formData.append('pdf', this.currentFile as Blob, this.currentFile?.name);
        formData.append('mode', this.selectedMode);

        if (promptInput && promptInput.value.trim()) {
          formData.append('customPrompt', promptInput.value.trim());
        }
        if (chkLatex) {
          formData.append('includeMathLatex', chkLatex.checked ? 'true' : 'false');
        }
        if (chkHeaders) {
          formData.append('removeHeadersFooters', chkHeaders.checked ? 'true' : 'false');
        }
        if (chkTables) {
          formData.append('preserveTables', chkTables.checked ? 'true' : 'false');
        }

        const response = await postFormApi(API_ROUTES.tools.pdfToMarkdown.convert, formData);
        const result = (await response.json()) as { data?: PdfToMarkdownResultData; error?: string; success: boolean };

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error || 'Error al convertir el documento a Markdown.');
        }

        this.currentResult = result.data;
        showToast('Documento convertido a Markdown con éxito.', 'success');
        this.renderMarkdownResult(result.data);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Error inesperado al convertir el PDF.';
        this.showError(errorMessage);
      } finally {
        this.isProcessing = false;
        if (processingSection) processingSection.style.display = 'none';
      }
    });
  }

  private renderMarkdownResult(data: PdfToMarkdownResultData): void {
    const resultSection = this.container.querySelector<HTMLElement>('[data-ref="section-markdown-result"]');
    const sidebarPreview = this.container.querySelector<HTMLElement>('[data-ref="markdown-sidebar-preview"]');
    const modelBadge = this.container.querySelector<HTMLElement>('[data-ref="markdown-badge-model"]');
    const wordsBadge = this.container.querySelector<HTMLElement>('[data-ref="markdown-badge-words"]');
    const linesBadge = this.container.querySelector<HTMLElement>('[data-ref="markdown-badge-lines"]');

    const workspaceTabs = this.container.querySelector<HTMLElement>('[data-ref="toolbar-workspace-tabs"]');
    const workspaceRendered = this.container.querySelector<HTMLElement>('[data-ref="markdown-workspace-rendered"]');
    const workspaceRaw = this.container.querySelector<HTMLElement>('[data-ref="markdown-workspace-raw"]');

    if (resultSection) resultSection.style.display = 'block';
    if (modelBadge) modelBadge.textContent = 'Aurora AI';
    if (wordsBadge) wordsBadge.textContent = `${data.wordCount} palabras`;
    if (linesBadge) linesBadge.textContent = `${data.lineCount} líneas`;

    const parsedHtml = renderMarkdownToHtml(data.markdown);

    if (sidebarPreview) {
      sidebarPreview.innerHTML = parsedHtml;
      sidebarPreview.scrollTop = 0;
    }

    if (workspaceTabs) workspaceTabs.style.display = 'flex';
    if (workspaceRendered) {
      workspaceRendered.innerHTML = parsedHtml;
      workspaceRendered.scrollTop = 0;
    }
    if (workspaceRaw) {
      workspaceRaw.textContent = data.markdown;
      workspaceRaw.scrollTop = 0;
    }

    this.switchWorkspaceTab('markdown');
  }

  private handleCopyMarkdown(): void {
    if (!this.currentResult?.markdown) return;
    navigator.clipboard.writeText(this.currentResult.markdown)
      .then(() => {
        showToast('Código Markdown copiado al portapapeles.', 'success');
      })
      .catch(() => {
        showToast('No se pudo copiar el texto al portapapeles.', 'error');
      });
  }

  private handleDownloadMarkdown(): void {
    if (!this.currentResult?.markdown) return;

    const blob = new Blob([this.currentResult.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.currentResult.filename || 'documento.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Descarga iniciada.', 'info');
  }

  private showError(message: string): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="markdown-global-error"]');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
  }

  private hideError(): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="markdown-global-error"]');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }
}

export async function createPdfToMarkdownView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/tools/pdf-to-markdown/pdf-to-markdown.html');
  const controller = new PdfToMarkdownController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
