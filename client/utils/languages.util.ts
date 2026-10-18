import { Language } from '../types/common.types.js';

export const AVAILABLE_LANGUAGES: Language[] = [
  { code: 'pa-PK', name: 'پن٘جابی (پاکستان)' },
  { code: 'om', name: 'Afaan Oromoo' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'az', name: 'Azərbaycanca' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'jv', name: 'Basa Jawa' },
  { code: 'su', name: 'Basa Sunda' },
  { code: 'ca', name: 'Català' },
  { code: 'ceb', name: 'Cebuano' },
  { code: 'ny', name: 'Chewa' },
  { code: 'cy', name: 'Cymraeg' },
  { code: 'da', name: 'Dansk' },
  { code: 'de', name: 'Deutsch' },
  { code: 'et', name: 'Eesti' },
  { code: 'en-AU', name: 'English (Australia)' },
  { code: 'en-IN', name: 'English (India)' },
  { code: 'en-PH', name: 'English (Philippines)' },
  { code: 'en-US', name: 'English (US)' },
  { code: 'en-GB', name: 'English (United Kingdom)' },
  { code: 'es-AR', name: 'Español (Argentina)' },
  { code: 'es-CO', name: 'Español (Colombia)' },
  { code: 'es-ES', name: 'Español (España)' },
  { code: 'es-US', name: 'Español (Estados Unidos)' },
  { code: 'es-419', name: 'Español (Latinoamérica)' },
  { code: 'es-MX', name: 'Español (México)' },
  { code: 'eu', name: 'Euskara' },
  { code: 'fr-BE', name: 'Français (Belgique)' },
  { code: 'fr-CA', name: 'Français (Canada)' },
  { code: 'fr-FR', name: 'Français (France)' },
  { code: 'ff', name: 'Fulani' },
  { code: 'gl', name: 'Galego' },
  { code: 'ha', name: 'Harshen Hausa' },
  { code: 'hr', name: 'Hrvatski' },
  { code: 'xh', name: 'IsiXhosa' },
  { code: 'zu', name: 'IsiZulu' },
  { code: 'it', name: 'Italiano' },
  { code: 'sw', name: 'Kiswahili' },
  { code: 'ku', name: 'Kurdî' },
  { code: 'lv', name: 'Latviešu' },
  { code: 'lt', name: 'Lietuvių' },
  { code: 'hu', name: 'Magyar' },
  { code: 'mg', name: 'Malagasy' },
  { code: 'ms', name: 'Melayu' },
  { code: 'nr', name: 'Ndebele' },
  { code: 'nl-BE', name: 'Nederlands (België)' },
  { code: 'nl-NL', name: 'Nederlands (Nederland)' },
  { code: 'nb', name: 'Norsk bokmål' },
  { code: 'uz', name: 'Oʻzbekcha' },
  { code: 'pl', name: 'Polski' },
  { code: 'pt-BR', name: 'Português (Brasil)' },
  { code: 'pt-PT', name: 'Português (Portugal)' },
  { code: 'ro', name: 'Română' },
  { code: 'st', name: 'Sesotho' },
  { code: 'sn', name: 'Shona' },
  { code: 'sq', name: 'Shqip' },
  { code: 'sk', name: 'Slovenčina' },
  { code: 'sl', name: 'Slovenščina' },
  { code: 'so', name: 'Soomaali' },
  { code: 'sr', name: 'Srpski' },
  { code: 'fi', name: 'Suomi' },
  { code: 'sv', name: 'Svenska' },
  { code: 'ss', name: 'Swati' },
  { code: 'tl', name: 'Tagalog' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'tw', name: 'Twi' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'wo', name: 'Wolof' },
  { code: 'yo', name: 'Èdè Yorùbá' },
  { code: 'cs', name: 'Čeština' },
  { code: 'el', name: 'Ελληνικά' },
  { code: 'bg', name: 'Български' },
  { code: 'ky', name: 'Кыргызча' },
  { code: 'mk', name: 'Македонски' },
  { code: 'mn', name: 'Монгол' },
  { code: 'ru', name: 'Русский' },
  { code: 'uk', name: 'Українська' },
  { code: 'kk', name: 'Қазақша' },
  { code: 'hy', name: 'Հայերեն' },
  { code: 'he', name: 'עברית' },
  { code: 'ur', name: 'اردو' },
  { code: 'ar-AE', name: 'عربي (الإمارات)' },
  { code: 'ar-SA', name: 'عربي (السعودية)' },
  { code: 'ar-MOD', name: 'عربي (اللغة المعاصرة)' },
  { code: 'ar-EG', name: 'عربي (مصر)' },
  { code: 'fa', name: 'فارسي' },
  { code: 'ne', name: 'नेपाली' },
  { code: 'mr', name: 'मराठी' },
  { code: 'mai', name: 'मैथिली' },
  { code: 'sd', name: 'सिन्धी' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'as', name: 'অসমীয়া' },
  { code: 'bn', name: 'বাংলা' },
  { code: 'pa-IN', name: 'ਪੰਜਾਬੀ (ਭਾਰਤ)' },
  { code: 'gu', name: 'ગુજરાતી' },
  { code: 'ta', name: 'தமிழ்' },
  { code: 'te', name: 'తెలుగు' },
  { code: 'kn', name: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'മലയാളം' },
  { code: 'si', name: 'සිංහල' },
  { code: 'th', name: 'ภาษาไทย' },
  { code: 'my', name: 'မြန်မာ' },
  { code: 'ka', name: 'ქართული' },
  { code: 'am', name: 'አማርኛ' },
  { code: 'km', name: 'ខ្មែរ' },
  { code: 'ig', name: 'Ị̀gbò' },
  { code: 'ja-Hira', name: 'にほんご（ひらがな）' },
  { code: 'ja', name: '日本語' },
  { code: 'zh-CN', name: '简体中文（中国大陆）' },
  { code: 'zh-TW', name: '繁體中文（台灣）' },
  { code: 'zh-HK', name: '繁體中文（香港）' },
  { code: 'ko', name: '한국어' },
];

export const LANGUAGE_MAP = new Map<string, string>(
  AVAILABLE_LANGUAGES.map((l) => [l.code.toLowerCase(), l.name])
);

export function getLanguageName(code: string | null | undefined): string {
  if (!code) return 'Español (México)';
  return LANGUAGE_MAP.get(String(code).toLowerCase()) || 'Español (México)';
}

export function detectBrowserLanguage(): string {
  const browserLangs = navigator.languages || [navigator.language || ''];
  for (const bl of browserLangs) {
    if (!bl) continue;
    const clean = bl.replace('_', '-');

    const exact = AVAILABLE_LANGUAGES.find(
      (l) => l.code.toLowerCase() === clean.toLowerCase()
    );
    if (exact) return exact.code;

    const baseCode = clean.split('-')[0].toLowerCase();
    const baseMatch = AVAILABLE_LANGUAGES.find(
      (l) => l.code.split('-')[0].toLowerCase() === baseCode
    );
    if (baseMatch) return baseMatch.code;
  }
  return 'es-MX';
}
