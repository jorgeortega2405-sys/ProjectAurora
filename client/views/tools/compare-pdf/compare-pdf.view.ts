import { navigate } from '../../../app-router.js';
import { API_ROUTES } from '../../../config/api-routes.js';
import { postFormApi } from '../../../services/api.service.js';
import { pickDropboxFiles } from '../../../services/dropbox.service.js';
import { pickGoogleDriveFiles } from '../../../services/google-drive.service.js';
import { renderIcons } from '../../../services/icon.service.js';
import { loadPdfJs } from '../../../services/pdf-loader.service.js';
import { loadTemplate } from '../../../services/template.service.js';
import { showToast } from '../../../services/toast.service.js';
import { ViewController } from '../../../types/common.types.js';
import { setupToolSidebarModal, ToolSidebarModalController, withButtonLoading } from '../../../utils/dom.util.js';
import { ClientDiffItem, ClientPageComparison, ComparePdfResultData, CompareViewMode } from './compare-pdf.types.js';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

export class ComparePdfController implements ViewController {
  private abortController: AbortController | null = null;
  private comparisonResult: ComparePdfResultData | null = null;
  private container: HTMLElement;
  private currentFile1: File | null = null;
  private currentFile2: File | null = null;
  private currentMode: CompareViewMode = 'semantic';
  private isComparing = false;
  private isSyncingScroll = false;
  private overlayOpacity = 0.5;
  private pageDimensions1: Array<{ height: number; width: number }> = [];
  private pageDimensions2: Array<{ height: number; width: number }> = [];
  private pageScales1: number[] = [];
  private pageScales2: number[] = [];
  private pdfDocument1: any = null;
  private pdfDocument2: any = null;
  private searchQuery = '';
  private sidebarModal: ToolSidebarModalController | null = null;
  private syncScroll = true;
  private zoom1 = 1.0;
  private zoom2 = 1.0;

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
    this.pdfDocument1 = null;
    this.pdfDocument2 = null;
  }

  private bindEvents(): void {
    if (!this.abortController) return;
    const { signal } = this.abortController;

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="compare-pdf-sidebar"]');
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="tool-sidebar-backdrop"]');
    const dragZone = this.container.querySelector<HTMLElement>('[data-ref="modal-drag-zone"]');
    const closeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-close"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');

    if (sidebar && backdrop && settingsBtn) {
      this.sidebarModal = setupToolSidebarModal({ backdrop, closeBtn, dragZone, settingsBtn, sidebar, signal });
    }

    const fileInput1 = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file1"]');
    const fileInput2 = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file2"]');
    const dropzoneHero = this.container.querySelector<HTMLElement>('[data-ref="compare-dropzone"]');
    const browseBtn1 = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-file1"]');
    const browseBtn2 = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-file2"]');

    const heroDriveBtn1 = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive1"]');
    const heroDropboxBtn1 = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox1"]');
    const heroDriveBtn2 = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive2"]');
    const heroDropboxBtn2 = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox2"]');

    const removeDoc1Btn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-remove-doc1"]');
    const removeDoc2Btn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-remove-doc2"]');
    const changeFilesBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-change-files"]');
    const syncScrollBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sync-scroll"]');

    const zoomOutBtn1 = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-zoom-out-left"]');
    const zoomInBtn1 = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-zoom-in-left"]');
    const zoomOutBtn2 = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-zoom-out-right"]');
    const zoomInBtn2 = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-zoom-in-right"]');

    const tabSemanticBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tab-semantic"]');
    const tabOverlayBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tab-overlay"]');
    const opacitySlider = this.container.querySelector<HTMLInputElement>('[data-ref="input-overlay-opacity"]');
    const searchInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-search-changes"]');

    const headerReportBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-header-report"]');
    const downloadReportBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-download-report"]');

    if (browseBtn1 && fileInput1) {
      browseBtn1.addEventListener('click', () => fileInput1.click(), { signal });
    }
    if (browseBtn2 && fileInput2) {
      browseBtn2.addEventListener('click', () => fileInput2.click(), { signal });
    }

    if (fileInput1) {
      fileInput1.addEventListener('change', async () => {
        if (fileInput1.files && fileInput1.files.length > 0) {
          await this.handleFile1Selected(fileInput1.files[0]);
        }
      }, { signal });
    }

    if (fileInput2) {
      fileInput2.addEventListener('change', async () => {
        if (fileInput2.files && fileInput2.files.length > 0) {
          await this.handleFile2Selected(fileInput2.files[0]);
        }
      }, { signal });
    }

    if (dropzoneHero) {
      dropzoneHero.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzoneHero.classList.add('is-dragover');
      }, { signal });

      dropzoneHero.addEventListener('dragleave', () => {
        dropzoneHero.classList.remove('is-dragover');
      }, { signal });

      dropzoneHero.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropzoneHero.classList.remove('is-dragover');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const files = e.dataTransfer.files;
          await this.handleFile1Selected(files[0]);
          if (files.length > 1) {
            await this.handleFile2Selected(files[1]);
          }
        }
      }, { signal });
    }

    const dropzoneDoc2 = this.container.querySelector<HTMLElement>('[data-ref="dropzone-doc2"]');
    if (dropzoneDoc2) {
      dropzoneDoc2.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzoneDoc2.classList.add('is-dragover');
      }, { signal });

      dropzoneDoc2.addEventListener('dragleave', () => {
        dropzoneDoc2.classList.remove('is-dragover');
      }, { signal });

      dropzoneDoc2.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropzoneDoc2.classList.remove('is-dragover');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          await this.handleFile2Selected(e.dataTransfer.files[0]);
        }
      }, { signal });
    }

    if (heroDriveBtn1) {
      heroDriveBtn1.addEventListener('click', async () => {
        await this.handleCloudImport(1, 'drive');
      }, { signal });
    }

    if (heroDropboxBtn1) {
      heroDropboxBtn1.addEventListener('click', async () => {
        await this.handleCloudImport(1, 'dropbox');
      }, { signal });
    }

    if (heroDriveBtn2) {
      heroDriveBtn2.addEventListener('click', async () => {
        await this.handleCloudImport(2, 'drive');
      }, { signal });
    }

    if (heroDropboxBtn2) {
      heroDropboxBtn2.addEventListener('click', async () => {
        await this.handleCloudImport(2, 'dropbox');
      }, { signal });
    }

    if (removeDoc1Btn && fileInput1) {
      removeDoc1Btn.addEventListener('click', () => {
        fileInput1.value = '';
        fileInput1.click();
      }, { signal });
    }

    if (removeDoc2Btn) {
      removeDoc2Btn.addEventListener('click', () => {
        this.resetFile2();
      }, { signal });
    }

    if (changeFilesBtn) {
      changeFilesBtn.addEventListener('click', () => {
        this.resetAll();
      }, { signal });
    }

    if (syncScrollBtn) {
      syncScrollBtn.addEventListener('click', () => {
        this.syncScroll = !this.syncScroll;
        syncScrollBtn.classList.toggle('is-active', this.syncScroll);
        showToast(
          this.syncScroll ? 'Desplazamiento sincronizado activado.' : 'Desplazamiento independiente activado.',
          'info'
        );
      }, { signal });
    }

    this.bindScrollSynchronization();

    if (zoomInBtn1) {
      zoomInBtn1.addEventListener('click', () => this.changeZoom(1, 0.15), { signal });
    }
    if (zoomOutBtn1) {
      zoomOutBtn1.addEventListener('click', () => this.changeZoom(1, -0.15), { signal });
    }

    if (zoomInBtn2) {
      zoomInBtn2.addEventListener('click', () => this.changeZoom(2, 0.15), { signal });
    }
    if (zoomOutBtn2) {
      zoomOutBtn2.addEventListener('click', () => this.changeZoom(2, -0.15), { signal });
    }

    if (tabSemanticBtn && tabOverlayBtn) {
      tabSemanticBtn.addEventListener('click', () => {
        this.switchMode('semantic');
      }, { signal });

      tabOverlayBtn.addEventListener('click', () => {
        this.switchMode('overlay');
      }, { signal });
    }

    if (opacitySlider) {
      opacitySlider.addEventListener('input', () => {
        const val = parseInt(opacitySlider.value, 10) || 50;
        this.overlayOpacity = val / 100;
        const valEl = this.container.querySelector<HTMLElement>('[data-ref="val-overlay-opacity"]');
        if (valEl) valEl.textContent = `${val}%`;
        this.applyOverlayOpacity();
      }, { signal });
    }

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.searchQuery = searchInput.value.trim().toLowerCase();
        this.renderChangesList();
      }, { signal });
    }

    if (headerReportBtn) {
      headerReportBtn.addEventListener('click', async () => {
        await this.handleDownloadReport();
      }, { signal });
    }

    if (downloadReportBtn) {
      downloadReportBtn.addEventListener('click', async () => {
        await this.handleDownloadReport();
      }, { signal });
    }
  }

  private bindScrollSynchronization(): void {
    if (!this.abortController) return;
    const { signal } = this.abortController;

    const scrollLeft = this.container.querySelector<HTMLElement>('[data-ref="scroll-container-left"]');
    const scrollRight = this.container.querySelector<HTMLElement>('[data-ref="scroll-container-right"]');

    if (!scrollLeft || !scrollRight) return;

    scrollLeft.addEventListener('scroll', () => {
      if (!this.syncScroll || this.isSyncingScroll || !this.currentFile2) return;
      this.isSyncingScroll = true;
      const maxLeft = scrollLeft.scrollHeight - scrollLeft.clientHeight;
      const maxRight = scrollRight.scrollHeight - scrollRight.clientHeight;
      if (maxLeft > 0 && maxRight > 0) {
        const ratio = scrollLeft.scrollTop / maxLeft;
        scrollRight.scrollTop = ratio * maxRight;
      }
      this.isSyncingScroll = false;
    }, { signal });

    scrollRight.addEventListener('scroll', () => {
      if (!this.syncScroll || this.isSyncingScroll || !this.currentFile1) return;
      this.isSyncingScroll = true;
      const maxLeft = scrollLeft.scrollHeight - scrollLeft.clientHeight;
      const maxRight = scrollRight.scrollHeight - scrollRight.clientHeight;
      if (maxLeft > 0 && maxRight > 0) {
        const ratio = scrollRight.scrollTop / maxRight;
        scrollLeft.scrollTop = ratio * maxLeft;
      }
      this.isSyncingScroll = false;
    }, { signal });
  }

  private switchMode(mode: CompareViewMode): void {
    this.currentMode = mode;
    const tabSemantic = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tab-semantic"]');
    const tabOverlay = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tab-overlay"]');
    const overlayControls = this.container.querySelector<HTMLElement>('[data-ref="section-overlay-controls"]');

    if (tabSemantic && tabOverlay) {
      tabSemantic.classList.toggle('is-active', mode === 'semantic');
      tabOverlay.classList.toggle('is-active', mode === 'overlay');
    }

    if (overlayControls) {
      overlayControls.style.display = mode === 'overlay' ? 'flex' : 'none';
    }

    this.applyOverlayOpacity();
  }

  private applyOverlayOpacity(): void {
    const rightCards = this.container.querySelectorAll<HTMLElement>('[data-ref="pages-wrapper-right"] .compare-page-card');
    rightCards.forEach((card) => {
      if (this.currentMode === 'overlay') {
        card.style.opacity = `${this.overlayOpacity}`;
      } else {
        card.style.opacity = '1';
      }
    });
  }

  private changeZoom(pane: 1 | 2, delta: number): void {
    if (pane === 1) {
      const newZoom = Math.min(2.0, Math.max(0.5, Math.round((this.zoom1 + delta) * 100) / 100));
      if (newZoom === this.zoom1) return;
      this.zoom1 = newZoom;
      const valEl = this.container.querySelector<HTMLElement>('[data-ref="val-zoom-left"]');
      if (valEl) valEl.textContent = `${Math.round(this.zoom1 * 100)}%`;
      this.renderDocument1Pages();
    } else {
      const newZoom = Math.min(2.0, Math.max(0.5, Math.round((this.zoom2 + delta) * 100) / 100));
      if (newZoom === this.zoom2) return;
      this.zoom2 = newZoom;
      const valEl = this.container.querySelector<HTMLElement>('[data-ref="val-zoom-right"]');
      if (valEl) valEl.textContent = `${Math.round(this.zoom2 * 100)}%`;
      this.renderDocument2Pages();
    }
  }

  private async handleCloudImport(docIndex: 1 | 2, provider: 'drive' | 'dropbox'): Promise<void> {
    this.hideError();
    try {
      const files = provider === 'drive'
        ? await pickGoogleDriveFiles({ multiselect: false })
        : await pickDropboxFiles({ multiselect: false });

      if (files.length > 0) {
        if (docIndex === 1) {
          await this.handleFile1Selected(files[0]);
        } else {
          await this.handleFile2Selected(files[0]);
        }
      }
    } catch (err: any) {
      this.showError(err?.message || `Error al importar archivo desde ${provider === 'drive' ? 'Google Drive' : 'Dropbox'}.`);
    }
  }

  private async handleFile1Selected(file: File): Promise<void> {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      this.showError('Por favor selecciona un archivo PDF válido.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      this.showError('El archivo 1 excede el límite permitido de 50 MB.');
      return;
    }

    this.hideError();
    this.currentFile1 = file;

    const titleEl = this.container.querySelector<HTMLElement>('[data-ref="title-doc-left"]');
    if (titleEl) titleEl.textContent = file.name;

    const dropzoneHero = this.container.querySelector<HTMLElement>('[data-ref="compare-dropzone-card"]');
    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="compare-workspace-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="compare-pdf-sidebar"]');

    if (dropzoneHero) dropzoneHero.style.display = 'none';
    if (workspaceCard) workspaceCard.style.display = 'flex';
    if (sidebar) sidebar.style.display = 'flex';

    try {
      const pdfjsLib = await loadPdfJs();
      const buffer = await file.arrayBuffer();
      this.pdfDocument1 = await pdfjsLib.getDocument({ data: buffer }).promise;

      this.pageDimensions1 = [];
      this.pageScales1 = [];
      const numPages = this.pdfDocument1.numPages;

      for (let i = 1; i <= numPages; i++) {
        const page = await this.pdfDocument1.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        this.pageDimensions1.push({ height: vp.height, width: vp.width });
      }

      await this.renderDocument1Pages();

      if (this.currentFile2) {
        await this.runComparison();
      }
    } catch {
      this.showError('Error al leer el archivo PDF 1. Verifica que no esté protegido o dañado.');
      this.resetAll();
    }
  }

  private async handleFile2Selected(file: File): Promise<void> {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      this.showError('Por favor selecciona un archivo PDF válido para el segundo documento.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      this.showError('El archivo 2 excede el límite permitido de 50 MB.');
      return;
    }

    this.hideError();
    this.currentFile2 = file;

    const titleEl = this.container.querySelector<HTMLElement>('[data-ref="title-doc-right"]');
    if (titleEl) titleEl.textContent = file.name;

    const dropzoneDoc2 = this.container.querySelector<HTMLElement>('[data-ref="dropzone-doc2"]');
    const scrollRight = this.container.querySelector<HTMLElement>('[data-ref="scroll-container-right"]');
    const pillRight = this.container.querySelector<HTMLElement>('[data-ref="floating-pill-right"]');
    const removeBtn2 = this.container.querySelector<HTMLElement>('[data-ref="btn-remove-doc2"]');

    if (dropzoneDoc2) dropzoneDoc2.style.display = 'none';
    if (scrollRight) scrollRight.style.display = 'flex';
    if (pillRight) pillRight.style.display = 'inline-flex';
    if (removeBtn2) removeBtn2.style.display = 'inline-flex';

    try {
      const pdfjsLib = await loadPdfJs();
      const buffer = await file.arrayBuffer();
      this.pdfDocument2 = await pdfjsLib.getDocument({ data: buffer }).promise;

      this.pageDimensions2 = [];
      this.pageScales2 = [];
      const numPages = this.pdfDocument2.numPages;

      for (let i = 1; i <= numPages; i++) {
        const page = await this.pdfDocument2.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        this.pageDimensions2.push({ height: vp.height, width: vp.width });
      }

      await this.renderDocument2Pages();
      await this.runComparison();
    } catch {
      this.showError('Error al leer el archivo PDF 2. Verifica que no esté protegido o dañado.');
      this.resetFile2();
    }
  }

  private resetFile2(): void {
    this.currentFile2 = null;
    this.pdfDocument2 = null;
    this.comparisonResult = null;

    const dropzoneDoc2 = this.container.querySelector<HTMLElement>('[data-ref="dropzone-doc2"]');
    const scrollRight = this.container.querySelector<HTMLElement>('[data-ref="scroll-container-right"]');
    const pillRight = this.container.querySelector<HTMLElement>('[data-ref="floating-pill-right"]');
    const removeBtn2 = this.container.querySelector<HTMLElement>('[data-ref="btn-remove-doc2"]');
    const fileInput2 = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file2"]');
    const pagesWrapper2 = this.container.querySelector<HTMLElement>('[data-ref="pages-wrapper-right"]');

    if (fileInput2) fileInput2.value = '';
    if (pagesWrapper2) pagesWrapper2.innerHTML = '';
    if (dropzoneDoc2) dropzoneDoc2.style.display = 'flex';
    if (scrollRight) scrollRight.style.display = 'none';
    if (pillRight) pillRight.style.display = 'none';
    if (removeBtn2) removeBtn2.style.display = 'none';

    this.updateSimilarityPill(null);
    this.renderChangesList();
  }

  private resetAll(): void {
    this.currentFile1 = null;
    this.currentFile2 = null;
    this.pdfDocument1 = null;
    this.pdfDocument2 = null;
    this.comparisonResult = null;

    const fileInput1 = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file1"]');
    const fileInput2 = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file2"]');
    const dropzoneHero = this.container.querySelector<HTMLElement>('[data-ref="compare-dropzone-card"]');
    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="compare-workspace-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="compare-pdf-sidebar"]');
    const pagesWrapper1 = this.container.querySelector<HTMLElement>('[data-ref="pages-wrapper-left"]');
    const pagesWrapper2 = this.container.querySelector<HTMLElement>('[data-ref="pages-wrapper-right"]');

    if (fileInput1) fileInput1.value = '';
    if (fileInput2) fileInput2.value = '';
    if (pagesWrapper1) pagesWrapper1.innerHTML = '';
    if (pagesWrapper2) pagesWrapper2.innerHTML = '';
    if (dropzoneHero) dropzoneHero.style.display = '';
    if (workspaceCard) workspaceCard.style.display = 'none';
    if (sidebar) sidebar.style.display = 'none';

    this.updateSimilarityPill(null);
    this.renderChangesList();
  }

  private async renderDocument1Pages(): Promise<void> {
    if (!this.pdfDocument1) return;
    const pagesWrapper = this.container.querySelector<HTMLElement>('[data-ref="pages-wrapper-left"]');
    if (!pagesWrapper) return;
    pagesWrapper.innerHTML = '';

    const numPages = this.pdfDocument1.numPages;

    for (let i = 1; i <= numPages; i++) {
      const pageIndex = i - 1;
      const page = await this.pdfDocument1.getPage(i);
      const dims = this.pageDimensions1[pageIndex];

      const baseWidth = 520 * this.zoom1;
      const displayScale = baseWidth / dims.width;
      this.pageScales1[pageIndex] = displayScale;

      const displayWidth = Math.floor(baseWidth);
      const displayHeight = Math.floor((dims.height / dims.width) * baseWidth);

      const pageCard = document.createElement('div');
      pageCard.className = 'compare-page-card';
      pageCard.setAttribute('data-page-left', `${pageIndex}`);
      pageCard.style.width = `${displayWidth}px`;
      pageCard.style.height = `${displayHeight}px`;

      const canvas = document.createElement('canvas');
      canvas.className = 'compare-page-canvas';
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
      pageCard.appendChild(canvas);

      const textLayer = document.createElement('div');
      textLayer.className = 'compare-text-layer';
      textLayer.setAttribute('data-textlayer-left', `${pageIndex}`);
      pageCard.appendChild(textLayer);

      pagesWrapper.appendChild(pageCard);
    }
  }

  private async renderDocument2Pages(): Promise<void> {
    if (!this.pdfDocument2) return;
    const pagesWrapper = this.container.querySelector<HTMLElement>('[data-ref="pages-wrapper-right"]');
    if (!pagesWrapper) return;
    pagesWrapper.innerHTML = '';

    const numPages = this.pdfDocument2.numPages;

    for (let i = 1; i <= numPages; i++) {
      const pageIndex = i - 1;
      const page = await this.pdfDocument2.getPage(i);
      const dims = this.pageDimensions2[pageIndex];

      const baseWidth = 520 * this.zoom2;
      const displayScale = baseWidth / dims.width;
      this.pageScales2[pageIndex] = displayScale;

      const displayWidth = Math.floor(baseWidth);
      const displayHeight = Math.floor((dims.height / dims.width) * baseWidth);

      const pageCard = document.createElement('div');
      pageCard.className = 'compare-page-card';
      pageCard.setAttribute('data-page-right', `${pageIndex}`);
      pageCard.style.width = `${displayWidth}px`;
      pageCard.style.height = `${displayHeight}px`;

      const canvas = document.createElement('canvas');
      canvas.className = 'compare-page-canvas';
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
      pageCard.appendChild(canvas);

      const textLayer = document.createElement('div');
      textLayer.className = 'compare-text-layer';
      textLayer.setAttribute('data-textlayer-right', `${pageIndex}`);
      pageCard.appendChild(textLayer);

      pagesWrapper.appendChild(pageCard);
    }
  }

  private async runComparison(): Promise<void> {
    if (!this.currentFile1 || !this.currentFile2 || this.isComparing) return;
    this.isComparing = true;
    this.hideError();

    const progressCard = this.container.querySelector<HTMLElement>('[data-ref="compare-processing-card"]');
    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="compare-workspace-card"]');

    if (progressCard) progressCard.style.display = 'flex';
    if (workspaceCard) workspaceCard.style.display = 'none';

    try {
      const formData = new FormData();
      formData.append('file1', this.currentFile1);
      formData.append('file2', this.currentFile2);
      formData.append('comparisonMode', this.currentMode);

      const response = await postFormApi(
        API_ROUTES.tools.comparePdf.compare,
        formData
      );

      const result = (await response.json()) as {
        data?: ComparePdfResultData;
        error?: string;
        message?: string;
        success: boolean;
      };

      if (response.ok && result.success && result.data) {
        this.comparisonResult = result.data;
        this.updateSimilarityPill(result.data.similarityPercentage);
        this.renderChangesList();
        this.renderDiffMarkers();
        showToast('Comparación completada exitosamente.', 'success');
      } else {
        throw new Error(result.error || result.message || 'Error al procesar la comparación.');
      }
    } catch (err: any) {
      this.showError(err?.message || 'Ha ocurrido un error al comparar los documentos.');
    } finally {
      this.isComparing = false;
      if (progressCard) progressCard.style.display = 'none';
      if (workspaceCard) workspaceCard.style.display = 'flex';
    }
  }

  private updateSimilarityPill(sim: number | null): void {
    const pill = this.container.querySelector<HTMLElement>('[data-ref="pill-similarity"]');
    const val = this.container.querySelector<HTMLElement>('[data-ref="txt-similarity-val"]');
    const downloadBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-download-report"]');

    if (sim === null) {
      if (val) val.textContent = '-';
      if (downloadBtn) downloadBtn.disabled = true;
    } else {
      if (val) val.textContent = `${sim}%`;
      if (downloadBtn) downloadBtn.disabled = false;
    }
  }

  private renderChangesList(): void {
    const listContainer = this.container.querySelector<HTMLElement>('[data-ref="changes-list-container"]');
    const countBadge = this.container.querySelector<HTMLElement>('[data-ref="val-total-changes"]');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (!this.comparisonResult || !this.currentFile2) {
      const emptyMsg = document.createElement('p');
      emptyMsg.className = 'compare-changes-list__empty';
      emptyMsg.setAttribute('data-ref', 'changes-empty-msg');
      emptyMsg.textContent = 'Sube el segundo documento para analizar y visualizar las diferencias.';
      listContainer.appendChild(emptyMsg);
      if (countBadge) countBadge.textContent = '0';
      return;
    }

    const pages = this.comparisonResult.pageComparisons || [];
    let displayedCount = 0;

    pages.forEach((pageComp) => {
      const filteredChanges = pageComp.changes.filter((ch) => {
        if (!this.searchQuery) return true;
        const oldMatch = ch.oldText?.toLowerCase().includes(this.searchQuery);
        const newMatch = ch.newText?.toLowerCase().includes(this.searchQuery);
        return Boolean(oldMatch || newMatch);
      });

      filteredChanges.forEach((change) => {
        displayedCount++;
        const card = document.createElement('div');
        card.className = 'compare-change-card';
        card.setAttribute('data-ref', `diff-card-${change.id}`);

        const header = document.createElement('div');
        header.className = 'compare-change-card__header';
        header.innerHTML = `<span>Página ${pageComp.pageIndex + 1}</span><span>${change.type}</span>`;
        card.appendChild(header);

        if (change.oldText) {
          const secOld = document.createElement('div');
          secOld.className = 'compare-change-card__section compare-change-card__section--old';

          const label = document.createElement('div');
          label.className = 'compare-change-card__label--old';
          label.innerHTML = `<span>Archivo antiguo</span><span>-${change.oldText.length}</span>`;
          secOld.appendChild(label);

          const text = document.createElement('div');
          text.className = 'compare-change-card__text--old';
          text.textContent = change.oldText;
          secOld.appendChild(text);

          card.appendChild(secOld);
        }

        if (change.newText) {
          const secNew = document.createElement('div');
          secNew.className = 'compare-change-card__section compare-change-card__section--new';

          const label = document.createElement('div');
          label.className = 'compare-change-card__label--new';
          label.innerHTML = `<span>Archivo nuevo</span><span>+${change.newText.length}</span>`;
          secNew.appendChild(label);

          const text = document.createElement('div');
          text.className = 'compare-change-card__text--new';
          text.textContent = change.newText;
          secNew.appendChild(text);

          card.appendChild(secNew);
        }

        card.addEventListener('click', () => {
          this.scrollToPage(pageComp.pageIndex);
        });

        listContainer.appendChild(card);
      });
    });

    if (countBadge) {
      countBadge.textContent = `${this.comparisonResult.totalChanges}`;
    }

    if (displayedCount === 0) {
      const noMatch = document.createElement('p');
      noMatch.className = 'compare-changes-list__empty';
      noMatch.textContent = this.searchQuery
        ? 'No se encontraron cambios que coincidan con la búsqueda.'
        : 'Los documentos son 100% idénticos. No se detectaron diferencias.';
      listContainer.appendChild(noMatch);
    }
  }

  private renderDiffMarkers(): void {
    if (!this.comparisonResult) return;
    const pages = this.comparisonResult.pageComparisons || [];

    pages.forEach((pageComp) => {
      const pageIndex = pageComp.pageIndex;
      const leftPageCard = this.container.querySelector<HTMLElement>(`[data-page-left="${pageIndex}"]`);
      const rightPageCard = this.container.querySelector<HTMLElement>(`[data-page-right="${pageIndex}"]`);

      if (pageComp.hasDifferences) {
        if (leftPageCard && !leftPageCard.querySelector('.compare-diff-marker')) {
          const marker = document.createElement('div');
          marker.className = 'compare-diff-marker compare-diff-marker--deletion';
          marker.style.top = '10px';
          marker.style.bottom = '10px';
          leftPageCard.appendChild(marker);
        }

        if (rightPageCard && !rightPageCard.querySelector('.compare-diff-marker')) {
          const marker = document.createElement('div');
          marker.className = 'compare-diff-marker compare-diff-marker--addition';
          marker.style.top = '10px';
          marker.style.bottom = '10px';
          rightPageCard.appendChild(marker);
        }
      }
    });
  }

  private scrollToPage(pageIndex: number): void {
    const leftCard = this.container.querySelector<HTMLElement>(`[data-page-left="${pageIndex}"]`);
    const rightCard = this.container.querySelector<HTMLElement>(`[data-page-right="${pageIndex}"]`);

    if (leftCard) {
      leftCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (rightCard) {
      rightCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  private async handleDownloadReport(): Promise<void> {
    if (!this.comparisonResult) {
      showToast('Por favor carga y compara dos archivos PDF antes de descargar el informe.', 'warning');
      return;
    }

    const downloadUrl = this.comparisonResult.downloadUrl;
    const filename = this.comparisonResult.filename || 'informe_comparacion.pdf';

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Descargando informe de comparación...', 'info');
  }

  private showError(msg: string): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="compare-global-error"]');
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.style.display = '';
    }
  }

  private hideError(): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="compare-global-error"]');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }
}

export async function createComparePdfView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/tools/compare-pdf/compare-pdf.html');
  const controller = new ComparePdfController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
