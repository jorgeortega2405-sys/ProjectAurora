import { navigate } from '../../../app-router.js';
import { API_ROUTES } from '../../../config/api-routes.js';
import { currentUser, postFormApi } from '../../../services/api.service.js';
import { pickDropboxFiles } from '../../../services/dropbox.service.js';
import { pickGoogleDriveFiles } from '../../../services/google-drive.service.js';
import { renderIcons } from '../../../services/icon.service.js';
import { loadPdfJs } from '../../../services/pdf-loader.service.js';
import { loadTemplate } from '../../../services/template.service.js';
import { showToast } from '../../../services/toast.service.js';
import { ViewController } from '../../../types/common.types.js';
import { setupToolSidebarModal, ToolSidebarModalController, withButtonLoading } from '../../../utils/dom.util.js';
import { SignatureAsset, SignatureMode, SignatureTab, SignPdfResponseData, SignPdfType, SignPlacedElement } from './sign-pdf.types.js';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const HANDWRITING_FONTS = [
  { family: "'Dancing Script', cursive", name: 'Dancing Script' },
  { family: "'Caveat', cursive", name: 'Caveat' },
  { family: "'Great Vibes', cursive", name: 'Great Vibes' },
  { family: "'Pacifico', cursive", name: 'Pacifico' },
  { family: "'Reenie Beanie', cursive", name: 'Reenie Beanie' },
];

export class SignPdfController implements ViewController {
  private abortController: AbortController | null = null;
  private activeColor = '#111827';
  private activePageIndex = 0;
  private activeSignatureMode: SignatureMode = 'type';
  private activeSignatureTab: SignatureTab = 'signature';
  private container: HTMLElement;
  private currentFile: File | null = null;
  private currentSignType: SignPdfType = 'simple';
  private isDrawing = false;
  private isProcessing = false;
  private logoAsset: SignatureAsset | null = null;
  private pageDimensions: Array<{ height: number; width: number }> = [];
  private pageScales: number[] = [];
  private pdfDocument: any = null;
  private placedElements: SignPlacedElement[] = [];
  private selectedElementId: string | null = null;
  private selectedFontIndex = 0;
  private sidebarModal: ToolSidebarModalController | null = null;
  private signatureAsset: SignatureAsset | null = null;
  private signerInitials = '';
  private signerName = '';
  private userInitialsAsset: SignatureAsset | null = null;
  private zoomLevel = 1.0;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async init(): Promise<void> {
    this.abortController = new AbortController();
    if (currentUser) {
      this.signerName = currentUser.username || '';
      this.signerInitials = this.calculateInitials(this.signerName);
    }
    renderIcons(this.container);
    this.bindEvents();
    this.setupDrawingCanvas();
  }

  public destroy(): void {
    document.body.classList.remove('modal-open');
    if (this.sidebarModal) {
      this.sidebarModal.destroy();
      this.sidebarModal = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.pdfDocument = null;
  }

  private calculateInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'A';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  private bindEvents(): void {
    if (!this.abortController) return;
    const { signal } = this.abortController;

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="sign-pdf-sidebar"]');
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="tool-sidebar-backdrop"]');
    const dragZone = this.container.querySelector<HTMLElement>('[data-ref="modal-drag-zone"]');
    const closeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-close"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');

    if (sidebar && backdrop && settingsBtn) {
      this.sidebarModal = setupToolSidebarModal({ backdrop, closeBtn, dragZone, settingsBtn, sidebar, signal });
    }

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const imgInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-signature-image"]');
    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="sign-dropzone"]');
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-file"]');
    const heroDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive"]');
    const heroDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox"]');
    const changeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-change-file"]');

    const choiceMeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="choice-only-me"]');
    const choiceOthersBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="choice-multiple-people"]');
    const cancelWhoSignsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-cancel-who-signs"]');

    const btnCloseModal = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-close-signature-modal"]');
    const btnCancelDetails = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-cancel-details"]');
    const btnApplySignature = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-apply-signature"]');

    const inputName = this.container.querySelector<HTMLInputElement>('[data-ref="input-full-name"]');
    const inputInitials = this.container.querySelector<HTMLInputElement>('[data-ref="input-initials"]');

    const tabSignature = this.container.querySelector<HTMLButtonElement>('[data-ref="tab-signature"]');
    const tabInitials = this.container.querySelector<HTMLButtonElement>('[data-ref="tab-initials"]');
    const tabLogo = this.container.querySelector<HTMLButtonElement>('[data-ref="tab-logo"]');

    const btnModeType = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-mode-type"]');
    const btnModeDraw = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-mode-draw"]');
    const btnModeUpload = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-mode-upload"]');

    const btnClearCanvas = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-clear-canvas"]');
    const btnBrowseSigImg = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-signature-img"]');
    const btnRemoveSigImg = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-remove-signature-img"]');

    const colorDots = this.container.querySelectorAll<HTMLButtonElement>('[data-ref^="color-"]');

    const btnTypeSimple = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-type-simple"]');
    const btnTypeDigital = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-type-digital"]');

    const btnEditSig = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-edit-signature"]');
    const btnEditInitials = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-edit-initials"]');

    const btnAddSig = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-add-signature"]');
    const btnAddInitials = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-add-initials"]');
    const btnAddName = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-add-name"]');
    const btnAddDate = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-add-date"]');
    const btnAddText = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-add-text"]');
    const btnAddLogo = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-add-logo"]');

    const btnZoomIn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-zoom-in"]');
    const btnZoomOut = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-zoom-out"]');
    const saveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-save-pdf"]');
    const sidebarSaveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-sign-pdf"]');

    browseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput?.click();
    }, { signal });

    heroDriveBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const files = await pickGoogleDriveFiles({ multiselect: false });
      if (files && files.length > 0) {
        this.handleFileUploaded(files[0]);
      }
    }, { signal });

    heroDropboxBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const files = await pickDropboxFiles({ multiselect: false });
      if (files && files.length > 0) {
        this.handleFileUploaded(files[0]);
      }
    }, { signal });

    dropzone?.addEventListener('click', () => {
      fileInput?.click();
    }, { signal });

    fileInput?.addEventListener('change', () => {
      const files = fileInput.files;
      if (files && files.length > 0) {
        this.handleFileUploaded(files[0]);
      }
      fileInput.value = '';
    }, { signal });

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="sign-dropzone-card"]');
    if (dropzoneCard) {
      dropzoneCard.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone?.classList.add('tool-dropzone--active');
      }, { signal });

      dropzoneCard.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropzone?.classList.remove('tool-dropzone--active');
      }, { signal });

      dropzoneCard.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone?.classList.remove('tool-dropzone--active');
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          this.handleFileUploaded(files[0]);
        }
      }, { signal });
    }

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
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          this.handleFileUploaded(files[0]);
        }
      }, { signal });
    }

    const modalWhoSigns = this.container.querySelector<HTMLElement>('[data-ref="modal-who-signs"]');
    modalWhoSigns?.addEventListener('click', (e) => {
      if (e.target === modalWhoSigns) {
        this.closeModal('modal-who-signs');
        this.resetSelectedFile();
      }
    }, { signal });

    const modalSigDetails = this.container.querySelector<HTMLElement>('[data-ref="modal-signature-details"]');
    modalSigDetails?.addEventListener('click', (e) => {
      if (e.target === modalSigDetails) {
        this.closeModal('modal-signature-details');
        if (!this.signatureAsset) {
          this.resetSelectedFile();
        }
      }
    }, { signal });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const openModal = this.container.querySelector<HTMLElement>('.sign-flow-modal-backdrop.is-visible');
        if (openModal) {
          const ref = openModal.getAttribute('data-ref');
          if (ref) {
            this.closeModal(ref);
            if (!this.signatureAsset) {
              this.resetSelectedFile();
            }
          }
        }
      }
    }, { signal });

    choiceMeBtn?.addEventListener('click', () => {
      this.closeModal('modal-who-signs');
      this.openSignatureDetailsModal();
    }, { signal });

    choiceOthersBtn?.addEventListener('click', () => {
      showToast('Configurando solicitud para múltiples firmantes. Comenzando con tu firma como firmante principal.', 'info');
      this.closeModal('modal-who-signs');
      this.openSignatureDetailsModal();
    }, { signal });

    cancelWhoSignsBtn?.addEventListener('click', () => {
      this.closeModal('modal-who-signs');
      this.resetSelectedFile();
    }, { signal });

    btnCloseModal?.addEventListener('click', () => {
      this.closeModal('modal-signature-details');
    }, { signal });

    btnCancelDetails?.addEventListener('click', () => {
      this.closeModal('modal-signature-details');
      if (!this.signatureAsset) {
        this.resetSelectedFile();
      }
    }, { signal });

    inputName?.addEventListener('input', () => {
      this.signerName = inputName.value.trim();
      if (!inputInitials?.value || inputInitials.value === this.signerInitials) {
        this.signerInitials = this.calculateInitials(this.signerName);
        if (inputInitials) inputInitials.value = this.signerInitials;
      }
      this.renderFontPreviews();
      this.updateSidebarFieldLabels();
    }, { signal });

    inputInitials?.addEventListener('input', () => {
      this.signerInitials = inputInitials.value.trim().toUpperCase();
      this.renderFontPreviews();
      this.updateSidebarFieldLabels();
    }, { signal });

    tabSignature?.addEventListener('click', () => this.switchSignatureTab('signature'), { signal });
    tabInitials?.addEventListener('click', () => this.switchSignatureTab('initials'), { signal });
    tabLogo?.addEventListener('click', () => this.switchSignatureTab('logo'), { signal });

    btnModeType?.addEventListener('click', () => this.switchSignatureMode('type'), { signal });
    btnModeDraw?.addEventListener('click', () => this.switchSignatureMode('draw'), { signal });
    btnModeUpload?.addEventListener('click', () => this.switchSignatureMode('upload'), { signal });

    btnClearCanvas?.addEventListener('click', () => this.clearDrawingCanvas(), { signal });

    btnBrowseSigImg?.addEventListener('click', () => {
      imgInput?.click();
    }, { signal });

    btnRemoveSigImg?.addEventListener('click', () => {
      const emptyView = this.container.querySelector<HTMLElement>('[data-ref="upload-empty-view"]');
      const previewView = this.container.querySelector<HTMLElement>('[data-ref="upload-preview-view"]');
      if (emptyView) emptyView.style.display = 'flex';
      if (previewView) previewView.style.display = 'none';
      if (this.activeSignatureTab === 'signature') {
        this.signatureAsset = null;
      } else if (this.activeSignatureTab === 'initials') {
        this.userInitialsAsset = null;
      } else {
        this.logoAsset = null;
      }
    }, { signal });

    imgInput?.addEventListener('change', () => {
      const files = imgInput.files;
      if (files && files.length > 0) {
        void this.handleSignatureImageUploaded(files[0]);
      }
      imgInput.value = '';
    }, { signal });

    colorDots.forEach((dot) => {
      dot.addEventListener('click', () => {
        colorDots.forEach((d) => d.classList.remove('is-active'));
        dot.classList.add('is-active');
        this.activeColor = dot.getAttribute('data-color') || '#111827';
        this.renderFontPreviews();
      }, { signal });
    });

    btnApplySignature?.addEventListener('click', async () => {
      await this.handleApplySignature();
    }, { signal });

    btnTypeSimple?.addEventListener('click', () => {
      this.setSignType('simple');
    }, { signal });

    btnTypeDigital?.addEventListener('click', () => {
      this.setSignType('digital');
    }, { signal });

    btnEditSig?.addEventListener('click', () => {
      this.switchSignatureTab('signature');
      this.openSignatureDetailsModal();
    }, { signal });

    btnEditInitials?.addEventListener('click', () => {
      this.switchSignatureTab('initials');
      this.openSignatureDetailsModal();
    }, { signal });

    btnAddSig?.addEventListener('click', () => this.addSignatureToDocument('signature'), { signal });
    btnAddInitials?.addEventListener('click', () => this.addSignatureToDocument('initials'), { signal });
    btnAddName?.addEventListener('click', () => this.addSignatureToDocument('name'), { signal });
    btnAddDate?.addEventListener('click', () => this.addSignatureToDocument('date'), { signal });
    btnAddText?.addEventListener('click', () => this.addSignatureToDocument('text'), { signal });
    btnAddLogo?.addEventListener('click', () => this.addSignatureToDocument('logo'), { signal });

    btnZoomIn?.addEventListener('click', () => {
      if (this.zoomLevel < 2.0) {
        this.zoomLevel = Math.min(2.0, parseFloat((this.zoomLevel + 0.25).toFixed(2)));
        this.updateZoomDisplay();
        void this.renderDocumentPages();
      }
    }, { signal });

    btnZoomOut?.addEventListener('click', () => {
      if (this.zoomLevel > 0.5) {
        this.zoomLevel = Math.max(0.5, parseFloat((this.zoomLevel - 0.25).toFixed(2)));
        this.updateZoomDisplay();
        void this.renderDocumentPages();
      }
    }, { signal });

    changeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resetSelectedFile();
      fileInput?.click();
    }, { signal });

    const executeSave = () => {
      if (saveBtn) void this.handleSaveSignedPdf(saveBtn);
    };

    saveBtn?.addEventListener('click', executeSave, { signal });
    sidebarSaveBtn?.addEventListener('click', executeSave, { signal });
  }

  private handleFileUploaded(file: File): void {
    this.hideError();

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      showToast('Solo se permiten documentos en formato PDF.', 'error');
      return;
    }

    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      showToast('El archivo supera el límite de 50 MB.', 'error');
      return;
    }

    this.currentFile = file;

    const inputName = this.container.querySelector<HTMLInputElement>('[data-ref="input-full-name"]');
    const inputInitials = this.container.querySelector<HTMLInputElement>('[data-ref="input-initials"]');

    if (!this.signerName) {
      this.signerName = currentUser?.username || 'Mi Firma';
    }
    if (!this.signerInitials) {
      this.signerInitials = this.calculateInitials(this.signerName);
    }

    if (inputName) inputName.value = this.signerName;
    if (inputInitials) inputInitials.value = this.signerInitials;

    this.renderFontPreviews();
    this.openModal('modal-who-signs');
  }

  private openModal(ref: string): void {
    const modal = this.container.querySelector<HTMLElement>(`[data-ref="${ref}"]`);
    if (modal) {
      modal.style.display = 'flex';
      void modal.offsetWidth;
      modal.classList.add('is-open', 'is-visible');
      document.body.classList.add('modal-open');
    }
  }

  private closeModal(ref: string): void {
    const modal = this.container.querySelector<HTMLElement>(`[data-ref="${ref}"]`);
    if (modal) {
      modal.classList.remove('is-open', 'is-visible');
      setTimeout(() => {
        if (!modal.classList.contains('is-visible')) {
          modal.style.display = 'none';
        }
      }, 200);
      const anyOtherModal = this.container.querySelector('.sign-flow-modal-backdrop.is-visible');
      if (!anyOtherModal) {
        document.body.classList.remove('modal-open');
      }
    }
  }

  private openSignatureDetailsModal(): void {
    this.openModal('modal-signature-details');
    this.renderFontPreviews();
  }

  private switchSignatureTab(tab: SignatureTab): void {
    this.activeSignatureTab = tab;
    const tabs = this.container.querySelectorAll<HTMLButtonElement>('[data-ref^="tab-"]');
    tabs.forEach((t) => {
      t.classList.toggle('is-active', t.getAttribute('data-tab') === tab);
    });

    const modeBar = this.container.querySelector<HTMLElement>('[data-ref="creator-mode-bar"]');
    const btnModeType = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-mode-type"]');
    const btnModeDraw = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-mode-draw"]');

    if (tab === 'logo') {
      if (btnModeType) btnModeType.style.display = 'none';
      if (btnModeDraw) btnModeDraw.style.display = 'none';
      this.switchSignatureMode('upload');
    } else {
      if (btnModeType) btnModeType.style.display = 'flex';
      if (btnModeDraw) btnModeDraw.style.display = 'flex';
      this.switchSignatureMode(this.activeSignatureMode === 'upload' ? 'type' : this.activeSignatureMode);
    }

    this.renderFontPreviews();
  }

  private switchSignatureMode(mode: SignatureMode): void {
    this.activeSignatureMode = mode;
    const modeBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-ref^="btn-mode-"]');
    modeBtns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-mode') === mode);
    });

    const paneType = this.container.querySelector<HTMLElement>('[data-ref="pane-type"]');
    const paneDraw = this.container.querySelector<HTMLElement>('[data-ref="pane-draw"]');
    const paneUpload = this.container.querySelector<HTMLElement>('[data-ref="pane-upload"]');
    const bottomBar = this.container.querySelector<HTMLElement>('[data-ref="creator-bottom-bar"]');

    if (paneType) paneType.style.display = mode === 'type' ? 'flex' : 'none';
    if (paneDraw) paneDraw.style.display = mode === 'draw' ? 'flex' : 'none';
    if (paneUpload) paneUpload.style.display = mode === 'upload' ? 'flex' : 'none';
    if (bottomBar) bottomBar.style.display = mode === 'upload' ? 'none' : 'flex';

    if (mode === 'type') {
      this.renderFontPreviews();
    }
  }

  private renderFontPreviews(): void {
    const list = this.container.querySelector<HTMLElement>('[data-ref="font-previews-list"]');
    if (!list) return;

    list.innerHTML = '';
    const textToShow = this.activeSignatureTab === 'initials'
      ? (this.signerInitials || 'D')
      : (this.signerName || 'Tu Firma');

    HANDWRITING_FONTS.forEach((font, idx) => {
      const card = document.createElement('div');
      card.className = `sign-font-option-card ${idx === this.selectedFontIndex ? 'is-active' : ''}`;
      card.setAttribute('data-ref', `font-option-${idx}`);

      const radio = document.createElement('div');
      radio.className = 'sign-font-radio';

      const preview = document.createElement('div');
      preview.className = 'sign-font-preview-text';
      preview.style.fontFamily = font.family;
      preview.style.color = this.activeColor;
      preview.textContent = textToShow;

      card.appendChild(radio);
      card.appendChild(preview);

      card.addEventListener('click', () => {
        this.selectedFontIndex = idx;
        list.querySelectorAll('.sign-font-option-card').forEach((c) => c.classList.remove('is-active'));
        card.classList.add('is-active');
      });

      list.appendChild(card);
    });
  }

  private setupDrawingCanvas(): void {
    const canvas = this.container.querySelector<HTMLCanvasElement>('[data-ref="signature-draw-canvas"]');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const placeholder = this.container.querySelector<HTMLElement>('[data-ref="draw-placeholder"]');

    const getCanvasCoordinates = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    };

    const startDraw = (e: PointerEvent) => {
      this.isDrawing = true;
      if (placeholder) placeholder.style.display = 'none';
      const pos = getCanvasCoordinates(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.strokeStyle = this.activeColor;
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    };

    const draw = (e: PointerEvent) => {
      if (!this.isDrawing) return;
      const pos = getCanvasCoordinates(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    };

    const endDraw = () => {
      if (!this.isDrawing) return;
      this.isDrawing = false;
      ctx.closePath();
    };

    canvas.addEventListener('pointerdown', startDraw);
    canvas.addEventListener('pointermove', draw);
    canvas.addEventListener('pointerup', endDraw);
    canvas.addEventListener('pointerleave', endDraw);
  }

  private clearDrawingCanvas(): void {
    const canvas = this.container.querySelector<HTMLCanvasElement>('[data-ref="signature-draw-canvas"]');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    const placeholder = this.container.querySelector<HTMLElement>('[data-ref="draw-placeholder"]');
    if (placeholder) placeholder.style.display = '';
  }

  private async handleSignatureImageUploaded(file: File): Promise<void> {
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

    const emptyView = this.container.querySelector<HTMLElement>('[data-ref="upload-empty-view"]');
    const previewView = this.container.querySelector<HTMLElement>('[data-ref="upload-preview-view"]');
    const previewImg = this.container.querySelector<HTMLImageElement>('[data-ref="upload-preview-img"]');

    if (emptyView) emptyView.style.display = 'none';
    if (previewView) previewView.style.display = 'flex';
    if (previewImg) previewImg.src = dataUrl;

    const asset: SignatureAsset = { dataUrl, file, mode: 'upload' };

    if (this.activeSignatureTab === 'signature') {
      this.signatureAsset = asset;
    } else if (this.activeSignatureTab === 'initials') {
      this.userInitialsAsset = asset;
    } else {
      this.logoAsset = asset;
      const logoVal = this.container.querySelector<HTMLElement>('[data-ref="val-card-logo"]');
      if (logoVal) logoVal.textContent = 'Cargado';
    }
  }

  private async renderTypedSignatureToPng(text: string, fontIndex: number, color: string): Promise<string> {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const fontItem = HANDWRITING_FONTS[fontIndex] || HANDWRITING_FONTS[0];

    try {
      await Promise.race([
        (document as any).fonts.load(`52px ${fontItem.name}`),
        new Promise((resolve) => setTimeout(resolve, 250)),
      ]);
    } catch {}

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `64px ${fontItem.family}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    return canvas.toDataURL('image/png');
  }

  private getDrawingCanvasPng(): string {
    const canvas = this.container.querySelector<HTMLCanvasElement>('[data-ref="signature-draw-canvas"]');
    if (!canvas) return '';
    return canvas.toDataURL('image/png');
  }

  private async handleApplySignature(): Promise<void> {
    const textToShow = this.signerName || 'Mi Firma';
    const initialsToShow = this.signerInitials || 'D';

    if (this.activeSignatureMode === 'type') {
      const sigDataUrl = await this.renderTypedSignatureToPng(textToShow, this.selectedFontIndex, this.activeColor);
      this.signatureAsset = { dataUrl: sigDataUrl, mode: 'type' };

      const initDataUrl = await this.renderTypedSignatureToPng(initialsToShow, this.selectedFontIndex, this.activeColor);
      this.userInitialsAsset = { dataUrl: initDataUrl, mode: 'type' };
    } else if (this.activeSignatureMode === 'draw') {
      const drawnUrl = this.getDrawingCanvasPng();
      if (this.activeSignatureTab === 'signature') {
        this.signatureAsset = { dataUrl: drawnUrl, mode: 'draw' };
        if (!this.userInitialsAsset) {
          const initDataUrl = await this.renderTypedSignatureToPng(initialsToShow, 0, this.activeColor);
          this.userInitialsAsset = { dataUrl: initDataUrl, mode: 'type' };
        }
      } else if (this.activeSignatureTab === 'initials') {
        this.userInitialsAsset = { dataUrl: drawnUrl, mode: 'draw' };
      }
    }

    this.closeModal('modal-signature-details');
    this.updateSidebarPreviews();
    await this.enterWorkspace();
  }

  private updateSidebarFieldLabels(): void {
    const valName = this.container.querySelector<HTMLElement>('[data-ref="val-card-name"]');
    const valInitials = this.container.querySelector<HTMLElement>('[data-ref="val-card-initials"]');
    const valDate = this.container.querySelector<HTMLElement>('[data-ref="val-card-date"]');

    if (valName) valName.textContent = this.signerName || 'Tu nombre';
    if (valInitials) valInitials.textContent = this.signerInitials || 'D';
    if (valDate) {
      const now = new Date();
      valDate.textContent = now.toLocaleDateString();
    }
  }

  private updateSidebarPreviews(): void {
    const sigBox = this.container.querySelector<HTMLElement>('[data-ref="card-signature-preview"]');
    if (sigBox && this.signatureAsset?.dataUrl) {
      sigBox.innerHTML = `<img src="${this.signatureAsset.dataUrl}" alt="Firma" />`;
    }

    this.updateSidebarFieldLabels();
  }

  private setSignType(type: SignPdfType): void {
    this.currentSignType = type;
    const btnSimple = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-type-simple"]');
    const btnDigital = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-type-digital"]');
    const typeLabel = this.container.querySelector<HTMLElement>('[data-ref="sidebar-sign-type-label"]');
    const signBtnTxt = this.container.querySelector<HTMLElement>('[data-ref="txt-sidebar-sign-btn"]');

    if (btnSimple) btnSimple.classList.toggle('is-active', type === 'simple');
    if (btnDigital) btnDigital.classList.toggle('is-active', type === 'digital');

    if (typeLabel) {
      typeLabel.textContent = type === 'digital' ? 'Firma Digital (SHA-256)' : 'Firma simple';
    }
    if (signBtnTxt) {
      signBtnTxt.textContent = type === 'digital' ? 'Firmar Digitalmente' : 'Firmar PDF';
    }
  }

  private async enterWorkspace(): Promise<void> {
    if (!this.currentFile) return;

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="sign-dropzone-card"]');
    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="sign-workspace-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="sign-pdf-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="sign-pdf-workspace"]');

    const fileNameEl = this.container.querySelector<HTMLElement>('[data-ref="sidebar-file-name"]');
    const titlePill = this.container.querySelector<HTMLElement>('[data-ref="val-doc-title"]');

    if (fileNameEl) fileNameEl.textContent = this.currentFile.name;
    if (titlePill) titlePill.textContent = this.currentFile.name;

    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (workspaceCard) workspaceCard.style.display = 'flex';
    if (sidebar) sidebar.style.display = 'flex';
    if (settingsBtn) settingsBtn.classList.add('is-visible');
    if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');

    try {
      const pdfjs = await loadPdfJs();
      const arrayBuffer = await this.currentFile.arrayBuffer();
      this.pdfDocument = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const numPages = this.pdfDocument.numPages;

      const pagesCountEl = this.container.querySelector<HTMLElement>('[data-ref="sidebar-pages-count"]');
      const pagesCountBadge = this.container.querySelector<HTMLElement>('[data-ref="pages-count-badge"]');
      if (pagesCountEl) pagesCountEl.textContent = `${numPages}`;
      if (pagesCountBadge) pagesCountBadge.textContent = `${numPages}`;

      this.pageDimensions = [];
      this.pageScales = [];
      for (let i = 1; i <= numPages; i++) {
        const page = await this.pdfDocument.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        this.pageDimensions.push({ height: vp.height, width: vp.width });
      }

      await this.renderThumbnails();
      await this.renderDocumentPages();
      this.updateModificationsSummary();
    } catch {
      showToast('Error al leer el archivo PDF.', 'error');
      this.resetSelectedFile();
    }
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
      thumbItem.className = `pdf-editor-thumbnail ${pageIndex === this.activePageIndex ? 'is-active' : ''}`;
      thumbItem.setAttribute('data-ref', `thumb-page-${pageIndex}`);

      const sheet = document.createElement('div');
      sheet.className = 'pdf-editor-thumbnail__sheet';

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-editor-thumbnail__canvas';
      sheet.appendChild(canvas);

      const badge = document.createElement('span');
      badge.className = 'pdf-editor-thumbnail__badge';
      badge.textContent = `#${i}`;

      thumbItem.appendChild(sheet);
      thumbItem.appendChild(badge);
      container.appendChild(thumbItem);

      thumbItem.addEventListener('click', () => {
        this.activePageIndex = pageIndex;
        this.container.querySelectorAll('.pdf-editor-thumbnail').forEach((t) => t.classList.remove('is-active'));
        thumbItem.classList.add('is-active');

        const targetPageCard = this.container.querySelector<HTMLElement>(`[data-page-index="${pageIndex}"]`);
        if (targetPageCard) {
          targetPageCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });

      void (async () => {
        try {
          const page = await this.pdfDocument.getPage(i);
          const vp = page.getViewport({ scale: 0.25 });
          canvas.width = vp.width;
          canvas.height = vp.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport: vp }).promise;
          }
        } catch {}
      })();
    }
  }

  private async renderDocumentPages(): Promise<void> {
    if (!this.pdfDocument) return;
    const pagesWrapper = this.container.querySelector<HTMLElement>('[data-ref="pages-wrapper"]');
    if (!pagesWrapper) return;
    pagesWrapper.innerHTML = '';

    const numPages = this.pdfDocument.numPages;
    const containerWidth = (this.container.querySelector('[data-ref="editor-scroll-container"]')?.clientWidth || 800) - 64;

    for (let i = 1; i <= numPages; i++) {
      const pageIndex = i - 1;
      const page = await this.pdfDocument.getPage(i);
      const originalVp = page.getViewport({ scale: 1 });

      const baseScale = Math.min(1.2, Math.max(0.6, containerWidth / originalVp.width));
      const displayScale = baseScale * this.zoomLevel;
      this.pageScales[pageIndex] = displayScale;

      const viewport = page.getViewport({ scale: displayScale });
      const displayWidth = Math.floor(viewport.width);
      const displayHeight = Math.floor(viewport.height);

      const pageCard = document.createElement('div');
      pageCard.className = 'pdf-edit-page-card';
      pageCard.setAttribute('data-page-index', `${pageIndex}`);
      pageCard.setAttribute('data-ref', `page-card-${pageIndex}`);
      pageCard.style.width = `${displayWidth}px`;
      pageCard.style.height = `${displayHeight}px`;

      const pageCanvas = document.createElement('canvas');
      pageCanvas.className = 'pdf-edit-page-canvas';
      pageCanvas.width = displayWidth;
      pageCanvas.height = displayHeight;
      pageCard.appendChild(pageCanvas);

      const canvasCtx = pageCanvas.getContext('2d');
      if (canvasCtx) {
        await page.render({ canvasContext: canvasCtx, viewport }).promise;
      }

      const overlay = document.createElement('div');
      overlay.className = 'sign-page-overlay';
      overlay.setAttribute('data-page-index', `${pageIndex}`);
      overlay.setAttribute('data-ref', `page-overlay-${pageIndex}`);
      pageCard.appendChild(overlay);

      overlay.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.sign-placed-element')) return;
        this.deselectAllElements();
      });

      pagesWrapper.appendChild(pageCard);
    }

    this.restorePlacedElements();
  }

  private addSignatureToDocument(type: 'date' | 'initials' | 'logo' | 'name' | 'signature' | 'text'): void {
    const pageIndex = this.activePageIndex;
    const overlay = this.container.querySelector<HTMLElement>(`.sign-page-overlay[data-page-index="${pageIndex}"]`);
    if (!overlay) return;

    const scale = this.pageScales[pageIndex] || 1;
    const defaultX = 50;
    const defaultY = 60;

    let width = 140;
    let height = 50;
    let dataUrl = '';
    let text = '';

    if (type === 'signature') {
      dataUrl = this.signatureAsset?.dataUrl || '';
      if (!dataUrl) {
        showToast('Configura tu firma primero.', 'info');
        this.openSignatureDetailsModal();
        return;
      }
      width = 150;
      height = 55;
    } else if (type === 'initials') {
      dataUrl = this.userInitialsAsset?.dataUrl || '';
      if (!dataUrl) {
        showToast('Configura tus iniciales primero.', 'info');
        this.openSignatureDetailsModal();
        return;
      }
      width = 80;
      height = 45;
    } else if (type === 'logo') {
      dataUrl = this.logoAsset?.dataUrl || '';
      if (!dataUrl) {
        showToast('Carga primero el logo de tu empresa.', 'info');
        this.switchSignatureTab('logo');
        this.openSignatureDetailsModal();
        return;
      }
      width = 100;
      height = 60;
    } else if (type === 'name') {
      text = this.signerName || 'Nombre completo';
      width = 140;
      height = 28;
    } else if (type === 'date') {
      text = new Date().toLocaleDateString('es-ES');
      width = 110;
      height = 28;
    } else if (type === 'text') {
      text = 'Texto de firma';
      width = 130;
      height = 28;
    }

    const item: SignPlacedElement = {
      color: '#111827',
      dataUrl,
      fontSize: 13,
      height: height / scale,
      id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      pageIndex,
      text,
      type,
      width: width / scale,
      x: defaultX / scale,
      y: defaultY / scale,
    };

    this.placedElements.push(item);
    this.renderElementOnOverlay(item, overlay, scale);
    this.updateModificationsSummary();
    showToast('Elemento agregado a la página.', 'success');
  }

  private renderElementOnOverlay(item: SignPlacedElement, overlay: HTMLElement, scale: number): void {
    const el = document.createElement('div');
    el.className = 'sign-placed-element is-selected';
    el.setAttribute('data-id', item.id);
    el.setAttribute('data-ref', `placed-${item.id}`);
    el.style.left = `${item.x * scale}px`;
    el.style.top = `${item.y * scale}px`;
    el.style.width = `${item.width * scale}px`;
    el.style.height = `${item.height * scale}px`;

    if (item.dataUrl) {
      const img = document.createElement('img');
      img.src = item.dataUrl;
      el.appendChild(img);
    } else {
      const badge = document.createElement('div');
      badge.className = 'sign-element-badge-text';
      badge.textContent = item.text || '';
      if (item.type === 'text') {
        badge.contentEditable = 'true';
        badge.addEventListener('blur', () => {
          item.text = badge.textContent || '';
        });
      }
      el.appendChild(badge);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'sign-element-delete-btn';
    deleteBtn.setAttribute('data-ref', `btn-del-${item.id}`);
    deleteBtn.setAttribute('aria-label', 'Eliminar campo');
    deleteBtn.innerHTML = '<svg class="component-icon" style="width: 12px; height: 12px;" aria-hidden="true"><use href="/icons.svg#close"></use></svg>';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeElement(item.id);
    });
    el.appendChild(deleteBtn);

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'sign-element-resize-handle';
    el.appendChild(resizeHandle);

    overlay.appendChild(el);
    this.selectElement(item.id);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectElement(item.id);
    });

    this.makeElementDraggable(el, (newX, newY) => {
      item.x = newX / scale;
      item.y = newY / scale;
    });

    this.makeElementResizable(el, resizeHandle, (newW, newH) => {
      item.width = newW / scale;
      item.height = newH / scale;
    });
  }

  private selectElement(id: string): void {
    this.selectedElementId = id;
    this.container.querySelectorAll('.sign-placed-element').forEach((el) => {
      el.classList.toggle('is-selected', el.getAttribute('data-id') === id);
    });
  }

  private deselectAllElements(): void {
    this.selectedElementId = null;
    this.container.querySelectorAll('.sign-placed-element').forEach((el) => {
      el.classList.remove('is-selected');
    });
  }

  private removeElement(id: string): void {
    this.placedElements = this.placedElements.filter((el) => el.id !== id);
    const el = this.container.querySelector<HTMLElement>(`[data-id="${id}"]`);
    el?.remove();
    this.updateModificationsSummary();
  }

  private restorePlacedElements(): void {
    this.placedElements.forEach((item) => {
      const overlay = this.container.querySelector<HTMLElement>(`.sign-page-overlay[data-page-index="${item.pageIndex}"]`);
      if (overlay) {
        const scale = this.pageScales[item.pageIndex] || 1;
        this.renderElementOnOverlay(item, overlay, scale);
      }
    });
  }

  private makeElementDraggable(el: HTMLElement, onMoveEnd: (x: number, y: number) => void): void {
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    const onPointerDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).classList.contains('sign-element-resize-handle')) return;
      if ((e.target as HTMLElement).closest('.sign-element-delete-btn')) return;
      e.stopPropagation();
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = parseFloat(el.style.left) || 0;
      initialTop = parseFloat(el.style.top) || 0;

      const onPointerMove = (moveEvt: PointerEvent) => {
        const dx = moveEvt.clientX - startX;
        const dy = moveEvt.clientY - startY;
        el.style.left = `${initialLeft + dx}px`;
        el.style.top = `${initialTop + dy}px`;
      };

      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        onMoveEnd(parseFloat(el.style.left), parseFloat(el.style.top));
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    };

    el.addEventListener('pointerdown', onPointerDown);
  }

  private makeElementResizable(
    el: HTMLElement,
    handle: HTMLElement,
    onResizeEnd: (w: number, h: number) => void
  ): void {
    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = el.offsetWidth;
      const startH = el.offsetHeight;

      const onMove = (moveEvt: PointerEvent) => {
        const newW = Math.max(30, startW + (moveEvt.clientX - startX));
        const newH = Math.max(20, startH + (moveEvt.clientY - startY));
        el.style.width = `${newW}px`;
        el.style.height = `${newH}px`;
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        onResizeEnd(el.offsetWidth, el.offsetHeight);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  private updateZoomDisplay(): void {
    const zoomLevelEl = this.container.querySelector<HTMLElement>('[data-ref="val-zoom-level"]');
    if (zoomLevelEl) {
      zoomLevelEl.textContent = `${Math.round(this.zoomLevel * 100)}%`;
    }
  }

  private updateModificationsSummary(): void {
    const countEl = this.container.querySelector<HTMLElement>('[data-ref="sidebar-elements-count"]');
    if (countEl) {
      countEl.textContent = `${this.placedElements.length} colocados`;
    }
  }

  private async dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const res = await fetch(dataUrl);
    return await res.blob();
  }

  private async handleSaveSignedPdf(button: HTMLButtonElement): Promise<void> {
    if (!this.currentFile || this.isProcessing) return;
    this.hideError();

    if (this.placedElements.length === 0) {
      this.showError('Debes colocar al menos un campo o firma en el documento.');
      showToast('Debes colocar al menos una firma en el PDF.', 'info');
      return;
    }

    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="sign-processing-card"]');
    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="sign-workspace-card"]');

    this.isProcessing = true;
    if (workspaceCard) workspaceCard.style.display = 'none';
    if (processingCard) processingCard.style.display = '';

    await withButtonLoading(button, async () => {
      try {
        const formData = new FormData();
        formData.append('file', this.currentFile as Blob, this.currentFile?.name);

        const uniqueImageMap = new Map<string, number>();
        const signatureBlobs: Blob[] = [];

        for (const item of this.placedElements) {
          if (item.dataUrl && !uniqueImageMap.has(item.dataUrl)) {
            const index = signatureBlobs.length;
            uniqueImageMap.set(item.dataUrl, index);
            const blob = await this.dataUrlToBlob(item.dataUrl);
            signatureBlobs.push(blob);
          }
        }

        signatureBlobs.forEach((blob, idx) => {
          formData.append('signatures', blob, `signature_${idx}.png`);
        });

        const elementsPayload = this.placedElements.map((el) => ({
          color: el.color,
          fontSize: el.fontSize,
          height: el.height,
          id: el.id,
          imageIndex: el.dataUrl ? uniqueImageMap.get(el.dataUrl) : undefined,
          pageIndex: el.pageIndex,
          text: el.text,
          type: el.type,
          width: el.width,
          x: el.x,
          y: el.y,
        }));

        const modifications = {
          elements: elementsPayload,
          includeAuditTrail: this.currentSignType === 'digital',
          signType: this.currentSignType,
          signerInitials: this.signerInitials,
          signerName: this.signerName || 'Firmante',
        };

        formData.append('modifications', JSON.stringify(modifications));

        const response = await postFormApi(API_ROUTES.tools.signPdf.sign, formData);
        const result = (await response.json()) as { data?: SignPdfResponseData; error?: string; success: boolean };

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error || 'Error al firmar el PDF.');
        }

        const token = result.data.fileId;
        const downloadPayload = {
          downloadUrl: `/api/download/${token}`,
          fileSize: result.data.fileSize,
          filename: result.data.filename,
          returnText: 'Firmar otro documento PDF',
          returnUrl: '/sign-pdf',
          subtitle: `El documento "${this.currentFile?.name}" ha sido firmado ${this.currentSignType === 'digital' ? 'con firma digital y sellado criptográfico' : 'correctamente'}.`,
          title: '¡PDF firmado con éxito!',
          token,
        };

        sessionStorage.setItem('download_ready_data', JSON.stringify(downloadPayload));
        showToast('PDF firmado con éxito.', 'success');
        navigate(`/download/${token}`);
      } catch (err: unknown) {
        if (workspaceCard) workspaceCard.style.display = 'flex';
        const errorMessage = err instanceof Error ? err.message : 'Error inesperado al firmar el PDF.';
        this.showError(errorMessage);
      } finally {
        this.isProcessing = false;
        if (processingCard) processingCard.style.display = 'none';
      }
    });
  }

  private resetSelectedFile(): void {
    this.currentFile = null;
    this.pdfDocument = null;
    this.placedElements = [];
    this.signatureAsset = null;
    this.userInitialsAsset = null;
    this.logoAsset = null;

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    if (fileInput) fileInput.value = '';

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="sign-dropzone-card"]');
    const workspaceCard = this.container.querySelector<HTMLElement>('[data-ref="sign-workspace-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="sign-pdf-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="sign-pdf-workspace"]');

    if (dropzoneCard) dropzoneCard.style.display = '';
    if (workspaceCard) workspaceCard.style.display = 'none';
    if (sidebar) sidebar.style.display = 'none';
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
    this.sidebarModal?.close();

    this.hideError();
  }

  private showError(message: string): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="sign-global-error"]');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = '';
    }
  }

  private hideError(): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="sign-global-error"]');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }
}

export async function createSignPdfView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/tools/sign-pdf/sign-pdf.html');
  const controller = new SignPdfController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
