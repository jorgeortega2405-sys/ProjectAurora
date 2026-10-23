import { navigate } from '../../app-router.js';
import { API_ROUTES } from '../../config/api-routes.js';
import { getApi, postFormApi } from '../../services/api.service.js';
import { renderIcons } from '../../services/icon.service.js';
import { loadPdfJs } from '../../services/pdf-loader.service.js';
import { loadTemplate } from '../../services/template.service.js';
import { showToast } from '../../services/toast.service.js';
import { withButtonLoading } from '../../utils/dom.util.js';
import Sortable from 'sortablejs';

interface WorkflowStep {
  id: string;
  options: Record<string, any>;
  tool: string;
}

interface UserWorkflow {
  category: 'pdf' | 'image';
  created_at: string;
  description: string | null;
  id: string;
  name: string;
  steps: WorkflowStep[];
  updated_at: string;
  user_id: string;
}

interface ToolDefinition {
  icon: string;
  id: string;
  isTerminal?: boolean;
  name: string;
  targetType?: string;
}

interface OrganizePageItem {
  id: string;
  originalIndex: number;
  pageNum: number;
  rotation: number;
  thumbnailDataUrl?: string;
}

const WORKFLOW_TOOLS: Record<string, ToolDefinition> = {
  'compress-pdf': { icon: 'compress', id: 'compress-pdf', name: 'Comprimir PDF' },
  'organize-pdf': { icon: 'layers', id: 'organize-pdf', name: 'Ordenar páginas PDF' },
  'pdf-to-excel': { icon: 'table_chart', id: 'pdf-to-excel', isTerminal: true, name: 'PDF a Excel', targetType: 'xlsx' },
  'pdf-to-jpg': { icon: 'image', id: 'pdf-to-jpg', isTerminal: true, name: 'PDF a JPG', targetType: 'jpg' },
  'pdf-to-powerpoint': { icon: 'slideshow', id: 'pdf-to-powerpoint', isTerminal: true, name: 'PDF a PowerPoint', targetType: 'pptx' },
  'pdf-to-word': { icon: 'description', id: 'pdf-to-word', isTerminal: true, name: 'PDF a Word', targetType: 'docx' },
  'split-pdf': { icon: 'call_split', id: 'split-pdf', name: 'Dividir PDF' },
};

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export class WorkflowRunnerController {
  private abortController: AbortController | null = null;
  private completedResult: { downloadUrl: string; fileSize: number; filename: string } | null = null;
  private compressLevel: 'extreme' | 'low' | 'recommended' = 'recommended';
  private container: HTMLElement;
  private currentFile: File | null = null;
  private currentStepIndex = 0;
  private isProcessing = false;
  private lastFileToken: string | null = null;
  private organizeOriginalPages: OrganizePageItem[] = [];
  private organizePages: OrganizePageItem[] = [];
  private pdfDocument: any = null;
  private sortableInstance: Sortable | null = null;
  private splitPages: OrganizePageItem[] = [];
  private splitSelectedPages: Set<number> = new Set();
  private workflow: UserWorkflow | null = null;
  private workflowId: string;

  constructor(container: HTMLElement, workflowId: string) {
    this.container = container;
    this.workflowId = workflowId;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.bindEvents();
    await this.loadWorkflow();
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.sortableInstance) {
      this.sortableInstance.destroy();
      this.sortableInstance = null;
    }
    this.pdfDocument = null;
  }

  private async loadWorkflow(): Promise<void> {
    try {
      const res = await getApi(`/api/settings/workflows/${this.workflowId}`);
      if (!res.ok) {
        showToast('Flujo de trabajo no encontrado', 'danger');
        navigate('/');
        return;
      }

      const data = await res.json();
      this.workflow = data.workflow;
      this.renderWorkflowInitialState();
    } catch {
      showToast('Error al cargar el flujo de trabajo', 'danger');
      navigate('/');
    }
  }

  private renderWorkflowInitialState(): void {
    if (!this.workflow) return;

    const titleEl = this.container.querySelector<HTMLElement>('[data-ref="workflow-sidebar-title"]');
    const subtitleEl = this.container.querySelector<HTMLElement>('[data-ref="workflow-sidebar-subtitle"]');
    const badgeEl = this.container.querySelector<HTMLElement>('[data-ref="workflow-steps-count-badge"]');

    if (titleEl) titleEl.textContent = this.workflow.name;
    if (subtitleEl) subtitleEl.textContent = `Secuencia de ${this.workflow.steps.length} ${this.workflow.steps.length === 1 ? 'herramienta' : 'herramientas'}`;
    if (badgeEl) badgeEl.textContent = `${this.workflow.steps.length} pasos`;

    this.renderStepper();
    this.updateMainActionButton();
    renderIcons(this.container);
  }

  private renderStepper(): void {
    const stepperList = this.container.querySelector<HTMLElement>('[data-ref="workflow-stepper-list"]');
    if (!stepperList || !this.workflow) return;

    stepperList.innerHTML = this.workflow.steps.map((step, idx) => {
      const toolDef = WORKFLOW_TOOLS[step.tool];
      const name = toolDef ? toolDef.name : step.tool;
      const icon = toolDef ? toolDef.icon : 'widgets';

      const isCompleted = this.currentFile !== null && idx < this.currentStepIndex;
      const isActive = this.currentFile !== null && idx === this.currentStepIndex;

      let badgeBg = 'var(--bg-hover)';
      let badgeColor = 'var(--text-secondary)';
      let statusText = 'Pendiente';
      let borderStyle = '1px solid var(--border-color)';
      let background = 'var(--bg-surface)';

      if (isCompleted) {
        badgeBg = 'color-mix(in srgb, #10b981 14%, transparent)';
        badgeColor = '#10b981';
        statusText = 'Completado';
        borderStyle = '1px solid color-mix(in srgb, #10b981 35%, transparent)';
      } else if (isActive) {
        badgeBg = 'color-mix(in srgb, var(--accent, #3b82f6) 14%, transparent)';
        badgeColor = 'var(--accent, #3b82f6)';
        statusText = 'En curso';
        borderStyle = '1px solid var(--accent, #3b82f6)';
        background = 'var(--bg-hover)';
      }

      return `
        <div class="workflow-stepper-item" data-ref="stepper-step-${step.id}" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: var(--radius-lg); border: ${borderStyle}; background: ${background}; transition: all 0.2s ease;">
          <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
            <div style="width: 24px; height: 24px; border-radius: 50%; background: ${badgeBg}; color: ${badgeColor}; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0;">
              ${isCompleted ? '✓' : idx + 1}
            </div>
            <div style="overflow: hidden;">
              <div style="font-size: 13px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${name}</div>
            </div>
          </div>
          <span style="font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; background: ${badgeBg}; color: ${badgeColor}; flex-shrink: 0;">${statusText}</span>
        </div>
      `;
    }).join('');

    renderIcons(stepperList);
  }

  private updateMainActionButton(): void {
    const mainActionBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-main-action"]');
    const txtMainAction = this.container.querySelector<HTMLElement>('[data-ref="txt-main-action"]');
    const iconMainAction = this.container.querySelector<SVGElement>('[data-ref="icon-main-action"] use');
    const sidebarResetBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sidebar-reset"]');

    if (!mainActionBtn || !txtMainAction || !this.workflow) return;

    if (!this.currentFile) {
      txtMainAction.textContent = 'Seleccionar PDF';
      mainActionBtn.disabled = true;
      if (iconMainAction) iconMainAction.setAttribute('href', '/icons.svg#upload_file');
      if (sidebarResetBtn) sidebarResetBtn.style.display = 'none';
      return;
    }

    if (this.completedResult) {
      mainActionBtn.style.display = 'none';
      if (sidebarResetBtn) sidebarResetBtn.style.display = 'inline-flex';
      return;
    }

    mainActionBtn.style.display = 'inline-flex';
    mainActionBtn.disabled = false;
    if (sidebarResetBtn) sidebarResetBtn.style.display = 'inline-flex';

    const isLastStep = this.currentStepIndex >= this.workflow.steps.length - 1;
    if (isLastStep) {
      const currentStep = this.workflow.steps[this.currentStepIndex];
      const toolDef = WORKFLOW_TOOLS[currentStep.tool];
      if (toolDef?.isTerminal) {
        txtMainAction.textContent = `Finalizar y Convertir a ${toolDef.name.replace('PDF a ', '')}`;
      } else {
        txtMainAction.textContent = `Finalizar y Descargar ${toolDef?.name || 'PDF'}`;
      }
      if (iconMainAction) iconMainAction.setAttribute('href', '/icons.svg#download');
    } else {
      const nextStep = this.workflow.steps[this.currentStepIndex + 1];
      const nextToolDef = WORKFLOW_TOOLS[nextStep.tool];
      const nextName = nextToolDef ? nextToolDef.name : nextStep.tool;
      txtMainAction.textContent = `Continuar al paso ${this.currentStepIndex + 2}: ${nextName}`;
      if (iconMainAction) iconMainAction.setAttribute('href', '/icons.svg#arrow_forward');
    }
  }

  private async handleFileSelected(file: File): Promise<void> {
    if (this.isProcessing) return;
    this.hideError();

    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    if (!isPdf) {
      this.showError('Por favor selecciona un documento en formato PDF.');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      this.showError('El archivo PDF supera el límite permitido de 50 MB.');
      return;
    }

    this.currentFile = file;
    this.currentStepIndex = 0;
    this.completedResult = null;

    await this.renderActiveStep();
  }

  private async renderActiveStep(): Promise<void> {
    if (!this.workflow || !this.currentFile) return;

    this.renderStepper();
    this.updateMainActionButton();

    const currentStep = this.workflow.steps[this.currentStepIndex];
    if (!currentStep) return;

    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="workflow-dropzone-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="workflow-processing-card"]');
    const organizeCard = this.container.querySelector<HTMLElement>('[data-ref="workflow-organize-card"]');
    const splitCard = this.container.querySelector<HTMLElement>('[data-ref="workflow-split-card"]');
    const overviewCard = this.container.querySelector<HTMLElement>('[data-ref="workflow-overview-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="workflow-result-card"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="workflow-workspace"]');

    if (dropzoneCard) dropzoneCard.style.display = 'none';
    if (processingCard) processingCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'none';

    if (currentStep.tool === 'organize-pdf') {
      if (splitCard) splitCard.style.display = 'none';
      if (overviewCard) overviewCard.style.display = 'none';
      if (organizeCard) organizeCard.style.display = 'block';
      if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');
      await this.setupOrganizeStep();
    } else if (currentStep.tool === 'split-pdf') {
      if (organizeCard) organizeCard.style.display = 'none';
      if (overviewCard) overviewCard.style.display = 'none';
      if (splitCard) splitCard.style.display = 'block';
      if (workspace) workspace.classList.add('tool-layout__workspace--top-aligned');
      await this.setupSplitStep();
    } else {
      if (organizeCard) organizeCard.style.display = 'none';
      if (splitCard) splitCard.style.display = 'none';
      if (overviewCard) overviewCard.style.display = 'block';
      if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
      this.setupOverviewStep(currentStep);
    }
  }

  private async setupOrganizeStep(): Promise<void> {
    if (!this.currentFile) return;

    const countBadge = this.container.querySelector<HTMLElement>('[data-ref="workflow-organize-count"]');
    const grid = this.container.querySelector<HTMLElement>('[data-ref="workflow-organize-grid"]');

    try {
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await this.currentFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({
        cMapPacked: true,
        cMapUrl: '/vendor/pdfjs/cmaps/',
        data: new Uint8Array(arrayBuffer),
        standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
      });
      this.pdfDocument = await loadingTask.promise;
      const count = this.pdfDocument.numPages || 1;

      this.organizePages = Array.from({ length: count }, (_, i) => ({
        id: `page-${Date.now()}-${i + 1}`,
        originalIndex: i,
        pageNum: i + 1,
        rotation: 0,
      }));
      this.organizeOriginalPages = this.organizePages.map((p) => ({ ...p }));

      if (countBadge) countBadge.textContent = `${count} págs.`;

      this.renderOrganizeGrid();
      this.initSortable();
      this.renderOrganizeSidebarOptions();

      for (const page of this.organizePages) {
        void this.generateOrganizeThumbnail(page);
      }
    } catch {
      this.showError('No se pudo cargar la vista previa del documento para organizar.');
    }
  }

  private renderOrganizeGrid(): void {
    const grid = this.container.querySelector<HTMLElement>('[data-ref="workflow-organize-grid"]');
    if (!grid) return;

    grid.innerHTML = this.organizePages.map((p, index) => {
      const isMoved = p.originalIndex !== index;
      const isRotated = p.rotation !== 0;

      return `
        <div class="organize-page-card" data-page-id="${p.id}" data-page-index="${index}" data-ref="card-${p.id}">
          <div class="organize-page-card__header-actions">
            <span class="organize-page-card__order-badge" data-ref="order-badge-${p.id}">${index + 1}</span>
            <div class="organize-page-card__btns-group">
              <button type="button" class="organize-page-card__btn-action" data-ref="btn-rotate-card" title="Girar 90°" aria-label="Girar 90°">
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#autorenew"></use></svg>
              </button>
              <button type="button" class="organize-page-card__btn-action organize-page-card__btn-action--remove" data-ref="btn-remove-card" title="Quitar página" aria-label="Quitar página">
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#close"></use></svg>
              </button>
            </div>
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
            <span class="organize-page-card__page-title">Página ${index + 1}</span>
            ${isMoved ? `<span class="organize-page-card__orig-sub">(orig. ${p.originalIndex + 1})</span>` : ''}
            ${isRotated ? `<span class="organize-page-card__rotation-badge" data-ref="rot-badge-${p.id}">+${p.rotation}°</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    renderIcons(grid);
  }

  private async generateOrganizeThumbnail(item: OrganizePageItem): Promise<void> {
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
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        item.thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.85);

        const sheet = this.container.querySelector<HTMLElement>(`[data-ref="sheet-${item.id}"]`);
        if (sheet) {
          sheet.innerHTML = `<img class="organize-page-card__canvas" data-ref="img-${item.id}" src="${item.thumbnailDataUrl}" alt="Página ${item.pageNum}" style="${item.rotation !== 0 ? `transform: rotate(${item.rotation}deg);` : ''}" />`;
        }
      }
    } catch {}
  }

  private initSortable(): void {
    const grid = this.container.querySelector<HTMLElement>('[data-ref="workflow-organize-grid"]');
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
          const [movedItem] = this.organizePages.splice(evt.oldIndex, 1);
          if (movedItem) {
            this.organizePages.splice(evt.newIndex, 0, movedItem);
          }
          this.refreshOrganizeCardBadges();
          this.renderOrganizeSidebarOptions();
        }
      },
    });
  }

  private refreshOrganizeCardBadges(): void {
    this.organizePages.forEach((p, index) => {
      const orderBadge = this.container.querySelector<HTMLElement>(`[data-ref="order-badge-${p.id}"]`);
      if (orderBadge) {
        orderBadge.textContent = `${index + 1}`;
      }
      const card = this.container.querySelector<HTMLElement>(`[data-ref="card-${p.id}"]`);
      if (card) {
        card.setAttribute('data-page-index', `${index}`);
        const pageTitle = card.querySelector<HTMLElement>('.organize-page-card__page-title');
        if (pageTitle) {
          pageTitle.textContent = `Página ${index + 1}`;
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

  private rotateOrganizePage(pageId: string): void {
    const item = this.organizePages.find((p) => p.id === pageId);
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

    this.renderOrganizeSidebarOptions();
  }

  private rotateAllOrganizePages(): void {
    this.organizePages.forEach((p) => {
      this.rotateOrganizePage(p.id);
    });
    showToast('Todas las páginas han sido giradas 90°.', 'info');
  }

  private removeOrganizePage(pageId: string): void {
    if (this.organizePages.length <= 1) {
      this.showError('El documento debe contener al menos una página.');
      return;
    }

    const index = this.organizePages.findIndex((p) => p.id === pageId);
    if (index !== -1) {
      this.organizePages.splice(index, 1);
      this.renderOrganizeGrid();
      this.initSortable();
      this.renderOrganizeSidebarOptions();

      const countBadge = this.container.querySelector<HTMLElement>('[data-ref="workflow-organize-count"]');
      if (countBadge) countBadge.textContent = `${this.organizePages.length} págs.`;
    }
  }

  private resetOrganizeOrder(): void {
    this.organizePages = this.organizeOriginalPages.map((p) => ({ ...p, rotation: 0 }));
    this.renderOrganizeGrid();
    this.initSortable();
    this.renderOrganizeSidebarOptions();
    showToast('Orden original restablecido.', 'info');
  }

  private renderOrganizeSidebarOptions(): void {
    const optionsSection = this.container.querySelector<HTMLElement>('[data-ref="section-active-options"]');
    const optionsBody = this.container.querySelector<HTMLElement>('[data-ref="active-step-body"]');
    const optionsTitle = this.container.querySelector<HTMLElement>('[data-ref="active-step-title"]');

    if (!optionsSection || !optionsBody) return;

    let modified = 0;
    this.organizePages.forEach((p, idx) => {
      if (p.originalIndex !== idx || p.rotation !== 0) modified++;
    });

    optionsSection.style.display = 'flex';
    if (optionsTitle) optionsTitle.textContent = 'Organizar páginas';

    optionsBody.innerHTML = `
      <div class="tool-summary-card" style="padding: 14px; border-radius: var(--radius-lg); background: var(--bg-hover); border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; font-size: 13px;">
          <span style="color: var(--text-secondary);">Páginas totales:</span>
          <strong style="color: var(--text-primary);">${this.organizePages.length}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 13px;">
          <span style="color: var(--text-secondary);">Páginas modificadas:</span>
          <strong style="color: var(--accent, #3b82f6);">${modified}</strong>
        </div>
      </div>
      <p style="font-size: 12px; color: var(--text-secondary); margin-top: 10px; line-height: 1.4;">
        Arrastra las páginas en el área de trabajo para definir el nuevo orden.
      </p>
    `;
  }

  private async setupSplitStep(): Promise<void> {
    if (!this.currentFile) return;

    const countBadge = this.container.querySelector<HTMLElement>('[data-ref="workflow-split-count"]');

    try {
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await this.currentFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({
        cMapPacked: true,
        cMapUrl: '/vendor/pdfjs/cmaps/',
        data: new Uint8Array(arrayBuffer),
        standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
      });
      this.pdfDocument = await loadingTask.promise;
      const count = this.pdfDocument.numPages || 1;

      this.splitPages = Array.from({ length: count }, (_, i) => ({
        id: `split-page-${Date.now()}-${i + 1}`,
        originalIndex: i,
        pageNum: i + 1,
        rotation: 0,
      }));

      this.splitSelectedPages = new Set(this.splitPages.map((p) => p.pageNum));
      if (countBadge) countBadge.textContent = `${count} págs.`;

      this.renderSplitGrid();
      this.renderSplitSidebarOptions();

      for (const page of this.splitPages) {
        void this.generateSplitThumbnail(page);
      }
    } catch {
      this.showError('No se pudo cargar la vista previa para dividir el PDF.');
    }
  }

  private renderSplitGrid(): void {
    const grid = this.container.querySelector<HTMLElement>('[data-ref="workflow-split-grid"]');
    if (!grid) return;

    grid.innerHTML = this.splitPages.map((p) => {
      const isSelected = this.splitSelectedPages.has(p.pageNum);

      return `
        <div class="split-page-card ${isSelected ? 'is-selected' : ''}" data-page="${p.pageNum}" data-ref="split-card-${p.pageNum}">
          <div class="split-page-card__order-badge">#${p.pageNum}</div>
          <div class="split-page-card__check-badge">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#check"></use></svg>
          </div>
          <div class="split-page-card__sheet-wrapper">
            <div class="split-page-card__sheet" data-ref="split-sheet-${p.pageNum}">
              ${
                p.thumbnailDataUrl
                  ? `<img class="split-page-card__preview-img" data-ref="img-page-${p.pageNum}" src="${p.thumbnailDataUrl}" alt="Página ${p.pageNum}" />`
                  : `
                    <div class="split-page-card__placeholder">
                      <svg class="component-icon split-page-card__placeholder-icon" aria-hidden="true"><use href="/icons.svg#picture_as_pdf"></use></svg>
                      <span style="font-size: 0.75rem; color: var(--text-tertiary);">${p.pageNum}</span>
                    </div>
                  `
              }
            </div>
          </div>
          <span class="split-page-card__page-num">Página ${p.pageNum}</span>
        </div>
      `;
    }).join('');

    renderIcons(grid);
  }

  private async generateSplitThumbnail(item: OrganizePageItem): Promise<void> {
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
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        item.thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.85);

        const sheet = this.container.querySelector<HTMLElement>(`[data-ref="split-sheet-${item.pageNum}"]`);
        if (sheet) {
          sheet.innerHTML = `<img class="split-page-card__preview-img" data-ref="img-page-${item.pageNum}" src="${item.thumbnailDataUrl}" alt="Página ${item.pageNum}" />`;
        }
      }
    } catch {}
  }

  private toggleSplitPage(pageNum: number): void {
    if (this.splitSelectedPages.has(pageNum)) {
      if (this.splitSelectedPages.size <= 1) {
        this.showError('Debes mantener seleccionada al menos una página.');
        return;
      }
      this.splitSelectedPages.delete(pageNum);
    } else {
      this.splitSelectedPages.add(pageNum);
    }

    const card = this.container.querySelector<HTMLElement>(`[data-ref="split-card-${pageNum}"]`);
    if (card) {
      if (this.splitSelectedPages.has(pageNum)) {
        card.classList.add('is-selected');
      } else {
        card.classList.remove('is-selected');
      }
    }

    this.renderSplitSidebarOptions();
  }

  private renderSplitSidebarOptions(): void {
    const optionsSection = this.container.querySelector<HTMLElement>('[data-ref="section-active-options"]');
    const optionsBody = this.container.querySelector<HTMLElement>('[data-ref="active-step-body"]');
    const optionsTitle = this.container.querySelector<HTMLElement>('[data-ref="active-step-title"]');

    if (!optionsSection || !optionsBody) return;

    optionsSection.style.display = 'flex';
    if (optionsTitle) optionsTitle.textContent = 'Dividir / Extraer';

    optionsBody.innerHTML = `
      <div class="tool-summary-card" style="padding: 14px; border-radius: var(--radius-lg); background: var(--bg-hover); border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; font-size: 13px;">
          <span style="color: var(--text-secondary);">Páginas totales:</span>
          <strong style="color: var(--text-primary);">${this.splitPages.length}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 13px;">
          <span style="color: var(--text-secondary);">Páginas seleccionadas:</span>
          <strong style="color: var(--accent, #3b82f6);">${this.splitSelectedPages.size}</strong>
        </div>
      </div>
      <p style="font-size: 12px; color: var(--text-secondary); margin-top: 10px; line-height: 1.4;">
        Las páginas seleccionadas se extraerán y combinarán para continuar hacia el siguiente paso del flujo.
      </p>
    `;
  }

  private setupOverviewStep(currentStep: WorkflowStep): void {
    if (!this.currentFile) return;

    const toolDef = WORKFLOW_TOOLS[currentStep.tool];
    const iconName = toolDef ? toolDef.icon : 'widgets';
    const toolName = toolDef ? toolDef.name : currentStep.tool;

    const toolIconEl = this.container.querySelector<SVGElement>('[data-ref="overview-tool-icon"] use');
    const toolTitleEl = this.container.querySelector<HTMLElement>('[data-ref="overview-tool-title"]');
    const toolDescEl = this.container.querySelector<HTMLElement>('[data-ref="overview-tool-desc"]');
    const fileNameEl = this.container.querySelector<HTMLElement>('[data-ref="overview-file-name"]');
    const fileMetaEl = this.container.querySelector<HTMLElement>('[data-ref="overview-file-meta"]');

    if (toolIconEl) toolIconEl.setAttribute('href', `/icons.svg#${iconName}`);
    if (toolTitleEl) toolTitleEl.textContent = toolName;
    if (fileNameEl) fileNameEl.textContent = this.currentFile.name;
    if (fileMetaEl) fileMetaEl.textContent = `${formatBytes(this.currentFile.size)}`;

    const optionsSection = this.container.querySelector<HTMLElement>('[data-ref="section-active-options"]');
    const optionsBody = this.container.querySelector<HTMLElement>('[data-ref="active-step-body"]');
    const optionsTitle = this.container.querySelector<HTMLElement>('[data-ref="active-step-title"]');

    if (!optionsSection || !optionsBody) return;

    optionsSection.style.display = 'flex';
    if (optionsTitle) optionsTitle.textContent = toolName;

    if (currentStep.tool === 'compress-pdf') {
      if (toolDescEl) toolDescEl.textContent = 'Reduce el tamaño del documento manteniendo la mejor calidad posible.';
      if (currentStep.options?.level) {
        this.compressLevel = currentStep.options.level;
      }

      optionsBody.innerHTML = `
        <div class="pdf-compress-options" data-ref="compress-options-container">
          <label class="pdf-compress-option ${this.compressLevel === 'extreme' ? 'is-active' : ''}" data-ref="opt-compress-extreme" data-level="extreme">
            <input class="pdf-compress-option__radio" data-ref="radio-compress-extreme" type="radio" name="wf-compress-level" value="extreme" ${this.compressLevel === 'extreme' ? 'checked' : ''} />
            <div class="pdf-compress-option__body">
              <div class="pdf-compress-option__title-row">
                <span class="pdf-compress-option__title">Alta Compresión</span>
                <span class="pdf-compress-option__badge">Menor tamaño</span>
              </div>
              <p class="pdf-compress-option__desc">Máxima reducción de peso (72 DPI). Ideal para enviar por correo o web.</p>
            </div>
          </label>
          <label class="pdf-compress-option ${this.compressLevel === 'recommended' ? 'is-active' : ''}" data-ref="opt-compress-recommended" data-level="recommended">
            <input class="pdf-compress-option__radio" data-ref="radio-compress-recommended" type="radio" name="wf-compress-level" value="recommended" ${this.compressLevel === 'recommended' ? 'checked' : ''} />
            <div class="pdf-compress-option__body">
              <div class="pdf-compress-option__title-row">
                <span class="pdf-compress-option__title">Compresión Recomendada</span>
                <span class="pdf-compress-option__badge">Equilibrada</span>
              </div>
              <p class="pdf-compress-option__desc">Buena compresión conservando alta calidad visual (150 DPI).</p>
            </div>
          </label>
          <label class="pdf-compress-option ${this.compressLevel === 'low' ? 'is-active' : ''}" data-ref="opt-compress-low" data-level="low">
            <input class="pdf-compress-option__radio" data-ref="radio-compress-low" type="radio" name="wf-compress-level" value="low" ${this.compressLevel === 'low' ? 'checked' : ''} />
            <div class="pdf-compress-option__body">
              <div class="pdf-compress-option__title-row">
                <span class="pdf-compress-option__title">Baja Compresión</span>
                <span class="pdf-compress-option__badge">Alta calidad</span>
              </div>
              <p class="pdf-compress-option__desc">Compresión ligera con la máxima calidad y nitidez posibles (300 DPI).</p>
            </div>
          </label>
        </div>
      `;

      optionsBody.querySelectorAll<HTMLElement>('.pdf-compress-option').forEach((optionEl) => {
        optionEl.addEventListener('click', () => {
          const level = optionEl.getAttribute('data-level') as 'extreme' | 'low' | 'recommended';
          if (level && level !== this.compressLevel) {
            this.compressLevel = level;
            optionsBody.querySelectorAll('.pdf-compress-option').forEach((el) => el.classList.remove('is-active'));
            optionEl.classList.add('is-active');
            const radio = optionEl.querySelector<HTMLInputElement>('input[type="radio"]');
            if (radio) radio.checked = true;
          }
        });
      });
    } else if (toolDef?.isTerminal) {
      if (toolDescEl) toolDescEl.textContent = `Paso final: convierte el documento a formato ${toolDef.name.replace('PDF a ', '')} listo para descargar.`;
      optionsBody.innerHTML = `
        <div class="tool-summary-card" style="padding: 14px; border-radius: var(--radius-lg); background: var(--bg-hover); border: 1px solid var(--border-color);">
          <div style="font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Formato de salida</div>
          <div style="font-size: 12px; color: var(--text-secondary);">${toolDef.name} (${toolDef.targetType?.toUpperCase()})</div>
        </div>
      `;
    }
  }

  private async executeCurrentStep(): Promise<void> {
    if (!this.workflow || !this.currentFile || this.isProcessing) return;
    this.hideError();

    const currentStep = this.workflow.steps[this.currentStepIndex];
    if (!currentStep) return;

    const actionBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-main-action"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="workflow-processing-card"]');
    const processingTitle = this.container.querySelector<HTMLElement>('[data-ref="workflow-processing-title"]');
    const processingSubtitle = this.container.querySelector<HTMLElement>('[data-ref="workflow-processing-subtitle"]');
    const organizeCard = this.container.querySelector<HTMLElement>('[data-ref="workflow-organize-card"]');
    const splitCard = this.container.querySelector<HTMLElement>('[data-ref="workflow-split-card"]');
    const overviewCard = this.container.querySelector<HTMLElement>('[data-ref="workflow-overview-card"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="workflow-workspace"]');

    const toolDef = WORKFLOW_TOOLS[currentStep.tool];
    const toolName = toolDef ? toolDef.name : currentStep.tool;

    this.isProcessing = true;
    if (organizeCard) organizeCard.style.display = 'none';
    if (splitCard) splitCard.style.display = 'none';
    if (overviewCard) overviewCard.style.display = 'none';
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
    if (processingCard) processingCard.style.display = 'flex';
    if (processingTitle) processingTitle.textContent = `Procesando paso ${this.currentStepIndex + 1}: ${toolName}...`;
    if (processingSubtitle) processingSubtitle.textContent = 'Aplicando las modificaciones a tu documento';

    await withButtonLoading(actionBtn, async () => {
      try {
        if (currentStep.tool === 'organize-pdf') {
          const pagesOrder = this.organizePages.map((p) => ({
            pageIndex: p.originalIndex,
            rotation: p.rotation,
          }));
          const formData = new FormData();
          formData.append('pdf', this.currentFile as Blob, this.currentFile?.name);
          formData.append('pagesOrder', JSON.stringify(pagesOrder));

          const res = await postFormApi(API_ROUTES.tools.organizePdf.organize, formData);
          const json = await res.json();
          if (!res.ok || !json.success || !json.data?.downloadUrl) {
            throw new Error(json.error || 'Error al ordenar las páginas del documento.');
          }

          this.lastFileToken = json.data.fileId || null;
          const fileRes = await fetch(json.data.downloadUrl);
          const blob = await fileRes.blob();
          this.currentFile = new File([blob], json.data.fileName || this.currentFile?.name || 'documento_organizado.pdf', { type: 'application/pdf' });
        } else if (currentStep.tool === 'split-pdf') {
          const selected = Array.from(this.splitSelectedPages).sort((a, b) => a - b);
          if (selected.length === 0) {
            throw new Error('Debes seleccionar al menos una página para continuar.');
          }
          const optionsPayload = {
            filename: this.currentFile?.name || 'documento_dividido.pdf',
            mergeSelected: true,
            mode: 'pages',
            selectedPages: selected,
            submode: 'custom',
          };
          const formData = new FormData();
          formData.append('pdf', this.currentFile as Blob, this.currentFile?.name);
          formData.append('options', JSON.stringify(optionsPayload));

          const res = await postFormApi(API_ROUTES.tools.splitPdf.split, formData);
          const json = await res.json();
          if (!res.ok || !json.success || !json.data) {
            throw new Error(json.error || 'Error al dividir las páginas del documento.');
          }

          this.lastFileToken = json.data.fileId || null;
          const downloadUrl = json.data.downloadUrl || API_ROUTES.tools.splitPdf.download(json.data.fileId);
          const fileRes = await fetch(downloadUrl);
          const blob = await fileRes.blob();
          this.currentFile = new File([blob], json.data.filename || this.currentFile?.name || 'documento_dividido.pdf', { type: 'application/pdf' });
        } else if (currentStep.tool === 'compress-pdf') {
          const formData = new FormData();
          formData.append('pdf', this.currentFile as Blob, this.currentFile?.name);
          formData.append('level', this.compressLevel);

          const res = await postFormApi(API_ROUTES.tools.compressPdf.compress, formData);
          const json = await res.json();
          if (!res.ok || !json.success || !json.data?.downloadUrl) {
            throw new Error(json.error || 'Error al comprimir el archivo PDF.');
          }

          this.lastFileToken = json.data.fileId || null;
          const fileRes = await fetch(json.data.downloadUrl);
          const blob = await fileRes.blob();
          this.currentFile = new File([blob], json.data.filename || this.currentFile?.name || 'documento_comprimido.pdf', { type: 'application/pdf' });
        } else if (toolDef?.isTerminal) {
          const targetType = toolDef.targetType || 'docx';
          const formData = new FormData();
          formData.append('file', this.currentFile as Blob, this.currentFile?.name);
          formData.append('targetType', targetType);

          const res = await postFormApi(API_ROUTES.tools.pdfConverter.convert, formData);
          const json = await res.json();
          if (!res.ok || !json.success || !json.data?.downloadToken) {
            throw new Error(json.error || 'Error al convertir el documento.');
          }

          this.lastFileToken = json.data.downloadToken || null;
          const downloadUrl = `/api/download/${this.lastFileToken}`;
          const finalFilename = `${this.currentFile?.name.replace(/\.pdf$/i, '') || 'documento'}.${targetType}`;
          this.completedResult = {
            downloadUrl,
            fileSize: this.currentFile?.size || 0,
            filename: finalFilename,
          };
        }

        const isLastStep = this.currentStepIndex >= this.workflow!.steps.length - 1;
        if (isLastStep) {
          if (!this.completedResult && this.currentFile) {
            this.completedResult = {
              downloadUrl: this.lastFileToken ? `/api/download/${this.lastFileToken}` : URL.createObjectURL(this.currentFile),
              fileSize: this.currentFile.size,
              filename: this.currentFile.name,
            };
          }

          const downloadUrl = this.lastFileToken ? `/api/download/${this.lastFileToken}` : this.completedResult!.downloadUrl;
          const downloadPayload = {
            downloadUrl,
            fileSize: this.completedResult!.fileSize,
            filename: this.completedResult!.filename,
            returnText: 'Ejecutar otro flujo',
            returnUrl: `/workflow/${this.workflow!.id}`,
            subtitle: `Se han procesado todas las acciones (${this.workflow!.steps.length} pasos) del flujo "${this.workflow!.name}".`,
            title: '¡Flujo de trabajo completado con éxito!',
            token: this.lastFileToken || undefined,
          };

          sessionStorage.setItem('download_ready_data', JSON.stringify(downloadPayload));
          showToast('¡Flujo completado con éxito!', 'success');
          const targetUrl = this.lastFileToken ? `/download/${this.lastFileToken}` : '/download-ready';
          navigate(targetUrl);
          return;
        } else {
          this.currentStepIndex++;
          showToast(`Paso completado. Continuando con ${WORKFLOW_TOOLS[this.workflow!.steps[this.currentStepIndex].tool]?.name || 'el siguiente paso'}...`, 'info');
          await this.renderActiveStep();
        }
      } catch (err: any) {
        this.showError(err.message || 'Ocurrió un error inesperado al procesar el paso.');
        await this.renderActiveStep();
      } finally {
        this.isProcessing = false;
        if (processingCard) processingCard.style.display = 'none';
      }
    });
  }

  private renderResultState(): void {
    if (!this.completedResult) return;

    const organizeCard = this.container.querySelector<HTMLElement>('[data-ref="workflow-organize-card"]');
    const splitCard = this.container.querySelector<HTMLElement>('[data-ref="workflow-split-card"]');
    const overviewCard = this.container.querySelector<HTMLElement>('[data-ref="workflow-overview-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="workflow-processing-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="workflow-result-card"]');
    const optionsSection = this.container.querySelector<HTMLElement>('[data-ref="section-active-options"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="workflow-workspace"]');

    if (organizeCard) organizeCard.style.display = 'none';
    if (splitCard) splitCard.style.display = 'none';
    if (overviewCard) overviewCard.style.display = 'none';
    if (processingCard) processingCard.style.display = 'none';
    if (optionsSection) optionsSection.style.display = 'none';
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');
    if (resultCard) resultCard.style.display = 'flex';

    const fileNameEl = this.container.querySelector<HTMLElement>('[data-ref="result-file-name"]');
    const stepsCountEl = this.container.querySelector<HTMLElement>('[data-ref="result-steps-count"]');
    const fileSizeEl = this.container.querySelector<HTMLElement>('[data-ref="result-file-size"]');

    if (fileNameEl) fileNameEl.textContent = this.completedResult.filename;
    if (stepsCountEl && this.workflow) stepsCountEl.textContent = `${this.workflow.steps.length} pasos`;
    if (fileSizeEl) fileSizeEl.textContent = formatBytes(this.completedResult.fileSize);

    this.updateMainActionButton();
    renderIcons(this.container);
  }

  private triggerDownload(): void {
    if (!this.completedResult) return;
    const a = document.createElement('a');
    a.href = this.completedResult.downloadUrl;
    a.download = this.completedResult.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast('¡Flujo completado! Descargando archivo...', 'success');
  }

  private resetToInitial(): void {
    this.currentFile = null;
    this.currentStepIndex = 0;
    this.completedResult = null;
    this.isProcessing = false;
    this.organizePages = [];
    this.organizeOriginalPages = [];
    this.splitPages = [];
    this.splitSelectedPages.clear();

    if (this.sortableInstance) {
      this.sortableInstance.destroy();
      this.sortableInstance = null;
    }
    this.pdfDocument = null;

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const dropzoneCard = this.container.querySelector<HTMLElement>('[data-ref="workflow-dropzone-card"]');
    const organizeCard = this.container.querySelector<HTMLElement>('[data-ref="workflow-organize-card"]');
    const splitCard = this.container.querySelector<HTMLElement>('[data-ref="workflow-split-card"]');
    const overviewCard = this.container.querySelector<HTMLElement>('[data-ref="workflow-overview-card"]');
    const processingCard = this.container.querySelector<HTMLElement>('[data-ref="workflow-processing-card"]');
    const resultCard = this.container.querySelector<HTMLElement>('[data-ref="workflow-result-card"]');
    const optionsSection = this.container.querySelector<HTMLElement>('[data-ref="section-active-options"]');
    const workspace = this.container.querySelector<HTMLElement>('[data-ref="workflow-workspace"]');

    if (fileInput) fileInput.value = '';
    if (dropzoneCard) dropzoneCard.style.display = 'flex';
    if (organizeCard) organizeCard.style.display = 'none';
    if (splitCard) splitCard.style.display = 'none';
    if (overviewCard) overviewCard.style.display = 'none';
    if (processingCard) processingCard.style.display = 'none';
    if (resultCard) resultCard.style.display = 'none';
    if (optionsSection) optionsSection.style.display = 'none';
    if (workspace) workspace.classList.remove('tool-layout__workspace--top-aligned');

    this.renderStepper();
    this.updateMainActionButton();
    this.hideError();
  }

  private showError(msg: string): void {
    const banner = this.container.querySelector<HTMLElement>('[data-ref="workflow-error-banner"]');
    if (banner) {
      banner.textContent = msg;
      banner.style.display = 'block';
    }
  }

  private hideError(): void {
    const banner = this.container.querySelector<HTMLElement>('[data-ref="workflow-error-banner"]');
    if (banner) {
      banner.textContent = '';
      banner.style.display = 'none';
    }
  }

  private bindEvents(): void {
    const signal = this.abortController?.signal;

    this.container.querySelector('[data-ref="btn-back-home"]')?.addEventListener(
      'click',
      () => navigate('/'),
      { signal }
    );

    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-pdf-file"]');
    const dropzone = this.container.querySelector<HTMLElement>('[data-ref="workflow-dropzone"]');
    const browseBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-browse-file"]');

    browseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput?.click();
    }, { signal });

    dropzone?.addEventListener('click', () => {
      fileInput?.click();
    }, { signal });

    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) void this.handleFileSelected(file);
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
        if (file) void this.handleFileSelected(file);
      }, { signal });
    }

    const organizeGrid = this.container.querySelector<HTMLElement>('[data-ref="workflow-organize-grid"]');
    organizeGrid?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const rotateBtn = target.closest<HTMLElement>('[data-ref="btn-rotate-card"]');
      const removeBtn = target.closest<HTMLElement>('[data-ref="btn-remove-card"]');
      const card = target.closest<HTMLElement>('[data-page-id]');
      if (!card) return;
      const pageId = card.getAttribute('data-page-id');
      if (!pageId) return;

      if (rotateBtn) {
        e.stopPropagation();
        this.rotateOrganizePage(pageId);
      } else if (removeBtn) {
        e.stopPropagation();
        this.removeOrganizePage(pageId);
      }
    }, { signal });

    this.container.querySelector('[data-ref="btn-organize-rotate-all"]')?.addEventListener(
      'click',
      () => this.rotateAllOrganizePages(),
      { signal }
    );

    this.container.querySelector('[data-ref="btn-organize-reset"]')?.addEventListener(
      'click',
      () => this.resetOrganizeOrder(),
      { signal }
    );

    const splitGrid = this.container.querySelector<HTMLElement>('[data-ref="workflow-split-grid"]');
    splitGrid?.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.split-page-card[data-page]');
      if (!card) return;
      const pageNumStr = card.getAttribute('data-page');
      if (pageNumStr) {
        this.toggleSplitPage(parseInt(pageNumStr, 10));
      }
    }, { signal });

    this.container.querySelector('[data-ref="btn-split-select-all"]')?.addEventListener(
      'click',
      () => {
        this.splitSelectedPages = new Set(this.splitPages.map((p) => p.pageNum));
        this.container.querySelectorAll<HTMLElement>('.split-page-card[data-page]').forEach((el) => {
          el.classList.add('is-selected');
        });
        this.renderSplitSidebarOptions();
      },
      { signal }
    );

    this.container.querySelector('[data-ref="btn-split-deselect-all"]')?.addEventListener(
      'click',
      () => {
        if (this.splitPages.length > 0) {
          const firstPageNum = this.splitPages[0].pageNum;
          this.splitSelectedPages = new Set([firstPageNum]);
          this.container.querySelectorAll<HTMLElement>('.split-page-card[data-page]').forEach((el) => {
            const num = parseInt(el.getAttribute('data-page') || '', 10);
            if (num === firstPageNum) {
              el.classList.add('is-selected');
            } else {
              el.classList.remove('is-selected');
            }
          });
          this.renderSplitSidebarOptions();
        }
      },
      { signal }
    );

    this.container.querySelector('[data-ref="btn-main-action"]')?.addEventListener(
      'click',
      () => void this.executeCurrentStep(),
      { signal }
    );

    this.container.querySelector('[data-ref="btn-sidebar-reset"]')?.addEventListener(
      'click',
      () => this.resetToInitial(),
      { signal }
    );

    this.container.querySelector('[data-ref="btn-download-result"]')?.addEventListener(
      'click',
      () => this.triggerDownload(),
      { signal }
    );

    this.container.querySelector('[data-ref="btn-restart-workflow"]')?.addEventListener(
      'click',
      () => this.resetToInitial(),
      { signal }
    );
  }
}

export async function createWorkflowRunnerView(workflowId: string): Promise<HTMLElement> {
  const container = await loadTemplate('/views/workflow/workflow-runner.html');
  const controller = new WorkflowRunnerController(container, workflowId);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
