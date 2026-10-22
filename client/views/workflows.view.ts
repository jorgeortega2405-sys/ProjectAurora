import { navigate } from '../app-router.js';
import { openModal } from '../components/modal.component.js';
import { openUpgradeModal } from '../components/upgrade-modal.component.js';
import { getMaxWorkflows } from '../config/tools-limits.config.js';
import { WORKFLOW_TOOLS } from '../config/workflow-tools.config.js';
import { SVG_TOOL_CREATE_WORKFLOW, SVG_TOOL_WORKFLOW } from '../graphics/tool-icons.graphics.js';
import { currentUser, deleteApi, getApi, postApi, putApi } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { UserWorkflow, WorkflowStep } from '../types/workflow.types.js';
import { setupDropdown } from '../utils/dom.util.js';

export class WorkflowsController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private workflows: UserWorkflow[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    if (!currentUser) {
      navigate('/login');
      return;
    }

    await this.loadWorkflows();
    this.renderWorkflows();
    this.bindEvents();

    const params = new URLSearchParams(window.location.search);
    if (params.get('new') === '1') {
      window.history.replaceState({}, '', '/workflows');
      this.openWorkflowModal();
    }
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private async loadWorkflows(): Promise<void> {
    try {
      const res = await getApi('/api/settings/workflows');
      if (res.ok) {
        const data = await res.json();
        this.workflows = Array.isArray(data.workflows) ? data.workflows : [];
      } else {
        this.workflows = [];
      }
    } catch {
      this.workflows = [];
    }
  }

  private renderWorkflows(): void {
    const grid = this.container.querySelector<HTMLElement>('[data-ref="workflows-grid"]');
    if (!grid) return;

    const maxAllowed = getMaxWorkflows(currentUser);
    const count = this.workflows.length;
    const isAtLimit = count >= maxAllowed;

    const createWorkflowCardHtml = `
      <div class="tool-card tool-card--create-workflow" data-ref="card-create-workflow">
        <div class="tool-card__icon-box" data-ref="icon-box-create-workflow">
          ${SVG_TOOL_CREATE_WORKFLOW}
        </div>
        <h3 class="tool-card__title" data-ref="title-create-workflow">Crear flujo de trabajo</h3>
        <p class="tool-card__desc" data-ref="desc-create-workflow">Automatiza tus tareas recurrentes combinando herramientas PDF en un solo paso.</p>
        <div style="align-items: center; display: flex; gap: 8px; margin-top: 10px;">
          <span class="component-badge component-badge--sm${isAtLimit ? ' component-badge--warning' : ''}" data-ref="badge-workflows-limit" style="font-size: 11px;">
            ${count} / ${maxAllowed} flujos guardados
          </span>
        </div>
      </div>
    `;

    const userWorkflowsHtml = this.workflows.map((wf) => {
      const stepNames = wf.steps.map((s) => {
        const tool = WORKFLOW_TOOLS.find((t) => t.id === s.tool);
        return tool ? tool.name : s.tool;
      }).join(' → ');

      return `
        <div class="tool-card tool-card--workflow" data-ref="card-workflow-${wf.id}" data-workflow-id="${wf.id}">
          <div class="tool-card__icon-box" data-ref="icon-box-workflow-${wf.id}">
            ${SVG_TOOL_WORKFLOW}
          </div>
          <div class="tool-card__actions" data-ref="actions-workflow-${wf.id}" style="align-items: center; display: flex; gap: 6px; position: absolute; right: 20px; top: 20px;">
            <span class="component-badge component-badge--sm" data-ref="badge-workflow-${wf.id}" style="font-size: 10.5px;">${wf.steps.length} pasos</span>
            <button type="button" class="component-button component-button--icon-only component-button--ghost component-button--h28" data-ref="btn-edit-wf-${wf.id}" data-id="${wf.id}" data-tooltip="Editar flujo" aria-label="Editar flujo">
              <svg class="component-icon" style="height: 14px; width: 14px;" aria-hidden="true"><use href="/icons.svg#edit"></use></svg>
            </button>
            <button type="button" class="component-button component-button--icon-only component-button--ghost component-button--danger component-button--h28" data-ref="btn-delete-wf-${wf.id}" data-id="${wf.id}" data-tooltip="Eliminar flujo" aria-label="Eliminar flujo">
              <svg class="component-icon" style="height: 14px; width: 14px;" aria-hidden="true"><use href="/icons.svg#delete"></use></svg>
            </button>
          </div>
          <h3 class="tool-card__title" data-ref="title-workflow-${wf.id}">${this.escape(wf.name)}</h3>
          <p class="tool-card__desc" data-ref="desc-workflow-${wf.id}">${this.escape(stepNames || 'Flujo de trabajo personalizado')}</p>
        </div>
      `;
    }).join('');

    grid.innerHTML = createWorkflowCardHtml + userWorkflowsHtml;
    renderIcons(grid);
  }

  private bindEvents(): void {
    const grid = this.container.querySelector<HTMLElement>('[data-ref="workflows-grid"]');
    grid?.addEventListener(
      'click',
      (e) => {
        const target = e.target as HTMLElement;

        const btnEdit = target.closest<HTMLElement>('[data-ref^="btn-edit-wf-"]');
        if (btnEdit) {
          e.preventDefault();
          e.stopPropagation();
          const id = btnEdit.getAttribute('data-id');
          const wf = this.workflows.find((w) => w.id === id);
          if (wf) this.openWorkflowModal(wf);
          return;
        }

        const btnDelete = target.closest<HTMLElement>('[data-ref^="btn-delete-wf-"]');
        if (btnDelete) {
          e.preventDefault();
          e.stopPropagation();
          const id = btnDelete.getAttribute('data-id');
          const wf = this.workflows.find((w) => w.id === id);
          if (wf) void this.confirmDeleteWorkflow(wf);
          return;
        }

        const createCard = target.closest<HTMLElement>('[data-ref="card-create-workflow"]');
        if (createCard) {
          e.preventDefault();
          const maxAllowed = getMaxWorkflows(currentUser);
          if (this.workflows.length >= maxAllowed) {
            showToast(`Has alcanzado el límite de ${maxAllowed} flujo${maxAllowed === 1 ? '' : 's'} de trabajo de tu plan actual.`, 'warning');
            openUpgradeModal();
            return;
          }
          this.openWorkflowModal();
          return;
        }

        const workflowCard = target.closest<HTMLElement>('[data-workflow-id]');
        if (workflowCard) {
          e.preventDefault();
          const wfId = workflowCard.getAttribute('data-workflow-id');
          if (wfId) {
            navigate(`/workflow/${wfId}`);
          }
        }
      },
      { signal: this.abortController?.signal }
    );
  }

  private openWorkflowModal(workflow?: UserWorkflow): void {
    if (!workflow) {
      const maxAllowed = getMaxWorkflows(currentUser);
      if (this.workflows.length >= maxAllowed) {
        showToast(`Has alcanzado el límite de ${maxAllowed} flujo${maxAllowed === 1 ? '' : 's'} de trabajo de tu plan actual.`, 'warning');
        openUpgradeModal();
        return;
      }
    }

    let currentSteps: WorkflowStep[] = workflow && Array.isArray(workflow.steps) ? [...workflow.steps] : [];
    let selectedToolId = '';
    let selectedCompressLevel = 'recommended';
    let selectedSplitMode = 'pages';
    let activeSubDropdownCtrls: Array<{ destroy: () => void }> = [];

    const toolsItemsHtml = WORKFLOW_TOOLS.map((t) => `
      <button type="button" class="menu-item" data-ref="opt-tool-${t.id}" data-value="${t.id}">
        <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#${t.icon}"></use></svg>
        <span class="menu-item__text">${t.name}</span>
      </button>
    `).join('');

    const modalBody = document.createElement('div');
    modalBody.className = 'workflow-modal-builder';
    modalBody.setAttribute('data-ref', 'workflow-modal-builder');
    modalBody.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';

    modalBody.innerHTML = `
      <label class="field" data-ref="field-workflow-name">
        <input class="field__input" data-ref="input-workflow-name" type="text" placeholder=" " value="${workflow ? this.escape(workflow.name) : ''}" autocomplete="off" />
        <span class="field__label" data-ref="label-workflow-name">Nombre del flujo de trabajo</span>
      </label>

      <div style="background: var(--bg-hover); border: 1px solid var(--border-color); border-radius: var(--radius-lg, 12px); padding: 14px;">
        <span style="color: var(--text-primary); display: block; font-size: 13px; font-weight: 600; margin-bottom: 8px;">Añadir herramienta al flujo</span>

        <div class="dropdown-wrapper dropdown-wrapper--full" data-ref="dropdown-wrapper-workflow-tool" style="margin-bottom: 10px;">
          <button type="button" class="dropdown-trigger dropdown-trigger--full" data-ref="btn-trigger-workflow-tool" aria-label="Seleccionar herramienta">
            <div class="dropdown-trigger__left" data-ref="dropdown-trigger-left-workflow-tool">
              <svg class="component-icon dropdown-trigger__icon" data-ref="icon-selected-tool" aria-hidden="true" style="display: none;"><use href="/icons.svg#widgets"></use></svg>
              <span class="dropdown-trigger__text" data-ref="txt-selected-tool">Selecciona una herramienta...</span>
            </div>
            <svg class="component-icon dropdown-trigger__chevron" aria-hidden="true"><use href="/icons.svg#expand_more"></use></svg>
          </button>
          <div class="dropdown-backdrop" data-ref="backdrop-workflow-tool">
            <div class="menu-panel menu-panel--dropdown menu-panel--w-full menu-panel--h-auto" data-ref="menu-workflow-tool">
              <div class="menu-panel__drag-zone" data-ref="drag-zone-workflow-tool" aria-hidden="true">
                <div class="menu-panel__drag-handle"></div>
              </div>
              <div class="menu-panel__list menu-panel__list--scrollable" data-ref="list-workflow-tool" style="max-height: 220px; overflow-y: auto;">
                ${toolsItemsHtml}
              </div>
            </div>
          </div>
        </div>

        <div class="workflow-tool-options" data-ref="workflow-tool-options" style="display: none; margin-bottom: 10px;"></div>

        <button type="button" class="component-button component-button--secondary component-button--h36" data-ref="btn-modal-add-step" style="gap: 6px; justify-content: center; width: 100%;">
          <svg class="component-icon" style="height: 16px; width: 16px;" aria-hidden="true"><use href="/icons.svg#add"></use></svg>
          <span>Añadir paso a la secuencia</span>
        </button>
      </div>

      <div>
        <div style="align-items: center; display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span style="color: var(--text-primary); font-size: 13px; font-weight: 600;">Secuencia de pasos (<span data-ref="txt-steps-count">${currentSteps.length}</span>)</span>
          <button type="button" class="component-button component-button--ghost component-button--danger" data-ref="btn-modal-clear-steps" style="font-size: 12px; padding: 2px 6px;">Borrar todo</button>
        </div>

        <div class="pipeline-steps-list" data-ref="modal-pipeline-steps-list" style="display: flex; flex-direction: column; gap: 8px; max-height: 200px; overflow-y: auto; padding-right: 4px;"></div>

        <div class="banner banner--danger pipeline-terminal-alert" data-ref="modal-terminal-alert" style="display: none; font-size: 12.5px; margin-top: 10px;">
          <svg class="component-icon" style="color: var(--danger, #ef4444); flex-shrink: 0;" aria-hidden="true"><use href="/icons.svg#block"></use></svg>
          <span>No es posible añadir más herramientas después de este paso de conversión final.</span>
        </div>
      </div>
    `;

    const toolDropdownWrapper = modalBody.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-workflow-tool"]');
    const toolTriggerBtn = modalBody.querySelector<HTMLButtonElement>('[data-ref="btn-trigger-workflow-tool"]');
    const toolTriggerText = modalBody.querySelector<HTMLElement>('[data-ref="txt-selected-tool"]');
    const toolTriggerIcon = modalBody.querySelector<SVGElement>('[data-ref="icon-selected-tool"]');
    const optionsBox = modalBody.querySelector<HTMLElement>('[data-ref="workflow-tool-options"]');
    const btnAddStep = modalBody.querySelector<HTMLButtonElement>('[data-ref="btn-modal-add-step"]');
    const stepsListEl = modalBody.querySelector<HTMLElement>('[data-ref="modal-pipeline-steps-list"]');
    const stepsCountEl = modalBody.querySelector<HTMLElement>('[data-ref="txt-steps-count"]');
    const terminalAlertEl = modalBody.querySelector<HTMLElement>('[data-ref="modal-terminal-alert"]');
    const btnClearSteps = modalBody.querySelector<HTMLButtonElement>('[data-ref="btn-modal-clear-steps"]');

    const updateToolOptions = (toolId: string) => {
      if (!optionsBox) return;

      activeSubDropdownCtrls.forEach((c) => c.destroy());
      activeSubDropdownCtrls = [];

      if (toolId === 'compress-pdf') {
        selectedCompressLevel = 'recommended';
        optionsBox.style.display = 'block';
        optionsBox.innerHTML = `
          <div class="dropdown-wrapper dropdown-wrapper--full" data-ref="dropdown-wrapper-compress-level">
            <button type="button" class="dropdown-trigger dropdown-trigger--full dropdown-trigger--sm" data-ref="btn-trigger-compress-level" aria-label="Nivel de compresión">
              <div class="dropdown-trigger__left" data-ref="dropdown-trigger-left-compress-level">
                <span class="dropdown-trigger__text" data-ref="txt-selected-compress-level">Nivel: Recomendado (Buena calidad y tamaño)</span>
              </div>
              <svg class="component-icon dropdown-trigger__chevron" aria-hidden="true"><use href="/icons.svg#expand_more"></use></svg>
            </button>
            <div class="dropdown-backdrop" data-ref="backdrop-compress-level">
              <div class="menu-panel menu-panel--dropdown menu-panel--w-full menu-panel--h-auto" data-ref="menu-compress-level">
                <div class="menu-panel__list" data-ref="list-compress-level">
                  <button type="button" class="menu-item is-active" data-ref="opt-compress-recommended" data-value="recommended">
                    <span class="menu-item__text">Nivel: Recomendado (Buena calidad y tamaño)</span>
                  </button>
                  <button type="button" class="menu-item" data-ref="opt-compress-extreme" data-value="extreme">
                    <span class="menu-item__text">Nivel: Extremo (Máxima compresión, menor calidad)</span>
                  </button>
                  <button type="button" class="menu-item" data-ref="opt-compress-low" data-value="low">
                    <span class="menu-item__text">Nivel: Bajo (Alta calidad, compresión ligera)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
        const wrapper = optionsBox.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-compress-level"]');
        if (wrapper) {
          const ctrl = setupDropdown(wrapper, {
            onSelect: (val: string) => {
              selectedCompressLevel = val || 'recommended';
            },
          });
          activeSubDropdownCtrls.push(ctrl);
        }
      } else if (toolId === 'split-pdf') {
        selectedSplitMode = 'pages';
        optionsBox.style.display = 'block';
        optionsBox.innerHTML = `
          <div class="dropdown-wrapper dropdown-wrapper--full" data-ref="dropdown-wrapper-split-mode">
            <button type="button" class="dropdown-trigger dropdown-trigger--full dropdown-trigger--sm" data-ref="btn-trigger-split-mode" aria-label="Modo de división">
              <div class="dropdown-trigger__left" data-ref="dropdown-trigger-left-split-mode">
                <span class="dropdown-trigger__text" data-ref="txt-selected-split-mode">Modo: Extraer páginas interactivamente</span>
              </div>
              <svg class="component-icon dropdown-trigger__chevron" aria-hidden="true"><use href="/icons.svg#expand_more"></use></svg>
            </button>
            <div class="dropdown-backdrop" data-ref="backdrop-split-mode">
              <div class="menu-panel menu-panel--dropdown menu-panel--w-full menu-panel--h-auto" data-ref="menu-split-mode">
                <div class="menu-panel__list" data-ref="list-split-mode">
                  <button type="button" class="menu-item is-active" data-ref="opt-split-pages" data-value="pages">
                    <span class="menu-item__text">Modo: Extraer páginas interactivamente</span>
                  </button>
                  <button type="button" class="menu-item" data-ref="opt-split-range" data-value="range">
                    <span class="menu-item__text">Modo: Dividir por rango de páginas</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
        const wrapper = optionsBox.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-split-mode"]');
        if (wrapper) {
          const ctrl = setupDropdown(wrapper, {
            onSelect: (val: string) => {
              selectedSplitMode = val || 'pages';
            },
          });
          activeSubDropdownCtrls.push(ctrl);
        }
      } else if (toolId === 'organize-pdf') {
        optionsBox.style.display = 'block';
        optionsBox.innerHTML = `
          <p class="tool-options-hint" data-ref="txt-organize-hint" style="color: var(--text-secondary); font-size: 12px; line-height: 1.4; margin: 0;">
            Durante la ejecución podrás reordenar, rotar o eliminar páginas visualmente.
          </p>
        `;
      } else {
        const toolDef = WORKFLOW_TOOLS.find((t) => t.id === toolId);
        if (toolDef?.isTerminal) {
          optionsBox.style.display = 'block';
          optionsBox.innerHTML = `
            <p class="tool-options-hint" data-ref="txt-terminal-hint" style="color: var(--text-secondary); font-size: 12px; line-height: 1.4; margin: 0;">
              Paso final: genera el documento convertido para descarga directa.
            </p>
          `;
        } else {
          optionsBox.style.display = 'none';
          optionsBox.innerHTML = '';
        }
      }
    };

    const resetToolSelection = () => {
      selectedToolId = '';
      if (toolTriggerText) {
        toolTriggerText.textContent = 'Selecciona una herramienta...';
      }
      if (toolTriggerIcon) {
        toolTriggerIcon.style.display = 'none';
      }
      toolDropdownWrapper?.querySelectorAll<HTMLElement>('.menu-item').forEach((item) => {
        item.classList.remove('is-active');
      });
      updateToolOptions('');
    };

    const toolDropdownCtrl = setupDropdown(toolDropdownWrapper, {
      onSelect: (toolId: string) => {
        selectedToolId = toolId;
        if (toolTriggerIcon) {
          toolTriggerIcon.style.display = '';
        }
        updateToolOptions(toolId);
      },
    });

    const hasTerminal = () => currentSteps.some((s) => {
      const def = WORKFLOW_TOOLS.find((t) => t.id === s.tool);
      return Boolean(def?.isTerminal);
    });

    const renderPipelineSteps = () => {
      if (!stepsListEl || !stepsCountEl) return;
      stepsCountEl.textContent = String(currentSteps.length);

      if (currentSteps.length === 0) {
        stepsListEl.innerHTML = `
          <div style="border: 1px dashed var(--border-color); border-radius: var(--radius-md, 8px); color: var(--text-tertiary); font-size: 12.5px; padding: 24px 16px; text-align: center;">
            Añade al menos una herramienta para construir la secuencia del flujo.
          </div>
        `;
        if (terminalAlertEl) terminalAlertEl.style.display = 'none';
        if (btnAddStep) btnAddStep.disabled = false;
        if (toolTriggerBtn) toolTriggerBtn.disabled = false;
        return;
      }

      stepsListEl.innerHTML = currentSteps.map((step, idx) => {
        const toolDef = WORKFLOW_TOOLS.find((t) => t.id === step.tool);
        const name = toolDef ? toolDef.name : step.tool;
        const icon = toolDef ? toolDef.icon : 'widgets';

        let optionDesc = '';
        if (step.tool === 'compress-pdf') {
          const lvl = step.options.level === 'extreme' ? 'Extremo' : (step.options.level === 'low' ? 'Bajo' : 'Recomendado');
          optionDesc = `Nivel: ${lvl}`;
        } else if (step.tool === 'split-pdf') {
          optionDesc = step.options.mode === 'range' ? 'Modo: Por rangos' : 'Modo: Extraer páginas';
        } else if (step.tool === 'organize-pdf') {
          optionDesc = 'Edición interactiva';
        } else if (toolDef?.isTerminal) {
          optionDesc = 'Conversión final';
        }

        return `
          <div class="pipeline-step-item" data-ref="step-item-${step.id}">
            <div style="align-items: center; display: flex; gap: 10px;">
              <div style="align-items: center; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 50%; color: var(--text-primary); display: flex; flex-shrink: 0; font-size: 11px; font-weight: 700; height: 22px; justify-content: center; width: 22px;">
                ${idx + 1}
              </div>
              <svg class="component-icon" style="color: var(--text-secondary); height: 18px; width: 18px;" aria-hidden="true"><use href="/icons.svg#${icon}"></use></svg>
              <div>
                <div style="color: var(--text-primary); font-size: 13px; font-weight: 600;">${name}</div>
                ${optionDesc ? `<div style="color: var(--text-secondary); font-size: 11px; margin-top: 1px;">${optionDesc}</div>` : ''}
              </div>
            </div>
            <button type="button" class="component-button component-button--icon-only component-button--ghost component-button--danger component-button--h28" data-ref="btn-modal-remove-step-${step.id}" data-id="${step.id}" aria-label="Eliminar paso">
              <svg class="component-icon" style="height: 14px; width: 14px;" aria-hidden="true"><use href="/icons.svg#delete"></use></svg>
            </button>
          </div>
        `;
      }).join('');

      renderIcons(stepsListEl);

      const terminal = hasTerminal();
      if (terminalAlertEl) terminalAlertEl.style.display = terminal ? 'flex' : 'none';
      if (btnAddStep) btnAddStep.disabled = terminal;
      if (toolTriggerBtn) toolTriggerBtn.disabled = terminal;
    };

    btnAddStep?.addEventListener('click', () => {
      if (hasTerminal()) {
        showToast('No es posible añadir herramientas después de un paso de conversión final.', 'warning');
        return;
      }

      if (!selectedToolId) {
        showToast('Por favor selecciona una herramienta para añadir.', 'warning');
        return;
      }

      const options: Record<string, any> = {};
      if (selectedToolId === 'compress-pdf') {
        options.level = selectedCompressLevel;
      } else if (selectedToolId === 'split-pdf') {
        options.mode = selectedSplitMode;
      }

      currentSteps.push({
        id: crypto.randomUUID(),
        options,
        tool: selectedToolId,
      });

      resetToolSelection();
      renderPipelineSteps();
    });

    stepsListEl?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-ref^="btn-modal-remove-step-"]');
      if (btn) {
        const stepId = btn.getAttribute('data-id');
        if (stepId) {
          currentSteps = currentSteps.filter((s) => s.id !== stepId);
          renderPipelineSteps();
        }
      }
    });

    btnClearSteps?.addEventListener('click', () => {
      currentSteps = [];
      resetToolSelection();
      renderPipelineSteps();
    });

    renderPipelineSteps();

    openModal({
      bodyHtml: modalBody,
      cancelText: 'Cancelar',
      confirmClass: 'component-button--primary component-button--black',
      confirmText: workflow ? 'Guardar cambios' : 'Crear flujo',
      description: 'Configura las herramientas y el orden de ejecución para automatizar tu proceso.',
      onClose: () => {
        toolDropdownCtrl?.destroy();
        activeSubDropdownCtrls.forEach((c) => c.destroy());
        activeSubDropdownCtrls = [];
      },
      onConfirm: async (inst) => {
        inst.clearError();
        const nameInput = modalBody.querySelector<HTMLInputElement>('[data-ref="input-workflow-name"]');
        const name = nameInput?.value.trim() || '';

        if (!name) {
          inst.showError('Por favor ingresa un nombre para el flujo de trabajo.');
          return false;
        }

        if (currentSteps.length === 0) {
          inst.showError('Debes añadir al menos una herramienta a la secuencia.');
          return false;
        }

        inst.setConfirmLoading(true, 'Guardando...');

        try {
          const payload = {
            category: 'pdf',
            name,
            steps: currentSteps,
          };

          const res = workflow
            ? await putApi(`/api/settings/workflows/${workflow.id}`, payload)
            : await postApi('/api/settings/workflows', payload);

          if (res.ok) {
            showToast(workflow ? 'Flujo de trabajo actualizado exitosamente' : 'Flujo de trabajo creado exitosamente', 'success');
            await this.loadWorkflows();
            this.renderWorkflows();
            window.dispatchEvent(new CustomEvent('workflow:changed'));
            return true;
          }

          const errData = await res.json().catch(() => ({}));
          if (res.status === 403 && errData.code === 'WORKFLOW_LIMIT_REACHED') {
            inst.close();
            showToast(errData.error || 'Has alcanzado el límite de tu plan actual.', 'warning');
            openUpgradeModal();
            return false;
          }

          inst.showError(errData.error || 'Ocurrió un error al guardar el flujo de trabajo.');
          inst.setConfirmLoading(false);
          return false;
        } catch {
          inst.showError('Error de conexión al guardar el flujo de trabajo.');
          inst.setConfirmLoading(false);
          return false;
        }
      },
      showCancel: true,
      showConfirm: true,
      size: 'workflow-builder',
      title: workflow ? 'Editar flujo de trabajo' : 'Crear flujo de trabajo',
    });
  }

  private async confirmDeleteWorkflow(workflow: UserWorkflow): Promise<void> {
    openModal({
      cancelText: 'Cancelar',
      confirmClass: 'component-button--danger',
      confirmText: 'Eliminar flujo',
      description: `¿Estás seguro de que deseas eliminar permanentemente el flujo de trabajo "${workflow.name}"? Esta acción no se puede deshacer.`,
      onConfirm: async (inst) => {
        inst.setConfirmLoading(true, 'Eliminando...');
        try {
          const res = await deleteApi(`/api/settings/workflows/${workflow.id}`);
          if (res.ok) {
            showToast('Flujo de trabajo eliminado exitosamente', 'success');
            await this.loadWorkflows();
            this.renderWorkflows();
            window.dispatchEvent(new CustomEvent('workflow:changed'));
            return true;
          }
          showToast('No se pudo eliminar el flujo de trabajo', 'danger');
          inst.setConfirmLoading(false);
          return false;
        } catch {
          showToast('Error de conexión al eliminar el flujo', 'danger');
          inst.setConfirmLoading(false);
          return false;
        }
      },
      showCancel: true,
      showConfirm: true,
      size: 'sm',
      title: 'Eliminar flujo de trabajo',
    });
  }

  private escape(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export async function createWorkflowsPageView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/workflows/workflows.html');
  const controller = new WorkflowsController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
