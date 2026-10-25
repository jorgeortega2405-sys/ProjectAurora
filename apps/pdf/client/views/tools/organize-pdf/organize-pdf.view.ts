import Sortable from 'sortablejs';
import { openUpgradeModal } from '../../../components/upgrade-modal.component.js';
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
import { setupToolSidebarModal, ToolSidebarModalController } from '../../../utils/dom.util.js';
import { OrganizePageItem, OrganizePdfResponseData } from './organize-pdf.types.js';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export class OrganizePdfController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private currentFile: File | null = null;
  private currentResult: OrganizePdfResponseData | null = null;
  private isProcessing = false;
  private originalPages: OrganizePageItem[] = [];
  private pages: OrganizePageItem[] = [];
  private pdfDocument: any = null;
  private sidebarModal: ToolSidebarModalController | null = null;
  private sortableInstance: Sortable | null = null;

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
    if (this.sortableInstance) {
      this.sortableInstance.destroy();
      this.sortableInstance = null;
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
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="organize-pdf-sidebar"]');

    this.sidebarModal = setupToolSidebarModal({
      backdrop: sidebarBackdrop,
      closeBtn: sidebarCloseBtn,
      dragZone: sidebarDragZone,
      settingsBtn,
      sidebar,
      signal,
    });

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
    const rotateAllBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-rotate-all"]');
    const resetOrderBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-reset-order"]');
    const mainActionBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-main-action"]');
    const downloadResultBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-download-result"]');
    const restartOrganizeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-restart-organize"]');
    const pagesGrid = this.container.querySelector<HTMLElement>('[data-ref="organize-pages-grid"]');

    browseBtn?.addEventListener('click', () => fileInput?.click(), { signal });

    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) {
        void this.handleFileSelected(file);
      }
      fileInput.value = '';
    }, { signal });

    if (dropzone) {
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('tool-dropzone--active');
      }, { signal });

      dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropzone.classList.remove('tool-dropzone--active');
      }, { signal });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('tool-dropzone--active');
        const file = e.dataTransfer?.files?.[0];
        if (file) {
          void this.handleFileSelected(file);
        }
      }, { signal });

      dropzone.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        fileInput?.click();
      }, { signal });
    }

    rotateAllBtn?.addEventListener('click', () => {
      this.rotateAllPages();
    }, { signal });

    resetOrderBtn?.addEventListener('click', () => {
      this.resetOrder();
    }, { signal });

    pagesGrid?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const rotateBtn = target.closest<HTMLElement>('[data-ref="btn-rotate-card"]');
      const removeBtn = target.closest<HTMLElement>('[data-ref="btn-remove-card"]');
      const card = target.closest<HTMLElement>('[data-page-id]');
      if (!card) return;
      const pageId = card.getAttribute('data-page-id');
      if (!pageId) return;

      if (rotateBtn) {
        e.stopPropagation();
        this.rotatePage(pageId);
      } else if (removeBtn) {
        e.stopPropagation();
        this.removePage(pageId);
      }
    }, { signal });

    mainActionBtn?.addEventListener('click', () => {
      if (!this.currentFile) {
        fileInput?.click();
      } else {
        void this.executeOrganizePdf();
      }
    }, { signal });

    downloadResultBtn?.addEventListener('click', () => {
      if (this.currentResult) {
        window.open(this.currentResult.downloadUrl, '_blank');
      }
    }, { signal });

    restartOrganizeBtn?.addEventListener('click', () => {
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

    const limits = getCurrentUserToolLimits('organize-pdf');
    const maxSizeBytes = limits.maxFileSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      this.showError(`El archivo supera el límite de ${limits.maxFileSizeMB} MB para tu plan actual. Actualiza tu suscripción para procesar archivos de mayor tamaño.`);
      if (!limits.isPremium) {
        openUpgradeModal('pro');
      }
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

      this.pages = Array.from({ length: count }, (_, i) => ({
        id: `page-${Date.now()}-${i + 1}`,
        originalIndex: i,
        pageNum: i + 1,
        rotation: 0,
      }));

      this.originalPages = this.pages.map((p) => ({ ...p }));

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

  private async generatePageThumbnail(item: OrganizePageItem): Promise<void> {
    if (!this.pdfDocument) return;
    try {
      const page = await this.pdfDocument.getPage(item.originalIndex + 1);
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

        const sheet = this.container.querySelector<HTMLElement>(`[data-ref="sheet-${item.id}"]`);
        if (sheet) {
          sheet.innerHTML = `<img class="organize-page-card__canvas" data-ref="img-${item.id}" src="${item.thumbnailDataUrl}" alt="Página ${item.pageNum}" style="${item.rotation !== 0 ? `transform: rotate(${item.rotation}deg);` : ''}" />`;
        }
      }
    } catch {}
  }

  private renderFilesView(): void {
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-dropzone-card"]');
    const itemsCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-items-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-processing-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-result-card"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="organize-pdf-workspace"]');

    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (processingCard) processingCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'none';
    if (itemsCard) itemsCard.style.display = 'block';
    if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="organize-pdf-sidebar"]');
    if (sidebar) sidebar.style.display = 'flex';
    const settingsBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
    if (settingsBtn) settingsBtn.classList.add('is-visible');

    const topActions = this.container.querySelector<HTMLElement>('[data-ref="organize-top-actions"]');
    if (topActions) topActions.style.display = 'flex';

    const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
    if (outputNameInput && this.currentFile) {
      const base = this.currentFile.name.replace(/\.[^/.]+$/, '');
      outputNameInput.value = `${base}_organizado.pdf`;
    }

    const countBadge = this.container.querySelector<HTMLElement>('[data-ref="pdf-count-badge"]');
    if (countBadge) {
      countBadge.textContent = `${this.pages.length} págs.`;
    }

    this.renderPagesGrid();
    this.initSortable();
    this.updateActionButtons();
  }

  private renderPagesGrid(): void {
    const grid = this.container.querySelector<HTMLElement>('[data-ref="organize-pages-grid"]');
    if (!grid) return;

    grid.innerHTML = this.pages.map((p, index) => {
      const isMoved = p.originalIndex !== index;
      const isRotated = p.rotation !== 0;

      return `
        <div class="organize-page-card" data-ref="card-${p.id}" data-page-id="${p.id}" data-page-index="${index}">
          <div class="organize-page-card__actions">
            <button type="button" class="component-button organize-page-card__btn-rotate" data-ref="btn-rotate-card" title="Girar 90°" aria-label="Girar 90°">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#autorenew"></use></svg>
            </button>
            <button type="button" class="component-button organize-page-card__btn-remove" data-ref="btn-remove-card" title="Quitar página" aria-label="Quitar página">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#close"></use></svg>
            </button>
          </div>
          <div class="organize-page-card__sheet-wrapper">
            <div class="organize-page-card__sheet" data-ref="sheet-${p.id}">
              ${
                p.thumbnailDataUrl
                  ? `<img class="organize-page-card__canvas" data-ref="img-${p.id}" src="${p.thumbnailDataUrl}" alt="Página ${p.pageNum}" style="${isRotated ? `transform: rotate(${p.rotation}deg);` : ''}" />`
                  : `<div class="organize-page-card__spinner"></div>`
              }
            </div>
          </div>
          <div class="organize-page-card__footer">
            <span class="organize-page-card__page-title">${t('tools.organize_pdf_page') || 'Página'} ${index + 1}</span>
            ${isMoved ? `<span class="organize-page-card__orig-sub">(orig. ${p.originalIndex + 1})</span>` : ''}
            ${isRotated ? `<span class="organize-page-card__rotation-badge" data-ref="rot-badge-${p.id}">+${p.rotation}°</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    renderIcons(grid);
  }

  private initSortable(): void {
    const grid = this.container.querySelector<HTMLElement>('[data-ref="organize-pages-grid"]');
    if (!grid) return;

    if (this.sortableInstance) {
      this.sortableInstance.destroy();
    }

    this.sortableInstance = new Sortable(grid, {
      animation: 160,
      chosenClass: 'sortable-chosen',
      ghostClass: 'sortable-ghost',
      onEnd: (evt) => {
        if (typeof evt.oldIndex === 'number' && typeof evt.newIndex === 'number' && evt.oldIndex !== evt.newIndex) {
          const [moved] = this.pages.splice(evt.oldIndex, 1);
          if (moved) {
            this.pages.splice(evt.newIndex, 0, moved);
          }
          this.refreshCardBadges();
          this.updateSummary();
        }
      },
    });
  }

  private refreshCardBadges(): void {
    this.pages.forEach((p, index) => {
      const card = this.container.querySelector<HTMLElement>(`[data-ref="card-${p.id}"]`);
      if (card) {
        card.setAttribute('data-page-index', `${index}`);
        const pageTitle = card.querySelector<HTMLElement>('.organize-page-card__page-title');
        if (pageTitle) {
          pageTitle.textContent = `${t('tools.organize_pdf_page') || 'Página'} ${index + 1}`;
        }
        let origSub = card.querySelector<HTMLElement>('.organize-page-card__orig-sub');
        if (p.originalIndex !== index) {
          if (!origSub) {
            origSub = document.createElement('span');
            origSub.className = 'organize-page-card__orig-sub';
            card.querySelector('.organize-page-card__footer')?.appendChild(origSub);
          }
          origSub.textContent = `(orig. ${p.originalIndex + 1})`;
        } else if (origSub) {
          origSub.remove();
        }
      }
    });
  }

  private rotatePage(pageId: string): void {
    const item = this.pages.find((p) => p.id === pageId);
    if (!item) return;

    item.rotation = (item.rotation + 90) % 360;

    const img = this.container.querySelector<HTMLElement>(`[data-ref="img-${item.id}"]`);
    if (img) {
      img.style.transform = item.rotation !== 0 ? `rotate(${item.rotation}deg)` : '';
    }

    const card = this.container.querySelector<HTMLElement>(`[data-ref="card-${item.id}"]`);
    if (card) {
      let rotBadge = card.querySelector<HTMLElement>(`[data-ref="rot-badge-${item.id}"]`);
      if (item.rotation !== 0) {
        if (!rotBadge) {
          rotBadge = document.createElement('span');
          rotBadge.className = 'organize-page-card__rotation-badge';
          rotBadge.setAttribute('data-ref', `rot-badge-${item.id}`);
          card.querySelector('.organize-page-card__footer')?.appendChild(rotBadge);
        }
        rotBadge.textContent = `+${item.rotation}°`;
      } else if (rotBadge) {
        rotBadge.remove();
      }
    }

    this.updateSummary();
  }

  private rotateAllPages(): void {
    this.pages.forEach((p) => {
      this.rotatePage(p.id);
    });
    showToast('Todas las páginas han sido giradas 90°.', 'info');
  }

  private removePage(pageId: string): void {
    if (this.pages.length <= 1) {
      this.showError('El documento no puede quedar vacío. Debe contener al menos una página.');
      return;
    }

    const index = this.pages.findIndex((p) => p.id === pageId);
    if (index !== -1) {
      this.pages.splice(index, 1);
      this.renderPagesGrid();
      this.initSortable();
      this.updateSummary();

      const countBadge = this.container.querySelector<HTMLElement>('[data-ref="pdf-count-badge"]');
      if (countBadge) {
        countBadge.textContent = `${this.pages.length} págs.`;
      }
    }
  }

  private resetOrder(): void {
    this.pages = this.originalPages.map((p) => ({ ...p, rotation: 0 }));
    this.renderPagesGrid();
    this.initSortable();
    this.updateSummary();
    showToast('Se ha restablecido el orden original del documento.', 'info');
  }

  private updateSummary(): void {
    const total = this.pages.length;
    if (total > 0) {
      this.hideError();
    }
  }

  private updateActionButtons(): void {
    const mainActionBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-main-action"]');
    const txtMainAction = this.container.querySelector<HTMLElement>('[data-ref="txt-main-action"]');

    if (mainActionBtn && txtMainAction) {
      if (!this.currentFile) {
        txtMainAction.textContent = t('tools.organize_pdf_btn_select') || 'Seleccionar PDF';
        mainActionBtn.style.display = '';
      } else if (this.currentResult) {
        mainActionBtn.style.display = 'none';
      } else {
        txtMainAction.textContent = t('tools.organize_pdf_btn_action') || 'Ordenar PDF';
        mainActionBtn.style.display = '';
      }
    }
  }

  private async executeOrganizePdf(): Promise<void> {
    if (!this.currentFile || this.isProcessing) return;
    this.hideError();

    if (this.pages.length === 0) {
      this.showError('Debes incluir al menos una página en el orden final.');
      return;
    }

    const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
    const customFilename = outputNameInput?.value.trim() || `${this.currentFile.name.replace(/\.pdf$/i, '')}_organizado.pdf`;

    const pagesOrder = this.pages.map((p) => ({
      pageIndex: p.originalIndex,
      rotation: p.rotation,
    }));

    const formData = new FormData();
    formData.append('pdf', this.currentFile);
    formData.append('pagesOrder', JSON.stringify(pagesOrder));
    formData.append('filename', customFilename);

    this.isProcessing = true;
    this.showProcessingState();

    try {
      const response = await postFormApi(
        API_ROUTES.tools.organizePdf.organize,
        formData
      );
      const json = await response.json();

      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.error || 'Error al procesar la solicitud.');
      }

      this.currentResult = json.data as OrganizePdfResponseData;
      const token = this.currentResult.fileId;
      const downloadPayload = {
        downloadUrl: `/api/download/${token}`,
        fileSize: this.currentResult.fileSize,
        filename: this.currentResult.filename,
        returnText: 'Organizar otro documento PDF',
        returnUrl: '/organize-pdf',
        subtitle: `Se ha reorganizado exitosamente el archivo "${this.currentFile?.name}".`,
        title: '¡PDF organizado con éxito!',
        token,
      };
      sessionStorage.setItem('download_ready_data', JSON.stringify(downloadPayload));
      showToast('Documento PDF organizado con éxito.', 'success');
      navigate(`/download/${token}`);
    } catch (err: any) {
      const message = err?.message || 'Error inesperado al ordenar el PDF.';
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
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="organize-pdf-workspace"]');

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
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="organize-pdf-workspace"]');

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
      const resSize = this.container.querySelector<HTMLElement>('[data-ref="result-file-size"]');

      if (resName) resName.textContent = this.currentResult.filename;
      if (resTotal) resTotal.textContent = `${this.currentResult.totalPages}`;
      if (resSize) resSize.textContent = formatBytes(this.currentResult.fileSize);
    }

    this.updateActionButtons();
  }

  private resetToInitial(): void {
    this.currentFile = null;
    this.currentResult = null;
    this.pages = [];
    this.originalPages = [];
    this.pdfDocument = null;
    this.isProcessing = false;

    if (this.sortableInstance) {
      this.sortableInstance.destroy();
      this.sortableInstance = null;
    }

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-dropzone-card"]');
    const itemsCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-items-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-processing-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="pdf-result-card"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="organize-pdf-workspace"]');

    if (fileInput) fileInput.value = '';

    if (processingCard) processingCard.style.display = 'none';
    if (itemsCard) itemsCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'none';
    if (dropzoneCard) dropzoneCard.style.display = 'flex';
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="organize-pdf-sidebar"]');
    if (sidebar) sidebar.style.display = 'none';
    const settingsBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    const topActions = this.container.querySelector<HTMLElement>('[data-ref="organize-top-actions"]');
    if (topActions) topActions.style.display = 'none';
    const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
    if (outputNameInput) outputNameInput.value = 'documento_organizado.pdf';
    if (this.sidebarModal) this.sidebarModal.close();

    this.updateSummary();
    this.updateActionButtons();
    this.hideError();
  }

  private showError(msg: string): void {
    const banner = this.container.querySelector<HTMLElement>('[data-ref="organize-pdf-error"]');
    if (banner) {
      banner.textContent = msg;
      banner.style.display = '';
    }
  }

  private hideError(): void {
    const banner = this.container.querySelector<HTMLElement>('[data-ref="organize-pdf-error"]');
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

export async function createOrganizePdfView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/tools/organize-pdf/organize-pdf.html');
  const controller = new OrganizePdfController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
