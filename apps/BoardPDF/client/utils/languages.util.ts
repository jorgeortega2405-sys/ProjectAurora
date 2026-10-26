import { Language } from '../types/common.types.js';

export const AVAILABLE_LANGUAGES: Language[] = [
  { code: 'es', name: 'Español' },
  { code: 'en', name: 'English' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'am', name: 'አማርኛ' },
  { code: 'ar', name: 'العربية' },
  { code: 'as', name: 'অসমীয়া' },
  { code: 'az', name: 'Azərbaycanca' },
  { code: 'bg', name: 'Български' },
  { code: 'bn', name: 'বাংলা' },
  { code: 'ca', name: 'Català' },
  { code: 'ceb', name: 'Cebuano' },
  { code: 'cs', name: 'Čeština' },
  { code: 'cy', name: 'Cymraeg' },
  { code: 'da', name: 'Dansk' },
  { code: 'de', name: 'Deutsch' },
  { code: 'el', name: 'Ελληνικά' },
  { code: 'et', name: 'Eesti' },
  { code: 'eu', name: 'Euskara' },
  { code: 'fa', name: 'فارسی' },
  { code: 'ff', name: 'Fulani' },
  { code: 'fi', name: 'Suomi' },
  { code: 'fr', name: 'Français' },
  { code: 'gl', name: 'Galego' },
  { code: 'gu', name: 'ગુજરાતી' },
  { code: 'ha', name: 'Harshen Hausa' },
  { code: 'he', name: 'עברית' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'hr', name: 'Hrvatski' },
  { code: 'hu', name: 'Magyar' },
  { code: 'hy', name: 'Հայերեն' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'ig', name: 'Ị̀gbò' },
  { code: 'it', name: 'Italiano' },
  { code: 'ja', name: '日本語' },
  { code: 'jv', name: 'Basa Jawa' },
  { code: 'ka', name: 'ქართული' },
  { code: 'kk', name: 'Қазақша' },
  { code: 'km', name: 'ខ្មែរ' },
  { code: 'kn', name: 'ಕನ್ನಡ' },
  { code: 'ko', name: '한국어' },
  { code: 'ku', name: 'Kurdî' },
  { code: 'ky', name: 'Кыргызча' },
  { code: 'lt', name: 'Lietuvių' },
  { code: 'lv', name: 'Latviešu' },
  { code: 'mai', name: 'मैथिली' },
  { code: 'mg', name: 'Malagasy' },
  { code: 'mk', name: 'Македонски' },
  { code: 'ml', name: 'മലയാളം' },
  { code: 'mn', name: 'Монгол' },
  { code: 'mr', name: 'मराठी' },
  { code: 'ms', name: 'Melayu' },
  { code: 'my', name: 'မြန်မာ' },
  { code: 'nb', name: 'Norsk bokmål' },
  { code: 'ne', name: 'नेपाली' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'nr', name: 'Ndebele' },
  { code: 'ny', name: 'Chewa' },
  { code: 'om', name: 'Afaan Oromoo' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ' },
  { code: 'pl', name: 'Polski' },
  { code: 'pt', name: 'Português' },
  { code: 'ro', name: 'Română' },
  { code: 'ru', name: 'Русский' },
  { code: 'sd', name: 'सिन्धी' },
  { code: 'si', name: 'සිංහල' },
  { code: 'sk', name: 'Slovenčina' },
  { code: 'sl', name: 'Slovenščina' },
  { code: 'sn', name: 'Shona' },
  { code: 'so', name: 'Soomaali' },
  { code: 'sq', name: 'Shqip' },
  { code: 'sr', name: 'Srpski' },
  { code: 'ss', name: 'Swati' },
  { code: 'st', name: 'Sesotho' },
  { code: 'su', name: 'Basa Sunda' },
  { code: 'sv', name: 'Svenska' },
  { code: 'sw', name: 'Kiswahili' },
  { code: 'ta', name: 'தமிழ்' },
  { code: 'te', name: 'తెలుగు' },
  { code: 'th', name: 'ภาษาไทย' },
  { code: 'tl', name: 'Tagalog' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'tw', name: 'Twi' },
  { code: 'uk', name: 'Українська' },
  { code: 'ur', name: 'اردو' },
  { code: 'uz', name: 'Oʻzbekcha' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'wo', name: 'Wolof' },
  { code: 'xh', name: 'IsiXhosa' },
  { code: 'yo', name: 'Èdè Yorùbá' },
  { code: 'zh', name: '中文' },
  { code: 'zu', name: 'IsiZulu' },
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
  const clean = String(code).trim().toLowerCase().replace('_', '-');
  if (clean === 'us') return true;
  if (clean.startsWith('es-') || clean === 'es-419') return true;
  if (clean.startsWith('en-')) return true;
  if (clean.startsWith('fr-')) return true;
  if (clean.startsWith('pt-')) return true;
  if (clean.startsWith('nl-')) return true;
  if (clean.startsWith('zh-')) return true;
  if (clean.startsWith('ar-')) return true;
  if (clean.startsWith('ja-')) return true;
  if (clean.startsWith('pa-')) return true;
  if (SUPPORTED_LANG_CODES.has(clean)) return true;
  const base = clean.split('-')[0];
  return SUPPORTED_LANG_CODES.has(base);
}

export function normalizeLanguageCode(code: string | null | undefined): string {
  if (!code) return DEFAULT_LANGUAGE;
  const clean = String(code).trim().toLowerCase().replace('_', '-');

  if (clean === 'us' || clean.startsWith('en-')) {
    return 'en';
  }
  if (clean.startsWith('es-') || clean === 'es-419') {
    return 'es';
  }
  if (clean.startsWith('fr-')) {
    return 'fr';
  }
  if (clean.startsWith('pt-')) {
    return 'pt';
  }
  if (clean.startsWith('nl-')) {
    return 'nl';
  }
  if (clean.startsWith('zh-')) {
    return 'zh';
  }
  if (clean.startsWith('ar-')) {
    return 'ar';
  }
  if (clean.startsWith('ja-')) {
    return 'ja';
  }
  if (clean.startsWith('pa-')) {
    return 'pa';
  }

  if (SUPPORTED_LANG_CODES.has(clean)) {
    return clean;
  }

  const base = clean.split('-')[0];
  if (SUPPORTED_LANG_CODES.has(base)) {
    return base;
  }

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

    if (clean === 'us' || clean.startsWith('en-')) return 'en';
    if (clean.startsWith('es-') || clean === 'es-419') return 'es';

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
