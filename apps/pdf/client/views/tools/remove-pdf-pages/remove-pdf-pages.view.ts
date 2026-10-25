import { API_ROUTES } from '../../../config/api-routes.js';
import { getCurrentUserToolLimits } from '../../../config/tools-limits.config.js';
import { postFormApi } from '../../../services/api.service.js';
import { pickDropboxFiles } from '../../../services/dropbox.service.js';
import { pickGoogleDriveFiles } from '../../../services/google-drive.service.js';
import { t } from '../../../services/i18n.service.js';
import { renderIcons } from '../../../services/icon.service.js';
import { navigate } from '../../../services/navigation.service.js';
import { loadPdfJs } from '../../../services/pdf-loader.service.js';
import { loadTemplate } from '../../../services/template.service.js';
import { showToast } from '../../../services/toast.service.js';
import { ViewController } from '../../../types/common.types.js';
import { bindFileDropzone, setupToolSidebarModal, ToolSidebarModalController } from '../../../utils/dom.util.js';
import { RemovePageItem, RemovePdfResponseData } from './remove-pdf-pages.types.js';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function parsePageNumbers(raw: string, maxPages: number): number[] {
  const result = new Set<number>();
  const parts = raw.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        const from = Math.max(1, Math.min(start, end));
        const to = Math.min(maxPages, Math.max(start, end));
        for (let i = from; i <= to; i++) {
          result.add(i);
        }
      }
    } else {
      const page = parseInt(trimmed, 10);
      if (!isNaN(page) && page >= 1 && page <= maxPages) {
        result.add(page);
      }
    }
  }
  return Array.from(result).sort((a, b) => a - b);
}

function formatPageNumbers(pages: number[]): string {
  if (pages.length === 0) return '';
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    if (curr === prev + 1) {
      prev = curr;
    } else {
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = curr;
      prev = curr;
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
  return ranges.join(', ');
}

export class RemovePdfPagesController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private currentFile: File | null = null;
  private currentResult: RemovePdfResponseData | null = null;
  private isProcessing = false;
  private lastClickedPageIndex: number | null = null;
  private pages: RemovePageItem[] = [];
  private pdfDocument: any = null;
  private removedPages: Set<number> = new Set();
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
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.sidebarModal) {
      this.sidebarModal.destroy();
      this.sidebarModal = null;
    }
    if (this.pdfDocument) {
      try {
        void this.pdfDocument.destroy();
      } catch {}
      this.pdfDocument = null;
    }
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

  private bindEvents(): void {
    if (!this.abortController) return;
    const { signal } = this.abortController;

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="pdf-dropzone"]');
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-pdf"]');
    const heroDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive"]');
    const heroDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const sidebarBackdrop = this.container.querySelector<HTMLElement>('[data-ref="tool-sidebar-backdrop"]');
    const sidebarCloseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-close"]');
    const sidebarDragZone = this.container.querySelector<HTMLElement>('[data-ref="modal-drag-zone"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="remove-pages-sidebar"]');
    const mainActionBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-main-action"]');
    const downloadResultBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-download-result"]');
    const restartRemoveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-restart-remove"]');
    const pagesGrid = this.container.querySelector<HTMLElement>('[data-ref="remove-pages-grid"]');
    const inputPagesToRemove = this.container.querySelector<HTMLInputElement>('[data-ref="input-pages-to-remove"]');

    this.sidebarModal = setupToolSidebarModal({
      backdrop: sidebarBackdrop,
      closeBtn: sidebarCloseBtn,
      dragZone: sidebarDragZone,
      settingsBtn,
      sidebar,
      signal,
    });

    browseBtn?.addEventListener('click', () => fileInput?.click(), { signal });

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
      const file = fileInput.files?.[0];
      if (file) {
        void this.handleFileSelected(file);
      }
      fileInput.value = '';
    }, { signal });

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-dropzone-card"]');
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

    dropzone?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      fileInput?.click();
    }, { signal });

    inputPagesToRemove?.addEventListener('input', () => {
      if (this.pages.length === 0) return;
      const parsed = parsePageNumbers(inputPagesToRemove.value, this.pages.length);
      this.removedPages = new Set(parsed);
      this.updateCardsState();
      this.updateSummary();
    }, { signal });

    pagesGrid?.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-page-index]');
      if (!card) return;
      const index = parseInt(card.getAttribute('data-page-index') || '0', 10);
      const pageNum = index + 1;

      if ((e as MouseEvent).shiftKey && this.lastClickedPageIndex !== null) {
        const from = Math.min(this.lastClickedPageIndex, index);
        const to = Math.max(this.lastClickedPageIndex, index);
        const shouldRemove = !this.removedPages.has(pageNum);

        for (let i = from; i <= to; i++) {
          const p = i + 1;
          if (shouldRemove) {
            this.removedPages.add(p);
          } else {
            this.removedPages.delete(p);
          }
        }
      } else {
        if (this.removedPages.has(pageNum)) {
          this.removedPages.delete(pageNum);
        } else {
          this.removedPages.add(pageNum);
        }
        this.lastClickedPageIndex = index;
      }

      if (inputPagesToRemove) {
        inputPagesToRemove.value = formatPageNumbers(Array.from(this.removedPages));
      }
      this.updateCardsState();
      this.updateSummary();
    }, { signal });

    mainActionBtn?.addEventListener('click', () => {
      if (!this.currentFile) {
        fileInput?.click();
      } else {
        void this.executeRemovePages();
      }
    }, { signal });

    downloadResultBtn?.addEventListener('click', () => {
      if (this.currentResult) {
        window.open(this.currentResult.downloadUrl, '_blank');
      }
    }, { signal });

    restartRemoveBtn?.addEventListener('click', () => {
      this.resetToInitial();
    }, { signal });
  }

  public async handleFileSelected(file: File): Promise<void> {
    if (this.isProcessing) return;
    this.hideError();

    const isPdfExt = file.name.toLowerCase().endsWith('.pdf');
    const isPdfMime = file.type === 'application/pdf' || file.type === 'application/x-pdf';
    if (!isPdfExt && !isPdfMime) {
      this.showError('Selecciona únicamente un documento en formato PDF.');
      return;
    }

    const limits = getCurrentUserToolLimits('remove-pdf-pages');
    const maxSizeBytes = limits.maxFileSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      this.showError(`El archivo supera el límite de ${limits.maxFileSizeMB} MB para tu plan actual. Actualiza tu suscripción para procesar archivos de mayor tamaño.`);
      return;
    }

    this.currentFile = file;

    try {
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({
        cMapPacked: true,
        cMapUrl: '/vendor/pdfjs/cmaps/',
        data: new Uint8Array(arrayBuffer),
        standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
      });
      this.pdfDocument = await loadingTask.promise;
      const count = this.pdfDocument.numPages || 1;

      if (count <= 1) {
        this.showError('El documento seleccionado solo tiene 1 página y no se pueden eliminar páginas de él.');
        this.resetToInitial();
        return;
      }

      this.pages = Array.from({ length: count }, (_, i) => ({
        id: `page-${i + 1}`,
        num: i + 1,
      }));

      this.removedPages.clear();
      this.lastClickedPageIndex = null;

      const inputPagesToRemove = this.container.querySelector<HTMLInputElement>('[data-ref="input-pages-to-remove"]');
      if (inputPagesToRemove) {
        inputPagesToRemove.value = '';
      }

      this.renderFilesView();
      this.updateSummary();

      for (const page of this.pages) {
        void this.generatePageThumbnail(page);
      }
    } catch {
      this.showError('No se pudo leer el archivo PDF seleccionado. Asegúrate de que no esté dañado o protegido.');
      this.resetToInitial();
    }
  }

  private async generatePageThumbnail(item: RemovePageItem): Promise<void> {
    if (!this.pdfDocument) return;
    try {
      const page = await this.pdfDocument.getPage(item.num);
      const origViewport = page.getViewport({ scale: 1 });
      const targetWidth = 220;
      const scale = targetWidth / Math.max(origViewport.width, 1);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({
          canvas,
          canvasContext: ctx,
          viewport,
        }).promise;

        item.thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.85);

        const sheet = this.container.querySelector<HTMLElement>(`[data-ref="sheet-page-${item.num}"]`);
        if (sheet) {
          sheet.innerHTML = `<img class="remove-page-card__canvas" data-ref="img-page-${item.num}" src="${item.thumbnailDataUrl}" alt="Página ${item.num}" />`;
        }
      }
    } catch {}
  }

  private renderFilesView(): void {
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-dropzone-card"]');
    const itemsCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-items-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-processing-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-result-card"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="remove-pages-workspace"]');

    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (processingCard) processingCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'none';
    if (itemsCard) itemsCard.style.display = 'block';
    if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="remove-pages-sidebar"]');
    if (sidebar) sidebar.style.display = 'flex';
    const settingsBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
    if (settingsBtn) settingsBtn.classList.add('is-visible');

    const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
    if (outputNameInput && this.currentFile) {
      const base = this.currentFile.name.replace(/\.[^/.]+$/, '');
      outputNameInput.value = `${base}_sin_paginas.pdf`;
    }

    const countBadge = this.container.querySelector<HTMLElement>('[data-ref="pdf-count-badge"]');
    if (countBadge) {
      countBadge.textContent = `${this.pages.length} págs.`;
    }

    this.renderPagesGrid();
    this.updateActionButtons();
  }

  private renderPagesGrid(): void {
    const grid = this.container.querySelector<HTMLElement>('[data-ref="remove-pages-grid"]');
    if (!grid) return;

    grid.innerHTML = this.pages.map((p, index) => {
      const isRemoved = this.removedPages.has(p.num);
      return `
        <div class="remove-page-card ${isRemoved ? 'is-marked-remove' : ''}" data-ref="page-card-${p.num}" data-page-index="${index}" data-page-num="${p.num}">
          <div class="remove-page-card__action-badge" data-ref="btn-toggle-${p.num}">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#close"></use></svg>
          </div>
          <div class="remove-page-card__overlay" data-ref="overlay-page-${p.num}">
            <div class="remove-page-card__remove-badge">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#delete_sweep"></use></svg>
            </div>
          </div>
          <div class="remove-page-card__sheet-wrapper">
            <div class="remove-page-card__sheet" data-ref="sheet-page-${p.num}">
              ${
                p.thumbnailDataUrl
                  ? `<img class="remove-page-card__canvas" data-ref="img-page-${p.num}" src="${p.thumbnailDataUrl}" alt="Página ${p.num}" />`
                  : `<div class="remove-page-card__spinner"></div>`
              }
            </div>
          </div>
          <div class="remove-page-card__footer">
            <span class="remove-page-card__page-num">${t('tools.remove_pdf_pages_page') || 'Página'} ${p.num}</span>
          </div>
        </div>
      `;
    }).join('');

    renderIcons(grid);
  }

  private updateCardsState(): void {
    this.pages.forEach((p) => {
      const card = this.container.querySelector<HTMLElement>(`[data-ref="page-card-${p.num}"]`);
      if (card) {
        card.classList.toggle('is-marked-remove', this.removedPages.has(p.num));
      }
    });
  }

  private updateSummary(): void {
    const total = this.pages.length;
    const removed = this.removedPages.size;

    if (this.currentFile) {
      if (removed === 0) {
        this.hideError();
      } else if (removed >= total) {
        this.showError('No puedes eliminar todas las páginas del documento. Debe quedar al menos una página.');
      } else {
        this.hideError();
      }
    }
  }

  private updateActionButtons(): void {
    const mainActionBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-main-action"]');
    const txtMainAction = this.container.querySelector<HTMLElement>('[data-ref="txt-main-action"]');

    if (mainActionBtn && txtMainAction) {
      if (!this.currentFile) {
        txtMainAction.textContent = t('tools.remove_pdf_pages_btn_select') || 'Seleccionar PDF';
        mainActionBtn.style.display = '';
      } else if (this.currentResult) {
        mainActionBtn.style.display = 'none';
      } else {
        txtMainAction.textContent = t('tools.remove_pdf_pages_btn_action') || 'Eliminar páginas';
        mainActionBtn.style.display = '';
      }
    }
  }

  private async executeRemovePages(): Promise<void> {
    if (!this.currentFile || this.isProcessing) return;
    this.hideError();

    const total = this.pages.length;
    const removedCount = this.removedPages.size;

    if (removedCount === 0) {
      this.showError('Debes seleccionar al menos una página para eliminar.');
      return;
    }

    if (removedCount >= total) {
      this.showError('No puedes eliminar todas las páginas del documento. Debe quedar al menos una página.');
      return;
    }

    const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
    const customFilename = outputNameInput?.value.trim() || `${this.currentFile.name.replace(/\.pdf$/i, '')}_sin_paginas.pdf`;

    const formData = new FormData();
    formData.append('pdf', this.currentFile);
    formData.append('pagesToRemove', JSON.stringify(Array.from(this.removedPages)));
    formData.append('filename', customFilename);

    this.isProcessing = true;
    this.showProcessingState();

    try {
      const response = await postFormApi(
        API_ROUTES.tools.removePdfPages.remove,
        formData
      );
      const json = await response.json();

      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.error || 'Error al procesar la solicitud.');
      }

      this.currentResult = json.data as RemovePdfResponseData;
      const token = this.currentResult.fileId;
      const downloadPayload = {
        downloadUrl: `/api/download/${token}`,
        fileSize: this.currentResult.fileSize,
        filename: this.currentResult.filename,
        returnText: 'Eliminar más páginas',
        returnUrl: '/remove-pdf-pages',
        subtitle: `Se han eliminado exitosamente ${this.currentResult.removedPages} páginas de "${this.currentFile?.name}".`,
        title: '¡Páginas eliminadas con éxito!',
        token,
      };
      sessionStorage.setItem('download_ready_data', JSON.stringify(downloadPayload));
      showToast('Páginas eliminadas con éxito.', 'success');
      navigate(`/download/${token}`);
    } catch (err: any) {
      const message = err?.message || 'Error inesperado al eliminar las páginas del PDF.';
      this.showError(message);
      this.renderFilesView();
    } finally {
      this.isProcessing = false;
    }
  }

  private showProcessingState(): void {
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-dropzone-card"]');
    const itemsCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-items-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-result-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-processing-card"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="remove-pages-workspace"]');

    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (itemsCard) itemsCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'none';
    if (processingCard) processingCard.style.display = 'flex';
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');

    const mainActionBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-main-action"]');
    if (mainActionBtn) {
      mainActionBtn.disabled = true;
    }
  }

  private showResultState(): void {
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-dropzone-card"]');
    const itemsCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-items-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-processing-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-result-card"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="remove-pages-workspace"]');

    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (itemsCard) itemsCard.style.display = 'none';
    if (processingCard) processingCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'flex';
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');

    const mainActionBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-main-action"]');
    if (mainActionBtn) {
      mainActionBtn.disabled = false;
    }

    if (this.currentResult) {
      const resName = this.container.querySelector<HTMLElement>('[data-ref="result-file-name"]');
      const resTotal = this.container.querySelector<HTMLElement>('[data-ref="result-total-pages"]');
      const resRemoved = this.container.querySelector<HTMLElement>('[data-ref="result-removed-pages"]');
      const resRemain = this.container.querySelector<HTMLElement>('[data-ref="result-remaining-pages"]');
      const resSize = this.container.querySelector<HTMLElement>('[data-ref="result-file-size"]');

      if (resName) resName.textContent = this.currentResult.filename;
      if (resTotal) resTotal.textContent = `${this.currentResult.originalPages}`;
      if (resRemoved) resRemoved.textContent = `${this.currentResult.removedPages}`;
      if (resRemain) resRemain.textContent = `${this.currentResult.remainingPages}`;
      if (resSize) resSize.textContent = formatBytes(this.currentResult.fileSize);
    }

    this.updateActionButtons();
  }

  private resetToInitial(): void {
    this.currentFile = null;
    this.currentResult = null;
    this.pages = [];
    this.removedPages.clear();
    this.lastClickedPageIndex = null;
    this.pdfDocument = null;
    this.isProcessing = false;

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const inputPagesToRemove = this.container.querySelector<HTMLInputElement>('[data-ref="input-pages-to-remove"]');
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-dropzone-card"]');
    const itemsCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-items-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-processing-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-result-card"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="remove-pages-workspace"]');

    if (fileInput) fileInput.value = '';
    if (inputPagesToRemove) inputPagesToRemove.value = '';

    if (processingCard) processingCard.style.display = 'none';
    if (itemsCard) itemsCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'none';
    if (dropzoneCard) dropzoneCard.style.display = 'flex';
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="remove-pages-sidebar"]');
    if (sidebar) sidebar.style.display = 'none';
    const settingsBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
    if (outputNameInput) outputNameInput.value = 'documento_sin_paginas.pdf';
    if (this.sidebarModal) this.sidebarModal.close();

    this.updateSummary();
    this.updateActionButtons();
    this.hideError();
  }

  private showError(msg: string): void {
    const banner = this.container.querySelector<HTMLElement>('[data-ref="remove-pdf-error"]');
    if (banner) {
      banner.textContent = msg;
      banner.style.display = '';
    }
  }

  private hideError(): void {
    const banner = this.container.querySelector<HTMLElement>('[data-ref="remove-pdf-error"]');
    if (banner) {
      banner.textContent = '';
      banner.style.display = 'none';
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export async function createRemovePdfPagesView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/tools/remove-pdf-pages/remove-pdf-pages.html');
  const controller = new RemovePdfPagesController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
