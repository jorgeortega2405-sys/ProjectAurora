import { Language } from '../types/common.types.js';

export const AVAILABLE_LANGUAGES: Language[] = [
  { code: 'es', name: 'Español' },
  { code: 'en', name: 'English' },
  { code: 'zh', name: '中文 (简体)' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'ar', name: 'العربية' },
  { code: 'bn', name: 'বাংলা' },
  { code: 'pt', name: 'Português' },
  { code: 'ru', name: 'Русский' },
  { code: 'ur', name: 'اردو' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'de', name: 'Deutsch' },
  { code: 'ja', name: '日本語' },
  { code: 'fr', name: 'Français' },
  { code: 'mr', name: 'मराठी' },
  { code: 'te', name: 'తెలుగు' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'ta', name: 'தமிழ்' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'tl', name: 'Tagalog' },
  { code: 'ko', name: '한국어' },
  { code: 'fa', name: 'فارسی' },
  { code: 'ha', name: 'Harshen Hausa' },
  { code: 'sw', name: 'Kiswahili' },
  { code: 'jv', name: 'Basa Jawa' },
  { code: 'it', name: 'Italiano' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ' },
  { code: 'gu', name: 'ગુજરાતી' },
  { code: 'th', name: 'ภาษาไทย' },
  { code: 'pl', name: 'Polski' },
  { code: 'nl', name: 'Nederlands' },
];

export const SUPPORTED_LANG_CODES = new Set<string>(
  AVAILABLE_LANGUAGES.map((l) => l.code.toLowerCase())
);

export const LANGUAGE_MAP = new Map<string, string>(
  AVAILABLE_LANGUAGES.map((l) => [l.code.toLowerCase(), l.name])
);

export const DEFAULT_LANGUAGE = 'es';

export function isSupportedLanguage(code: string | null | undefined): boolean {
  if (!code) return false;
  return SUPPORTED_LANG_CODES.has(String(code).trim().toLowerCase());
}

export function normalizeLanguageCode(code: string | null | undefined): string {
  if (!code) return DEFAULT_LANGUAGE;
  const clean = String(code).trim().toLowerCase().replace('_', '-');

  if (SUPPORTED_LANG_CODES.has(clean)) {
    return clean;
  }

  const base = clean.split('-')[0];
  if (SUPPORTED_LANG_CODES.has(base)) {
    return base;
  }

  if (clean.startsWith('es')) return 'es';
  if (clean.startsWith('en')) return 'en';
  if (clean.startsWith('pt')) return 'pt';
  if (clean.startsWith('zh')) return 'zh';
  if (clean.startsWith('ar')) return 'ar';
  if (clean.startsWith('de')) return 'de';
  if (clean.startsWith('fr')) return 'fr';
  if (clean.startsWith('it')) return 'it';
  if (clean.startsWith('ru')) return 'ru';
  if (clean.startsWith('ja')) return 'ja';
  if (clean.startsWith('ko')) return 'ko';

  return DEFAULT_LANGUAGE;
}

export function getLanguageName(code: string | null | undefined): string {
  const norm = normalizeLanguageCode(code);
  return LANGUAGE_MAP.get(norm) || 'Español';
}

export function detectBrowserLanguage(): string {
  const browserLangs = navigator.languages || [navigator.language || ''];
  for (const bl of browserLangs) {
    if (!bl) continue;
    const clean = bl.trim().toLowerCase().replace('_', '-');

    if (SUPPORTED_LANG_CODES.has(clean)) {
      return clean;
    }

    const base = clean.split('-')[0];
    if (SUPPORTED_LANG_CODES.has(base)) {
      return base;
    }
  }
  return DEFAULT_LANGUAGE;
}
