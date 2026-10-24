const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

declare global {
  interface Window {
    __AURORA_TURNSTILE_SITE_KEY__?: string;
    turnstile?: {
      getResponse: (widgetId?: string) => string | undefined;
      remove: (widgetId: string) => void;
      render: (
        container: HTMLElement,
        options: {
          action?: string;
          appearance?: 'always' | 'execute' | 'interaction-only';
          callback?: (token: string) => void;
          'error-callback'?: (code: string) => void;
          'expired-callback'?: () => void;
          sitekey: string;
          size?: 'normal' | 'compact' | 'flexible';
          theme?: 'auto' | 'light' | 'dark';
        }
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

export interface TurnstileInstance {
  getResponse: () => string;
  reset: () => void;
  widgetId: string | null;
}

export interface TurnstileMountOptions {
  action?: string;
  appearance?: 'always' | 'execute' | 'interaction-only';
  onCompleted?: (token: string) => void;
  onError?: (code: string) => void;
  onExpired?: () => void;
  size?: 'normal' | 'compact' | 'flexible';
}

let scriptLoadingPromise: Promise<boolean> | null = null;

export function getTurnstileSiteKey(): string {
  const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env;
  const envKey = metaEnv?.VITE_TURNSTILE_SITE_KEY;
  if (typeof envKey === 'string' && envKey.trim()) {
    return envKey.trim();
  }
  if (typeof window !== 'undefined' && window.__AURORA_TURNSTILE_SITE_KEY__) {
    return window.__AURORA_TURNSTILE_SITE_KEY__.trim();
  }
  return '';
}

export function isTurnstileEnabled(): boolean {
  return Boolean(getTurnstileSiteKey());
}

export function loadTurnstileScript(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.turnstile) return Promise.resolve(true);

  if (scriptLoadingPromise) {
    return scriptLoadingPromise;
  }

  scriptLoadingPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector('script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]');
    if (existing) {
      if (window.turnstile) {
        resolve(true);
        return;
      }
      existing.addEventListener('load', () => resolve(true), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  return scriptLoadingPromise;
}

export async function mountTurnstile(
  container: HTMLElement,
  options: TurnstileMountOptions = {}
): Promise<TurnstileInstance> {
  const siteKey = getTurnstileSiteKey();
  if (!siteKey) {
    return {
      getResponse: () => '',
      reset: () => {},
      widgetId: null,
    };
  }

  const loaded = await loadTurnstileScript();
  if (!loaded || !window.turnstile) {
    return {
      getResponse: () => '',
      reset: () => {},
      widgetId: null,
    };
  }

  container.innerHTML = '';
  let currentToken = '';

  const themeMode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'auto';

  const widgetId = window.turnstile.render(container, {
    action: options.action,
    appearance: options.appearance || 'interaction-only',
    callback: (token: string) => {
      currentToken = token;
      options.onCompleted?.(token);
    },
    'error-callback': (code: string) => {
      currentToken = '';
      options.onError?.(code);
    },
    'expired-callback': () => {
      currentToken = '';
      options.onExpired?.();
    },
    sitekey: siteKey,
    size: options.size || 'flexible',
    theme: themeMode,
  });

  return {
    getResponse: () => {
      if (currentToken) return currentToken;
      return window.turnstile?.getResponse(widgetId) || '';
    },
    reset: () => {
      currentToken = '';
      if (widgetId && window.turnstile) {
        window.turnstile.reset(widgetId);
      }
    },
    widgetId,
  };
}

export function unmountTurnstile(widgetId: string | null): void {
  if (widgetId && typeof window !== 'undefined' && window.turnstile) {
    try {
      window.turnstile.remove(widgetId);
    } catch {}
  }
}
