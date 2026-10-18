import { navigate } from '../../../app-router.js';
import { openUpgradeModal } from '../../../components/upgrade-modal.component.js';
import { API_ROUTES } from '../../../config/api-routes.js';
import { getCurrentUserToolLimits } from '../../../config/tools-limits.config.js';
import { currentUser, hasPermission, postFormApi } from '../../../services/api.service.js';
import { pickDropboxFiles } from '../../../services/dropbox.service.js';
import { pickGoogleDriveFiles } from '../../../services/google-drive.service.js';
import { loadPdfJs } from '../../../services/pdf-loader.service.js';
import { loadTemplate } from '../../../services/template.service.js';
import { showToast } from '../../../services/toast.service.js';
import { ViewController } from '../../../types/common.types.js';
import { setupDropdown, setupToolSidebarModal, ToolSidebarModalController, withButtonLoading } from '../../../utils/dom.util.js';
import { TranslatePdfResultData } from './translate-pdf.types.js';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export class TranslatePdfViewController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private currentFile: File | null = null;
  private dropdownControllers: Array<{ destroy: () => void }> = [];
  private pdfDocument: any = null;
  private selectedMode: 'standard' | 'advanced' = 'standard';
  private showingTranslated: boolean = false;
  private sidebarModal: ToolSidebarModalController | null = null;
  private sourceLang: string = '';
  private targetLang: string = 'ES';
  private translatedPdfBuffer: ArrayBuffer | null = null;
  private translatedPdfDocument: any = null;
  private translatedResult: TranslatePdfResultData | null = null;
  private zoomScale: number = 1.0;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async init(): Promise<void> {
    this.abortController = new AbortController();
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
    this.dropdownControllers.forEach((ctrl) => ctrl.destroy());
    this.dropdownControllers = [];
    this.currentFile = null;
    this.pdfDocument = null;
    this.translatedPdfDocument = null;
    this.translatedPdfBuffer = null;
    this.translatedResult = null;
  }

  private bindEvents(): void {
    if (!this.abortController) return;
    const { signal } = this.abortController;

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="translate-dropzone"]');
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-file"]');
    const changeFileBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-change-file"]');
    const zoomInBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-zoom-in"]');
    const zoomOutBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-zoom-out"]');
    const translateBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-translate-action"]');
    const downloadBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-download-translated"]');
    const toggleViewerBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-viewer-doc"]');
    const resetBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-reset-tool"]');
    const heroDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive"]');
    const heroDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const sidebarBackdrop = this.container.querySelector<HTMLElement>('[data-ref="tool-sidebar-backdrop"]');
    const sidebarCloseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-close"]');
    const sidebarDragZone = this.container.querySelector<HTMLElement>('[data-ref="modal-drag-zone"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="translate-pdf-sidebar"]');

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

    changeFileBtn?.addEventListener('click', () => {
      fileInput?.click();
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

    const modeOptions = this.container.querySelectorAll<HTMLElement>('.ai-mode-option');
    modeOptions.forEach((opt) => {
      opt.addEventListener('click', () => {
        const mode = opt.getAttribute('data-mode') as 'standard' | 'advanced';
        if (!mode) return;

        if (mode === 'advanced') {
          if (!currentUser) {
            showToast('Inicia sesión para utilizar Advanced AI con tus créditos de suscripción.', 'info');
            navigate('/login');
            return;
          }
          const credits = currentUser.ai_credits_balance ?? 0;
          if (credits < 10 && !hasPermission(currentUser, '*')) {
            showToast('No tienes suficientes créditos de IA (10 requeridos). Actualiza tu plan para obtener más.', 'info');
            openUpgradeModal('pro');
            return;
          }
        }

        this.selectedMode = mode;
        modeOptions.forEach((o) => {
          const isMatch = o === opt;
          o.classList.toggle('is-active', isMatch);
          const radio = o.querySelector<HTMLInputElement>('input[type="radio"]');
          if (radio) radio.checked = isMatch;
        });
      }, { signal });
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

    translateBtn?.addEventListener('click', () => {
      void this.handleTranslate(translateBtn);
    }, { signal });

    downloadBtn?.addEventListener('click', () => {
      this.handleDownload();
    }, { signal });

    toggleViewerBtn?.addEventListener('click', () => {
      void this.handleToggleViewerDoc();
    }, { signal });

    resetBtn?.addEventListener('click', () => {
      this.handleReset();
    }, { signal });

    const wrapperSource = this.container.querySelector<HTMLElement>('[data-ref="wrapper-source-lang"]');
    if (wrapperSource) {
      const ctrl = setupDropdown(wrapperSource, {
        onSelect: (val: string) => {
          this.sourceLang = val || '';
        },
      });
      this.dropdownControllers.push(ctrl);
    }

    const wrapperTarget = this.container.querySelector<HTMLElement>('[data-ref="wrapper-target-lang"]');
    if (wrapperTarget) {
      const ctrl = setupDropdown(wrapperTarget, {
        onSelect: (val: string) => {
          this.targetLang = val || 'ES';
        },
      });
      this.dropdownControllers.push(ctrl);
    }

    resetBtn?.addEventListener('click', () => {
      this.handleReset();
    }, { signal });
  }

  private updateZoomDisplay(): void {
    const zoomEl = this.container.querySelector<HTMLElement>('[data-ref="viewer-zoom-level"]');
    if (zoomEl) {
      zoomEl.textContent = `${Math.round(this.zoomScale * 100)}%`;
    }
  }

  private async handleDriveImport(): Promise<void> {
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
    this.hideError();

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      this.showError('Solo se permiten documentos en formato PDF.');
      return;
    }

    const limits = getCurrentUserToolLimits('translate-pdf');
    if (file.size > limits.maxFileSizeMB * 1024 * 1024) {
      this.showError(`El archivo PDF excede el límite máximo de ${limits.maxFileSizeMB} MB.`);
      if (!limits.isPremium) {
        openUpgradeModal('pro');
      }
      return;
    }

    this.currentFile = file;
    this.translatedResult = null;
    this.translatedPdfBuffer = null;
    this.translatedPdfDocument = null;
    this.showingTranslated = false;

    try {
      const pdfjsLib = await loadPdfJs();
      const buffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: buffer });
      this.pdfDocument = await loadingTask.promise;

      this.renderViewerState(file);
      await this.renderAllPages();
    } catch {
      this.showError('No se pudo procesar la vista previa del archivo PDF.');
    }
  }

  private renderViewerState(file: File): void {
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="translate-dropzone-card"]');
    const viewerCard = this.container.querySelector<HTMLElement>('[data-ref="translate-viewer-card"]');
    const fileNameEl = this.container.querySelector<HTMLElement>('[data-ref="viewer-file-name"]');
    const pageCountEl = this.container.querySelector<HTMLElement>('[data-ref="viewer-page-count"]');
    const docStateEl = this.container.querySelector<HTMLElement>('[data-ref="viewer-doc-state"]');

    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="translate-result-card"]');
    if (resultCard) resultCard.style.display = 'none';

    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (viewerCard) viewerCard.style.display = 'flex';

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="translate-pdf-sidebar"]');
    if (sidebar) sidebar.style.display = 'flex';
    const settingsBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
    if (settingsBtn) settingsBtn.classList.add('is-visible');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="translate-pdf-workspace"]');
    if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');

    const numPages = this.pdfDocument?.numPages || 1;

    if (fileNameEl) fileNameEl.textContent = file.name;
    if (pageCountEl) pageCountEl.textContent = `${numPages} ${numPages === 1 ? 'página' : 'páginas'}`;
    if (docStateEl) {
      docStateEl.textContent = 'Original';
      docStateEl.classList.remove('pdf-viewer-toolbar__badge--active');
    }
  }

  private async renderAllPages(): Promise<void> {
    const activeDoc = this.showingTranslated ? this.translatedPdfDocument : this.pdfDocument;
    if (!activeDoc) return;

    const scrollContainer = this.container.querySelector<HTMLElement>('[data-ref="viewer-scroll-container"]');
    if (!scrollContainer) return;

    scrollContainer.innerHTML = '';
    const numPages = activeDoc.numPages;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const pageCard = document.createElement('div');
      pageCard.className = 'pdf-page-card';
      pageCard.setAttribute('data-ref', `page-card-${pageNum}`);

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-page-card__canvas';
      canvas.setAttribute('data-ref', `canvas-page-${pageNum}`);
      pageCard.appendChild(canvas);

      const footer = document.createElement('div');
      footer.className = 'pdf-page-card__footer';
      footer.textContent = `Página ${pageNum} de ${numPages}`;
      pageCard.appendChild(footer);

      scrollContainer.appendChild(pageCard);

      try {
        const page = await activeDoc.getPage(pageNum);
        const baseViewport = page.getViewport({ scale: 1 });
        const pageWidth = baseViewport.width;
        const pageHeight = baseViewport.height;

        const containerWidth = scrollContainer.clientWidth > 100 ? scrollContainer.clientWidth : 700;
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

        const scale = (displayWidth * dpr) / pageWidth;
        const viewport = page.getViewport({ scale });
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await page.render({
            canvasContext: ctx,
            viewport,
          }).promise;
        }
      } catch {}
    }
  }

  private async handleTranslate(btn: HTMLButtonElement): Promise<void> {
    this.hideError();

    if (!this.currentFile) {
      this.showError('Por favor selecciona un archivo PDF primero.');
      return;
    }

    const formData = new FormData();
    formData.append('file', this.currentFile);
    formData.append('mode', this.selectedMode);
    formData.append('targetLang', this.targetLang || 'ES');
    if (this.sourceLang) {
      formData.append('sourceLang', this.sourceLang);
    }

    await withButtonLoading(btn, async () => {
      try {
        const response = await postFormApi(
          API_ROUTES.tools.translatePdf.translate,
          formData
        );
        const res = (await response.json()) as { data?: TranslatePdfResultData; error?: string; success: boolean };

        if (!response.ok || !res.success || !res.data) {
          this.showError(res.error || 'No se pudo completar la traducción del documento.');
          return;
        }

        if (this.selectedMode === 'advanced' && currentUser && currentUser.ai_credits_balance !== undefined) {
          currentUser.ai_credits_balance = Math.max(0, currentUser.ai_credits_balance - 10);
        }

        this.translatedResult = res.data;
        const token = res.data.fileId;
        const downloadPayload = {
          downloadUrl: `/api/download/${token}`,
          fileSize: res.data.size,
          filename: res.data.filename,
          returnText: 'Traducir otro documento',
          returnUrl: '/translate-pdf',
          subtitle: `Se ha traducido exitosamente "${this.currentFile?.name}".`,
          title: '¡PDF traducido con éxito!',
          token,
        };
        sessionStorage.setItem('download_ready_data', JSON.stringify(downloadPayload));
        showToast('Documento traducido con éxito.', 'success');
        navigate(`/download/${token}`);
      } catch (err: any) {
        this.showError(err?.message || 'Error al conectar con el servidor.');
      }
    });
  }

  private async preloadTranslatedPdf(downloadUrl: string): Promise<void> {
    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) return;
      this.translatedPdfBuffer = await res.arrayBuffer();
      const pdfjsLib = await loadPdfJs();
      const loadingTask = pdfjsLib.getDocument({ data: this.translatedPdfBuffer });
      this.translatedPdfDocument = await loadingTask.promise;
    } catch {}
  }

  private renderResultState(data: TranslatePdfResultData): void {
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="translate-result-card"]');
    const resultSummary = this.container.querySelector<HTMLElement>('[data-ref="translate-result-summary"]');

    if (resultSummary) {
      resultSummary.textContent = `${data.filename} (${formatBytes(data.size)})`;
    }

    if (resultCard) {
      resultCard.style.display = 'flex';
    }
  }

  private handleDownload(): void {
    if (!this.translatedResult) return;
    const a = document.createElement('a');
    a.href = this.translatedResult.downloadUrl;
    a.download = this.translatedResult.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  private async handleToggleViewerDoc(): Promise<void> {
    if (!this.translatedPdfDocument) {
      if (this.translatedResult?.downloadUrl) {
        await this.preloadTranslatedPdf(this.translatedResult.downloadUrl);
      }
    }

    if (!this.translatedPdfDocument) {
      showToast('Cargando vista previa traducida...', 'info');
      return;
    }

    this.showingTranslated = !this.showingTranslated;

    const docStateEl = this.container.querySelector<HTMLElement>('[data-ref="viewer-doc-state"]');
    const fileNameEl = this.container.querySelector<HTMLElement>('[data-ref="viewer-file-name"]');
    const toggleTxt = this.container.querySelector<HTMLElement>('[data-ref="txt-toggle-viewer-doc"]');

    if (this.showingTranslated) {
      if (docStateEl) {
        docStateEl.textContent = 'Traducido';
        docStateEl.classList.add('pdf-viewer-toolbar__badge--active');
      }
      if (fileNameEl && this.translatedResult) {
        fileNameEl.textContent = this.translatedResult.filename;
      }
      if (toggleTxt) {
        toggleTxt.textContent = 'Ver documento original en el visor';
      }
    } else {
      if (docStateEl) {
        docStateEl.textContent = 'Original';
        docStateEl.classList.remove('pdf-viewer-toolbar__badge--active');
      }
      if (fileNameEl && this.currentFile) {
        fileNameEl.textContent = this.currentFile.name;
      }
      if (toggleTxt) {
        toggleTxt.textContent = 'Ver traducción en el visor';
      }
    }

    await this.renderAllPages();
  }

  private handleReset(): void {
    this.currentFile = null;
    this.pdfDocument = null;
    this.translatedPdfDocument = null;
    this.translatedPdfBuffer = null;
    this.translatedResult = null;
    this.showingTranslated = false;
    this.selectedMode = 'standard';
    this.sourceLang = '';
    this.targetLang = 'ES';
    this.hideError();

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    if (fileInput) fileInput.value = '';

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="translate-dropzone-card"]');
    const viewerCard = this.container.querySelector<HTMLElement>('[data-ref="translate-viewer-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="translate-result-card"]');

    if (dropzoneCard) dropzoneCard.style.display = 'flex';
    if (viewerCard) viewerCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'none';

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="translate-pdf-sidebar"]');
    if (sidebar) sidebar.style.display = 'none';
    const settingsBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-tool-settings"]');
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="translate-pdf-workspace"]');
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
    if (this.sidebarModal) this.sidebarModal.close();
  }

  private showError(msg: string): void {
    const banner = this.container.querySelector<HTMLElement>('[data-ref="translate-error-banner"]');
    const text = this.container.querySelector<HTMLElement>('[data-ref="translate-error-text"]');
    if (banner && text) {
      text.textContent = msg;
      banner.style.display = 'block';
    }
  }

  private hideError(): void {
    const banner = this.container.querySelector<HTMLElement>('[data-ref="translate-error-banner"]');
    if (banner) {
      banner.style.display = 'none';
    }
  }
}

export async function createTranslatePdfView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/tools/translate-pdf/translate-pdf.html');
  const controller = new TranslatePdfViewController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
