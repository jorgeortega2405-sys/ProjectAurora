import { API_ROUTES } from '../config/api-routes.js';
import { detectBrowserLanguage } from '../utils/languages.util.js';
import { currentUser, postApi } from './api.service.js';

let currentLanguage = 'es-MX';
let currentTranslations: Record<string, unknown> = {};

const FALLBACK_TRANSLATIONS: Record<string, unknown> = {
  app: {
    loading: 'Cargando...',
    name: 'ProjectAurora',
    tagline: 'Sistema SPA Modular',
  },
  common: {
    back: 'Volver',
    cancel: 'Cancelar',
    close: 'Cerrar',
    continue: 'Continuar',
    loading: 'Cargando...',
    save: 'Guardar',
  },
  error: {
    back_to_home: 'Volver al inicio',
    not_found_desc: 'La página que buscas no existe o ha sido movida.',
    not_found_title: 'Página no encontrada',
  },
  home: {
    badge: 'ProjectAurora',
    card_desc: 'El sistema base se encuentra inicializado y listo para recibir nuevos módulos y componentes.',
    card_title: 'Página de Inicio',
    subtitle: 'Layout y arquitectura SPA modular con diseño enterprise.',
    title: 'Bienvenido a Aurora',
  },
  nav: {
    accounts: 'Cuentas',
    add_account: 'Agregar otra cuenta',
    go_home: 'Ir al inicio',
    help: 'Ayuda',
    home: 'Inicio',
    login: 'Acceder',
    logout: 'Cerrar sesión',
    logout_all: 'Cerrar todas las sesiones',
    profile: 'Perfil',
    settings: 'Configuración',
    toggle_theme: 'Cambiar tema',
    upcoming: 'Próximamente',
    upgrade: 'Actualizar plan',
  },
  upcoming: {
    back_home: 'Ir a Inicio',
    badge: 'Próximamente',
    card_desc: 'Esta sección está preparada para recibir nuevas características y funcionalidades.',
    card_title: 'En Construcción',
    subtitle: 'Estamos preparando nuevas funciones y módulos. Pronto estarán disponibles.',
    title: 'Próximamente',
  },
};

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return current;
}

export function t(
  key: string,
  paramsOrFallback?: Record<string, number | string> | string,
  explicitFallback?: string
): string {
  let params: Record<string, number | string> = {};
  let fallback: string | undefined = explicitFallback;

  if (typeof paramsOrFallback === 'string') {
    fallback = paramsOrFallback;
  } else if (paramsOrFallback && typeof paramsOrFallback === 'object') {
    params = paramsOrFallback;
  }

  let val = getNestedValue(currentTranslations, key);
  if (val === undefined || val === null) {
    val = getNestedValue(FALLBACK_TRANSLATIONS, key);
  }

  if (val === undefined || val === null) {
    return fallback !== undefined ? fallback : key;
  }

  let text = String(val);
  for (const [paramKey, paramVal] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramVal));
  }

  return text;
}

export function getCurrentLanguage(): string {
  return currentLanguage;
}

async function loadTranslationFile(code: string): Promise<void> {
  try {
    const res = await fetch(`/translations/${encodeURIComponent(code)}.json`);
    if (res.ok) {
      currentTranslations = await res.json();
      try {
        sessionStorage.setItem(`aurora_i18n_${code}`, JSON.stringify(currentTranslations));
      } catch {}
      return;
    }
  } catch {}

  try {
    const fallbackRes = await fetch('/translations/es-MX.json');
    if (fallbackRes.ok) {
      currentTranslations = await fallbackRes.json();
      try {
        sessionStorage.setItem('aurora_i18n_es-MX', JSON.stringify(currentTranslations));
      } catch {}
      return;
    }
  } catch {}

  currentTranslations = FALLBACK_TRANSLATIONS;
}

export async function initI18n(): Promise<void> {
  const savedLang = localStorage.getItem('aurora_language');
  const browserLang = detectBrowserLanguage();

  currentLanguage = savedLang || browserLang || 'es-MX';
  try {
    const cached = sessionStorage.getItem(`aurora_i18n_${currentLanguage}`);
    if (cached) {
      currentTranslations = JSON.parse(cached);
      void loadTranslationFile(currentLanguage);
      return;
    }
  } catch {}
  await loadTranslationFile(currentLanguage);
}

export async function setLanguage(code: string): Promise<void> {
  if (!code) return;
  currentLanguage = code;
  localStorage.setItem('aurora_language', code);

  await loadTranslationFile(code);

  if (currentUser) {
    try {
      await postApi(API_ROUTES.settings.preferences, { language: code });
    } catch {}
  }
}

export function translateElement<T extends HTMLElement>(element: T): T {
  const nodesWithI18n = element.querySelectorAll<HTMLElement>('[data-i18n]');
  nodesWithI18n.forEach((node) => {
    const key = node.getAttribute('data-i18n');
    if (key) {
      node.textContent = t(key);
    }
  });

  const htmlNodes = element.querySelectorAll<HTMLElement>('[data-i18n-html]');
  htmlNodes.forEach((node) => {
    const key = node.getAttribute('data-i18n-html');
    if (key) {
      node.innerHTML = t(key);
    }
  });

  const placeholders = element.querySelectorAll<HTMLElement>('[data-i18n-placeholder]');
  placeholders.forEach((node) => {
    const key = node.getAttribute('data-i18n-placeholder');
    if (key && 'placeholder' in node) {
      (node as unknown as HTMLInputElement).placeholder = t(key);
    }
  });

  const tooltips = element.querySelectorAll<HTMLElement>('[data-i18n-tooltip]');
  tooltips.forEach((node) => {
    const key = node.getAttribute('data-i18n-tooltip');
    if (key) {
      node.setAttribute('data-tooltip', t(key));
    }
  });

  const arias = element.querySelectorAll<HTMLElement>('[data-i18n-aria]');
  arias.forEach((node) => {
    const key = node.getAttribute('data-i18n-aria');
    if (key) {
      node.setAttribute('aria-label', t(key));
    }
  });

  if (element.hasAttribute('data-i18n')) {
    const key = element.getAttribute('data-i18n');
    if (key) {
      element.textContent = t(key);
    }
  }

  return element;
}
