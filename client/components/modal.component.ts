import { API_ROUTES } from '../config/api-routes.js';
import { MODAL_2FA_SHIELD_SVG } from '../graphics/modal-illustrations.graphics.js';
import { postApi } from '../services/api.service.js';
import { t, translateElement } from '../services/i18n.service.js';
import { renderIcons } from '../services/icon.service.js';
import { showToast } from '../services/toast.service.js';
import { ModalInstance, ModalOptions } from '../types/common.types.js';

let activeModals: ModalInstance[] = [];
let active2FAModal: any = null;

export function closeAllModals(): void {
  const modalsToClose = [...activeModals];
  for (const modal of modalsToClose) {
    modal.close();
  }
  activeModals = [];
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

  return modalInstance;
}


export async function open2FAModal(options: { onClose?: () => void; onSuccess?: () => void } = {}): Promise<any> {
  const { onClose = null, onSuccess = null } = options;

  if (active2FAModal) {
    active2FAModal.close();
  }

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('data-ref', 'modal-2fa-backdrop');

  backdrop.innerHTML = `
    <div class="modal-container" data-ref="modal-2fa-container">
      <button type="button" class="modal-close-btn" data-ref="btn-modal-close" data-i18n-aria="common.close" aria-label="${t('common.close')}">
        <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#close"></use></svg>
      </button>
      <div class="modal-card modal-card--split" data-ref="modal-card-2fa">
        <div class="modal-card__drag-zone" data-ref="modal-2fa-drag-zone" aria-hidden="true">
          <div class="modal-card__drag-handle"></div>
        </div>
        <div class="modal-split__left" data-ref="modal-split-left">
          <div class="modal-split__stage" data-ref="stage-1-container">
            <div class="modal-split__header" data-ref="stage-1-header">
              <h2 class="modal-split__title" data-ref="stage-1-title" data-i18n="settings.security.two_factor_modal_title">
                ${t('settings.security.two_factor_modal_title')}
              </h2>
              <p class="modal-split__desc" data-ref="stage-1-desc" data-i18n="settings.security.two_factor_modal_desc">
                ${t('settings.security.two_factor_modal_desc')}
              </p>
            </div>

            <div class="modal-split__form" data-ref="stage-1-form">
              <label class="field" data-ref="field-modal-2fa-code">
                <input class="field__input field__input--code" data-ref="input-modal-2fa-code" type="text" maxlength="6" placeholder=" " autocomplete="one-time-code" inputmode="numeric" />
                <span class="field__label" data-ref="label-modal-2fa-code" data-i18n="settings.security.two_factor_modal_code_label">
                  ${t('settings.security.two_factor_modal_code_label')}
                </span>
              </label>

              <button type="button" class="modal-split__link-toggle" data-ref="btn-toggle-secret">
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#key"></use></svg>
                <span data-ref="toggle-secret-text" data-i18n="settings.security.two_factor_view_secret">
                  ${t('settings.security.two_factor_view_secret')}
                </span>
              </button>

              <div class="modal-split__secret-box" data-ref="box-secret-key" style="display: none;">
                <span class="modal-split__secret-value" data-ref="text-secret-value"></span>
                <button type="button" class="modal-split__secret-copy" data-ref="btn-copy-secret" data-tooltip="${t('common.copy') || 'Copiar'}">
                  <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#content_copy"></use></svg>
                </button>
              </div>

              <button type="button" class="component-button component-button--h44 component-button--black component-button--w-full" data-ref="btn-continue-2fa">
                ${t('common.continue')}
              </button>

              <div class="banner banner--danger" data-ref="modal-2fa-error" style="display: none;"></div>
            </div>
          </div>

          <div class="modal-split__stage" data-ref="stage-2-container" style="display: none;">
            <div class="modal-split__header" data-ref="stage-2-header">
              <h2 class="modal-split__title" data-ref="stage-2-title" data-i18n="settings.security.two_factor_backup_title">
                ${t('settings.security.two_factor_backup_title')}
              </h2>
              <p class="modal-split__desc" data-ref="stage-2-desc" data-i18n="settings.security.two_factor_backup_desc">
                ${t('settings.security.two_factor_backup_desc')}
              </p>
            </div>

            <div class="modal-split__backup-section" data-ref="stage-2-codes">
              <div class="backup-codes-grid" data-ref="backup-codes-grid"></div>

              <div class="modal-split__backup-actions" data-ref="stage-2-actions">
                <button type="button" class="component-button component-button--h38" data-ref="btn-copy-backup-codes">
                  <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#content_copy"></use></svg>
                  <span data-ref="btn-copy-text">${t('settings.security.two_factor_copy_all')}</span>
                </button>
                <button type="button" class="component-button component-button--h38 component-button--black" data-ref="btn-finish-2fa">
                  ${t('settings.security.two_factor_finish')}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-split__right" data-ref="modal-split-right">
          <div class="modal-split__visual-stage" data-ref="visual-stage-1">
            <div class="modal-split__qr-wrapper" data-ref="qr-wrapper">
              <div class="modal-split__qr-canvas" data-ref="qr-container"></div>
            </div>
            <div class="modal-split__right-hint" data-ref="qr-hint">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#qr_code_scanner"></use></svg>
              <span data-i18n="settings.security.two_factor_qr_hint">${t('settings.security.two_factor_qr_hint')}</span>
            </div>
          </div>

          <div class="modal-split__visual-stage" data-ref="visual-stage-2" style="display: none;">
            <div class="modal-split__svg-wrapper" data-ref="svg-wrapper">
              ${MODAL_2FA_SHIELD_SVG}
            </div>
            <div class="modal-split__right-status" data-ref="status-badge">
              <span class="modal-split__badge-check">
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#verified_user"></use></svg>
              </span>
              <span class="modal-split__badge-text" data-i18n="settings.security.two_factor_active_badge">
                ${t('settings.security.two_factor_active_badge')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  translateElement(backdrop);
  renderIcons(backdrop);

  const closeBtn = backdrop.querySelector<HTMLElement>('[data-ref="btn-modal-close"]');
  const stage1Container = backdrop.querySelector<HTMLElement>('[data-ref="stage-1-container"]');
  const stage2Container = backdrop.querySelector<HTMLElement>('[data-ref="stage-2-container"]');
  const visualStage1 = backdrop.querySelector<HTMLElement>('[data-ref="visual-stage-1"]');
  const visualStage2 = backdrop.querySelector<HTMLElement>('[data-ref="visual-stage-2"]');
  const qrContainer = backdrop.querySelector<HTMLElement>('[data-ref="qr-container"]');
  const codeInput = backdrop.querySelector<HTMLInputElement>('[data-ref="input-modal-2fa-code"]');
  const continueBtn = backdrop.querySelector<HTMLButtonElement>('[data-ref="btn-continue-2fa"]');
  const errorBanner = backdrop.querySelector<HTMLElement>('[data-ref="modal-2fa-error"]');
  const toggleSecretBtn = backdrop.querySelector<HTMLElement>('[data-ref="btn-toggle-secret"]');
  const secretBox = backdrop.querySelector<HTMLElement>('[data-ref="box-secret-key"]');
  const secretValueEl = backdrop.querySelector<HTMLElement>('[data-ref="text-secret-value"]');
  const copySecretBtn = backdrop.querySelector<HTMLElement>('[data-ref="btn-copy-secret"]');
  const backupCodesGrid = backdrop.querySelector<HTMLElement>('[data-ref="backup-codes-grid"]');
  const copyBackupBtn = backdrop.querySelector<HTMLElement>('[data-ref="btn-copy-backup-codes"]');
  const finishBtn = backdrop.querySelector<HTMLElement>('[data-ref="btn-finish-2fa"]');

  let currentBackupCodes: string[] = [];
  let isClosing = false;

  const showError = (message: string) => {
    if (errorBanner) {
      errorBanner.textContent = message;
      errorBanner.style.display = 'block';
    }
  };

  const clearError = () => {
    if (errorBanner) {
      errorBanner.textContent = '';
      errorBanner.style.display = 'none';
    }
  };

  const setButtonLoading = (btn: HTMLButtonElement | null, isLoading: boolean, loadingText = t('common.loading') || 'Cargando...') => {
    if (!btn) return;
    if (isLoading) {
      btn.disabled = true;
      btn.setAttribute('data-original-text', btn.textContent || '');
      btn.textContent = loadingText;
    } else {
      btn.disabled = false;
      btn.textContent = btn.getAttribute('data-original-text') || t('common.continue');
    }
  };

  const modalInstance = {
    backdrop,
    close() {
      if (isClosing) return;
      isClosing = true;

      backdrop.classList.remove('is-visible');
      document.removeEventListener('keydown', handleKeyDown);
      detach2FAPointerListeners();
      dragZone2fa?.removeEventListener('pointerdown', onPointerDown);
      dragZone2fa?.removeEventListener('lostpointercapture', onPointerUp);

      setTimeout(() => {
        if (backdrop.parentNode) {
          backdrop.parentNode.removeChild(backdrop);
        }
        if (active2FAModal === modalInstance) {
          active2FAModal = null;
        }
        document.body.classList.remove('modal-open');
        if (onClose) onClose();
      }, 200);
    },
  };

  active2FAModal = modalInstance;

  const card2fa = backdrop.querySelector<HTMLElement>('[data-ref="modal-card-2fa"]');
  const dragZone2fa = backdrop.querySelector<HTMLElement>('[data-ref="modal-2fa-drag-zone"]');
  let startY = 0;
  let currentY = 0;
  let startTime = 0;
  let isDragging = false;
  let activePointerId: number | null = null;

  const detach2FAPointerListeners = () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (isClosing || !card2fa) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    isDragging = true;
    activePointerId = e.pointerId;
    startY = e.clientY;
    currentY = startY;
    startTime = performance.now();

    try {
      (dragZone2fa || card2fa).setPointerCapture(activePointerId);
    } catch (_) {}

    card2fa.style.transition = 'none';
    backdrop.style.transition = 'none';

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
    currentY = e.clientY;
    const diff = currentY - startY;

    if (card2fa) {
      if (diff > 0) {
        card2fa.style.transform = `translateY(${diff}px)`;
        const progress = Math.min(diff / 240, 1);
        backdrop.style.opacity = `${Math.max(0.2, 1 - progress * 0.8)}`;
      } else {
        const rubberDiff = Math.max(diff * 0.15, -24);
        card2fa.style.transform = `translateY(${rubberDiff}px)`;
      }
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!isDragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
    isDragging = false;
    detach2FAPointerListeners();

    try {
      if (activePointerId !== null) {
        (dragZone2fa || card2fa)?.releasePointerCapture(activePointerId);
      }
    } catch (_) {}
    activePointerId = null;

    const diff = currentY - startY;
    const elapsed = Math.max(1, performance.now() - startTime);
    const velocity = diff / elapsed;

    if (diff > 80 || (diff > 25 && velocity > 0.45)) {
      modalInstance.close();
    } else {
      backdrop.style.transition = 'opacity 0.25s ease';
      backdrop.style.opacity = '1';
      if (card2fa) {
        card2fa.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
        card2fa.style.transform = '';
      }
    }
  };

  dragZone2fa?.addEventListener('pointerdown', onPointerDown);
  dragZone2fa?.addEventListener('lostpointercapture', onPointerUp);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      modalInstance.close();
    }
  };

  document.addEventListener('keydown', handleKeyDown);

  backdrop.addEventListener('click', (e: MouseEvent) => {
    if (e.target === backdrop) {
      e.preventDefault();
      modalInstance.close();
    }
  });

  closeBtn?.addEventListener('click', (e: MouseEvent) => {
    e.preventDefault();
    modalInstance.close();
  });

  toggleSecretBtn?.addEventListener('click', (e: MouseEvent) => {
    e.preventDefault();
    if (!secretBox) return;
    const isHidden = secretBox.style.display === 'none';
    secretBox.style.display = isHidden ? 'flex' : 'none';
  });

  copySecretBtn?.addEventListener('click', async (e: MouseEvent) => {
    e.preventDefault();
    const secretText = secretValueEl?.textContent || '';
    if (secretText) {
      try {
        await navigator.clipboard.writeText(secretText);
        showToast(t('common.copied') || 'Copiado al portapapeles', 'success');
      } catch (_) {}
    }
  });

  copyBackupBtn?.addEventListener('click', async (e: MouseEvent) => {
    e.preventDefault();
    if (currentBackupCodes.length > 0) {
      const textToCopy = `ProjectAurora - Códigos de Respaldo 2FA:\n\n${currentBackupCodes.join('\n')}\n\nConserva estos códigos en un lugar seguro. Cada código solo se puede usar una vez.`;
      try {
        await navigator.clipboard.writeText(textToCopy);
        showToast(
          t('settings.security.two_factor_copied_toast') ||
            'Códigos de respaldo copiados al portapapeles.',
          'success'
        );
      } catch (_) {
        showToast(t('common.copied') || 'Copiado al portapapeles', 'success');
      }
    }
  });

  finishBtn?.addEventListener('click', (e: MouseEvent) => {
    e.preventDefault();
    modalInstance.close();
    if (onSuccess) {
      onSuccess();
    }
  });

  document.body.appendChild(backdrop);
  document.body.classList.add('modal-open');

  requestAnimationFrame(() => {
    backdrop.classList.add('is-visible');
  });

  try {
    const res = await postApi(API_ROUTES.settings.twoFactorGenerate);
    const data = await res.json();

    if (!res.ok || !data.ok) {
      showError(data.error || t('toasts.generic_error'));
      return modalInstance;
    }

    const { backupCodes, qrUri, secret } = data;
    currentBackupCodes = backupCodes || [];

    if (secretValueEl) {
      secretValueEl.textContent = secret;
    }

    if (qrContainer && qrUri) {
      qrContainer.innerHTML = '';
      void import('qr-code-styling').then(({ default: QRCodeStyling }) => {
        const qrCode = new QRCodeStyling({
          backgroundOptions: {
            color: '#ffffff',
          },
          cornersDotOptions: {
            color: '#000000',
            type: 'dot',
          },
          cornersSquareOptions: {
            color: '#000000',
            type: 'extra-rounded',
          },
          data: qrUri,
          dotsOptions: {
            color: '#000000',
            type: 'rounded',
          },
          height: 200,
          margin: 2,
          type: 'svg',
          width: 200,
        });
        qrCode.append(qrContainer);
      });
    }

    codeInput?.focus();
  } catch (_) {
    showError(t('toasts.network_error'));
  }

  codeInput?.addEventListener('input', () => {
    if (codeInput) {
      codeInput.value = codeInput.value.replace(/[^\d\s-]/g, '').slice(0, 8);
    }
  });

  const handleVerifyStage1 = async () => {
    clearError();
    const rawCode = codeInput?.value || '';
    const code = rawCode.replace(/[\s-]+/g, '').trim();

    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      showError(
        t('settings.security.two_factor_invalid_code') ||
          'Ingresa un código válido de 6 dígitos.'
      );
      return;
    }

    setButtonLoading(continueBtn, true);

    try {
      const res = await postApi(API_ROUTES.settings.twoFactorEnable, { code });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setButtonLoading(continueBtn, false);
        showError(
          data.error ||
            t('settings.security.two_factor_invalid_code') ||
            'Código incorrecto o expirado.'
        );
        return;
      }

      if (data.backupCodes && Array.isArray(data.backupCodes)) {
        currentBackupCodes = data.backupCodes;
      }

      if (backupCodesGrid) {
        backupCodesGrid.innerHTML = '';
        currentBackupCodes.forEach((bCode) => {
          const badge = document.createElement('div');
          badge.className = 'code-badge';
          badge.setAttribute('data-ref', 'code-badge-item');
          badge.textContent = bCode;
          badge.title = t('common.copy') || 'Copiar';
          badge.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(bCode);
              showToast(`${t('common.copied') || 'Copiado'}: ${bCode}`, 'success');
            } catch (_) {}
          });
          backupCodesGrid.appendChild(badge);
        });
      }

      if (stage1Container) stage1Container.style.display = 'none';
      if (visualStage1) visualStage1.style.display = 'none';
      if (stage2Container) stage2Container.style.display = 'flex';
      if (visualStage2) visualStage2.style.display = 'flex';

      showToast(
        t('settings.security.two_factor_enabled_toast') ||
          'Autenticación en dos pasos activada.',
        'success'
      );
    } catch (_) {
      setButtonLoading(continueBtn, false);
      showError(t('toasts.network_error'));
    }
  };

  continueBtn?.addEventListener('click', handleVerifyStage1);

  codeInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleVerifyStage1();
    }
  });

  return modalInstance;
}
