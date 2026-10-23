import Sortable from 'sortablejs';
import { ToolStatusManager } from '../../../components/tool-status.component.js';
import { openUpgradeModal } from '../../../components/upgrade-modal.component.js';
import { API_ROUTES } from '../../../config/api-routes.js';
import { getCurrentUserToolLimits } from '../../../config/tools-limits.config.js';
import { postFormApi, postFormWithProgress } from '../../../services/api.service.js';
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
import { MergePdfResponseData, SelectedPdfItem } from './merge-pdf.types.js';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

async function estimatePdfPages(file: File): Promise<number> {
  try {
    const headBuffer = await file.slice(0, Math.min(file.size, 128 * 1024)).arrayBuffer();
    const headText = new TextDecoder('latin1').decode(headBuffer);
    const countMatch = headText.match(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/);
    if (countMatch && countMatch[1]) {
      const count = parseInt(countMatch[1], 10);
      if (count > 0) return count;
    }
    const tailBuffer = await file.slice(Math.max(0, file.size - 128 * 1024)).arrayBuffer();
    const tailText = new TextDecoder('latin1').decode(tailBuffer);
    const tailCountMatch = tailText.match(/\/Count\s+(\d+)/);
    if (tailCountMatch && tailCountMatch[1]) {
      const count = parseInt(tailCountMatch[1], 10);
      if (count > 0) return count;
    }
  } catch {}
  return 1;
}

export class MergePdfController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private currentResult: MergePdfResponseData | null = null;
  private isProcessing = false;
  private selectedFiles: SelectedPdfItem[] = [];
  private sidebarModal: ToolSidebarModalController | null = null;
  private sortable: Sortable | null = null;
  private statusManager: ToolStatusManager | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async init(): Promise<void> {
    this.abortController = new AbortController();
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="pdf-merger-workspace"]') || this.container;
    this.statusManager = new ToolStatusManager({
      container: workspace,
      onRetry: () => {
        this.renderFilesList();
      },
      toolName: 'Unir PDF',
    });
    renderIcons(this.container);
    this.bindEvents();
  }

  public destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.statusManager) {
      this.statusManager.destroy();
      this.statusManager = null;
    }
    if (this.sortable) {
      this.sortable.destroy();
      this.sortable = null;
    }
    if (this.sidebarModal) {
      this.sidebarModal.destroy();
      this.sidebarModal = null;
    }
  }

  private bindEvents(): void {
    if (!this.abortController) return;
    const { signal } = this.abortController;

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-files"]');
    const addMoreInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-add-more-pdf"]');
    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="pdf-dropzone"]');
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-pdfs"]');
    const fabAddMoreBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-fab-add-more"]');
    const fabDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-fab-drive"]');
    const fabDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-fab-dropbox"]');
    const heroDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive"]');
    const heroDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox"]');
    const mainActionBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-main-action"]');
    const sidebarResetBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-reset"]');
    const downloadResultBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-download-result"]');
    const restartMergeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-restart-merge"]');
    const itemsGrid = this.container.querySelector<HTMLElement>('[data-ref="pdf-items-grid"]');
    const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const sidebarBackdrop = this.container.querySelector<HTMLElement>('[data-ref="tool-sidebar-backdrop"]');
    const sidebarCloseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-close"]');
    const sidebarDragZone = this.container.querySelector<HTMLElement>('[data-ref="modal-drag-zone"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="pdf-merger-sidebar"]');

    this.sidebarModal = setupToolSidebarModal({
      backdrop: sidebarBackdrop,
      closeBtn: sidebarCloseBtn,
      dragZone: sidebarDragZone,
      settingsBtn,
      sidebar,
      signal,
    });

    browseBtn?.addEventListener('click', () => {
      fileInput?.click();
    }, { signal });

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-dropzone-card"]');
    const dropTarget = dropzoneCard || dropzone;
    bindFileDropzone({
      dropTarget,
      visualTarget: dropTarget,
      onFiles: (files) => {
        if (files.length > 0) {
          void this.handleFilesAdded(files);
        }
      },
      signal,
    });

    fileInput?.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        void this.handleFilesAdded(fileInput.files);
      }
    }, { signal });

    fabAddMoreBtn?.addEventListener('click', () => {
      addMoreInput?.click();
    }, { signal });

    fabDriveBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void this.handleDriveImport();
    }, { signal });

    fabDropboxBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void this.handleDropboxImport();
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

    addMoreInput?.addEventListener('change', () => {
      if (addMoreInput.files && addMoreInput.files.length > 0) {
        void this.handleFilesAdded(addMoreInput.files);
        addMoreInput.value = '';
      }
    }, { signal });

    const mergeNotice = this.container.querySelector<HTMLElement>('[data-ref="merge-info-notice"]');
    mergeNotice?.addEventListener('click', () => {
      if (this.selectedFiles.length < 2) {
        addMoreInput?.click();
      }
    }, { signal });

    mainActionBtn?.addEventListener('click', () => {
      if (this.currentResult) {
        this.downloadMergedResult();
      } else if (this.selectedFiles.length === 0) {
        fileInput?.click();
      } else if (this.selectedFiles.length === 1) {
        addMoreInput?.click();
      } else {
        this.sidebarModal?.close();
        void this.startMergeProcess();
      }
    }, { signal });

    sidebarResetBtn?.addEventListener('click', () => {
      this.resetToInitial();
    }, { signal });

    downloadResultBtn?.addEventListener('click', () => {
      this.downloadMergedResult();
    }, { signal });

    restartMergeBtn?.addEventListener('click', () => {
      this.resetToInitial();
    }, { signal });

    outputNameInput?.addEventListener('input', () => {
      this.hideError();
    }, { signal });

    itemsGrid?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const removeBtn = target.closest<HTMLButtonElement>('[data-ref="btn-remove-pdf"]');
      if (removeBtn) {
        e.stopPropagation();
        const id = removeBtn.getAttribute('data-id');
        if (id) {
          this.removeFile(id);
        }
      }
    }, { signal });
  }

  private async handleDriveImport(): Promise<void> {
    if (this.isProcessing) return;
    this.hideError();
    try {
      const files = await pickGoogleDriveFiles({ multiselect: true });
      if (files.length > 0) {
        await this.handleFilesAdded(files);
      }
    } catch (err: any) {
      this.showError(err?.message || 'Error al importar archivos desde Google Drive.');
    }
  }

  private async handleDropboxImport(): Promise<void> {
    if (this.isProcessing) return;
    this.hideError();
    try {
      const files = await pickDropboxFiles({ multiselect: true });
      if (files.length > 0) {
        await this.handleFilesAdded(files);
      }
    } catch (err: any) {
      this.showError(err?.message || 'Error al importar archivos desde Dropbox.');
    }
  }

  private async handleFilesAdded(fileList: FileList | File[]): Promise<void> {
    if (this.isProcessing) return;
    this.hideError();

    const incomingFiles = Array.isArray(fileList) ? fileList : Array.from(fileList);
    const validPdfs = incomingFiles.filter((f) => {
      const isPdfExt = f.name.toLowerCase().endsWith('.pdf');
      const isPdfMime = f.type === 'application/pdf' || f.type === 'application/x-pdf';
      return isPdfExt || isPdfMime;
    });

    if (validPdfs.length === 0) {
      this.showError('Selecciona únicamente documentos en formato PDF.');
      return;
    }

    const limits = getCurrentUserToolLimits('merge-pdf');
    if (this.selectedFiles.length + validPdfs.length > limits.maxFiles) {
      if (!limits.isPremium) {
        this.showError(`El plan gratuito permite unir hasta ${limits.maxFiles} archivos PDF por tarea. Actualiza a Pro para unir hasta 500 archivos.`);
        openUpgradeModal('pro');
      } else {
        this.showError(`Puedes unir un máximo de ${limits.maxFiles} archivos PDF.`);
      }
      return;
    }

    const maxFileSizeBytes = limits.maxFileSizeMB * 1024 * 1024;
    const oversized = validPdfs.find((f) => f.size > maxFileSizeBytes);
    if (oversized) {
      this.showError(`El archivo "${oversized.name}" supera el límite de ${limits.maxFileSizeMB} MB.`);
      if (!limits.isPremium) {
        openUpgradeModal('pro');
      }
      return;
    }

    const currentTotalSize = this.selectedFiles.reduce((acc, curr) => acc + curr.size, 0);
    const incomingTotalSize = validPdfs.reduce((acc, curr) => acc + curr.size, 0);
    const maxTotalSizeBytes = limits.maxTotalSizeMB * 1024 * 1024;
    if (currentTotalSize + incomingTotalSize > maxTotalSizeBytes) {
      this.showError(`El tamaño acumulado de todos los archivos no debe superar ${limits.maxTotalSizeMB} MB.`);
      if (!limits.isPremium) {
        openUpgradeModal('pro');
      }
      return;
    }

    const newItems: SelectedPdfItem[] = [];

    for (const file of validPdfs) {
      try {
        const initialPages = await estimatePdfPages(file);
        const item: SelectedPdfItem = {
          file,
          id: `pdf-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          name: file.name,
          pageCount: initialPages,
          size: file.size,
        };
        this.selectedFiles.push(item);
        newItems.push(item);
      } catch {
        this.showError(`El archivo "${file.name}" está dañado, protegido con contraseña o en un formato no compatible.`);
      }
    }

    this.renderFilesList();
    this.updateSummary();

    for (const item of newItems) {
      void this.generateThumbnailForItem(item);
    }
  }

  private async generateThumbnailForItem(item: SelectedPdfItem): Promise<void> {
    let pdfDoc: any = null;
    try {
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await item.file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({
        cMapPacked: true,
        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/cmaps/',
        data: new Uint8Array(arrayBuffer),
        standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/standard_fonts/',
      });
      pdfDoc = await loadingTask.promise;
      item.pageCount = pdfDoc.numPages || item.pageCount;

      const page = await pdfDoc.getPage(1);
      const origViewport = page.getViewport({ scale: 1 });
      const targetWidth = 280;
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

        item.thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.88);

        const sheet = this.container.querySelector<HTMLElement>(`[data-ref="sheet-${item.id}"]`);
        if (sheet && item.thumbnailDataUrl) {
          sheet.innerHTML = `<img class="pdf-card__preview-img" data-ref="img-preview-${item.id}" src="${item.thumbnailDataUrl}" alt="${item.name}" />`;
        }

        const metaEl = this.container.querySelector<HTMLElement>(`[data-ref="meta-${item.id}"]`);
        if (metaEl) {
          const pagesLabel = item.pageCount === 1 ? '1 pág.' : `${item.pageCount} págs.`;
          metaEl.textContent = `${pagesLabel} • ${formatBytes(item.size)}`;
        }
      }
    } catch {
    } finally {
      try {
        if (pdfDoc) await pdfDoc.destroy();
      } catch {}
    }

    this.updateSummary();
  }

  private renderFilesList(): void {
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-dropzone-card"]');
    const itemsCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-items-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-processing-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-result-card"]');
    const itemsGrid = this.container.querySelector<HTMLElement>('[data-ref="pdf-items-grid"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="pdf-merger-workspace"]');
    const badge = this.container.querySelector<HTMLElement>('[data-ref="pdf-count-badge"]');
    const fabMore = this.container.querySelector<HTMLElement>('[data-ref="tool-fab-more"]');
    const fabBadge = this.container.querySelector<HTMLElement>('[data-ref="badge-fab-count"]');
    const fabSettings = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="pdf-merger-sidebar"]');

    if (!itemsGrid) return;

    if (this.selectedFiles.length === 0) {
      this.resetToInitial();
      return;
    }

    this.statusManager?.hide();

    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (processingCard) processingCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'none';
    if (itemsCard) itemsCard.style.display = 'flex';
    if (sidebar) sidebar.style.display = 'flex';
    if (fabSettings) fabSettings.classList.add('is-visible');
    if (fabMore) fabMore.style.display = 'flex';
    if (fabBadge) fabBadge.textContent = this.selectedFiles.length.toString();
    if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');
    if (badge) badge.textContent = this.selectedFiles.length.toString();

    itemsGrid.innerHTML = this.selectedFiles
      .map((item, index) => this.renderCardHtml(item, index))
      .join('');

    renderIcons(itemsGrid);
    this.initSortable();
    this.updateActionButtons();
  }

  private renderCardHtml(item: SelectedPdfItem, index: number): string {
    const pagesLabel = item.pageCount === 1 ? '1 pág.' : `${item.pageCount} págs.`;

    const sheetContent = item.thumbnailDataUrl
      ? `<img class="pdf-card__preview-img" src="${item.thumbnailDataUrl}" alt="${item.name}" />`
      : `
        <div class="pdf-card__placeholder">
          <svg class="component-icon pdf-card__placeholder-icon" aria-hidden="true"><use href="/icons.svg#picture_as_pdf"></use></svg>
          <div class="pdf-card__placeholder-lines">
            <span class="pdf-card__placeholder-line"></span>
            <span class="pdf-card__placeholder-line pdf-card__placeholder-line--short"></span>
            <span class="pdf-card__placeholder-line"></span>
          </div>
        </div>
      `;

    return `
      <div class="pdf-card" data-ref="card-pdf-${item.id}" data-id="${item.id}">
        <div class="pdf-card__order-badge" data-ref="badge-${item.id}">#${index + 1}</div>
        <button type="button" class="component-button pdf-card__btn-remove" data-ref="btn-remove-pdf" data-id="${item.id}" title="Eliminar archivo" aria-label="Eliminar archivo">
          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#close"></use></svg>
        </button>

        <div class="pdf-card__sheet-wrapper" data-ref="sheet-wrapper-${item.id}">
          <div class="pdf-card__sheet" data-ref="sheet-${item.id}">
            ${sheetContent}
          </div>
        </div>

        <span class="pdf-card__filename" title="${item.name}">${item.name}</span>
        <span class="pdf-card__meta" data-ref="meta-${item.id}">${pagesLabel} • ${formatBytes(item.size)}</span>
      </div>
    `;
  }

  private initSortable(): void {
    if (this.sortable) {
      this.sortable.destroy();
      this.sortable = null;
    }

    const itemsGrid = this.container.querySelector<HTMLElement>('[data-ref="pdf-items-grid"]');
    if (!itemsGrid) return;

    this.sortable = new Sortable(itemsGrid, {
      animation: 200,
      chosenClass: 'pdf-card--chosen',
      filter: 'button, .pdf-card__btn-remove',
      ghostClass: 'pdf-card--ghost',
      onEnd: () => {
        this.syncOrderFromDom();
      },
      preventOnFilter: false,
    });
  }

  private syncOrderFromDom(): void {
    const itemsGrid = this.container.querySelector<HTMLElement>('[data-ref="pdf-items-grid"]');
    if (!itemsGrid) return;

    const cards = Array.from(itemsGrid.querySelectorAll<HTMLElement>('.pdf-card[data-id]'));
    const newOrderedFiles: SelectedPdfItem[] = [];

    cards.forEach((card, index) => {
      const id = card.getAttribute('data-id');
      const found = this.selectedFiles.find((f) => f.id === id);
      if (found) {
        newOrderedFiles.push(found);
      }
      const badge = card.querySelector<HTMLElement>('.pdf-card__order-badge');
      if (badge) {
        badge.textContent = `#${index + 1}`;
      }
    });

    this.selectedFiles = newOrderedFiles;
  }

  private removeFile(id: string): void {
    this.selectedFiles = this.selectedFiles.filter((f) => f.id !== id);
    this.renderFilesList();
    this.updateSummary();
  }

  private updateSummary(): void {}

  private updateActionButtons(): void {
    const mainBtnText = this.container.querySelector<HTMLElement>('[data-ref="txt-main-action"]');
    const mainBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-main-action"]');
    const resetBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-reset"]');
    const noticeEl = this.container.querySelector<HTMLElement>('[data-ref="merge-info-notice"]');
    const noticeText = this.container.querySelector<HTMLElement>('[data-ref="txt-merge-info-notice"]');

    if (!mainBtnText || !mainBtn) return;

    if (this.currentResult) {
      mainBtnText.textContent = t('tools.merge_pdf_btn_download') || 'Descargar PDF Unido';
      if (resetBtn) resetBtn.style.display = '';
      if (noticeEl) noticeEl.style.display = 'none';
    } else if (this.selectedFiles.length >= 2) {
      mainBtnText.textContent = t('tools.merge_pdf_btn_merge') || 'Unir PDF';
      if (resetBtn) resetBtn.style.display = '';
      if (noticeEl) noticeEl.style.display = 'flex';
      if (noticeText) {
        noticeText.innerHTML = 'Para cambiar el orden de tus PDFs, arrastra y suelta los archivos cómo quieras.';
      }
    } else if (this.selectedFiles.length === 1) {
      mainBtnText.textContent = 'Unir PDF';
      if (resetBtn) resetBtn.style.display = '';
      if (noticeEl) noticeEl.style.display = 'flex';
      if (noticeText) {
        noticeText.innerHTML = `Por favor, selecciona más archivos PDF haciendo click en 'Seleccionar archivos PDF'.<br>Selecciona múltiples archivos manteniendo pulsado ’Ctrl’`;
      }
    } else {
      mainBtnText.textContent = t('tools.merge_pdf_btn_select') || 'Seleccionar PDFs';
      if (resetBtn) resetBtn.style.display = 'none';
      if (noticeEl) noticeEl.style.display = 'none';
    }
  }

  private async startMergeProcess(): Promise<void> {
    if (this.isProcessing) return;

    if (this.selectedFiles.length < 2) {
      this.showError('Debes seleccionar al menos 2 archivos PDF para poder unirlos.');
      return;
    }

    this.isProcessing = true;
    this.hideError();
    this.showProcessingState();
    this.statusManager?.showUploading(1, this.selectedFiles.length);

    try {
      const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
      let customFilename = outputNameInput?.value?.trim() || 'documento_unido.pdf';
      if (!customFilename.toLowerCase().endsWith('.pdf')) {
        customFilename = `${customFilename}.pdf`;
      }
      const formData = new FormData();
      formData.append('filename', customFilename);

      for (const item of this.selectedFiles) {
        formData.append('pdfs', item.file, item.name);
      }

      const response = await postFormWithProgress(
        API_ROUTES.tools.mergePdf.merge,
        formData,
        (progress) => {
          this.statusManager?.updateUploadProgress(progress, 1);
        },
        this.abortController?.signal
      );

      const json = await response.json();

      if (!response.ok || !json.success) {
        const errorMsg = json.error || 'No se pudieron unir los documentos PDF. Intenta nuevamente.';
        this.statusManager?.showError({
          boxText: 'Uno o más archivos seleccionados están dañados, protegidos o en un formato no compatible. Verifica que se puedan abrir en tu lector de PDF y vuelve a intentarlo.',
          boxTitle: 'Archivo dañado o no compatible',
          desc: errorMsg,
          retryText: 'Reintentar Unir PDF',
          title: '¡Oh no! No hemos podido unir tus archivos.',
        });
        return;
      }

      this.currentResult = json.data as MergePdfResponseData;
      const token = this.currentResult.fileId;
      const downloadPayload = {
        downloadUrl: `/api/download/${token}`,
        fileSize: this.currentResult.fileSize,
        filename: this.currentResult.filename,
        returnText: 'Unir más archivos PDF',
        returnUrl: '/merge-pdf',
        subtitle: `Se han unido exitosamente ${this.selectedFiles.length} archivos en un solo documento.`,
        title: '¡PDFs unidos con éxito!',
        token,
      };
      sessionStorage.setItem('download_ready_data', JSON.stringify(downloadPayload));
      showToast('¡Documentos PDF unidos exitosamente!', 'success');
      navigate(`/download/${token}`);
    } catch {
      this.statusManager?.showError({
        boxText: 'Comprueba tu conexión a internet o intenta con archivos de menor tamaño. Si el problema persiste, intenta reparar los documentos antes de unirlos.',
        boxTitle: 'Error en la conexión o procesamiento',
        desc: 'Ha ocurrido un error inesperado al procesar los archivos. Por favor intenta más tarde.',
        retryText: 'Reintentar Unir PDF',
        title: '¡Oh no! No hemos podido unir tus archivos.',
      });
    } finally {
      this.isProcessing = false;
    }
  }

  private showProcessingState(): void {
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-dropzone-card"]');
    const itemsCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-items-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-processing-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-result-card"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="pdf-merger-workspace"]');
    const fabMore = this.container.querySelector<HTMLElement>('[data-ref="tool-fab-more"]');
    const fabSettings = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="pdf-merger-sidebar"]');

    if (sidebar) sidebar.style.display = 'none';
    if (fabSettings) fabSettings.classList.remove('is-visible');
    if (fabMore) fabMore.style.display = 'none';
    this.sidebarModal?.close();
    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (itemsCard) itemsCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'none';
    if (processingCard) processingCard.style.display = 'none';
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
  }

  private renderResultState(result: MergePdfResponseData): void {
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-dropzone-card"]');
    const itemsCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-items-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-processing-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-result-card"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="pdf-merger-workspace"]');
    const fabMore = this.container.querySelector<HTMLElement>('[data-ref="tool-fab-more"]');
    const fabSettings = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="pdf-merger-sidebar"]');

    if (sidebar) sidebar.style.display = 'none';
    if (fabSettings) fabSettings.classList.remove('is-visible');
    if (fabMore) fabMore.style.display = 'none';
    this.sidebarModal?.close();
    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (itemsCard) itemsCard.style.display = 'none';
    if (processingCard) processingCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'flex';
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');

    const nameEl = this.container.querySelector<HTMLElement>('[data-ref="result-file-name"]');
    const pagesEl = this.container.querySelector<HTMLElement>('[data-ref="result-page-count"]');
    const sizeEl = this.container.querySelector<HTMLElement>('[data-ref="result-file-size"]');

    if (nameEl) nameEl.textContent = result.filename;
    if (pagesEl) pagesEl.textContent = `${result.pageCount} ${result.pageCount === 1 ? 'página' : 'páginas'}`;
    if (sizeEl) sizeEl.textContent = formatBytes(result.fileSize);

    this.updateActionButtons();
    renderIcons(this.container);
  }

  private downloadMergedResult(): void {
    if (!this.currentResult) return;
    const downloadUrl = this.currentResult.downloadUrl || API_ROUTES.tools.mergePdf.download(this.currentResult.fileId);
    const filename = this.currentResult.filename || 'documento_unido.pdf';

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast('Iniciando descarga del PDF...', 'success');
  }

  private resetToInitial(): void {
    this.selectedFiles = [];
    this.currentResult = null;
    this.isProcessing = false;

    if (this.sortable) {
      this.sortable.destroy();
      this.sortable = null;
    }

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-files"]');
    const addMoreInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-add-more-pdf"]');
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-dropzone-card"]');
    const itemsCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-items-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-processing-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-result-card"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="pdf-merger-workspace"]');
    const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
    const fabMore = this.container.querySelector<HTMLElement>('[data-ref="tool-fab-more"]');
    const fabSettings = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="pdf-merger-sidebar"]');

    if (sidebar) sidebar.style.display = 'none';
    if (fabSettings) fabSettings.classList.remove('is-visible');
    if (fabMore) fabMore.style.display = 'none';
    this.sidebarModal?.close();
    if (fileInput) fileInput.value = '';
    if (addMoreInput) addMoreInput.value = '';
    if (outputNameInput) outputNameInput.value = 'documento_unido.pdf';

    if (processingCard) processingCard.style.display = 'none';
    if (itemsCard) itemsCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'none';
    this.statusManager?.hide();
    if (dropzoneCard) dropzoneCard.style.display = 'flex';
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');

    this.updateSummary();
    this.updateActionButtons();
    this.hideError();
  }

  private showError(msg: string): void {
    const banner = this.container.querySelector<HTMLElement>('[data-ref="merge-pdf-error"]');
    if (banner) {
      banner.textContent = msg;
      banner.style.display = '';
    }
  }

  private hideError(): void {
    const banner = this.container.querySelector<HTMLElement>('[data-ref="merge-pdf-error"]');
    if (banner) {
      banner.textContent = '';
      banner.style.display = 'none';
    }
  }
}

export async function createMergePdfView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/tools/merge-pdf/merge-pdf.html');
  const controller = new MergePdfController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
