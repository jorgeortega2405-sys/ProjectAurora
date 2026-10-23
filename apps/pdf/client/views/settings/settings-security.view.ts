import { open2FAModal, openModal } from '../../components/modal.component.js';
import { API_ROUTES } from '../../config/api-routes.js';
import { clearUserState, currentUser, getApi, hasPermission, logoutAllApi, postApi, setCurrentUser, setLinkedAccounts } from '../../services/api.service.js';
import { t } from '../../services/i18n.service.js';
import { navigate } from '../../services/navigation.service.js';
import { loadTemplate } from '../../services/template.service.js';
import { showToast } from '../../services/toast.service.js';
import { ModalInstance, ViewController } from '../../types/common.types.js';
import { setupPasswordToggle } from '../../utils/dom.util.js';
import { validatePassword } from '../../utils/validators.util.js';

export class SecuritySettingsController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const isProtected = !hasPermission(currentUser, 'account:edit_security');
    const protectedBanner = this.container.querySelector<HTMLElement>('[data-ref="protected-account-banner"]');
    if (isProtected && protectedBanner) {
      protectedBanner.style.display = 'flex';
    }

    const btnChangePassword = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-change-password"]');
    const btnConfigure2fa = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-configure-2fa"]');
    const btnLogoutAllDevices = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-logout-all-devices"]');

    if (isProtected) {
      if (btnChangePassword) btnChangePassword.style.display = 'none';
      if (btnConfigure2fa) btnConfigure2fa.style.display = 'none';
      if (btnLogoutAllDevices) btnLogoutAllDevices.style.display = 'none';
      const dangerGroup = this.container.querySelector<HTMLElement>('[data-ref="group-danger-zone"]');
      if (dangerGroup) dangerGroup.style.display = 'none';
    }

    let is2faEnabled = Boolean(currentUser?.two_factor_enabled);

    const update2FAButtonUi = (enabled: boolean) => {
      is2faEnabled = enabled;
      if (!btnConfigure2fa) return;
      if (enabled) {
        btnConfigure2fa.textContent = t('settings.security.btn_disable_2fa', 'Desactivar');
        btnConfigure2fa.className = 'component-button component-button--h34 component-button--danger';
      } else {
        btnConfigure2fa.textContent = t('settings.security.btn_configure_2fa', 'Configurar');
        btnConfigure2fa.className = 'component-button component-button--h34 component-button--black';
      }
    };

    try {
      getApi(API_ROUTES.settings.twoFactorStatus)
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            update2FAButtonUi(Boolean(data.enabled));
          }
        })
        .catch(() => {});
    } catch (_) {}

    btnConfigure2fa?.addEventListener('click', () => {
      if (is2faEnabled) {
        const modal = openModal({
          bodyHtml: `
            <label class="field" data-ref="field-disable-2fa-password" style="margin-top: 16px;">
              <input class="field__input" data-ref="input-disable-2fa-password" type="password" placeholder=" " autocomplete="current-password" />
              <span class="field__label" data-ref="label-disable-2fa-password">${t('settings.security.current_password_label', 'Contraseña o código de 6 dígitos')}</span>
            </label>
          `,
          cancelText: t('common.cancel'),
          confirmText: t('settings.security.btn_disable_2fa', 'Desactivar'),
          descriptionKey: 'settings.security.two_factor_disable_confirm',
          onConfirm: async (inst) => {
            inst.setConfirmLoading(true);
            const input = inst.backdrop.querySelector<HTMLInputElement>('[data-ref="input-disable-2fa-password"]');
            const val = input ? input.value.trim() : '';
            try {
              const res = await postApi(API_ROUTES.settings.twoFactorDisable, { code: val, password: val });
              const data = await res.json();
              if (res.ok && data.ok) {
                inst.close();
                update2FAButtonUi(false);
                showToast(
                  t('settings.security.two_factor_disabled_toast', '2FA desactivado correctamente.'),
                  'success'
                );
              } else {
                inst.setConfirmLoading(false);
                inst.showError(data.error || t('toasts.generic_error'));
              }
            } catch (_) {
              inst.setConfirmLoading(false);
              inst.showError(t('toasts.generic_error'));
            }
          },
          showConfirm: true,
          titleKey: 'settings.security.two_factor_disable_title',
        });

        if (modal.confirmBtn) {
          modal.confirmBtn.className = 'component-button component-button--h34 component-button--danger';
        }
      } else {
        open2FAModal({
          onSuccess: () => {
            update2FAButtonUi(true);
          },
        });
      }
    }, { signal });

    let cachedStatus = { hasGoogle: false, hasPassword: false };
    try {
      getApi(API_ROUTES.settings.passwordStatus)
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            cachedStatus = {
              hasGoogle: Boolean(data.hasGoogle || currentUser?.google_id),
              hasPassword: Boolean(data.hasPassword),
            };
            if (btnChangePassword && !cachedStatus.hasPassword) {
              btnChangePassword.textContent = t('settings.security.btn_create_password', 'Crear contraseña');
            }
          }
        })
        .catch(() => {});
    } catch (_) {}

    btnChangePassword?.addEventListener('click', async () => {
      try {
        const res = await getApi(API_ROUTES.settings.passwordStatus);
        if (res.ok) {
          const data = await res.json();
          cachedStatus = {
            hasGoogle: Boolean(data.hasGoogle || currentUser?.google_id),
            hasPassword: Boolean(data.hasPassword),
          };
        }
      } catch (_) {}

      openPasswordModalFlow(cachedStatus, () => {
        if (btnChangePassword) {
          btnChangePassword.textContent = t('settings.security.btn_change_password', 'Cambiar contraseña');
        }
        cachedStatus.hasPassword = true;
      });
    }, { signal });

    btnLogoutAllDevices?.addEventListener('click', () => {
      const modal = openModal({
        cancelText: t('modal.cancel'),
        confirmText: t('settings.security.btn_logout_all', 'Cerrar sesión'),
        descriptionKey: 'settings.security.dialog_confirm_logout_all',
        onConfirm: async (inst) => {
          inst.setConfirmLoading(true);
          try {
            const ok = await logoutAllApi();
            if (ok) {
              inst.close();
              showToast(
                t('settings.security.logout_all_success', 'Se han cerrado todas las sesiones activas.'),
                'success'
              );
              navigate('/login');
            } else {
              inst.setConfirmLoading(false);
              inst.showError(t('toasts.generic_error'));
            }
          } catch (_) {
            inst.setConfirmLoading(false);
            inst.showError(t('toasts.generic_error'));
          }
        },
        showConfirm: true,
        titleKey: 'settings.security.logout_all_title',
      });

      if (modal.confirmBtn) {
        modal.confirmBtn.className = 'component-button component-button--h34 component-button--danger';
      }
    }, { signal });

    const btnDeleteAccount = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-delete-account"]');
    btnDeleteAccount?.addEventListener('click', () => {
      const hasPassword = Boolean(cachedStatus.hasPassword);
      openModal({
        bodyHtml: hasPassword
          ? `
            <label class="field" data-ref="field-delete-password" style="margin-top: 1rem;">
              <input class="field__input" data-ref="input-delete-password" type="password" placeholder=" " autocomplete="current-password" />
              <span class="field__label" data-ref="label-delete-password">${t('settings.security.modal_current_password_label', 'Contraseña actual')}</span>
            </label>
          `
          : '',
        cancelText: t('modal.cancel'),
        confirmClass: 'component-button--danger',
        confirmText: t('settings.security.delete_account_modal_confirm', 'Eliminar cuenta definitivamente'),
        descriptionKey: 'settings.security.delete_account_modal_desc',
        onConfirm: async (inst) => {
          let password = '';
          if (hasPassword) {
            const inputPwd = inst.body?.querySelector<HTMLInputElement>('[data-ref="input-delete-password"]');
            password = inputPwd?.value?.trim() || '';
            if (!password) {
              inst.showError(t('settings.security.modal_current_password_error', 'Por favor ingresa tu contraseña actual para confirmar.'));
              return;
            }
          }
          inst.setConfirmLoading(true);
          try {
            const res = await postApi(API_ROUTES.settings.accountDelete, { password });
            let data: any = {};
            try {
              data = await res.json();
            } catch (_) {}

            if (res.ok && data.ok) {
              inst.close();
              showToast(
                t('settings.security.delete_account_toast', 'Tu cuenta y todos tus datos han sido eliminados exitosamente.'),
                'success'
              );
              if (data.switched && data.activeUser) {
                setCurrentUser(data.activeUser);
                setLinkedAccounts(data.accounts || []);
                navigate('/settings/your-account');
              } else {
                clearUserState();
                navigate('/login');
              }
            } else {
              inst.setConfirmLoading(false);
              inst.showError(data.error || t('toasts.generic_error'));
            }
          } catch (_) {
            inst.setConfirmLoading(false);
            inst.showError(t('toasts.generic_error'));
          }
        },
        showConfirm: true,
        size: '825x225',
        titleKey: 'settings.security.delete_account_modal_title',
      });
    }, { signal });
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export async function createSecurityView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/settings/security.html');
  const controller = new SecuritySettingsController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}

function openPasswordModalFlow(
  _status: { hasGoogle?: boolean; hasPassword?: boolean },
  onPasswordUpdated: () => void
): void {
  showDirectPasswordStep(onPasswordUpdated);
}

function showDirectPasswordStep(onPasswordUpdated: () => void): void {
  const modal = openModal({
    bodyHtml: `
      <label class="field" data-ref="field-current-password">
        <input class="field__input field__input--has-action" data-ref="modal-input-current-password" type="password" maxlength="128" placeholder=" " autocomplete="current-password" />
        <span class="field__label" data-ref="modal-label-current-password">${t('settings.security.modal_current_password_label', 'Contraseña actual')}</span>
        <button type="button" class="field__action" data-ref="toggle-modal-current-password" data-i18n-tooltip="auth.login.show_password" data-i18n-aria="auth.login.toggle_password">
          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#visibility"></use></svg>
        </button>
      </label>
    `,
    cancelText: t('modal.cancel'),
    confirmText: t('modal.continue'),
    descriptionKey: 'settings.security.modal_verify_password_desc',
    onConfirm: async (inst) => {
      const inputPass = inst.body.querySelector<HTMLInputElement>(
        '[data-ref="modal-input-current-password"]'
      );
      const currentPassword = inputPass?.value || '';

      if (!currentPassword) {
        inst.showError(t('validation.password_required', 'La contraseña es requerida.'));
        return false;
      }

      inst.clearError();
      inst.setConfirmLoading(true);

      try {
        const verifyRes = await postApi(API_ROUTES.settings.passwordVerify, { currentPassword });
        const verifyData = await verifyRes.json();

        if (!verifyRes.ok || !verifyData.ok) {
          inst.setConfirmLoading(false);
          inst.showError(
            verifyData.error || t('settings.security.current_password_incorrect', 'Contraseña incorrecta.')
          );
          return false;
        }

        showStep2NewPassword(inst, onPasswordUpdated);
        return false;
      } catch (_) {
        inst.setConfirmLoading(false);
        inst.showError(t('toasts.generic_error'));
        return false;
      }
    },
    showConfirm: true,
    size: '825x225',
    titleKey: 'settings.security.modal_verify_password_title',
  });

  const toggleCurrentPass = modal.body.querySelector<HTMLElement>(
    '[data-ref="toggle-modal-current-password"]'
  );
  const inputCurrentPass = modal.body.querySelector<HTMLInputElement>(
    '[data-ref="modal-input-current-password"]'
  );
  setupPasswordToggle(toggleCurrentPass, inputCurrentPass, {
    hideTooltip: t('auth.login.hide_password'),
    showTooltip: t('auth.login.show_password'),
  });

  inputCurrentPass?.focus();
}

function showStep2NewPassword(
  modal: ModalInstance,
  onPasswordUpdated: () => void
): void {
  modal.setTitle(t('settings.security.modal_set_password_title', 'Crear nueva contraseña'));
  modal.setDescription(t('settings.security.modal_set_password_desc', 'Ingresa tu nueva contraseña para proteger tu cuenta.'));
  modal.setBodyHtml(`
    <label class="field" data-ref="field-new-password">
      <input class="field__input field__input--has-action" data-ref="modal-input-new-password" type="password" maxlength="128" placeholder=" " autocomplete="new-password" />
      <span class="field__label" data-ref="modal-label-new-password">${t('settings.security.new_password_label', 'Nueva contraseña')}</span>
      <button type="button" class="field__action" data-ref="toggle-modal-new-password" data-i18n-tooltip="auth.login.show_password" data-i18n-aria="auth.login.toggle_password">
        <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#visibility"></use></svg>
      </button>
    </label>
    <label class="field" data-ref="field-confirm-new-password" style="margin-top: 1rem;">
      <input class="field__input field__input--has-action" data-ref="modal-input-confirm-new-password" type="password" maxlength="128" placeholder=" " autocomplete="new-password" />
      <span class="field__label" data-ref="modal-label-confirm-new-password">${t('settings.security.confirm_new_password_label', 'Confirmar nueva contraseña')}</span>
      <button type="button" class="field__action" data-ref="toggle-modal-confirm-new-password" data-i18n-tooltip="auth.login.show_password" data-i18n-aria="auth.login.toggle_password">
        <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#visibility"></use></svg>
      </button>
    </label>
  `);
  modal.setConfirmText(t('modal.save', 'Guardar'));

  const inputNewPass = modal.body.querySelector<HTMLInputElement>(
    '[data-ref="modal-input-new-password"]'
  );
  const inputConfirmPass = modal.body.querySelector<HTMLInputElement>(
    '[data-ref="modal-input-confirm-new-password"]'
  );
  const toggleNewPass = modal.body.querySelector<HTMLElement>(
    '[data-ref="toggle-modal-new-password"]'
  );
  const toggleConfirmPass = modal.body.querySelector<HTMLElement>(
    '[data-ref="toggle-modal-confirm-new-password"]'
  );

  setupPasswordToggle(toggleNewPass, inputNewPass, {
    hideTooltip: t('auth.login.hide_password'),
    showTooltip: t('auth.login.show_password'),
  });

  setupPasswordToggle(toggleConfirmPass, inputConfirmPass, {
    hideTooltip: t('auth.login.hide_password'),
    showTooltip: t('auth.login.show_password'),
  });

  inputNewPass?.focus();

  modal.setOnConfirm(async (inst: any) => {
    const newPass = inputNewPass?.value || '';
    const confirmPass = inputConfirmPass?.value || '';

    const validation = validatePassword(newPass);
    if (!validation.valid) {
      inst.showError(validation.error);
      return false;
    }

    if (newPass !== confirmPass) {
      inst.showError(t('validation.passwords_not_match', 'Las contraseñas no coinciden.'));
      return false;
    }

    inst.clearError();
    inst.setConfirmLoading(true);

    try {
      const updateRes = await postApi(API_ROUTES.settings.password, { newPassword: newPass });
      const updateData = await updateRes.json();

      if (!updateRes.ok || !updateData.ok) {
        inst.setConfirmLoading(false);
        inst.showError(updateData.error || t('toasts.generic_error'));
        return false;
      }

      inst.close();
      showToast(t('settings.security.password_updated_toast', 'Contraseña actualizada correctamente.'), 'success');
      if (onPasswordUpdated) {
        onPasswordUpdated();
      }
      return true;
    } catch (_) {
      inst.setConfirmLoading(false);
      inst.showError(t('toasts.generic_error'));
      return false;
    }
  });
}
