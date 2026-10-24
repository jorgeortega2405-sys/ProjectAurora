import { isAuthenticated, loginAdmin } from '../services/auth.service.js';
import { renderIcons } from '../services/icon.service.js';
import { navigate } from '../services/navigation.service.js';
import { loadTemplate } from '../services/template.service.js';
import { mountTurnstile, TurnstileInstance, unmountTurnstile } from '../services/turnstile.service.js';
import { ViewController } from '../types/common.types.js';

export class AdminLoginController implements ViewController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private isSubmitting = false;
  private turnstileInstance: TurnstileInstance | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();

    const turnstileBox = this.container.querySelector<HTMLElement>('[data-ref="turnstile-admin-login-container"]');
    if (turnstileBox) {
      void mountTurnstile(turnstileBox, { action: 'admin-login' }).then((inst) => {
        this.turnstileInstance = inst;
      });
    }

    renderIcons(this.container);
    this.bindEvents();
  }

  destroy(): void {
    if (this.turnstileInstance) {
      unmountTurnstile(this.turnstileInstance.widgetId);
      this.turnstileInstance = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private bindEvents(): void {
    const signal = this.abortController?.signal;

    const emailInput = this.container.querySelector<HTMLInputElement>('[data-ref="admin-login-email"]');
    const passwordInput = this.container.querySelector<HTMLInputElement>('[data-ref="admin-login-password"]');
    const toggleBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-toggle-admin-password"]');
    const submitBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-admin-login"]');
    const cancelBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-cancel-admin-login"]');
    const errorBanner = this.container.querySelector<HTMLElement>('[data-ref="admin-login-error"]');

    if (isAuthenticated() && cancelBtn) {
      cancelBtn.style.display = 'block';
      cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        navigate('/');
      }, { signal });
    }

    const showError = (msg: string) => {
      if (errorBanner) {
        errorBanner.textContent = msg;
        errorBanner.style.display = 'block';
      }
    };

    const hideError = () => {
      if (errorBanner) {
        errorBanner.textContent = '';
        errorBanner.style.display = 'none';
      }
    };

    toggleBtn?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (!passwordInput) return;
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        const useEl = toggleBtn.querySelector('use');
        if (useEl) {
          useEl.setAttribute('href', `/icons.svg#${isPassword ? 'visibility_off' : 'visibility'}`);
        }
      },
      { signal }
    );

    const handleSubmit = async () => {
      if (this.isSubmitting) return;
      hideError();

      const identifier = emailInput?.value.trim() || '';
      const password = passwordInput?.value || '';

      if (!identifier) {
        showError('Ingresa tu correo electrónico o nombre de usuario.');
        emailInput?.focus();
        return;
      }

      if (!password) {
        showError('Ingresa tu contraseña.');
        passwordInput?.focus();
        return;
      }

      this.isSubmitting = true;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verificando acceso...';
      }

      const turnstileToken = this.turnstileInstance?.getResponse() || '';

      try {
        const result = await loginAdmin(identifier, password, turnstileToken);
        if (!result.success || !result.user) {
          this.turnstileInstance?.reset();
          showError(result.error || 'Credenciales inválidas.');
          return;
        }

        navigate('/', true);
      } catch {
        showError('Ocurrió un error al intentar iniciar sesión.');
      } finally {
        this.isSubmitting = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Acceder al Panel';
        }
      }
    };

    submitBtn?.addEventListener('click', handleSubmit, { signal });

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void handleSubmit();
      }
    };

    emailInput?.addEventListener('keydown', handleKeydown, { signal });
    passwordInput?.addEventListener('keydown', handleKeydown, { signal });

    requestAnimationFrame(() => {
      emailInput?.focus();
    });
  }
}

export async function createAdminLoginView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/auth/login.html');
  const controller = new AdminLoginController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
