import { navigate, switchLanguage } from '../../app-router.js';
import { openModal } from '../../components/modal.component.js';
import { API_ROUTES } from '../../config/api-routes.js';
import { currentUser, deleteApi, escapeHtml, getApi, hasPermission, postApi, postFormApi, setCurrentUser } from '../../services/api.service.js';
import { getCurrentLanguage, t } from '../../services/i18n.service.js';
import { loadTemplate } from '../../services/template.service.js';
import { setToastPreferences, showToast } from '../../services/toast.service.js';
import { ViewController } from '../../types/common.types.js';
import { debounce, setupDropdown, withButtonLoading } from '../../utils/dom.util.js';
import { AVAILABLE_LANGUAGES, detectBrowserLanguage, getLanguageName } from '../../utils/languages.util.js';
import { applyAvatarTier } from '../../utils/tier.util.js';
import { validateAndSanitizeFile } from '../../utils/validators.util.js';

export class YourAccountController implements ViewController {
  private abortController: AbortController | null = null;
  private cleanUpLinkListeners: (() => void) | null = null;
  private container: HTMLElement;
  private dropdownController: { close: () => void; destroy: () => void; update: () => void } | null = null;
  private selectedAvatarFile: File | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    try {
      const meRes = await getApi(API_ROUTES.me);
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.user) {
          setCurrentUser(meData.user);
        }
      }
    } catch (_) {}

    if (!currentUser) return;

    const isProtected = !hasPermission(currentUser, 'account:edit_identifiers');
    const protectedBanner = this.container.querySelector<HTMLElement>('[data-ref="protected-account-banner"]');
    if (isProtected && protectedBanner) {
      protectedBanner.style.display = 'flex';
    }

    this._initAvatarSection(signal, isProtected);
    this._initUsernameSection(signal, isProtected);
    this._initEmailSection(signal, isProtected);
    this._initGoogleSection(signal, isProtected);
    await this._initPreferencesSection(signal);
  }

  destroy(): void {
    if (this.cleanUpLinkListeners) {
      this.cleanUpLinkListeners();
      this.cleanUpLinkListeners = null;
    }
    if (this.dropdownController) {
      this.dropdownController.destroy();
      this.dropdownController = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private _getDefaultAvatarUrl(name?: string): string {
    return API_ROUTES.avatar(name || currentUser?.username || 'User');
  }

  private _hasCustomAvatar(): boolean {
    if (!currentUser?.avatar_url) return false;
    const url = currentUser.avatar_url.trim();
    if (!url || url === 'null' || url === 'undefined') return false;
    if (url.includes('/api/avatar') || url.includes('/api/settings/avatar')) return false;
    return true;
  }

  private _refreshAvatarsInDom(url: string | null): void {
    const finalUrl = url || this._getDefaultAvatarUrl(currentUser?.username);
    const avatarImg = this.container.querySelector<HTMLImageElement>('[data-ref="profile-avatar-img"]');
    if (avatarImg) {
      avatarImg.classList.add('image-lazy-fade');
      avatarImg.classList.remove('image-loaded');
      avatarImg.src = finalUrl;
      avatarImg.onload = () => avatarImg.classList.add('image-loaded');
      avatarImg.onerror = () => avatarImg.classList.add('image-loaded');
      if (avatarImg.complete) avatarImg.classList.add('image-loaded');
    }

    const otherAvatars = document.querySelectorAll<HTMLImageElement>(
      '[data-ref="avatar-img"], [data-ref="topbar-avatar-img"], [data-ref="btn-avatar-toggle"] img, [data-ref="active-account-avatar"]'
    );
    otherAvatars.forEach((el) => {
      el.classList.add('image-lazy-fade');
      el.classList.remove('image-loaded');
      el.src = finalUrl;
      el.onload = () => el.classList.add('image-loaded');
      el.onerror = () => el.classList.add('image-loaded');
      if (el.complete) el.classList.add('image-loaded');
    });
  }

  private _initAvatarSection(signal: AbortSignal, isProtected: boolean): void {
    const avatarPreviewBox = this.container.querySelector<HTMLElement>('[data-ref="avatar-preview-box"]');
    const fileInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-avatar-file"]');
    const btnUploadAvatar = this.container.querySelector<HTMLElement>('[data-ref="btn-upload-avatar"]');
    const btnChangeAvatar = this.container.querySelector<HTMLElement>('[data-ref="btn-change-avatar"]');
    const btnDeleteAvatar = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-delete-avatar"]');
    const btnCancelAvatar = this.container.querySelector<HTMLElement>('[data-ref="btn-cancel-avatar"]');
    const btnSaveAvatar = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-save-avatar"]');
    const avatarErrorBanner = this.container.querySelector<HTMLElement>('[data-ref="avatar-error"]');

    if (avatarPreviewBox && currentUser) {
      applyAvatarTier(avatarPreviewBox, currentUser.subscription_tier || 'free', currentUser.subscription_tier_color);
    }

    const updateAvatarButtonsState = (state: 'preview' | 'custom' | 'default') => {
      if (isProtected) {
        if (btnUploadAvatar) btnUploadAvatar.style.display = 'none';
        if (btnChangeAvatar) btnChangeAvatar.style.display = 'none';
        if (btnDeleteAvatar) btnDeleteAvatar.style.display = 'none';
        if (btnCancelAvatar) btnCancelAvatar.style.display = 'none';
        if (btnSaveAvatar) btnSaveAvatar.style.display = 'none';
        return;
      }
      if (state === 'preview') {
        if (btnUploadAvatar) btnUploadAvatar.style.display = 'none';
        if (btnChangeAvatar) btnChangeAvatar.style.display = 'none';
        if (btnDeleteAvatar) btnDeleteAvatar.style.display = 'none';
        if (btnCancelAvatar) btnCancelAvatar.style.display = 'inline-flex';
        if (btnSaveAvatar) btnSaveAvatar.style.display = 'inline-flex';
      } else if (state === 'custom') {
        if (btnUploadAvatar) btnUploadAvatar.style.display = 'none';
        if (btnChangeAvatar) btnChangeAvatar.style.display = 'inline-flex';
        if (btnDeleteAvatar) btnDeleteAvatar.style.display = 'inline-flex';
        if (btnCancelAvatar) btnCancelAvatar.style.display = 'none';
        if (btnSaveAvatar) btnSaveAvatar.style.display = 'none';
      } else {
        if (btnUploadAvatar) btnUploadAvatar.style.display = 'inline-flex';
        if (btnChangeAvatar) btnChangeAvatar.style.display = 'none';
        if (btnDeleteAvatar) btnDeleteAvatar.style.display = 'none';
        if (btnCancelAvatar) btnCancelAvatar.style.display = 'none';
        if (btnSaveAvatar) btnSaveAvatar.style.display = 'none';
      }
    };

    if (isProtected && avatarPreviewBox) {
      avatarPreviewBox.removeAttribute('data-i18n-tooltip');
      avatarPreviewBox.removeAttribute('data-tooltip');
      avatarPreviewBox.style.cursor = 'default';
      const overlay = avatarPreviewBox.querySelector<HTMLElement>('[data-ref="avatar-preview-overlay"]');
      if (overlay) overlay.style.display = 'none';
    }

    const initialAvatarUrl = this._hasCustomAvatar()
      ? currentUser?.avatar_url!
      : this._getDefaultAvatarUrl(currentUser?.username);
    this._refreshAvatarsInDom(initialAvatarUrl);
    updateAvatarButtonsState(this._hasCustomAvatar() ? 'custom' : 'default');

    const triggerFileInput = () => {
      if (isProtected) return;
      if (avatarErrorBanner) avatarErrorBanner.style.display = 'none';
      fileInput?.click();
    };

    avatarPreviewBox?.addEventListener('click', (e) => {
      e.preventDefault();
      triggerFileInput();
    }, { signal });

    btnUploadAvatar?.addEventListener('click', (e) => {
      e.preventDefault();
      triggerFileInput();
    }, { signal });

    btnChangeAvatar?.addEventListener('click', (e) => {
      e.preventDefault();
      triggerFileInput();
    }, { signal });

    fileInput?.addEventListener('change', (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      if (avatarErrorBanner) avatarErrorBanner.style.display = 'none';

      const validation = validateAndSanitizeFile(file, {
        allowedMimes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
        maxMb: 2,
      });

      if (!validation.valid) {
        if (avatarErrorBanner) {
          avatarErrorBanner.textContent = validation.error ?? '';
          avatarErrorBanner.style.display = 'block';
        }
        target.value = '';
        return;
      }

      this.selectedAvatarFile = validation.file ?? null;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const avatarImg = this.container.querySelector<HTMLImageElement>('[data-ref="profile-avatar-img"]');
        if (avatarImg && ev.target?.result) {
          avatarImg.classList.add('image-lazy-fade');
          avatarImg.classList.remove('image-loaded');
          avatarImg.src = String(ev.target.result);
          avatarImg.onload = () => avatarImg.classList.add('image-loaded');
          if (avatarImg.complete) avatarImg.classList.add('image-loaded');
        }
        updateAvatarButtonsState('preview');
      };
      reader.readAsDataURL(file);
    }, { signal });

    btnCancelAvatar?.addEventListener('click', (e) => {
      e.preventDefault();
      this.selectedAvatarFile = null;
      if (fileInput) fileInput.value = '';
      if (avatarErrorBanner) avatarErrorBanner.style.display = 'none';
      this._refreshAvatarsInDom(currentUser?.avatar_url || null);
      updateAvatarButtonsState(this._hasCustomAvatar() ? 'custom' : 'default');
    }, { signal });

    btnSaveAvatar?.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!this.selectedAvatarFile) return;

      await withButtonLoading(btnSaveAvatar, t('app.loading'), async () => {
        if (avatarErrorBanner) avatarErrorBanner.style.display = 'none';
        const formData = new FormData();
        formData.append('avatar', this.selectedAvatarFile!);

        try {
          const res = await postFormApi(API_ROUTES.settings.avatar, formData);
          const data = await res.json();

          if (res.ok && data.ok && currentUser) {
            currentUser.avatar_url = data.avatar_url;
            setCurrentUser({ ...currentUser, avatar_url: data.avatar_url });
            this._refreshAvatarsInDom(data.avatar_url);
            this.selectedAvatarFile = null;
            if (fileInput) fileInput.value = '';
            updateAvatarButtonsState('custom');
            showToast(t('toasts.avatar_updated'), 'success');
          } else if (avatarErrorBanner) {
            avatarErrorBanner.textContent = data.error || t('toasts.generic_error');
            avatarErrorBanner.style.display = 'block';
          }
        } catch (_) {
          if (avatarErrorBanner) {
            avatarErrorBanner.textContent = t('toasts.generic_error');
            avatarErrorBanner.style.display = 'block';
          }
        }
      });
    }, { signal });

    btnDeleteAvatar?.addEventListener('click', async (e) => {
      e.preventDefault();
      await withButtonLoading(btnDeleteAvatar, t('app.loading'), async () => {
        if (avatarErrorBanner) avatarErrorBanner.style.display = 'none';

        try {
          const res = await deleteApi(API_ROUTES.settings.avatar);
          const data = await res.json();

          if (res.ok && data.ok && currentUser) {
            currentUser.avatar_url = null;
            setCurrentUser({ ...currentUser, avatar_url: null });
            this._refreshAvatarsInDom(null);
            this.selectedAvatarFile = null;
            if (fileInput) fileInput.value = '';
            updateAvatarButtonsState('default');
            showToast(t('toasts.avatar_deleted'), 'success');
          } else if (avatarErrorBanner) {
            avatarErrorBanner.textContent = data.error || t('toasts.generic_error');
            avatarErrorBanner.style.display = 'block';
          }
        } catch (_) {
          if (avatarErrorBanner) {
            avatarErrorBanner.textContent = t('toasts.generic_error');
            avatarErrorBanner.style.display = 'block';
          }
        }
      });
    }, { signal });
  }

  private _initUsernameSection(signal: AbortSignal, isProtected: boolean): void {
    const usernameViewBox = this.container.querySelector<HTMLElement>('[data-ref="username-view-box"]');
    const usernameEditRow = this.container.querySelector<HTMLElement>('[data-ref="username-edit-row"]');
    const usernameViewActions = this.container.querySelector<HTMLElement>('[data-ref="username-view-actions"]');
    const displayUsername = this.container.querySelector<HTMLElement>('[data-ref="display-username"]');
    const inputUsername = this.container.querySelector<HTMLInputElement>('[data-ref="input-username"]');
    const btnEditUsername = this.container.querySelector<HTMLElement>('[data-ref="btn-edit-username"]');
    const btnCancelUsername = this.container.querySelector<HTMLElement>('[data-ref="btn-cancel-username"]');
    const btnSaveUsername = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-save-username"]');
    const usernameErrorBanner = this.container.querySelector<HTMLElement>('[data-ref="username-error"]');

    if (displayUsername && currentUser) {
      displayUsername.textContent = currentUser.username || '-';
    }

    if (isProtected && btnEditUsername) {
      btnEditUsername.style.display = 'none';
      return;
    }

    btnEditUsername?.addEventListener('click', (e) => {
      e.preventDefault();
      if (usernameErrorBanner) usernameErrorBanner.style.display = 'none';
      if (inputUsername) inputUsername.value = currentUser?.username || '';
      if (usernameViewBox) usernameViewBox.style.display = 'none';
      if (usernameViewActions) usernameViewActions.style.display = 'none';
      if (usernameEditRow) usernameEditRow.style.display = 'flex';
      inputUsername?.focus();
    }, { signal });

    btnCancelUsername?.addEventListener('click', (e) => {
      e.preventDefault();
      if (usernameErrorBanner) usernameErrorBanner.style.display = 'none';
      if (usernameEditRow) usernameEditRow.style.display = 'none';
      if (usernameViewBox) usernameViewBox.style.display = '';
      if (usernameViewActions) usernameViewActions.style.display = '';
    }, { signal });

    btnSaveUsername?.addEventListener('click', async (e) => {
      e.preventDefault();
      const newUsername = inputUsername?.value?.trim() || '';

      if (newUsername === currentUser?.username) {
        if (usernameEditRow) usernameEditRow.style.display = 'none';
        if (usernameViewBox) usernameViewBox.style.display = '';
        if (usernameViewActions) usernameViewActions.style.display = '';
        return;
      }

      await withButtonLoading(btnSaveUsername, t('app.loading'), async () => {
        if (usernameErrorBanner) usernameErrorBanner.style.display = 'none';

        try {
          const res = await postApi(API_ROUTES.settings.username, { username: newUsername });
          const data = await res.json();

          if (res.ok && data.ok && currentUser) {
            currentUser.username = data.username;
            if (displayUsername) displayUsername.textContent = data.username;
            if (!this._hasCustomAvatar()) {
              this._refreshAvatarsInDom(null);
            }
            if (usernameEditRow) usernameEditRow.style.display = 'none';
            if (usernameViewBox) usernameViewBox.style.display = '';
            if (usernameViewActions) usernameViewActions.style.display = '';
            showToast(t('toasts.username_updated'), 'success');
          } else if (usernameErrorBanner) {
            usernameErrorBanner.textContent = data.error || t('toasts.generic_error');
            usernameErrorBanner.style.display = 'block';
          }
        } catch (_) {
          if (usernameErrorBanner) {
            usernameErrorBanner.textContent = t('toasts.generic_error');
            usernameErrorBanner.style.display = 'block';
          }
        }
      });
    }, { signal });
  }

  private _initEmailSection(signal: AbortSignal, isProtected: boolean): void {
    const emailViewBox = this.container.querySelector<HTMLElement>('[data-ref="email-view-box"]');
    const emailEditRow = this.container.querySelector<HTMLElement>('[data-ref="email-edit-row"]');
    const emailViewActions = this.container.querySelector<HTMLElement>('[data-ref="email-view-actions"]');
    const displayEmail = this.container.querySelector<HTMLElement>('[data-ref="display-email"]');
    const inputEmail = this.container.querySelector<HTMLInputElement>('[data-ref="input-email"]');
    const btnEditEmail = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-edit-email"]');
    const btnCancelEmail = this.container.querySelector<HTMLElement>('[data-ref="btn-cancel-email"]');
    const btnSaveEmail = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-save-email"]');
    const emailErrorBanner = this.container.querySelector<HTMLElement>('[data-ref="email-error"]');

    if (displayEmail && currentUser) {
      displayEmail.textContent = currentUser.email || '-';
    }

    if (isProtected && btnEditEmail) {
      btnEditEmail.style.display = 'none';
      return;
    }

    const activateEmailEditMode = () => {
      if (emailErrorBanner) emailErrorBanner.style.display = 'none';
      if (inputEmail) inputEmail.value = currentUser?.email || '';
      if (emailViewBox) emailViewBox.style.display = 'none';
      if (emailViewActions) emailViewActions.style.display = 'none';
      if (emailEditRow) emailEditRow.style.display = 'flex';
      inputEmail?.focus();
    };

    const deactivateEmailEditMode = () => {
      if (emailErrorBanner) emailErrorBanner.style.display = 'none';
      if (emailEditRow) emailEditRow.style.display = 'none';
      if (emailViewBox) emailViewBox.style.display = '';
      if (emailViewActions) emailViewActions.style.display = '';
    };

    btnCancelEmail?.addEventListener('click', (e) => {
      e.preventDefault();
      deactivateEmailEditMode();
    }, { signal });

    btnSaveEmail?.addEventListener('click', async (e) => {
      e.preventDefault();
      const newEmail = inputEmail?.value?.trim() || '';

      if (newEmail.toLowerCase() === (currentUser?.email || '').toLowerCase()) {
        deactivateEmailEditMode();
        return;
      }

      await withButtonLoading(btnSaveEmail, t('app.loading'), async () => {
        if (emailErrorBanner) emailErrorBanner.style.display = 'none';

        try {
          const res = await postApi(API_ROUTES.settings.email, { email: newEmail });
          const data = await res.json();

          if (res.ok && data.ok && currentUser) {
            currentUser.email = data.email;
            if (displayEmail) displayEmail.textContent = data.email;
            deactivateEmailEditMode();
            showToast(t('toasts.email_updated'), 'success');
          } else if (emailErrorBanner) {
            emailErrorBanner.textContent = data.error || t('toasts.generic_error');
            emailErrorBanner.style.display = 'block';
          }
        } catch (_) {
          if (emailErrorBanner) {
            emailErrorBanner.textContent = t('toasts.generic_error');
            emailErrorBanner.style.display = 'block';
          }
        }
      });
    }, { signal });

    btnEditEmail?.addEventListener('click', async (e) => {
      e.preventDefault();
      if (emailErrorBanner) emailErrorBanner.style.display = 'none';

      await withButtonLoading(btnEditEmail, t('app.loading'), async () => {
        try {
          const res = await postApi(API_ROUTES.settings.emailRequestCode);
          const data = await res.json();

          if (!res.ok || !data.ok) {
            showToast(data.error || t('toasts.generic_error'), 'danger');
            return;
          }

          if (data.alreadyAuthorized) {
            activateEmailEditMode();
            return;
          }

          showToast(t('settings.your_account.email_code_sent_toast'), 'info');

          openModal({
            bodyHtml: `
              <label class="field" data-ref="field-email-code">
                <input class="field__input field__input--code" data-ref="modal-input-code" type="text" maxlength="6" inputmode="numeric" pattern="[0-9]*" placeholder=" " autocomplete="one-time-code" />
                <span class="field__label" data-ref="modal-label-code">${t('settings.your_account.modal_email_code_placeholder')}</span>
              </label>
            `,
            cancelText: t('settings.your_account.btn_cancel'),
            confirmText: t('settings.your_account.btn_continue'),
            descriptionKey: 'settings.your_account.modal_email_verify_desc',
            descriptionParams: { email: currentUser?.email || '' },
            onConfirm: async (inst) => {
              const inputCodeEl = inst.body.querySelector<HTMLInputElement>('[data-ref="modal-input-code"]');
              const inputCode = inputCodeEl?.value?.trim() || '';

              if (!inputCode) {
                inst.showError(t('validation.code_required'));
                return;
              }
              if (inputCode.length !== 6 || !/^\d+$/.test(inputCode)) {
                inst.showError(t('validation.code_invalid'));
                return;
              }

              inst.clearError();
              inst.setConfirmLoading(true);

              try {
                const verifyRes = await postApi(API_ROUTES.settings.emailVerifyCode, { code: inputCode });
                const verifyData = await verifyRes.json();

                if (!verifyRes.ok || !verifyData.ok) {
                  inst.setConfirmLoading(false);
                  inst.showError(verifyData.error || t('toasts.generic_error'));
                  return;
                }

                inst.close();
                activateEmailEditMode();
              } catch (_) {
                inst.setConfirmLoading(false);
                inst.showError(t('toasts.generic_error'));
              }
            },
            titleKey: 'settings.your_account.modal_email_verify_title',
          });
        } catch (_) {
          showToast(t('toasts.generic_error'), 'danger');
        }
      });
    }, { signal });
  }

  private _initGoogleSection(signal: AbortSignal, isProtected: boolean): void {
    const googleStatusEl = this.container.querySelector<HTMLElement>('[data-ref="google-account-status"]');
    const googleActionBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-google-account-action"]');

    if (isProtected && googleActionBtn) {
      googleActionBtn.style.display = 'none';
      return;
    }

    const refreshGoogleStatus = () => {
      if (!currentUser) return;
      if (currentUser.google_id) {
        if (googleStatusEl) googleStatusEl.textContent = t('settings.your_account.google_connected');
        if (googleActionBtn) {
          googleActionBtn.textContent = t('settings.your_account.btn_disconnect');
          googleActionBtn.classList.remove('component-button--black');
        }
      } else {
        if (googleStatusEl) googleStatusEl.textContent = t('settings.your_account.google_not_connected');
        if (googleActionBtn) {
          googleActionBtn.textContent = t('settings.your_account.btn_connect');
          googleActionBtn.classList.add('component-button--black');
        }
      }
    };
    refreshGoogleStatus();

    void (async () => {
      try {
        const pwdStatusRes = await getApi(API_ROUTES.settings.passwordStatus);
        if (signal.aborted) return;
        if (pwdStatusRes.ok) {
          const pwdStatusData = await pwdStatusRes.json();
          if (currentUser && !signal.aborted) {
            currentUser.google_id = pwdStatusData?.hasGoogle ? (currentUser.google_id || 'connected') : null;
            setCurrentUser(currentUser);
            refreshGoogleStatus();
          }
        }
      } catch (_) {}
    })();

    googleActionBtn?.addEventListener('click', async (e: Event) => {
      e.preventDefault();
      if (!currentUser) return;

      if (currentUser.google_id) {
        await withButtonLoading(googleActionBtn, t('app.loading'), async () => {
          try {
            const pwdStatusRes = await getApi(API_ROUTES.settings.passwordStatus);
            const pwdStatusData = await pwdStatusRes.json();
            const hasPassword = Boolean(pwdStatusData?.hasPassword);

            if (!hasPassword) {
              openModal({
                cancelText: t('modal.cancel'),
                confirmClass: 'component-button--black',
                confirmText: t('settings.your_account.btn_go_to_security'),
                descriptionKey: 'settings.your_account.modal_google_no_password_desc',
                onConfirm: (modalInst) => {
                  modalInst.close();
                  navigate('/settings/security');
                },
                showCancel: true,
                titleKey: 'settings.your_account.modal_google_no_password_title',
              });
              return;
            }

            openModal({
              cancelText: t('modal.cancel'),
              confirmClass: 'component-button--danger',
              confirmText: t('settings.your_account.btn_unlink_confirm'),
              descriptionKey: 'settings.your_account.modal_unlink_google_desc',
              onConfirm: async (modalInst) => {
                modalInst.clearError();
                modalInst.setConfirmLoading(true);
                try {
                  const unlinkRes = await postApi(API_ROUTES.settings.googleUnlink);
                  const unlinkData = await unlinkRes.json();

                  if (unlinkRes.ok && unlinkData.ok) {
                    if (currentUser) {
                      currentUser.google_id = null;
                      setCurrentUser(currentUser);
                    }
                    refreshGoogleStatus();
                    modalInst.close();
                    showToast(t('settings.your_account.google_unlinked_success'), 'success');
                  } else {
                    modalInst.setConfirmLoading(false);
                    modalInst.showError(unlinkData.error || t('toasts.generic_error'));
                  }
                } catch (_) {
                  modalInst.setConfirmLoading(false);
                  modalInst.showError(t('toasts.generic_error'));
                }
              },
              titleKey: 'settings.your_account.modal_unlink_google_title',
            });
          } catch (_) {
            showToast(t('toasts.generic_error'), 'danger');
          }
        });
      } else {
        let linkChannel: BroadcastChannel | null = null;
        let pollInterval: ReturnType<typeof setInterval> | null = null;
        let checkClosedInterval: ReturnType<typeof setInterval> | null = null;
        let popupWindow: Window | null = null;

        const cleanUpLocalLinkListeners = () => {
          try {
            if (linkChannel) {
              linkChannel.close();
              linkChannel = null;
            }
          } catch (_) {}
          window.removeEventListener('storage', handleStorageEvent);
          window.removeEventListener('message', handleMessageEvent);
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          if (checkClosedInterval) {
            clearInterval(checkClosedInterval);
            checkClosedInterval = null;
          }
          localStorage.removeItem('google_link_event');
          this.cleanUpLinkListeners = null;
        };

        this.cleanUpLinkListeners = cleanUpLocalLinkListeners;

        const onLinkSuccess = (googleId?: string) => {
          cleanUpLocalLinkListeners();
          if (currentUser) {
            currentUser.google_id = googleId || 'connected';
            setCurrentUser(currentUser);
            refreshGoogleStatus();
          }
          showToast(t('settings.your_account.google_linked_success'), 'success');
        };

        const onLinkError = (errorMsg?: string) => {
          cleanUpLocalLinkListeners();
          showToast(errorMsg || t('toasts.generic_error'), 'danger');
        };

        const onLinkCancelled = () => {
          cleanUpLocalLinkListeners();
          showToast(t('toasts.google_link_cancelled'), 'info');
        };

        const handleStorageEvent = (event: StorageEvent) => {
          if (event.key === 'google_link_event' && event.newValue) {
            try {
              const data = JSON.parse(event.newValue);
              if (data.type === 'GOOGLE_LINK_SUCCESS') {
                onLinkSuccess(data.google_id);
              } else if (data.type === 'GOOGLE_LINK_ERROR') {
                onLinkError(data.error);
              } else if (data.type === 'GOOGLE_LINK_CANCELLED') {
                onLinkCancelled();
              }
            } catch (_) {}
          }
        };

        const handleMessageEvent = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;
          if (event.data?.type === 'GOOGLE_LINK_SUCCESS') {
            onLinkSuccess(event.data.google_id);
          } else if (event.data?.type === 'GOOGLE_LINK_ERROR') {
            onLinkError(event.data.error);
          } else if (event.data?.type === 'GOOGLE_LINK_CANCELLED') {
            onLinkCancelled();
          }
        };

        try {
          if (typeof BroadcastChannel !== 'undefined') {
            linkChannel = new BroadcastChannel('google_link_channel');
            linkChannel.onmessage = (event) => {
              if (event.data?.type === 'GOOGLE_LINK_SUCCESS') {
                onLinkSuccess(event.data.google_id);
              } else if (event.data?.type === 'GOOGLE_LINK_ERROR') {
                onLinkError(event.data.error);
              } else if (event.data?.type === 'GOOGLE_LINK_CANCELLED') {
                onLinkCancelled();
              }
            };
          }
        } catch (_) {}

        window.addEventListener('storage', handleStorageEvent, { signal });
        window.addEventListener('message', handleMessageEvent, { signal });

        pollInterval = setInterval(() => {
          try {
            const raw = localStorage.getItem('google_link_event');
            if (raw) {
              const data = JSON.parse(raw);
              if (data.type === 'GOOGLE_LINK_SUCCESS') {
                onLinkSuccess(data.google_id);
              } else if (data.type === 'GOOGLE_LINK_ERROR') {
                onLinkError(data.error);
              } else if (data.type === 'GOOGLE_LINK_CANCELLED') {
                onLinkCancelled();
              }
            }
          } catch (_) {}
        }, 400);

        checkClosedInterval = setInterval(() => {
          if (popupWindow && popupWindow.closed) {
            if (checkClosedInterval) {
              clearInterval(checkClosedInterval);
              checkClosedInterval = null;
            }
            setTimeout(() => {
              cleanUpLocalLinkListeners();
            }, 600);
          }
        }, 800);

        popupWindow = window.open(
          API_ROUTES.auth.googleLink,
          'google_link_window',
          'width=500,height=650,menubar=no,toolbar=no,status=no,resizable=yes'
        );

        if (!popupWindow || popupWindow.closed || typeof popupWindow.closed === 'undefined') {
          cleanUpLocalLinkListeners();
          showToast(t('settings.security.google_popup_blocked'), 'danger');
        }
      }
    }, { signal });
  }

  private async _initPreferencesSection(signal: AbortSignal): Promise<void> {
    const langDropdown = this.container.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-language"]');
    const langSelectedText = this.container.querySelector<HTMLElement>('[data-ref="language-selected-text"]');
    const toggleOpenLinks = this.container.querySelector<HTMLInputElement>('[data-ref="toggle-open-links"]');
    const langListEl = this.container.querySelector<HTMLElement>('[data-ref="list-languages"]');
    const langSearchInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-search-language"]');
    const langEmptyEl = this.container.querySelector<HTMLElement>('[data-ref="empty-languages"]');

    const renderLanguagesList = (currentLang: string) => {
      if (!langListEl) return;
      langListEl.innerHTML = AVAILABLE_LANGUAGES.map((l) => {
        const isActive = l.code.toLowerCase() === (currentLang || '').toLowerCase();
        return `<button type="button" class="menu-item${isActive ? ' is-active' : ''}" data-ref="option-lang-${l.code}" data-lang="${l.code}">
          <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#language"></use></svg>
          <span class="menu-item__text">${escapeHtml(l.name)}</span>
        </button>`;
      }).join('');
    };

    const filterLanguages = (query: string) => {
      if (!langListEl) return;
      const cleanQuery = query.toLowerCase().trim();
      let matchesCount = 0;
      const items = langListEl.querySelectorAll<HTMLElement>('.menu-item');
      items.forEach((item) => {
        const name = item.querySelector('.menu-item__text')?.textContent?.toLowerCase() || '';
        const code = (item.getAttribute('data-lang') || '').toLowerCase();
        const match = !cleanQuery || name.includes(cleanQuery) || code.includes(cleanQuery);
        item.style.display = match ? 'flex' : 'none';
        if (match) matchesCount++;
      });
      if (langEmptyEl) {
        langEmptyEl.style.display = matchesCount === 0 ? 'block' : 'none';
      }
    };

    langSearchInput?.addEventListener('input', (e: Event) => {
      filterLanguages((e.target as HTMLInputElement).value);
      this.dropdownController?.update();
    }, { signal });

    let activeLang = getCurrentLanguage() || detectBrowserLanguage();
    renderLanguagesList(activeLang);
    if (langSelectedText) {
      langSelectedText.textContent = getLanguageName(activeLang);
    }

    try {
      const prefRes = await getApi(API_ROUTES.settings.preferences);
      if (prefRes.ok) {
        const prefData = await prefRes.json();
        const prefs = prefData.preferences;

        if (prefs) {
          setToastPreferences(prefs);
          if (prefs.language) {
            activeLang = prefs.language;
            if (langSelectedText) {
              langSelectedText.textContent = getLanguageName(prefs.language);
            }
            renderLanguagesList(prefs.language);
          }
          if (toggleOpenLinks) {
            toggleOpenLinks.checked = Boolean(prefs.open_links_new_tab);
          }
        }
      }
    } catch (_) {}

    if (langDropdown) {
      this.dropdownController = setupDropdown(langDropdown, {
        onClose: () => {
          if (langSearchInput) {
            langSearchInput.value = '';
            filterLanguages('');
          }
        },
        onSelect: async (lang: string) => {
          try {
            activeLang = lang;
            if (langSelectedText) {
              langSelectedText.textContent = getLanguageName(lang);
            }
            showToast(t('toasts.language_updated'), 'success');
            await switchLanguage(lang);
          } catch (_) {}
        },
      });
    }

    const saveOpenLinks = debounce(async (checked: boolean) => {
      try {
        await postApi(API_ROUTES.settings.preferences, { open_links_new_tab: checked });
        showToast(t('toasts.preferences_saved'), 'success');
      } catch (_) {}
    }, 350);

    toggleOpenLinks?.addEventListener('change', (e: Event) => {
      saveOpenLinks((e.target as HTMLInputElement).checked);
    }, { signal });
  }
}

export async function createYourAccountView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/settings/your-account.html');
  const controller = new YourAccountController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
