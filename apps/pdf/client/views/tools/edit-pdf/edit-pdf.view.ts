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
import { bindFileDropzone, setupToolSidebarModal, ToolSidebarModalController, withButtonLoading } from '../../../utils/dom.util.js';
import { EditDrawingStroke, EditImageItem, EditPdfMode, EditPdfResponseData, EditPdfTool, EditShapeItem, EditShapeType, EditTextAddition, EditTextReplacement, EditorProperties, NativeTextItem } from './edit-pdf.types.js';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export class EditPdfController implements ViewController {
  private abortController: AbortController | null = null;
  private activePageIndex = 0;
  private container: HTMLElement;
  private currentFile: File | null = null;
  private currentMode: EditPdfMode = 'annotate';
  private currentTool: EditPdfTool = 'select';
  private drawings: EditDrawingStroke[] = [];
  private hasNativeText = false;
  private images: EditImageItem[] = [];
  private isProcessing = false;
  private pageDimensions: Array<{ height: number; width: number }> = [];
  private pageScales: number[] = [];
  private pdfDocument: any = null;
  private properties: EditorProperties = {
    fillColor: 'transparent',
    fontFamily: 'Helvetica',
    fontSize: 14,
    strokeColor: '#000000',
    strokeWidth: 2,
  };
  private redoStack: any[] = [];
  private replacements: EditTextReplacement[] = [];
  private selectedElement: { el: HTMLElement; id: string; type: string } | null = null;
  private shapes: EditShapeItem[] = [];
  private sidebarModal: ToolSidebarModalController | null = null;
  private statusManager: ToolStatusManager | null = null;
  private texts: EditTextAddition[] = [];
  private undoStack: any[] = [];
  private zoomLevel = 1.0;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async init(): Promise<void> {
    this.abortController = new AbortController();
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="edit-pdf-workspace"]') || this.container;
    this.statusManager = new ToolStatusManager({
      container: workspace,
      onRetry: () => {
        this.restoreEditorFromError();
      },
      toolName: 'Editar PDF',
    });
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

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="edit-pdf-sidebar"]');
    const backdrop = this.container.querySelector<HTMLElement>('[data-ref="tool-sidebar-backdrop"]');
    const dragZone = this.container.querySelector<HTMLElement>('[data-ref="edit-sidebar-drag-zone"]');
    const closeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-close"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');

    if (sidebar && backdrop && settingsBtn) {
      this.sidebarModal = setupToolSidebarModal({ backdrop, closeBtn, dragZone, settingsBtn, sidebar, signal });
    }

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const imgInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-image-file"]');
    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="edit-dropzone"]');
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-file"]');
    const heroDriveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-drive"]');
    const heroDropboxBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hero-dropbox"]');
    const sidebarSaveBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-save-pdf"]');

    const btnModeAnnotate = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-mode-annotate"]');
    const btnModeEdit = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-mode-edit"]');

    const btnZoomIn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-zoom-in"]');
    const btnZoomOut = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-zoom-out"]');
    const btnUndo = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-undo"]');
    const btnRedo = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-redo"]');
    const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
    outputNameInput?.addEventListener('input', () => this.hideError(), { signal });

    browseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput?.click();
    }, { signal });

    heroDriveBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const files = await pickGoogleDriveFiles({ multiselect: false });
      if (files && files.length > 0) {
        void this.handleFileSelected(files[0]);
      }
    }, { signal });

    heroDropboxBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const files = await pickDropboxFiles({ multiselect: false });
      if (files && files.length > 0) {
        void this.handleFileSelected(files[0]);
      }
    }, { signal });

    dropzone?.addEventListener('click', () => {
      fileInput?.click();
    }, { signal });

    fileInput?.addEventListener('change', () => {
      const files = fileInput.files;
      if (files && files.length > 0) {
        void this.handleFileSelected(files[0]);
      }
    }, { signal });

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="edit-dropzone-card"]');
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

    btnModeAnnotate?.addEventListener('click', () => {
      this.setMode('annotate');
    }, { signal });

    btnModeEdit?.addEventListener('click', () => {
      this.setMode('edit');
    }, { signal });

    const toolButtons = this.container.querySelectorAll<HTMLButtonElement>('[data-tool]');
    toolButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tool = btn.getAttribute('data-tool') as EditPdfTool;
        if (tool === 'image') {
          imgInput?.click();
        } else if (tool) {
          this.setTool(tool);
        }
      }, { signal });
    });

    imgInput?.addEventListener('change', () => {
      const files = imgInput.files;
      if (files && files.length > 0) {
        void this.handleImageAdded(files[0]);
      }
      imgInput.value = '';
    }, { signal });

    btnZoomIn?.addEventListener('click', () => {
      if (this.zoomLevel < 2.0) {
        this.zoomLevel = Math.min(2.0, parseFloat((this.zoomLevel + 0.25).toFixed(2)));
        this.updateZoomDisplay();
        void this.rerenderAllPages();
      }
    }, { signal });

    btnZoomOut?.addEventListener('click', () => {
      if (this.zoomLevel > 0.5) {
        this.zoomLevel = Math.max(0.5, parseFloat((this.zoomLevel - 0.25).toFixed(2)));
        this.updateZoomDisplay();
        void this.rerenderAllPages();
      }
    }, { signal });

    btnUndo?.addEventListener('click', () => {
      this.handleUndo();
    }, { signal });

    btnRedo?.addEventListener('click', () => {
      this.handleRedo();
    }, { signal });

    const colorSwatches = this.container.querySelectorAll<HTMLButtonElement>('[data-ref^="swatch-"]');
    colorSwatches.forEach((swatch) => {
      swatch.addEventListener('click', () => {
        colorSwatches.forEach((s) => s.classList.remove('is-active'));
        swatch.classList.add('is-active');
        const color = swatch.getAttribute('data-color') || '#000000';
        this.properties.strokeColor = color;
        this.applySelectedElementProperties();
      }, { signal });
    });

    const fillSwatches = this.container.querySelectorAll<HTMLButtonElement>('[data-ref^="fill-"]');
    fillSwatches.forEach((swatch) => {
      swatch.addEventListener('click', () => {
        fillSwatches.forEach((s) => s.classList.remove('is-active'));
        swatch.classList.add('is-active');
        const color = swatch.getAttribute('data-color') || 'transparent';
        this.properties.fillColor = color;
        this.applySelectedElementProperties();
      }, { signal });
    });

    const strokeBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-ref^="stroke-"]');
    strokeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        strokeBtns.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const width = parseInt(btn.getAttribute('data-width') || '2', 10);
        this.properties.strokeWidth = width;
        this.applySelectedElementProperties();
      }, { signal });
    });

    const fontBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-ref^="font-"]');
    fontBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        fontBtns.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const size = parseInt(btn.getAttribute('data-size') || '14', 10);
        this.properties.fontSize = size;
        this.applySelectedElementProperties();
      }, { signal });
    });

    const executeSave = () => {
      if (sidebarSaveBtn) void this.handleSavePdf(sidebarSaveBtn);
    };

    sidebarSaveBtn?.addEventListener('click', executeSave, { signal });
  }

  private setMode(mode: EditPdfMode): void {
    this.currentMode = mode;
    const btnAnnotate = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-mode-annotate"]');
    const btnEdit = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-mode-edit"]');
    const groupAnnotate = this.container.querySelector<HTMLElement>('[data-ref="tools-group-annotate"]');
    const groupEdit = this.container.querySelector<HTMLElement>('[data-ref="tools-group-edit"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="edit-editor-card"]');

    if (btnAnnotate) btnAnnotate.classList.toggle('is-active', mode === 'annotate');
    if (btnEdit) btnEdit.classList.toggle('is-active', mode === 'edit');
    if (groupAnnotate) groupAnnotate.style.display = mode === 'annotate' ? 'inline-flex' : 'none';
    if (groupEdit) groupEdit.style.display = mode === 'edit' ? 'inline-flex' : 'none';

    if (workspace) {
      workspace.classList.toggle('mode--annotate', mode === 'annotate');
      workspace.classList.toggle('mode--edit', mode === 'edit');
    }

    if (mode === 'edit') {
      const statusPill = this.container.querySelector<HTMLElement>('[data-ref="edit-status-pill"]');
      const statusTxt = this.container.querySelector<HTMLElement>('[data-ref="txt-edit-status"]');
      if (this.hasNativeText) {
        if (statusPill) {
          statusPill.className = 'pdf-editor-status-pill pdf-editor-status-pill--success';
        }
        if (statusTxt) {
          statusTxt.textContent = 'Texto editable detectado: haz clic en cualquier línea para editarla.';
        }
      } else {
        if (statusPill) {
          statusPill.className = 'pdf-editor-status-pill pdf-editor-status-pill--warning';
        }
        if (statusTxt) {
          statusTxt.textContent = 'Este PDF no contiene texto vectorial (es una imagen o escaneo).';
        }
      }
    }
  }

  private setTool(tool: EditPdfTool): void {
    this.currentTool = tool;
    const toolButtons = this.container.querySelectorAll<HTMLButtonElement>('[data-tool]');
    toolButtons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-tool') === tool);
    });
  }

  private updateZoomDisplay(): void {
    const zoomLevelEl = this.container.querySelector<HTMLElement>('[data-ref="val-zoom-level"]');
    if (zoomLevelEl) {
      zoomLevelEl.textContent = `${Math.round(this.zoomLevel * 100)}%`;
    }
  }

  private async handleFileSelected(file: File): Promise<void> {
    this.hideError();

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      this.showError('Solo se permiten documentos en formato PDF.');
      return;
    }

    const limits = getCurrentUserToolLimits('edit-pdf');
    if (file.size > limits.maxFileSizeMB * 1024 * 1024) {
      this.showError(`El archivo seleccionado supera el límite permitido de ${limits.maxFileSizeMB} MB.`);
      return;
    }

    this.currentFile = file;

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="edit-dropzone-card"]');
    const editorCard = this.container.querySelector<HTMLElement>('[data-ref="edit-editor-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="edit-pdf-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="edit-pdf-workspace"]');
    const topControls = this.container.querySelector<HTMLElement>('[data-ref="editor-top-controls"]');
    const topActions = this.container.querySelector<HTMLElement>('[data-ref="editor-top-actions"]');

    const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
    if (outputNameInput) {
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      outputNameInput.value = `${baseName}_editado.pdf`;
    }

    try {
      const pdfjs = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      this.pdfDocument = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const numPages = this.pdfDocument.numPages;

      const pagesCountBadge = this.container.querySelector<HTMLElement>('[data-ref="pages-count-badge"]');
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
      this.setMode('annotate');

      if (dropzoneCard) dropzoneCard.style.display = 'none';
      if (editorCard) editorCard.style.display = 'flex';
      if (sidebar) sidebar.style.display = 'flex';
      if (settingsBtn) settingsBtn.classList.add('is-visible');
      if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');
      if (topControls) topControls.style.display = 'flex';
      if (topActions) topActions.style.display = 'flex';
    } catch {
      this.showError('El archivo seleccionado no se pudo abrir porque estaba dañado o contiene errores en su estructura.');
      if (dropzoneCard) dropzoneCard.style.display = '';
      if (editorCard) editorCard.style.display = 'none';
      if (sidebar) sidebar.style.display = 'none';
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
    let foundNativeText = false;

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
      pageCard.className = 'pdf-edit-page-card';
      pageCard.setAttribute('data-page-index', `${pageIndex}`);
      pageCard.style.width = `${displayWidth}px`;
      pageCard.style.height = `${displayHeight}px`;

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-edit-page-canvas';
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

      const overlay = document.createElement('div');
      overlay.className = 'pdf-editor-overlay';
      overlay.setAttribute('data-page-index', `${pageIndex}`);
      pageCard.appendChild(overlay);

      const drawCanvas = document.createElement('canvas');
      drawCanvas.className = 'pdf-drawing-canvas';
      drawCanvas.width = displayWidth;
      drawCanvas.height = displayHeight;
      overlay.appendChild(drawCanvas);

      const shapesSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      shapesSvg.setAttribute('class', 'pdf-shapes-svg');
      shapesSvg.setAttribute('width', `${displayWidth}`);
      shapesSvg.setAttribute('height', `${displayHeight}`);
      overlay.appendChild(shapesSvg);

      const textLayer = document.createElement('div');
      textLayer.className = 'pdf-native-text-layer';
      overlay.appendChild(textLayer);

      try {
        const textContent = await page.getTextContent();
        if (textContent.items && textContent.items.length > 0) {
          const validItems = textContent.items.filter((it: any) => it.str && it.str.trim().length > 0);
          if (validItems.length > 0) {
            foundNativeText = true;
            this.renderNativeTextItems(page, validItems, displayScale, textLayer, pageIndex);
          }
        }
      } catch {}

      this.bindPageOverlayInteractions(overlay, pageIndex, drawCanvas, shapesSvg);

      pagesWrapper.appendChild(pageCard);
    }

    this.hasNativeText = foundNativeText;
    this.restoreModifications();
  }

  private renderNativeTextItems(
    page: any,
    items: any[],
    scale: number,
    textLayer: HTMLElement,
    pageIndex: number
  ): void {
    const viewport = page.getViewport({ scale });

    items.forEach((item: any, itemIndex: number) => {
      const tx = (window as any).pdfjsLib?.Util?.transform
        ? (window as any).pdfjsLib.Util.transform(viewport.transform, item.transform)
        : [scale, 0, 0, scale, item.transform[4] * scale, (this.pageDimensions[pageIndex].height - item.transform[5]) * scale];

      const itemX = tx[4];
      const itemY = tx[5] - (item.height * scale || 14);
      const itemW = item.width * scale;
      const itemH = (item.height * scale) || 16;
      const fontSize = Math.max(10, Math.round(item.height * scale));

      const span = document.createElement('div');
      span.className = 'pdf-native-text-item';
      span.setAttribute('data-ref', `native-text-${pageIndex}-${itemIndex}`);
      span.setAttribute('data-original', item.str);
      span.style.left = `${itemX}px`;
      span.style.top = `${itemY}px`;
      span.style.width = `${Math.max(itemW, 16)}px`;
      span.style.height = `${itemH}px`;
      span.style.fontSize = `${fontSize}px`;
      span.textContent = item.str;

      span.addEventListener('click', (e) => {
        if (this.currentMode !== 'edit') return;
        e.stopPropagation();
        this.openInlineTextEditor(span, item.str, itemX, itemY, itemW, itemH, fontSize, pageIndex);
      });

      textLayer.appendChild(span);
    });
  }

  private openInlineTextEditor(
    span: HTMLElement,
    originalText: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fontSize: number,
    pageIndex: number
  ): void {
    const parent = span.parentElement;
    if (!parent) return;

    span.style.visibility = 'hidden';

    const input = document.createElement('input');
    input.className = 'pdf-native-text-input';
    input.type = 'text';
    input.value = span.textContent || originalText;
    input.style.left = `${x}px`;
    input.style.top = `${y}px`;
    input.style.minWidth = `${Math.max(width, 60)}px`;
    input.style.height = `${height}px`;
    input.style.fontSize = `${fontSize}px`;

    parent.appendChild(input);
    input.focus();
    input.select();

    const finishEdit = () => {
      const newText = input.value;
      input.remove();

      if (newText !== originalText && newText.trim().length > 0) {
        span.textContent = newText;
        span.style.visibility = 'visible';

        const scale = this.pageScales[pageIndex] || 1;
        const pdfX = x / scale;
        const pdfY = y / scale;
        const pdfW = width / scale;
        const pdfH = height / scale;
        const pdfFontSize = fontSize / scale;

        const replacement: EditTextReplacement = {
          color: this.properties.strokeColor,
          fontFamily: this.properties.fontFamily,
          fontSize: pdfFontSize,
          height: pdfH,
          id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          newText,
          originalText,
          pageIndex,
          width: pdfW,
          x: pdfX,
          y: pdfY,
        };

        this.replacements.push(replacement);
        this.pushAction('add_replacement', replacement);
        this.updateModificationsSummary();
        showToast('Texto modificado correctamente.', 'success');
      } else {
        span.style.visibility = 'visible';
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        finishEdit();
      } else if (e.key === 'Escape') {
        input.remove();
        span.style.visibility = 'visible';
      }
    });

    input.addEventListener('blur', () => {
      finishEdit();
    }, { once: true });
  }

  private bindPageOverlayInteractions(
    overlay: HTMLElement,
    pageIndex: number,
    drawCanvas: HTMLCanvasElement,
    shapesSvg: SVGElement
  ): void {
    let isDrawing = false;
    let currentStroke: Array<{ x: number; y: number }> = [];

    const getCoords = (e: PointerEvent) => {
      const rect = overlay.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    overlay.addEventListener('pointerdown', (e) => {
      if (this.currentMode !== 'annotate') return;
      const target = e.target as HTMLElement;
      if (target.closest('.pdf-added-textbox') || target.closest('.pdf-added-image')) return;

      const pt = getCoords(e);

      if (this.currentTool === 'draw') {
        isDrawing = true;
        currentStroke = [pt];
        const ctx = drawCanvas.getContext('2d');
        if (ctx) {
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y);
          ctx.strokeStyle = this.properties.strokeColor;
          ctx.lineWidth = this.properties.strokeWidth;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        }
      } else if (this.currentTool === 'text') {
        this.addTextBoxAt(pt.x, pt.y, pageIndex, overlay);
      } else if (this.currentTool === 'line' || this.currentTool === 'rect' || this.currentTool === 'circle') {
        this.startShapeDraw(pt.x, pt.y, pageIndex, overlay, shapesSvg, this.currentTool);
      }
    });

    overlay.addEventListener('pointermove', (e) => {
      if (!isDrawing || this.currentTool !== 'draw') return;
      const pt = getCoords(e);
      currentStroke.push(pt);
      const ctx = drawCanvas.getContext('2d');
      if (ctx) {
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
      }
    });

    const endDraw = () => {
      if (!isDrawing) return;
      isDrawing = false;
      if (currentStroke.length > 1) {
        const scale = this.pageScales[pageIndex] || 1;
        const normalizedPoints = currentStroke.map((p) => ({
          x: p.x / scale,
          y: p.y / scale,
        }));

        const strokeItem: EditDrawingStroke = {
          color: this.properties.strokeColor,
          id: `draw_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          pageIndex,
          points: normalizedPoints,
          width: this.properties.strokeWidth / scale,
        };

        this.drawings.push(strokeItem);
        this.pushAction('add_drawing', strokeItem);
        this.updateModificationsSummary();
      }
      currentStroke = [];
    };

    overlay.addEventListener('pointerup', endDraw);
    overlay.addEventListener('pointercancel', endDraw);
  }

  private startShapeDraw(
    startX: number,
    startY: number,
    pageIndex: number,
    overlay: HTMLElement,
    shapesSvg: SVGElement,
    shapeType: EditShapeType
  ): void {
    let previewEl: SVGElement | null = null;

    if (shapeType === 'line') {
      previewEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      previewEl.setAttribute('x1', `${startX}`);
      previewEl.setAttribute('y1', `${startY}`);
      previewEl.setAttribute('x2', `${startX}`);
      previewEl.setAttribute('y2', `${startY}`);
      previewEl.setAttribute('stroke', this.properties.strokeColor);
      previewEl.setAttribute('stroke-width', `${this.properties.strokeWidth}`);
    } else if (shapeType === 'rect') {
      previewEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      previewEl.setAttribute('x', `${startX}`);
      previewEl.setAttribute('y', `${startY}`);
      previewEl.setAttribute('width', '0');
      previewEl.setAttribute('height', '0');
      previewEl.setAttribute('stroke', this.properties.strokeColor);
      previewEl.setAttribute('stroke-width', `${this.properties.strokeWidth}`);
      previewEl.setAttribute('fill', this.properties.fillColor);
    } else if (shapeType === 'circle') {
      previewEl = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      previewEl.setAttribute('cx', `${startX}`);
      previewEl.setAttribute('cy', `${startY}`);
      previewEl.setAttribute('rx', '0');
      previewEl.setAttribute('ry', '0');
      previewEl.setAttribute('stroke', this.properties.strokeColor);
      previewEl.setAttribute('stroke-width', `${this.properties.strokeWidth}`);
      previewEl.setAttribute('fill', this.properties.fillColor);
    }

    if (previewEl) {
      shapesSvg.appendChild(previewEl);
    }

    const onMove = (e: PointerEvent) => {
      const rect = overlay.getBoundingClientRect();
      const currX = e.clientX - rect.left;
      const currY = e.clientY - rect.top;

      if (!previewEl) return;

      if (shapeType === 'line') {
        previewEl.setAttribute('x2', `${currX}`);
        previewEl.setAttribute('y2', `${currY}`);
      } else if (shapeType === 'rect') {
        const x = Math.min(startX, currX);
        const y = Math.min(startY, currY);
        const w = Math.abs(currX - startX);
        const h = Math.abs(currY - startY);
        previewEl.setAttribute('x', `${x}`);
        previewEl.setAttribute('y', `${y}`);
        previewEl.setAttribute('width', `${w}`);
        previewEl.setAttribute('height', `${h}`);
      } else if (shapeType === 'circle') {
        const cx = (startX + currX) / 2;
        const cy = (startY + currY) / 2;
        const rx = Math.abs(currX - startX) / 2;
        const ry = Math.abs(currY - startY) / 2;
        previewEl.setAttribute('cx', `${cx}`);
        previewEl.setAttribute('cy', `${cy}`);
        previewEl.setAttribute('rx', `${rx}`);
        previewEl.setAttribute('ry', `${ry}`);
      }
    };

    const onUp = (e: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      const rect = overlay.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;
      const scale = this.pageScales[pageIndex] || 1;

      if (shapeType === 'line') {
        if (Math.abs(endX - startX) > 4 || Math.abs(endY - startY) > 4) {
          const item: EditShapeItem = {
            id: `line_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            pageIndex,
            strokeColor: this.properties.strokeColor,
            strokeWidth: this.properties.strokeWidth / scale,
            type: 'line',
            x: startX / scale,
            x2: endX / scale,
            y: startY / scale,
            y2: endY / scale,
          };
          this.shapes.push(item);
          this.pushAction('add_shape', item);
          this.updateModificationsSummary();
        } else {
          previewEl?.remove();
        }
      } else if (shapeType === 'rect' || shapeType === 'circle') {
        const w = Math.abs(endX - startX);
        const h = Math.abs(endY - startY);
        if (w > 6 && h > 6) {
          const x = Math.min(startX, endX);
          const y = Math.min(startY, endY);
          const item: EditShapeItem = {
            fillColor: this.properties.fillColor,
            height: h / scale,
            id: `shape_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            pageIndex,
            strokeColor: this.properties.strokeColor,
            strokeWidth: this.properties.strokeWidth / scale,
            type: shapeType,
            width: w / scale,
            x: x / scale,
            y: y / scale,
          };
          this.shapes.push(item);
          this.pushAction('add_shape', item);
          this.updateModificationsSummary();
        } else {
          previewEl?.remove();
        }
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  private addTextBoxAt(x: number, y: number, pageIndex: number, overlay: HTMLElement): void {
    const scale = this.pageScales[pageIndex] || 1;
    const textBox = document.createElement('div');
    textBox.className = 'pdf-added-textbox is-selected';
    textBox.style.left = `${x}px`;
    textBox.style.top = `${y}px`;

    const content = document.createElement('div');
    content.className = 'pdf-added-textbox__content';
    content.contentEditable = 'true';
    content.style.color = this.properties.strokeColor;
    content.style.fontSize = `${this.properties.fontSize}px`;
    content.style.fontFamily = this.properties.fontFamily;
    content.textContent = 'Escribe aquí...';

    textBox.appendChild(content);
    overlay.appendChild(textBox);

    content.focus();
    const range = document.createRange();
    range.selectNodeContents(content);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    const onFinish = () => {
      const textVal = content.textContent?.trim() || '';
      if (!textVal || textVal === 'Escribe aquí...') {
        textBox.remove();
        return;
      }
      const item: EditTextAddition = {
        color: this.properties.strokeColor,
        fontFamily: this.properties.fontFamily,
        fontSize: this.properties.fontSize / scale,
        id: `txt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        pageIndex,
        text: textVal,
        x: x / scale,
        y: y / scale,
      };
      this.texts.push(item);
      this.pushAction('add_text', item);
      this.updateModificationsSummary();
      this.makeElementDraggable(textBox, (newX, newY) => {
        item.x = newX / scale;
        item.y = newY / scale;
      });
    };

    content.addEventListener('blur', onFinish, { once: true });
    content.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        content.blur();
      }
    });
  }

  private async handleImageAdded(file: File): Promise<void> {
    const pageIndex = this.activePageIndex;
    const overlay = this.container.querySelector<HTMLElement>(`.pdf-editor-overlay[data-page-index="${pageIndex}"]`);
    if (!overlay) return;

    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

    const scale = this.pageScales[pageIndex] || 1;
    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'pdf-added-image is-selected';
    imgWrapper.style.left = '40px';
    imgWrapper.style.top = '40px';
    imgWrapper.style.width = '140px';
    imgWrapper.style.height = '140px';

    const img = document.createElement('img');
    img.src = dataUrl;
    imgWrapper.appendChild(img);

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'pdf-element-resize-handle';
    imgWrapper.appendChild(resizeHandle);

    overlay.appendChild(imgWrapper);

    const item: EditImageItem = {
      dataUrl,
      file,
      height: 140 / scale,
      id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      pageIndex,
      width: 140 / scale,
      x: 40 / scale,
      y: 40 / scale,
    };

    this.images.push(item);
    this.pushAction('add_image', item);
    this.updateModificationsSummary();

    this.makeElementDraggable(imgWrapper, (newX, newY) => {
      item.x = newX / scale;
      item.y = newY / scale;
    });

    this.makeElementResizable(imgWrapper, resizeHandle, (newW, newH) => {
      item.width = newW / scale;
      item.height = newH / scale;
    });
  }

  private makeElementDraggable(el: HTMLElement, onMoveEnd: (x: number, y: number) => void): void {
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    const onPointerDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).classList.contains('pdf-element-resize-handle')) return;
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
        const newH = Math.max(30, startH + (moveEvt.clientY - startY));
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

  private applySelectedElementProperties(): void {
    if (!this.selectedElement) return;
    const { el, type } = this.selectedElement;
    if (type === 'text') {
      const content = el.querySelector<HTMLElement>('.pdf-added-textbox__content');
      if (content) {
        content.style.color = this.properties.strokeColor;
        content.style.fontSize = `${this.properties.fontSize}px`;
      }
    }
  }

  private pushAction(type: string, data: any): void {
    this.undoStack.push({ data, type });
    this.redoStack = [];
    this.updateUndoRedoButtons();
  }

  private handleUndo(): void {
    if (this.undoStack.length === 0) return;
    const action = this.undoStack.pop();
    this.redoStack.push(action);

    if (action.type === 'add_text') {
      this.texts = this.texts.filter((t) => t.id !== action.data.id);
    } else if (action.type === 'add_shape') {
      this.shapes = this.shapes.filter((s) => s.id !== action.data.id);
    } else if (action.type === 'add_drawing') {
      this.drawings = this.drawings.filter((d) => d.id !== action.data.id);
    } else if (action.type === 'add_replacement') {
      this.replacements = this.replacements.filter((r) => r.id !== action.data.id);
    } else if (action.type === 'add_image') {
      this.images = this.images.filter((img) => img.id !== action.data.id);
    }

    this.updateUndoRedoButtons();
    this.updateModificationsSummary();
    void this.rerenderAllPages();
  }

  private handleRedo(): void {
    if (this.redoStack.length === 0) return;
    const action = this.redoStack.pop();
    this.undoStack.push(action);

    if (action.type === 'add_text') {
      this.texts.push(action.data);
    } else if (action.type === 'add_shape') {
      this.shapes.push(action.data);
    } else if (action.type === 'add_drawing') {
      this.drawings.push(action.data);
    } else if (action.type === 'add_replacement') {
      this.replacements.push(action.data);
    } else if (action.type === 'add_image') {
      this.images.push(action.data);
    }

    this.updateUndoRedoButtons();
    this.updateModificationsSummary();
    void this.rerenderAllPages();
  }

  private updateUndoRedoButtons(): void {
    const btnUndo = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-undo"]');
    const btnRedo = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-redo"]');
    if (btnUndo) btnUndo.disabled = this.undoStack.length === 0;
    if (btnRedo) btnRedo.disabled = this.redoStack.length === 0;
  }

  private updateModificationsSummary(): void {}

  private restoreModifications(): void {
    this.drawings.forEach((stroke) => {
      const pageIndex = stroke.pageIndex;
      const overlay = this.container.querySelector<HTMLElement>(`.pdf-editor-overlay[data-page-index="${pageIndex}"]`);
      const drawCanvas = overlay?.querySelector<HTMLCanvasElement>('.pdf-drawing-canvas');
      if (drawCanvas && stroke.points.length > 1) {
        const scale = this.pageScales[pageIndex] || 1;
        const ctx = drawCanvas.getContext('2d');
        if (ctx) {
          ctx.beginPath();
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = stroke.width * scale;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.moveTo(stroke.points[0].x * scale, stroke.points[0].y * scale);
          for (let p = 1; p < stroke.points.length; p++) {
            ctx.lineTo(stroke.points[p].x * scale, stroke.points[p].y * scale);
          }
          ctx.stroke();
        }
      }
    });

    this.shapes.forEach((shape) => {
      const pageIndex = shape.pageIndex;
      const overlay = this.container.querySelector<HTMLElement>(`.pdf-editor-overlay[data-page-index="${pageIndex}"]`);
      const shapesSvg = overlay?.querySelector<SVGElement>('.pdf-shapes-svg');
      if (shapesSvg) {
        const scale = this.pageScales[pageIndex] || 1;
        if (shape.type === 'line') {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', `${shape.x * scale}`);
          line.setAttribute('y1', `${shape.y * scale}`);
          line.setAttribute('x2', `${(shape.x2 ?? shape.x) * scale}`);
          line.setAttribute('y2', `${(shape.y2 ?? shape.y) * scale}`);
          line.setAttribute('stroke', shape.strokeColor);
          line.setAttribute('stroke-width', `${shape.strokeWidth * scale}`);
          shapesSvg.appendChild(line);
        } else if (shape.type === 'rect') {
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.setAttribute('x', `${shape.x * scale}`);
          rect.setAttribute('y', `${shape.y * scale}`);
          rect.setAttribute('width', `${(shape.width ?? 50) * scale}`);
          rect.setAttribute('height', `${(shape.height ?? 50) * scale}`);
          rect.setAttribute('stroke', shape.strokeColor);
          rect.setAttribute('stroke-width', `${shape.strokeWidth * scale}`);
          rect.setAttribute('fill', shape.fillColor || 'transparent');
          shapesSvg.appendChild(rect);
        } else if (shape.type === 'circle') {
          const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
          const w = (shape.width ?? 50) * scale;
          const h = (shape.height ?? 50) * scale;
          ellipse.setAttribute('cx', `${shape.x * scale + w / 2}`);
          ellipse.setAttribute('cy', `${shape.y * scale + h / 2}`);
          ellipse.setAttribute('rx', `${w / 2}`);
          ellipse.setAttribute('ry', `${h / 2}`);
          ellipse.setAttribute('stroke', shape.strokeColor);
          ellipse.setAttribute('stroke-width', `${shape.strokeWidth * scale}`);
          ellipse.setAttribute('fill', shape.fillColor || 'transparent');
          shapesSvg.appendChild(ellipse);
        }
      }
    });

    this.texts.forEach((txt) => {
      const pageIndex = txt.pageIndex;
      const overlay = this.container.querySelector<HTMLElement>(`.pdf-editor-overlay[data-page-index="${pageIndex}"]`);
      if (overlay) {
        const scale = this.pageScales[pageIndex] || 1;
        const textBox = document.createElement('div');
        textBox.className = 'pdf-added-textbox';
        textBox.style.left = `${txt.x * scale}px`;
        textBox.style.top = `${txt.y * scale}px`;

        const content = document.createElement('div');
        content.className = 'pdf-added-textbox__content';
        content.contentEditable = 'true';
        content.style.color = txt.color || '#000000';
        content.style.fontSize = `${txt.fontSize * scale}px`;
        content.style.fontFamily = txt.fontFamily || 'Helvetica';
        content.textContent = txt.text;

        textBox.appendChild(content);
        overlay.appendChild(textBox);

        this.makeElementDraggable(textBox, (newX, newY) => {
          txt.x = newX / scale;
          txt.y = newY / scale;
        });
      }
    });

    this.replacements.forEach((rep) => {
      const pageIndex = rep.pageIndex;
      const overlay = this.container.querySelector<HTMLElement>(`.pdf-editor-overlay[data-page-index="${pageIndex}"]`);
      if (overlay) {
        const scale = this.pageScales[pageIndex] || 1;
        const patch = document.createElement('div');
        patch.className = 'pdf-text-replace-patch';
        patch.style.left = `${rep.x * scale}px`;
        patch.style.top = `${rep.y * scale}px`;
        patch.style.width = `${rep.width * scale}px`;
        patch.style.height = `${rep.height * scale}px`;
        patch.style.fontSize = `${rep.fontSize * scale}px`;
        patch.style.color = rep.color || '#000000';
        patch.style.fontFamily = rep.fontFamily || 'Helvetica';
        patch.textContent = rep.newText;
        overlay.appendChild(patch);
      }
    });

    this.images.forEach((imgItem) => {
      const pageIndex = imgItem.pageIndex;
      const overlay = this.container.querySelector<HTMLElement>(`.pdf-editor-overlay[data-page-index="${pageIndex}"]`);
      if (overlay) {
        const scale = this.pageScales[pageIndex] || 1;
        const imgWrapper = document.createElement('div');
        imgWrapper.className = 'pdf-added-image';
        imgWrapper.style.left = `${imgItem.x * scale}px`;
        imgWrapper.style.top = `${imgItem.y * scale}px`;
        imgWrapper.style.width = `${imgItem.width * scale}px`;
        imgWrapper.style.height = `${imgItem.height * scale}px`;

        const img = document.createElement('img');
        img.src = imgItem.dataUrl;
        imgWrapper.appendChild(img);

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'pdf-element-resize-handle';
        imgWrapper.appendChild(resizeHandle);

        overlay.appendChild(imgWrapper);

        this.makeElementDraggable(imgWrapper, (newX, newY) => {
          imgItem.x = newX / scale;
          imgItem.y = newY / scale;
        });

        this.makeElementResizable(imgWrapper, resizeHandle, (newW, newH) => {
          imgItem.width = newW / scale;
          imgItem.height = newH / scale;
        });
      }
    });
  }

  private async rerenderAllPages(): Promise<void> {
    await this.renderDocumentPages();
  }

  private resetSelectedFile(): void {
    this.currentFile = null;
    this.pdfDocument = null;
    this.drawings = [];
    this.shapes = [];
    this.texts = [];
    this.replacements = [];
    this.images = [];
    this.undoStack = [];
    this.redoStack = [];

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    if (fileInput) fileInput.value = '';

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="edit-dropzone-card"]');
    const editorCard = this.container.querySelector<HTMLElement>('[data-ref="edit-editor-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="edit-pdf-sidebar"]');
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tool-settings"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="edit-pdf-workspace"]');

    if (dropzoneCard) dropzoneCard.style.display = '';
    if (editorCard) editorCard.style.display = 'none';
    if (sidebar) sidebar.style.display = 'none';
    if (settingsBtn) settingsBtn.classList.remove('is-visible');
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
    const topControls = this.container.querySelector<HTMLElement>('[data-ref="editor-top-controls"]');
    const topActions = this.container.querySelector<HTMLElement>('[data-ref="editor-top-actions"]');
    if (topControls) topControls.style.display = 'none';
    if (topActions) topActions.style.display = 'none';

    const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
    if (outputNameInput) {
      outputNameInput.value = 'documento_editado.pdf';
    }
    this.sidebarModal?.close();

    this.hideError();
  }

  private async handleSavePdf(button: HTMLButtonElement): Promise<void> {
    if (!this.currentFile || this.isProcessing) return;
    this.hideError();

    const editorCard = this.container.querySelector<HTMLElement>('[data-ref="edit-editor-card"]');
    const topControls = this.container.querySelector<HTMLElement>('[data-ref="editor-top-controls"]');
    const topActions = this.container.querySelector<HTMLElement>('[data-ref="editor-top-actions"]');

    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="edit-pdf-sidebar"]');

    this.isProcessing = true;
    if (editorCard) editorCard.style.display = 'none';
    if (topControls) topControls.style.display = 'none';
    if (topActions) topActions.style.display = 'none';
    if (sidebar) sidebar.style.display = 'none';

    this.statusManager?.showUploading(1, 1);

    await withButtonLoading(button, async () => {
      try {
        const formData = new FormData();
        formData.append('file', this.currentFile as Blob, this.currentFile?.name);

        const outputNameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-output-name"]');
        const customFilename = outputNameInput?.value?.trim() || `${this.currentFile?.name.replace(/\.[^/.]+$/, '')}_editado.pdf`;
        formData.append('filename', customFilename);

        const imagesMeta: any[] = [];
        this.images.forEach((imgItem, idx) => {
          formData.append('images', imgItem.file, `image_${idx}_${imgItem.file.name}`);
          imagesMeta.push({
            height: imgItem.height,
            id: imgItem.id,
            imageIndex: idx,
            pageIndex: imgItem.pageIndex,
            width: imgItem.width,
            x: imgItem.x,
            y: imgItem.y,
          });
        });

        const modifications = {
          drawings: this.drawings,
          images: imagesMeta,
          replacements: this.replacements,
          shapes: this.shapes,
          texts: this.texts,
        };

        formData.append('modifications', JSON.stringify(modifications));

        const response = await postFormWithProgress(
          API_ROUTES.tools.editPdf.process,
          formData,
          (progress) => {
            this.statusManager?.updateUploadProgress(progress, 1);
          },
          this.abortController?.signal
        );
        const result = (await response.json()) as { data?: EditPdfResponseData; error?: string; success: boolean };

        this.statusManager?.showProcessingState({
          subtitle: 'Guardando anotaciones, formas, dibujos y modificaciones de texto',
          title: 'Aplicando ediciones al documento...',
        });

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error || 'Error al aplicar las modificaciones al PDF.');
        }

        const token = result.data.fileId;
        const downloadPayload = {
          downloadUrl: `/api/download/${token}`,
          fileSize: result.data.fileSize,
          filename: result.data.filename,
          returnText: 'Editar otro documento PDF',
          returnUrl: '/edit-pdf',
          subtitle: `El documento "${this.currentFile?.name}" se ha editado y guardado correctamente.`,
          title: '¡PDF editado con éxito!',
          token,
        };

        sessionStorage.setItem('download_ready_data', JSON.stringify(downloadPayload));
        showToast('PDF editado y guardado con éxito.', 'success');
        navigate(`/download/${token}`);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Error inesperado al guardar el PDF editado.';
        this.statusManager?.showError({
          boxText: 'Uno o más trazos, textos o imágenes agregados superan los límites del visor o el archivo base es ilegible. Revisa las anotaciones e inténtalo de nuevo.',
          boxTitle: 'Error al procesar la edición',
          desc: errorMessage,
          retryText: 'Reintentar Guardar PDF',
          title: '¡Oh no! No hemos podido guardar tu archivo.',
        });
      } finally {
        this.isProcessing = false;
      }
    });
  }

  private restoreEditorFromError(): void {
    this.statusManager?.hide();
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="edit-dropzone-card"]');
    const editorCard = this.container.querySelector<HTMLElement>('[data-ref="edit-editor-card"]');
    const sidebar = this.container.querySelector<HTMLElement>('[data-ref="edit-pdf-sidebar"]');
    const topControls = this.container.querySelector<HTMLElement>('[data-ref="editor-top-controls"]');
    const topActions = this.container.querySelector<HTMLElement>('[data-ref="editor-top-actions"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="edit-pdf-workspace"]');

    if (this.currentFile && this.pdfDocument) {
      if (dropzoneCard) dropzoneCard.style.display = 'none';
      if (editorCard) editorCard.style.display = 'flex';
      if (sidebar) sidebar.style.display = 'flex';
      if (topControls) topControls.style.display = 'flex';
      if (topActions) topActions.style.display = 'flex';
      if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');
    } else {
      this.resetSelectedFile();
    }
  }

  private showError(message: string): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="edit-global-error"]');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = '';
    }
  }

  private hideError(): void {
    const errorEl = this.container.querySelector<HTMLElement>('[data-ref="edit-global-error"]');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }
}

export async function createEditPdfView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/tools/edit-pdf/edit-pdf.html');
  const controller = new EditPdfController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
