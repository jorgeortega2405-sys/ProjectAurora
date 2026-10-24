import { API_ROUTES } from '../config/api-routes.js';
import { getApi, postApi, setAuthState } from '../services/api.service.js';
import { t } from '../services/i18n.service.js';
import { navigate } from '../services/navigation.service.js';
import { loadTemplate } from '../services/template.service.js';
import { mountTurnstile, TurnstileInstance, unmountTurnstile } from '../services/turnstile.service.js';
import { RegistrationState, TwoFactorLoginState } from '../types/auth.types.js';
import { bindNavigationLinks, bindSubmitOnEnter, createBannerManager, setupPasswordToggle, withButtonLoading } from '../utils/dom.util.js';
import { validateEmail, validatePassword, validateUsername, validateVerificationCode } from '../utils/validators.util.js';

const REG_STORAGE_KEY = 'aurora_reg_flow';
const TWO_FACTOR_STORAGE_KEY = 'aurora_2fa_login_flow';

export function getRegistrationState(): RegistrationState {
  try {
    const raw = sessionStorage.getItem(REG_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RegistrationState) : {};
  } catch {
    return {};
  }
}

export function saveStage1Data(email: string, password: string): void {
  const current = getRegistrationState();
  const updated: RegistrationState = {
    ...current,
    email: email.trim().toLowerCase(),
    password: String(password),
    step: 2,
  };
  sessionStorage.setItem(REG_STORAGE_KEY, JSON.stringify(updated));
}

export function saveStage2Data(username: string): void {
  const current = getRegistrationState();
  const updated: RegistrationState = {
    ...current,
    step: 3,
    username: username.trim(),
  };
  sessionStorage.setItem(REG_STORAGE_KEY, JSON.stringify(updated));
}

export function clearRegistrationState(): void {
  sessionStorage.removeItem(REG_STORAGE_KEY);
}

export function hasStage1Data(): boolean {
  const state = getRegistrationState();
  return Boolean(state.email && state.password);
}

export function hasStage2Data(): boolean {
  const state = getRegistrationState();
  return Boolean(state.email && state.password && state.username);
}

function getCookie(name: string): string | null {
  try {
    if (typeof document === 'undefined' || !document.cookie) return null;
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      return decodeURIComponent(parts.pop()!.split(';').shift()!.trim());
    }
    return null;
  } catch {
    return null;
  }
}

export function getTwoFactorState(): TwoFactorLoginState {
  try {
    const raw = sessionStorage.getItem(TWO_FACTOR_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as TwoFactorLoginState) : {};
    if (parsed.tempToken && parsed.email) {
      return parsed;
    }
  } catch (_) {}

  const cookieToken = getCookie('2fa_temp_token');
  const cookieEmail = getCookie('2fa_temp_email');
  if (cookieToken && cookieEmail) {
    saveTwoFactorLoginState(cookieToken, cookieEmail);
    return { email: cookieEmail, tempToken: cookieToken };
  }
  if (cookieEmail) {
    return { email: cookieEmail, tempToken: '' };
  }

  try {
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      const urlEmail = params.get('email');
      if (urlToken && urlEmail) {
        saveTwoFactorLoginState(urlToken, urlEmail);
        return { email: urlEmail, tempToken: urlToken };
      }
    }
  } catch (_) {}

  return {};
}

export function saveTwoFactorLoginState(tempToken: string, email: string): void {
  const data: TwoFactorLoginState = {
    email: String(email).trim().toLowerCase(),
    tempToken: String(tempToken).trim(),
    timestamp: Date.now(),
  };
  try {
    sessionStorage.setItem(TWO_FACTOR_STORAGE_KEY, JSON.stringify(data));
  } catch (_) {}
}

export function clearTwoFactorState(): void {
  try {
    sessionStorage.removeItem(TWO_FACTOR_STORAGE_KEY);
  } catch (_) {}
  try {
    document.cookie = '2fa_temp_token=; Max-Age=0; path=/;';
    document.cookie = '2fa_temp_email=; Max-Age=0; path=/;';
  } catch (_) {}
}

export function hasTwoFactorLoginData(): boolean {
  const state = getTwoFactorState();
  return Boolean(state.tempToken && state.email) || Boolean(getCookie('2fa_temp_email'));
}

export class LoginController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private startAt2FA: boolean;
  private turnstileInstance: TurnstileInstance | null = null;

  constructor(container: HTMLElement, startAt2FA = false) {
    this.container = container;
    this.startAt2FA = startAt2FA;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();

    const turnstileBox = this.container.querySelector<HTMLElement>('[data-ref="turnstile-login-container"]');
    if (turnstileBox) {
      void mountTurnstile(turnstileBox, { action: 'login' }).then((inst) => {
        this.turnstileInstance = inst;
      });
    }

    const stepMain = this.container.querySelector<HTMLElement>('[data-ref="login-step-main"]');
    const step2FA = this.container.querySelector<HTMLElement>('[data-ref="login-step-2fa"]');
    const stepSSO = this.container.querySelector<HTMLElement>('[data-ref="login-step-sso"]');

    const emailInput = this.container.querySelector<HTMLInputElement>('[data-ref="login-email"]');
    const passwordInput = this.container.querySelector<HTMLInputElement>('[data-ref="login-password"]');
    const toggleBtn = this.container.querySelector<HTMLElement>('[data-ref="toggle-login-password"]');
    const submitBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-login"]');
    const googleBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-google-login"]');
    const ssoBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sso-login"]');
    const bannersMain = createBannerManager(this.container, { errorRef: 'login-error' });

    const code2FAInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-login-2fa-code"]');
    const submit2FABtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-2fa"]');
    const backToLoginLink = this.container.querySelector<HTMLElement>('[data-ref="btn-back-to-login"]');
    const banners2FA = createBannerManager(this.container, { errorRef: 'login-2fa-error' });

    const ssoEmailInput = this.container.querySelector<HTMLInputElement>('[data-ref="login-sso-email"]');
    const submitSsoBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-sso"]');
    const backFromSsoLink = this.container.querySelector<HTMLElement>('[data-ref="btn-back-from-sso"]');
    const bannersSSO = createBannerManager(this.container, { errorRef: 'login-sso-error' });

    bindNavigationLinks(this.container, {
      'btn-forgot-password': '/forgot-password',
      'btn-to-register': '/register',
      'login-home-link': '/',
    });

    googleBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = '/api/auth/google';
    }, { signal: this.abortController.signal });

    ssoBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      const currentEmail = emailInput?.value.trim() || '';
      if (currentEmail && ssoEmailInput) {
        ssoEmailInput.value = currentEmail;
      }
      activateStep('sso');
    }, { signal: this.abortController.signal });

    backFromSsoLink?.addEventListener('click', (e) => {
      e.preventDefault();
      activateStep('main');
    }, { signal: this.abortController.signal });

    const urlParams = new URLSearchParams(window.location.search);
    const urlError = urlParams.get('error');
    if (urlError) {
      bannersMain.showError(decodeURIComponent(urlError));
    }

    const tokenParam = urlParams.get('token');
    const emailParam = urlParams.get('email');
    if (tokenParam && emailParam) {
      saveTwoFactorLoginState(tokenParam, emailParam);
      window.history.replaceState({}, document.title, window.location.pathname);
      this.startAt2FA = true;
    }

    setupPasswordToggle(toggleBtn, passwordInput, {
      hideTooltip: t('auth.login.hide_password') || 'Ocultar contraseña',
      showTooltip: t('auth.login.show_password') || 'Mostrar contraseña',
    });

    const activateStep = (stepName: 'main' | '2fa' | 'sso') => {
      bannersMain.hideAll();
      banners2FA.hideAll();
      bannersSSO.hideAll();

      if (stepMain) stepMain.style.display = stepName === 'main' ? 'block' : 'none';
      if (step2FA) step2FA.style.display = stepName === '2fa' ? 'block' : 'none';
      if (stepSSO) stepSSO.style.display = stepName === 'sso' ? 'block' : 'none';

      if (stepName === '2fa') {
        window.history.pushState({}, '', '/login/verification-aditional');
        requestAnimationFrame(() => code2FAInput?.focus());
      } else if (stepName === 'sso') {
        window.history.pushState({}, '', '/login/sso');
        requestAnimationFrame(() => ssoEmailInput?.focus());
      } else if (stepName === 'main') {
        window.history.pushState({}, '', '/login');
        requestAnimationFrame(() => emailInput?.focus());
      }
    };

    const is2FARoute = this.startAt2FA || window.location.pathname === '/login/verification-aditional';
    const isSSORoute = window.location.pathname === '/login/sso';

    if (is2FARoute) {
      if (!hasTwoFactorLoginData()) {
        activateStep('main');
        bannersMain.showError(t('auth.login_2fa.session_expired') || 'La sesión de verificación ha expirado. Inicia sesión nuevamente.');
      } else {
        activateStep('2fa');
      }
    } else if (isSSORoute) {
      activateStep('sso');
    } else {
      activateStep('main');
    }

    const executeLogin = async () => {
      bannersMain.hideAll();
      const email = emailInput?.value.trim() || '';
      const password = passwordInput?.value || '';

      if (!email) {
        bannersMain.showError(t('validation.email_required') || 'Ingresa tu correo electrónico.');
        return;
      }
      if (!password) {
        bannersMain.showError(t('validation.password_required') || 'Ingresa tu contraseña.');
        return;
      }

      const turnstileToken = this.turnstileInstance?.getResponse() || '';

      await withButtonLoading(submitBtn, t('auth.login.loading') || 'Iniciando sesión...', async () => {
        try {
          const res = await postApi(
            API_ROUTES.auth.login,
            { email, password, turnstileToken },
            turnstileToken ? { 'x-turnstile-token': turnstileToken } : undefined
          );
          const data = await res.json();

          if (!res.ok) {
            this.turnstileInstance?.reset();
            if (data.requiresSso) {
              if (ssoEmailInput) ssoEmailInput.value = email;
              activateStep('sso');
              bannersSSO.showError(data.error || 'Tu organización exige inicio de sesión con SSO.');
              return;
            }
            bannersMain.showError(data.error || 'Credenciales inválidas.');
            return;
          }

          if (data.requires2FA) {
            saveTwoFactorLoginState(data.tempToken, data.email || email);
            activateStep('2fa');
            return;
          }

          setAuthState(data.user, data.accounts || []);
          navigate('/');
        } catch {
          bannersMain.showError('Error de red al intentar iniciar sesión.');
        }
      });
    };

    submitBtn?.addEventListener('click', executeLogin, { signal: this.abortController.signal });
    bindSubmitOnEnter([emailInput, passwordInput], executeLogin);

    const executeSso = async () => {
      bannersSSO.hideAll();
      const ssoEmail = ssoEmailInput?.value.trim().toLowerCase() || '';

      if (!ssoEmail || !ssoEmail.includes('@')) {
        bannersSSO.showError('Ingresa un correo corporativo válido.');
        return;
      }

      await withButtonLoading(submitSsoBtn, t('auth.login_sso.loading') || 'Buscando proveedor corporativo...', async () => {
        try {
          const res = await getApi(`/api/auth/sso/initiate?email=${encodeURIComponent(ssoEmail)}`);
          const data = await res.json();

          if (!res.ok) {
            bannersSSO.showError(data.error || 'No se encontró un proveedor de SSO para el dominio de este correo.');
            return;
          }

          if (data.authorizeUrl) {
            window.location.href = data.authorizeUrl;
          } else {
            bannersSSO.showError('No se pudo generar la URL de autorización corporativa.');
          }
        } catch {
          bannersSSO.showError('Error de red al conectar con el servidor corporativo.');
        }
      });
    };

    submitSsoBtn?.addEventListener('click', executeSso, { signal: this.abortController.signal });
    bindSubmitOnEnter(ssoEmailInput, executeSso);

    const executeVerify2FA = async () => {
      banners2FA.hideAll();
      const state = getTwoFactorState();
      const code = code2FAInput?.value.trim() || '';

      if (!code) {
        banners2FA.showError(
          t('auth.login_2fa.code_required') || 'Ingresa el código de verificación o código de respaldo.'
        );
        return;
      }

      await withButtonLoading(submit2FABtn, t('auth.login_2fa.loading') || 'Verificando...', async () => {
        try {
          const res = await postApi(API_ROUTES.auth.login2fa, {
            code,
            tempToken: state.tempToken || undefined,
          });

          const data = await res.json();

          if (!res.ok) {
            banners2FA.showError(data.error || t('toasts.generic_error') || 'Código incorrecto o expirado.');
            return;
          }

          setAuthState(data.user, data.accounts || []);
          clearTwoFactorState();
          navigate('/');
        } catch {
          banners2FA.showError(t('toasts.network_error') || 'Error de red.');
        }
      });
    };

    submit2FABtn?.addEventListener('click', executeVerify2FA, { signal: this.abortController.signal });
    bindSubmitOnEnter(code2FAInput, executeVerify2FA);

    backToLoginLink?.addEventListener('click', (e) => {
      e.preventDefault();
      clearTwoFactorState();
      activateStep('main');
    }, { signal: this.abortController.signal });
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
}

export async function createLoginView(startAt2FA = false): Promise<HTMLElement> {
  const container = await loadTemplate('/views/auth/login.html');
  const controller = new LoginController(container, startAt2FA);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}

export function createLogin2FAView(): Promise<HTMLElement> {
  return createLoginView(true);
}

export class RegisterController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private initialStage: number;
  private turnstileInstance: TurnstileInstance | null = null;

  constructor(container: HTMLElement, initialStage = 1) {
    this.container = container;
    this.initialStage = initialStage;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();

    const turnstileBox = this.container.querySelector<HTMLElement>('[data-ref="turnstile-register-container"]');
    if (turnstileBox) {
      void mountTurnstile(turnstileBox, { action: 'register' }).then((inst) => {
        this.turnstileInstance = inst;
      });
    }

    const step1 = this.container.querySelector<HTMLElement>('[data-ref="register-step-1"]');
    const step2 = this.container.querySelector<HTMLElement>('[data-ref="register-step-2"]');
    const step3 = this.container.querySelector<HTMLElement>('[data-ref="register-step-3"]');

    const emailInput = this.container.querySelector<HTMLInputElement>('[data-ref="register-email"]');
    const passwordInput = this.container.querySelector<HTMLInputElement>('[data-ref="register-password"]');
    const togglePassBtn = this.container.querySelector<HTMLElement>('[data-ref="toggle-register-password"]');
    const submitStage1Btn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-stage1"]');
    const googleRegisterBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-google-register"]');
    const bannersStage1 = createBannerManager(this.container, { errorRef: 'register-error-stage1' });

    googleRegisterBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = '/api/auth/google';
    }, { signal: this.abortController.signal });

    const usernameInput = this.container.querySelector<HTMLInputElement>('[data-ref="register-username"]');
    const randomUsernameBtn = this.container.querySelector<HTMLElement>('[data-ref="btn-random-username"]');
    const submitStage2Btn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-stage2"]');
    const btnBackStage1 = this.container.querySelector<HTMLElement>('[data-ref="btn-back-stage1"]');
    const bannersStage2 = createBannerManager(this.container, { errorRef: 'register-error-stage2' });

    const subtitleTextEl = this.container.querySelector<HTMLElement>('[data-ref="verify-subtitle-text"]');
    const codeInput = this.container.querySelector<HTMLInputElement>('[data-ref="register-code"]');
    const submitStage3Btn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-stage3"]');
    const resendCodeBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-resend-code"]');
    const restartRegisterLink = this.container.querySelector<HTMLElement>('[data-ref="btn-restart-register"]');
    const bannersStage3 = createBannerManager(this.container, {
      errorRef: 'register-error-stage3',
      successRef: 'register-success-stage3',
    });

    const state = getRegistrationState();
    if (state.email && emailInput) emailInput.value = state.email;
    if (state.username && usernameInput) usernameInput.value = state.username;

    bindNavigationLinks(this.container, {
      'btn-to-login': '/login',
      'register-home-link': '/',
    });

    setupPasswordToggle(togglePassBtn, passwordInput, {
      hideTooltip: t('auth.login.hide_password') || 'Ocultar contraseña',
      showTooltip: t('auth.login.show_password') || 'Mostrar contraseña',
    });

    const activateStage = (stageNum: number) => {
      bannersStage1.hideAll();
      bannersStage2.hideAll();
      bannersStage3.hideAll();

      if (step1) step1.style.display = stageNum === 1 ? 'block' : 'none';
      if (step2) step2.style.display = stageNum === 2 ? 'block' : 'none';
      if (step3) step3.style.display = stageNum === 3 ? 'block' : 'none';

      if (stageNum === 1) {
        window.history.pushState({}, '', '/register');
        requestAnimationFrame(() => emailInput?.focus());
      } else if (stageNum === 2) {
        window.history.pushState({}, '', '/register/aditional-data');
        requestAnimationFrame(() => usernameInput?.focus());
      } else if (stageNum === 3) {
        window.history.pushState({}, '', '/register/verification-account');
        const currentState = getRegistrationState();
        if (subtitleTextEl) {
          subtitleTextEl.innerHTML = `Hemos enviado un código de 6 dígitos a <strong style="color: var(--text-primary);">${currentState.email || ''}</strong>. Es válido durante 15 minutos.`;
        }
        requestAnimationFrame(() => codeInput?.focus());
      }
    };

    let currentStage = this.initialStage;
    if (currentStage === 2 && !hasStage1Data()) {
      currentStage = 1;
      window.history.replaceState({}, '', '/register');
    } else if (currentStage === 3 && !hasStage2Data()) {
      currentStage = 1;
      window.history.replaceState({}, '', '/register');
    }
    activateStage(currentStage);

    const executeStage1 = async () => {
      bannersStage1.hideAll();
      const email = emailInput?.value.trim() || '';
      const password = passwordInput?.value || '';

      const emailValidation = validateEmail(email);
      if (!emailValidation.valid) {
        bannersStage1.showError(emailValidation.error || 'Correo inválido.');
        return;
      }

      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        bannersStage1.showError(passwordValidation.error || 'Contraseña inválida.');
        return;
      }

      const turnstileToken = this.turnstileInstance?.getResponse() || '';

      await withButtonLoading(submitStage1Btn, t('auth.register.loading') || 'Comprobando...', async () => {
        try {
          const res = await postApi(
            '/api/register/stage1-validate',
            { email, password, turnstileToken },
            turnstileToken ? { 'x-turnstile-token': turnstileToken } : undefined
          );
          const data = await res.json();

          if (!res.ok) {
            this.turnstileInstance?.reset();
            bannersStage1.showError(data.error || 'Error al validar datos.');
            return;
          }

          saveStage1Data(email, password);
          activateStage(2);
        } catch {
          bannersStage1.showError('Error de red al conectar con el servidor.');
        }
      });
    };

    submitStage1Btn?.addEventListener('click', executeStage1, { signal: this.abortController.signal });
    bindSubmitOnEnter([emailInput, passwordInput], executeStage1);

    randomUsernameBtn?.addEventListener('click', () => {
      const currentState = getRegistrationState();
      const emailBase = (currentState.email || '')
        .split('@')[0]
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9_.-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^[._-]+|[._-]+$/g, '');
      const randomSuffix = Math.floor(100 + Math.random() * 900);
      let suggestedName = emailBase.length >= 3
        ? `${emailBase.slice(0, 24)}_${randomSuffix}`
        : `user_${randomSuffix}_${Math.floor(100 + Math.random() * 900)}`;
      suggestedName = suggestedName.slice(0, 30);
      if (usernameInput) {
        usernameInput.value = suggestedName;
        usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
        usernameInput.focus();
      }
      bannersStage2.hideAll();
    }, { signal: this.abortController.signal });

    const executeStage2 = async () => {
      bannersStage2.hideAll();
      const currentState = getRegistrationState();
      const username = usernameInput?.value.trim() || '';

      const usernameValidation = validateUsername(username);
      if (!usernameValidation.valid) {
        bannersStage2.showError(usernameValidation.error || 'Nombre de usuario inválido.');
        return;
      }

      await withButtonLoading(submitStage2Btn, t('auth.register_stage2.loading') || 'Enviando código...', async () => {
        try {
          const res = await postApi('/api/register/send-code', {
            email: currentState.email,
            password: currentState.password,
            username,
          });

          const data = await res.json();

          if (!res.ok) {
            bannersStage2.showError(data.error || 'Error al enviar código de verificación.');
            return;
          }

          saveStage2Data(username);
          activateStage(3);
        } catch {
          bannersStage2.showError('Error de red al conectar con el servidor.');
        }
      });
    };

    submitStage2Btn?.addEventListener('click', executeStage2, { signal: this.abortController.signal });
    bindSubmitOnEnter(usernameInput, executeStage2);

    btnBackStage1?.addEventListener('click', (e) => {
      e.preventDefault();
      activateStage(1);
    }, { signal: this.abortController.signal });

    const executeStage3 = async () => {
      bannersStage3.hideAll();
      const currentState = getRegistrationState();
      const code = codeInput?.value.trim() || '';

      const codeValidation = validateVerificationCode(code);
      if (!codeValidation.valid) {
        bannersStage3.showError(codeValidation.error || 'Ingresa un código de 6 dígitos.');
        return;
      }

      await withButtonLoading(submitStage3Btn, t('auth.register_stage3.loading') || 'Verificando...', async () => {
        try {
          const res = await postApi('/api/register/verify-code', {
            code,
            email: currentState.email,
          });

          const data = await res.json();

          if (!res.ok) {
            bannersStage3.showError(data.error || 'Código incorrecto o expirado.');
            return;
          }

          setAuthState(data.user, data.accounts || []);
          clearRegistrationState();
          navigate('/');
        } catch {
          bannersStage3.showError('Error de red al verificar el código.');
        }
      });
    };

    submitStage3Btn?.addEventListener('click', executeStage3, { signal: this.abortController.signal });
    bindSubmitOnEnter(codeInput, executeStage3);

    resendCodeBtn?.addEventListener('click', async () => {
      bannersStage3.hideAll();
      const currentState = getRegistrationState();

      await withButtonLoading(resendCodeBtn, t('auth.register_stage3.resending') || 'Reenviando...', async () => {
        try {
          const res = await postApi('/api/register/resend-code', {
            email: currentState.email,
          });

          const data = await res.json();

          if (!res.ok) {
            bannersStage3.showError(data.error || 'Error al reenviar el código.');
            return;
          }

          bannersStage3.showSuccess(t('auth.register_stage3.code_sent') || 'Código reenviado exitosamente.');
        } catch {
          bannersStage3.showError('Error de red al reenviar el código.');
        }
      });
    }, { signal: this.abortController.signal });

    restartRegisterLink?.addEventListener('click', (e) => {
      e.preventDefault();
      clearRegistrationState();
      activateStage(1);
    }, { signal: this.abortController.signal });
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
}

export async function createRegisterView(targetStage = 1): Promise<HTMLElement> {
  const path = window.location.pathname;
  if (path === '/register/aditional-data') targetStage = 2;
  else if (path === '/register/verification-account') targetStage = 3;

  const container = await loadTemplate('/views/auth/register.html');
  const controller = new RegisterController(container, targetStage);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}

export class ForgotPasswordController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private turnstileInstance: TurnstileInstance | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();

    const turnstileBox = this.container.querySelector<HTMLElement>('[data-ref="turnstile-forgot-container"]');
    if (turnstileBox) {
      void mountTurnstile(turnstileBox, { action: 'forgot-password' }).then((inst) => {
        this.turnstileInstance = inst;
      });
    }

    const submitBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-forgot"]');
    const emailInput = this.container.querySelector<HTMLInputElement>('[data-ref="forgot-email"]');
    const banners = createBannerManager(this.container, {
      errorRef: 'forgot-error',
      successRef: 'forgot-success',
    });

    bindNavigationLinks(this.container, {
      'btn-forgot-to-login': '/login',
      'forgot-home-link': '/',
    });

    const handleSubmit = async () => {
      banners.hideAll();
      const email = emailInput?.value.trim() || '';

      const emailValidation = validateEmail(email);
      if (!emailValidation.valid) {
        banners.showError(emailValidation.error || t('toasts.generic_error'));
        emailInput?.focus();
        return;
      }

      const turnstileToken = this.turnstileInstance?.getResponse() || '';

      await withButtonLoading(submitBtn, t('auth.forgot_password.loading'), async () => {
        try {
          const res = await postApi(
            API_ROUTES.auth.forgotPassword,
            { email, turnstileToken },
            turnstileToken ? { 'x-turnstile-token': turnstileToken } : undefined
          );
          const data = await res.json().catch(() => ({}));

          if (res.ok) {
            banners.showSuccess(data.message || t('auth.forgot_password.success_msg'));
            if (emailInput) {
              emailInput.value = '';
            }
          } else {
            this.turnstileInstance?.reset();
            const errorMsg = data.error || t('toasts.generic_error');
            banners.showError(errorMsg);
          }
        } catch {
          banners.showError(t('toasts.network_error'));
        }
      });
    };

    submitBtn?.addEventListener('click', handleSubmit, { signal: this.abortController.signal });
    bindSubmitOnEnter(emailInput, handleSubmit);
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
}

export async function createForgotPasswordView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/auth/forgot-password.html');
  const controller = new ForgotPasswordController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}

export class ResetPasswordController {
  private abortController: AbortController | null = null;
  private container: HTMLElement;
  private turnstileInstance: TurnstileInstance | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();

    const turnstileBox = this.container.querySelector<HTMLElement>('[data-ref="turnstile-reset-container"]');
    if (turnstileBox) {
      void mountTurnstile(turnstileBox, { action: 'reset-password' }).then((inst) => {
        this.turnstileInstance = inst;
      });
    }

    const submitBtn = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-reset"]');
    const passwordInput = this.container.querySelector<HTMLInputElement>('[data-ref="reset-password"]');
    const confirmInput = this.container.querySelector<HTMLInputElement>('[data-ref="reset-password-confirm"]');
    const togglePassBtn = this.container.querySelector<HTMLElement>('[data-ref="toggle-reset-password"]');
    const toggleConfirmBtn = this.container.querySelector<HTMLElement>('[data-ref="toggle-reset-password-confirm"]');
    const banners = createBannerManager(this.container, {
      errorRef: 'reset-error',
      successRef: 'reset-success',
    });

    const urlParams = new URLSearchParams(window.location.search);
    const token = (urlParams.get('token') || '').trim();

    bindNavigationLinks(this.container, {
      'btn-reset-to-login': '/login',
      'reset-home-link': '/',
    });

    setupPasswordToggle(togglePassBtn, passwordInput, {
      hideTooltip: t('auth.login.hide_password'),
      showTooltip: t('auth.login.show_password'),
    });
    setupPasswordToggle(toggleConfirmBtn, confirmInput, {
      hideTooltip: t('auth.login.hide_password'),
      showTooltip: t('auth.login.show_password'),
    });

    if (!token) {
      banners.showError(t('toasts.generic_error'));
      if (submitBtn) submitBtn.disabled = true;
      if (passwordInput) passwordInput.disabled = true;
      if (confirmInput) confirmInput.disabled = true;
    } else {
      getApi(API_ROUTES.auth.resetPasswordValidate(token))
        .then((res) => res.json())
        .then((data) => {
          if (!data.valid) {
            banners.showError(data.error || t('toasts.generic_error'));
            if (submitBtn) submitBtn.disabled = true;
            if (passwordInput) passwordInput.disabled = true;
            if (confirmInput) confirmInput.disabled = true;
          }
        })
        .catch(() => {});
    }

    const handleSubmit = async () => {
      banners.hideAll();

      if (!token) {
        banners.showError(t('toasts.generic_error'));
        return;
      }

      const password = passwordInput?.value || '';
      const confirm = confirmInput?.value || '';

      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        banners.showError(passwordValidation.error || t('toasts.generic_error'));
        passwordInput?.focus();
        return;
      }

      if (password !== confirm) {
        banners.showError(t('validation.passwords_not_match'));
        confirmInput?.focus();
        return;
      }

      const turnstileToken = this.turnstileInstance?.getResponse() || '';

      await withButtonLoading(submitBtn, t('auth.reset_password.loading'), async () => {
        try {
          const res = await postApi(
            API_ROUTES.auth.resetPassword,
            { password, token, turnstileToken },
            turnstileToken ? { 'x-turnstile-token': turnstileToken } : undefined
          );
          const data = await res.json().catch(() => ({}));

          if (res.ok) {
            banners.showSuccess(t('auth.reset_password.success_msg'));
            if (passwordInput) passwordInput.disabled = true;
            if (confirmInput) confirmInput.disabled = true;
            if (submitBtn) submitBtn.style.display = 'none';

            setTimeout(() => {
              navigate('/login');
            }, 2000);
          } else {
            this.turnstileInstance?.reset();
            banners.showError(data.error || t('toasts.generic_error'));
          }
        } catch {
          banners.showError(t('toasts.network_error'));
        }
      });
    };

    submitBtn?.addEventListener('click', handleSubmit, { signal: this.abortController.signal });
    bindSubmitOnEnter([passwordInput, confirmInput], handleSubmit);
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
}

export async function createResetPasswordView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/auth/reset-password.html');
  const controller = new ResetPasswordController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
