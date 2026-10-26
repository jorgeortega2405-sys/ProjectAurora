import { t, translateElement } from '../services/i18n.service.js';
import { renderIcons } from '../services/icon.service.js';
import { ModalInstance, ModalOptions } from '../types/common.types.js';

let activeModals: ModalInstance[] = [];

export function closeAllModals(): void {
  const modalsToClose = [...activeModals];
  for (const modal of modalsToClose) {
    modal.close();
  }
  activeModals = [];
}

export function setupSheetDragToDismiss(
  dragZone: HTMLElement,
  sheet: HTMLElement,
  backdrop: HTMLElement,
  onClose: () => void
): () => void {
  const existingCleanup = (dragZone as any).__dragCleanup;
  if (typeof existingCleanup === 'function') {
    existingCleanup();
  }

  let startY = 0;
  let currentY = 0;
  let startTime = 0;
  let isDragging = false;
  let activePointerId: number | null = null;

  const detachPointerListeners = () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (window.innerWidth > 768) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    isDragging = true;
    activePointerId = e.pointerId;
    startY = e.clientY;
    currentY = startY;
    startTime = performance.now();

    try {
      (dragZone || sheet).setPointerCapture(activePointerId);
    } catch (_) {}

    sheet.classList.add('is-dragging');
    sheet.style.setProperty('transition', 'none', 'important');

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
    currentY = e.clientY;
    const diff = currentY - startY;

    if (diff > 0) {
      sheet.style.setProperty('transform', `translateY(${diff}px)`, 'important');
    } else {
      sheet.style.setProperty('transform', 'translateY(0)', 'important');
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
    isDragging = false;
    sheet.classList.remove('is-dragging');
    detachPointerListeners();

    try {
      if (activePointerId !== null) {
        (dragZone || sheet)?.releasePointerCapture(activePointerId);
      }
    } catch (_) {}
    activePointerId = null;

    const diff = currentY - startY;
    const elapsed = Math.max(1, performance.now() - startTime);
    const velocity = diff / elapsed;

    const sheetHeight = sheet.offsetHeight || 350;
    const distanceThreshold = Math.min(Math.max(sheetHeight * 0.32, 85), 150);
    const flickThreshold = Math.min(Math.max(sheetHeight * 0.18, 60), 90);
    const shouldDismiss = diff >= distanceThreshold || (diff >= flickThreshold && velocity > 0.55);

    if (shouldDismiss) {
      sheet.style.setProperty('transition', 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)', 'important');
      sheet.style.setProperty('transform', 'translateY(100%)', 'important');
      backdrop.style.setProperty('transition', 'opacity 0.22s ease', 'important');
      backdrop.style.setProperty('opacity', '0', 'important');
      setTimeout(() => {
        sheet.style.removeProperty('transition');
        sheet.style.removeProperty('transform');
        backdrop.style.removeProperty('transition');
        backdrop.style.removeProperty('opacity');
        onClose();
      }, 220);
    } else {
      sheet.style.setProperty('transition', 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)', 'important');
      sheet.style.setProperty('transform', 'translateY(0)', 'important');
      setTimeout(() => {
        sheet.style.removeProperty('transition');
        sheet.style.removeProperty('transform');
      }, 250);
    }
  };

  dragZone.addEventListener('pointerdown', onPointerDown);
  dragZone.addEventListener('lostpointercapture', onPointerUp);

  const cleanup = () => {
    detachPointerListeners();
    dragZone.removeEventListener('pointerdown', onPointerDown);
    dragZone.removeEventListener('lostpointercapture', onPointerUp);
    delete (dragZone as any).__dragCleanup;
  };

  (dragZone as any).__dragCleanup = cleanup;
  return cleanup;
}

export function openModal(options: ModalOptions = {}): ModalInstance {
  let {
    bodyHtml = '',
    cancelText = t('common.cancel'),
    confirmClass = 'component-button--black',
    confirmText = t('common.continue'),
    description = '',
    descriptionKey = '',
    descriptionParams = {},
    onCancel = null,
    onClose = null,
    onConfirm = null,
    showCancel = true,
    showConfirm = true,
    size = 'sm',
    title = '',
    titleKey = '',
  } = options;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('data-ref', 'modal-backdrop');

  const renderedTitle = titleKey ? t(titleKey) : title;
  const renderedDesc = descriptionKey ? t(descriptionKey, descriptionParams) : description;

  backdrop.innerHTML = `
    <div class="modal-container" data-ref="modal-container">
      <button type="button" class="modal-close-btn" data-ref="btn-modal-close" data-i18n-aria="common.close" aria-label="${t('common.close')}">
        <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#close"></use></svg>
      </button>
      <div class="modal-card modal-card--${size}" data-ref="modal-card">
        <div class="modal-card__drag-zone" data-ref="modal-drag-zone" aria-hidden="true">
          <div class="modal-card__drag-handle"></div>
        </div>
        <div class="modal-card__header" data-ref="modal-header">
          <h2 class="modal-card__title" data-ref="modal-title">${renderedTitle}</h2>
          ${renderedDesc ? `<p class="modal-card__desc" data-ref="modal-desc">${renderedDesc}</p>` : ''}
        </div>
        <div class="modal-card__body" data-ref="modal-body"></div>
        <div class="modal-card__footer" data-ref="modal-footer">
          <div class="modal-card__actions" data-ref="modal-actions">
            ${showCancel ? `<button type="button" class="component-button component-button--h34" data-ref="btn-modal-cancel">${cancelText}</button>` : ''}
            ${showConfirm ? `<button type="button" class="component-button component-button--h34 ${confirmClass}" data-ref="btn-modal-confirm">${confirmText}</button>` : ''}
          </div>
          <div class="banner banner--danger" data-ref="modal-error" style="display: none;"></div>
        </div>
      </div>
    </div>
  `;

  const bodyContainer = backdrop.querySelector<HTMLElement>('[data-ref="modal-body"]');
  if (bodyContainer) {
    if (typeof bodyHtml === 'string') {
      bodyContainer.innerHTML = bodyHtml;
    } else if (bodyHtml instanceof HTMLElement) {
      bodyContainer.appendChild(bodyHtml);
    }
  }

  translateElement(backdrop);
  renderIcons(backdrop);

  const card = backdrop.querySelector<HTMLElement>('[data-ref="modal-card"]');
  const closeBtn = backdrop.querySelector<HTMLElement>('[data-ref="btn-modal-close"]');
  const cancelBtn = backdrop.querySelector<HTMLElement>('[data-ref="btn-modal-cancel"]');
  const confirmBtn = backdrop.querySelector<HTMLButtonElement>('[data-ref="btn-modal-confirm"]');
  const errorBanner = backdrop.querySelector<HTMLElement>('[data-ref="modal-error"]');
  const titleEl = backdrop.querySelector<HTMLElement>('[data-ref="modal-title"]');
  const descEl = backdrop.querySelector<HTMLElement>('[data-ref="modal-desc"]');
  const dragZone = backdrop.querySelector<HTMLElement>('[data-ref="modal-drag-zone"]');

  let isClosing = false;

  const modalInstance: ModalInstance = {
    backdrop,
    body: bodyContainer || document.createElement('div'),
    btnCancel: cancelBtn as any,
    btnConfirm: confirmBtn,
    cancelBtn,
    card,
    clearError() {
      if (errorBanner) {
        errorBanner.textContent = '';
        errorBanner.style.display = 'none';
      }
    },
    close() {
      if (isClosing) return;
      isClosing = true;

      backdrop.classList.remove('is-visible');

      document.removeEventListener('keydown', handleKeyDown);

      setTimeout(() => {
        if (backdrop.parentNode) {
          backdrop.parentNode.removeChild(backdrop);
        }
        activeModals = activeModals.filter((m) => m !== modalInstance);
        if (activeModals.length === 0) {
          document.body.classList.remove('modal-open');
        }
        if (onClose) {
          onClose();
        }
      }, 200);
    },
    closeBtn,
    confirmBtn,
    errorBanner,
    setBody(newBody: HTMLElement | string) {
      if (!bodyContainer) return;
      if (typeof newBody === 'string') {
        bodyContainer.innerHTML = newBody;
      } else if (newBody instanceof HTMLElement) {
        bodyContainer.innerHTML = '';
        bodyContainer.appendChild(newBody);
      }
      translateElement(bodyContainer);
      renderIcons(bodyContainer);
    },
    setConfirmLoading(isLoading: boolean, loadingText = t('common.loading') || 'Cargando...') {
      if (!confirmBtn) return;
      if (isLoading) {
        confirmBtn.disabled = true;
        confirmBtn.setAttribute('data-original-text', confirmBtn.textContent || '');
        confirmBtn.textContent = loadingText;
      } else {
        confirmBtn.disabled = false;
        confirmBtn.textContent = confirmBtn.getAttribute('data-original-text') || confirmText;
      }
    },
    setConfirmText(newText: string, newKey = '') {
      const resolved = newKey ? t(newKey) : newText;
      confirmText = resolved;
      if (confirmBtn) {
        confirmBtn.textContent = resolved;
      }
    },
    setConfirmVisible(visible: boolean) {
      if (confirmBtn) {
        confirmBtn.style.display = visible ? '' : 'none';
      }
    },
    setDescription(newDesc: string, newKey = '', params: Record<number | string, number | string> = {}) {
      if (descEl) {
        descEl.innerHTML = newKey ? t(newKey, params) : newDesc;
        descEl.style.display = 'block';
      }
    },
    setOnConfirm(fn: ((inst: ModalInstance) => boolean | Promise<boolean | void> | void) | null) {
      onConfirm = fn;
    },
    setTitle(newTitle: string, newKey = '') {
      if (titleEl) {
        titleEl.textContent = newKey ? t(newKey) : newTitle;
      }
    },
    showError(message: string) {
      if (errorBanner) {
        errorBanner.textContent = message;
        errorBanner.style.display = 'block';
      }
    },
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      modalInstance.close();
    }
  };

  document.addEventListener('keydown', handleKeyDown);

  closeBtn?.addEventListener('click', () => {
    modalInstance.close();
  });

  cancelBtn?.addEventListener('click', () => {
    if (onCancel) {
      onCancel(modalInstance);
    }
    modalInstance.close();
  });

  confirmBtn?.addEventListener('click', async () => {
    if (onConfirm) {
      const shouldClose = await onConfirm(modalInstance);
      if (shouldClose !== false) {
        modalInstance.close();
      }
    } else {
      modalInstance.close();
    }
  });

  backdrop.addEventListener('click', (e: MouseEvent) => {
    if (e.target === backdrop) {
      modalInstance.close();
    }
  });

  document.body.appendChild(backdrop);
  document.body.classList.add('modal-open');
  activeModals.push(modalInstance);

  requestAnimationFrame(() => {
    backdrop.classList.add('is-visible');
    const firstInput = backdrop.querySelector<HTMLInputElement>('input:not([type="hidden"]), select, textarea');
    if (firstInput) {
      firstInput.focus();
    }
  });

  if (dragZone && card) {
    setupSheetDragToDismiss(dragZone, card, backdrop, () => modalInstance.close());
  }

  return modalInstance;
}
