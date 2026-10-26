export interface LanguageInfo {
  code: string;
  name: string;
}

export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
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
  SUPPORTED_LANGUAGES.map((l) => l.code.toLowerCase())
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

export interface ServerRouteSeoInfo {
  category?: string;
  descriptions: Record<string, string>;
  isTool?: boolean;
  routeId: string;
  slugs: Record<string, string>;
  titles: Record<string, string>;
}

export const SERVER_SEO_ROUTES: Record<string, ServerRouteSeoInfo> = {
  home: {
    descriptions: {
      en: 'Free and secure online PDF tools. Merge, split, compress, edit, convert, and protect your PDF documents with ease.',
      es: 'Herramientas PDF online 100% gratis y seguras. Une, divide, comprime, edita, convierte y protege tus documentos PDF con facilidad.',
    },
    routeId: 'home',
    slugs: { de: '', en: '', es: '', fr: '', it: '', pt: '' },
    titles: {
      en: 'BoardPDF - Free & Secure Online PDF Tools',
      es: 'BoardPDF - Herramientas PDF online 100% gratis y seguras',
    },
  },
  'merge-pdf': {
    category: 'organize',
    descriptions: {
      en: 'Combine and merge multiple PDF documents into one single file in the exact order you want. Fast, easy, and secure.',
      es: 'Combina y une múltiples documentos PDF en un solo archivo en el orden que desees. Rápido, fácil y seguro.',
    },
    isTool: true,
    routeId: 'merge-pdf',
    slugs: { de: 'pdf-zusammenfuegen', en: 'merge-pdf', es: 'unir-pdf', fr: 'fusionner-pdf', it: 'unire-pdf', pt: 'juntar-pdf' },
    titles: {
      en: 'Merge PDF - Combine PDF files online for free | BoardPDF',
      es: 'Unir PDF - Combina archivos PDF online gratis | BoardPDF',
    },
  },
  'split-pdf': {
    category: 'organize',
    descriptions: {
      en: 'Split a PDF into multiple files or extract specific pages with ease and high precision.',
      es: 'Divide un PDF en múltiples archivos o extrae páginas específicas con facilidad y precisión.',
    },
    isTool: true,
    routeId: 'split-pdf',
    slugs: { de: 'pdf-teilen', en: 'split-pdf', es: 'dividir-pdf', fr: 'diviser-pdf', it: 'dividere-pdf', pt: 'dividir-pdf' },
    titles: {
      en: 'Split PDF - Separate PDF pages online | BoardPDF',
      es: 'Dividir PDF - Separa páginas de tus documentos PDF | BoardPDF',
    },
  },
  'remove-pdf-pages': {
    category: 'organize',
    descriptions: {
      en: 'Remove unwanted pages from your PDF document visually and instantly.',
      es: 'Elimina páginas no deseadas de tu PDF en segundos de forma visual y sencilla.',
    },
    isTool: true,
    routeId: 'remove-pdf-pages',
    slugs: { de: 'pdf-seiten-loeschen', en: 'remove-pdf-pages', es: 'eliminar-paginas-pdf', fr: 'supprimer-pages-pdf', it: 'eliminare-pagine-pdf', pt: 'remover-paginas-pdf' },
    titles: {
      en: 'Remove PDF Pages - Delete unwanted pages | BoardPDF',
      es: 'Eliminar Páginas PDF - Borra hojas innecesarias | BoardPDF',
    },
  },
  'extract-pdf-pages': {
    category: 'organize',
    descriptions: {
      en: 'Extract specific pages from your PDF document and generate a new file instantly.',
      es: 'Extrae páginas específicas de un archivo PDF y crea un nuevo documento al instante.',
    },
    isTool: true,
    routeId: 'extract-pdf-pages',
    slugs: { de: 'pdf-seiten-extrahieren', en: 'extract-pdf-pages', es: 'extraer-paginas-pdf', fr: 'extraire-pages-pdf', it: 'estrarre-pagine-pdf', pt: 'extrair-paginas-pdf' },
    titles: {
      en: 'Extract PDF Pages - Save selected pages | BoardPDF',
      es: 'Extraer Páginas de PDF - Guarda páginas seleccionadas | BoardPDF',
    },
  },
  'organize-pdf': {
    category: 'organize',
    descriptions: {
      en: 'Sort, remove and rotate pages in your PDF file easily with interactive visual preview.',
      es: 'Ordena, elimina y rota páginas de tu archivo PDF fácilmente con vista previa interactiva.',
    },
    isTool: true,
    routeId: 'organize-pdf',
    slugs: { de: 'pdf-organisieren', en: 'organize-pdf', es: 'organizar-pdf', fr: 'organiser-pdf', it: 'organizzare-pdf', pt: 'organizar-pdf' },
    titles: {
      en: 'Organize PDF - Reorder, rotate and sort pages | BoardPDF',
      es: 'Organizar PDF - Reordena, rota y ordena páginas | BoardPDF',
    },
  },
  'compress-pdf': {
    category: 'optimize',
    descriptions: {
      en: 'Reduce your PDF file size while maintaining the highest possible document quality.',
      es: 'Reduce el tamaño de tus documentos PDF manteniendo la máxima calidad posible.',
    },
    isTool: true,
    routeId: 'compress-pdf',
    slugs: { de: 'pdf-verkleinern', en: 'compress-pdf', es: 'comprimir-pdf', fr: 'compresser-pdf', it: 'comprimere-pdf', pt: 'comprimir-pdf' },
    titles: {
      en: 'Compress PDF - Reduce PDF file size online | BoardPDF',
      es: 'Comprimir PDF - Reduce el tamaño de tu archivo PDF | BoardPDF',
    },
  },
  'repair-pdf': {
    category: 'optimize',
    descriptions: {
      en: 'Repair and recover content from damaged or corrupted PDF documents online.',
      es: 'Repara y rescata el contenido de archivos PDF dañados o con errores de formato.',
    },
    isTool: true,
    routeId: 'repair-pdf',
    slugs: { de: 'pdf-reparieren', en: 'repair-pdf', es: 'reparar-pdf', fr: 'reparer-pdf', it: 'riparare-pdf', pt: 'reparar-pdf' },
    titles: {
      en: 'Repair PDF - Fix corrupt and damaged PDF files | BoardPDF',
      es: 'Reparar PDF - Recupera archivos PDF dañados o corruptos | BoardPDF',
    },
  },
  'ocr-pdf': {
    category: 'optimize',
    descriptions: {
      en: 'Recognize text from scanned documents and images to make them searchable and selectable.',
      es: 'Reconoce texto en documentos escaneados e imágenes para hacerlos buscables y editables.',
    },
    isTool: true,
    routeId: 'ocr-pdf',
    slugs: { de: 'ocr-pdf', en: 'ocr-pdf', es: 'ocr-pdf', fr: 'ocr-pdf', it: 'ocr-pdf', pt: 'ocr-pdf' },
    titles: {
      en: 'OCR PDF - Convert scanned PDF to searchable text | BoardPDF',
      es: 'OCR PDF - Convierte texto escaneado a PDF editable | BoardPDF',
    },
  },
  'jpg-to-pdf': {
    category: 'convert-to-pdf',
    descriptions: {
      en: 'Convert JPG photos and images to PDF format in seconds with optimal quality.',
      es: 'Convierte fotos e imágenes JPG a formato PDF en segundos con la mejor calidad.',
    },
    isTool: true,
    routeId: 'jpg-to-pdf',
    slugs: { de: 'jpg-in-pdf', en: 'jpg-to-pdf', es: 'jpg-a-pdf', fr: 'jpg-en-pdf', it: 'da-jpg-a-pdf', pt: 'jpg-para-pdf' },
    titles: {
      en: 'JPG to PDF - Convert images to PDF documents | BoardPDF',
      es: 'JPG a PDF - Convierte imágenes a documentos PDF | BoardPDF',
    },
  },
  'word-to-pdf': {
    category: 'convert-to-pdf',
    descriptions: {
      en: 'Convert your Word documents (DOC, DOCX) to PDF keeping original formatting intact.',
      es: 'Convierte tus documentos de Word (DOC, DOCX) a PDF manteniendo el diseño original.',
    },
    isTool: true,
    routeId: 'word-to-pdf',
    slugs: { de: 'word-in-pdf', en: 'word-to-pdf', es: 'word-a-pdf', fr: 'word-en-pdf', it: 'da-word-a-pdf', pt: 'word-para-pdf' },
    titles: {
      en: 'Word to PDF - Convert DOCX files to PDF | BoardPDF',
      es: 'Word a PDF - Convierte archivos DOCX a PDF | BoardPDF',
    },
  },
  'powerpoint-to-pdf': {
    category: 'convert-to-pdf',
    descriptions: {
      en: 'Convert your PPT and PPTX presentations into PDF files for easy sharing.',
      es: 'Convierte tus presentaciones PPT y PPTX a PDF para compartirlas fácilmente.',
    },
    isTool: true,
    routeId: 'powerpoint-to-pdf',
    slugs: { de: 'powerpoint-in-pdf', en: 'powerpoint-to-pdf', es: 'powerpoint-a-pdf', fr: 'powerpoint-en-pdf', it: 'da-powerpoint-a-pdf', pt: 'powerpoint-para-pdf' },
    titles: {
      en: 'PowerPoint to PDF - Convert PPT slides to PDF | BoardPDF',
      es: 'PowerPoint a PDF - Convierte diapositivas PPT a PDF | BoardPDF',
    },
  },
  'excel-to-pdf': {
    category: 'convert-to-pdf',
    descriptions: {
      en: 'Convert Excel tables and spreadsheets (XLS, XLSX) to print-ready PDF files.',
      es: 'Convierte tablas y hojas de cálculo de Excel (XLS, XLSX) a documentos PDF listos para imprimir.',
    },
    isTool: true,
    routeId: 'excel-to-pdf',
    slugs: { de: 'excel-in-pdf', en: 'excel-to-pdf', es: 'excel-a-pdf', fr: 'excel-en-pdf', it: 'da-excel-a-pdf', pt: 'excel-para-pdf' },
    titles: {
      en: 'Excel to PDF - Convert XLS spreadsheets to PDF | BoardPDF',
      es: 'Excel a PDF - Convierte hojas de cálculo XLS a PDF | BoardPDF',
    },
  },
  'html-to-pdf': {
    category: 'convert-to-pdf',
    descriptions: {
      en: 'Convert web pages, HTML code or URLs into high-fidelity PDF documents.',
      es: 'Convierte páginas web, código HTML o URLs a documentos PDF de alta fidelidad.',
    },
    isTool: true,
    routeId: 'html-to-pdf',
    slugs: { de: 'html-in-pdf', en: 'html-to-pdf', es: 'html-a-pdf', fr: 'html-en-pdf', it: 'da-html-a-pdf', pt: 'html-para-pdf' },
    titles: {
      en: 'HTML to PDF - Convert web pages and HTML to PDF | BoardPDF',
      es: 'HTML a PDF - Convierte páginas web y código a PDF | BoardPDF',
    },
  },
  'pdf-to-jpg': {
    category: 'convert-from-pdf',
    descriptions: {
      en: 'Convert your PDF pages to high-resolution JPG images or extract all images easily.',
      es: 'Convierte páginas de tu archivo PDF a imágenes JPG de alta resolución o extrae todas las fotos.',
    },
    isTool: true,
    routeId: 'pdf-to-jpg',
    slugs: { de: 'pdf-in-jpg', en: 'pdf-to-jpg', es: 'pdf-a-jpg', fr: 'pdf-en-jpg', it: 'da-pdf-a-jpg', pt: 'pdf-para-jpg' },
    titles: {
      en: 'PDF to JPG - Extract images or convert pages to JPG | BoardPDF',
      es: 'PDF a JPG - Extrae imágenes o convierte páginas a JPG | BoardPDF',
    },
  },
  'pdf-to-word': {
    category: 'convert-from-pdf',
    descriptions: {
      en: 'Convert your PDF files to editable Word (DOCX) documents with pinpoint accuracy.',
      es: 'Convierte tus documentos PDF a Word (DOCX) editables con máxima precisión de texto.',
    },
    isTool: true,
    routeId: 'pdf-to-word',
    slugs: { de: 'pdf-in-word', en: 'pdf-to-word', es: 'pdf-a-word', fr: 'pdf-en-word', it: 'da-pdf-a-word', pt: 'pdf-para-word' },
    titles: {
      en: 'PDF to Word - Convert PDF files to editable DOCX | BoardPDF',
      es: 'PDF a Word - Convierte archivos PDF a DOCX editable | BoardPDF',
    },
  },
  'pdf-to-powerpoint': {
    category: 'convert-from-pdf',
    descriptions: {
      en: 'Convert your PDF files into editable PowerPoint PPTX slide presentations.',
      es: 'Convierte tus archivos PDF en presentaciones editables de PowerPoint PPTX.',
    },
    isTool: true,
    routeId: 'pdf-to-powerpoint',
    slugs: { de: 'pdf-in-powerpoint', en: 'pdf-to-powerpoint', es: 'pdf-a-powerpoint', fr: 'pdf-en-powerpoint', it: 'da-pdf-a-powerpoint', pt: 'pdf-para-powerpoint' },
    titles: {
      en: 'PDF to PowerPoint - Convert PDF to PPTX slides | BoardPDF',
      es: 'PDF a PowerPoint - Convierte tu PDF a diapositivas PPTX | BoardPDF',
    },
  },
  'pdf-to-excel': {
    category: 'convert-from-pdf',
    descriptions: {
      en: 'Extract tables from your PDF documents directly into Excel spreadsheets in seconds.',
      es: 'Extrae tablas de tus documentos PDF directamente a hojas de cálculo de Excel en segundos.',
    },
    isTool: true,
    routeId: 'pdf-to-excel',
    slugs: { de: 'pdf-in-excel', en: 'pdf-to-excel', es: 'pdf-a-excel', fr: 'pdf-en-excel', it: 'da-pdf-a-excel', pt: 'pdf-para-excel' },
    titles: {
      en: 'PDF to Excel - Extract PDF tables to XLSX spreadsheets | BoardPDF',
      es: 'PDF a Excel - Extrae tablas de PDF a hojas XLSX | BoardPDF',
    },
  },
  'pdf-to-pdfa': {
    category: 'convert-from-pdf',
    descriptions: {
      en: 'Transform your PDF documents to standard PDF/A format for secure legal and institutional archiving.',
      es: 'Transforma tus documentos PDF a formato estándar PDF/A para archivado legal e institucional seguro.',
    },
    isTool: true,
    routeId: 'pdf-to-pdfa',
    slugs: { de: 'pdf-in-pdfa', en: 'pdf-to-pdfa', es: 'pdf-a-pdfa', fr: 'pdf-en-pdfa', it: 'da-pdf-a-pdfa', pt: 'pdf-para-pdfa' },
    titles: {
      en: 'PDF to PDF/A - Convert documents for long-term archiving | BoardPDF',
      es: 'PDF a PDF/A - Convierte documentos para archivo a largo plazo | BoardPDF',
    },
  },
  'rotate-pdf': {
    category: 'edit',
    descriptions: {
      en: 'Rotate your PDF documents horizontally or vertically. Rotate single pages or the entire file.',
      es: 'Rota tus documentos PDF horizontal o verticalmente. Gira páginas individuales o todo el archivo.',
    },
    isTool: true,
    routeId: 'rotate-pdf',
    slugs: { de: 'pdf-drehen', en: 'rotate-pdf', es: 'rotar-pdf', fr: 'pivoter-pdf', it: 'ruotare-pdf', pt: 'rodar-pdf' },
    titles: {
      en: 'Rotate PDF - Turn PDF pages online | BoardPDF',
      es: 'Rotar PDF - Gira páginas PDF online | BoardPDF',
    },
  },
  'page-numbers': {
    category: 'edit',
    descriptions: {
      en: 'Add page numbers to your PDF documents with custom typography, formatting, and positioning.',
      es: 'Añade números de página a tus documentos PDF con formato, tipografía y posición personalizados.',
    },
    isTool: true,
    routeId: 'page-numbers',
    slugs: { de: 'seitenzahlen-pdf', en: 'page-numbers', es: 'numeros-de-pagina', fr: 'numeroter-pdf', it: 'numeri-di-pagina-pdf', pt: 'numerar-pdf' },
    titles: {
      en: 'Page Numbers in PDF - Number your PDF pages | BoardPDF',
      es: 'Números de Página en PDF - Numera tus documentos | BoardPDF',
    },
  },
  'watermark-pdf': {
    category: 'edit',
    descriptions: {
      en: 'Add text or image watermarks to your PDF files with customizable transparency and position.',
      es: 'Agrega marcas de agua de texto o imagen a tus archivos PDF con transparencia y posición ajustables.',
    },
    isTool: true,
    routeId: 'watermark-pdf',
    slugs: { de: 'pdf-wasserzeichen', en: 'watermark-pdf', es: 'marca-de-agua', fr: 'filigrane-pdf', it: 'filigrana-pdf', pt: 'marca-dagua' },
    titles: {
      en: 'Watermark PDF - Add watermarks to your documents | BoardPDF',
      es: 'Marca de Agua en PDF - Protege tus documentos | BoardPDF',
    },
  },
  'crop-pdf': {
    category: 'edit',
    descriptions: {
      en: 'Trim margins or specific regions of your PDF document with precision and ease.',
      es: 'Recorta los márgenes o áreas específicas de tu documento PDF de forma precisa e intuitiva.',
    },
    isTool: true,
    routeId: 'crop-pdf',
    slugs: { de: 'pdf-zuschneiden', en: 'crop-pdf', es: 'recortar-pdf', fr: 'recadrer-pdf', it: 'ritagliare-pdf', pt: 'cortar-pdf' },
    titles: {
      en: 'Crop PDF - Trim margins and crop PDF pages | BoardPDF',
      es: 'Recortar PDF - Ajusta márgenes y recorta páginas | BoardPDF',
    },
  },
  'edit-pdf': {
    category: 'edit',
    descriptions: {
      en: 'Edit PDF documents in your browser by adding text, signatures, annotations, images, and shapes.',
      es: 'Edita documentos PDF en tu navegador añadiendo texto, firmas, notas, imágenes y dibujos.',
    },
    isTool: true,
    routeId: 'edit-pdf',
    slugs: { de: 'pdf-bearbeiten', en: 'edit-pdf', es: 'editar-pdf', fr: 'modifier-pdf', it: 'modificare-pdf', pt: 'editar-pdf' },
    titles: {
      en: 'Edit PDF - Add text, shapes and drawings online | BoardPDF',
      es: 'Editar PDF - Agrega texto, formas y dibujos online | BoardPDF',
    },
  },
  'unlock-pdf': {
    category: 'security',
    descriptions: {
      en: 'Remove passwords and restrictions from your PDF files to view, print, and edit them freely.',
      es: 'Elimina contraseñas y restricciones de tus archivos PDF para verlos, imprimirlos y editarlos libremente.',
    },
    isTool: true,
    routeId: 'unlock-pdf',
    slugs: { de: 'pdf-entsperren', en: 'unlock-pdf', es: 'desbloquear-pdf', fr: 'deverrouiller-pdf', it: 'sbloccare-pdf', pt: 'desbloquear-pdf' },
    titles: {
      en: 'Unlock PDF - Remove password and permissions | BoardPDF',
      es: 'Desbloquear PDF - Quita la contraseña de seguridad | BoardPDF',
    },
  },
  'protect-pdf': {
    category: 'security',
    descriptions: {
      en: 'Protect your confidential PDF files with strong passwords and state-of-the-art encryption.',
      es: 'Protege tus documentos PDF confidenciales con contraseñas seguras y cifrado de última generación.',
    },
    isTool: true,
    routeId: 'protect-pdf',
    slugs: { de: 'pdf-schuetzen', en: 'protect-pdf', es: 'proteger-pdf', fr: 'proteger-pdf', it: 'proteggere-pdf', pt: 'proteger-pdf' },
    titles: {
      en: 'Protect PDF - Encrypt and password protect your PDF | BoardPDF',
      es: 'Proteger PDF - Encripta y pon contraseña a tu PDF | BoardPDF',
    },
  },
  'redact-pdf': {
    category: 'security',
    descriptions: {
      en: 'Permanently blackout and sanitize sensitive information and personal data from your PDF files.',
      es: 'Tacha y elimina permanentemente información sensible y datos personales de tus documentos PDF.',
    },
    isTool: true,
    routeId: 'redact-pdf',
    slugs: { de: 'pdf-schwaerzen', en: 'redact-pdf', es: 'censurar-pdf', fr: 'biffer-pdf', it: 'censurare-pdf', pt: 'censurar-pdf' },
    titles: {
      en: 'Redact PDF - Permanently blackout sensitive info | BoardPDF',
      es: 'Censurar PDF - Oculta datos y texto confidencial | BoardPDF',
    },
  },
  'compare-pdf': {
    category: 'security',
    descriptions: {
      en: 'Compare two PDF documents visually side by side to instantly spot text and visual changes.',
      es: 'Compara dos archivos PDF visualmente lado a lado y detecta cambios y diferencias al instante.',
    },
    isTool: true,
    routeId: 'compare-pdf',
    slugs: { de: 'pdf-vergleichen', en: 'compare-pdf', es: 'comparar-pdf', fr: 'comparer-pdf', it: 'confrontare-pdf', pt: 'comparar-pdf' },
    titles: {
      en: 'Compare PDF - Spot differences between two files | BoardPDF',
      es: 'Comparar PDF - Resalta diferencias entre dos archivos | BoardPDF',
    },
  },
  'summarize-pdf': {
    category: 'pdf-intelligence',
    descriptions: {
      en: 'Summarize extensive documents, reports and articles in seconds using advanced artificial intelligence.',
      es: 'Resume documentos extensos y reportes en segundos con inteligencia artificial avanzada.',
    },
    isTool: true,
    routeId: 'summarize-pdf',
    slugs: { de: 'pdf-zusammenfassen', en: 'summarize-pdf', es: 'resumir-pdf', fr: 'resumer-pdf', it: 'riassumere-pdf', pt: 'resumir-pdf' },
    titles: {
      en: 'Summarize PDF - Smart automatic summaries | BoardPDF',
      es: 'Resumir PDF - Extrae resúmenes inteligentes | BoardPDF',
    },
  },
  'translate-pdf': {
    category: 'pdf-intelligence',
    descriptions: {
      en: 'Translate PDF documents into more than 30 languages while preserving original formatting and layout.',
      es: 'Traduce documentos PDF a más de 30 idiomas conservando el diseño y formato original.',
    },
    isTool: true,
    routeId: 'translate-pdf',
    slugs: { de: 'pdf-uebersetzen', en: 'translate-pdf', es: 'traducir-pdf', fr: 'traduire-pdf', it: 'tradurre-pdf', pt: 'traduzir-pdf' },
    titles: {
      en: 'Translate PDF - Translate complete documents | BoardPDF',
      es: 'Traducir PDF - Traduce documentos completos | BoardPDF',
    },
  },
  'pdf-to-markdown': {
    category: 'pdf-intelligence',
    descriptions: {
      en: 'Convert complex PDF files into clean Markdown format ready for Obsidian, Notion, and notes.',
      es: 'Convierte archivos PDF complejos a formato Markdown limpio listo para Obsidian, Notion y blogs.',
    },
    isTool: true,
    routeId: 'pdf-to-markdown',
    slugs: { de: 'pdf-in-markdown', en: 'pdf-to-markdown', es: 'pdf-a-markdown', fr: 'pdf-en-markdown', it: 'da-pdf-a-markdown', pt: 'pdf-para-markdown' },
    titles: {
      en: 'PDF to Markdown - Clean text and table extraction | BoardPDF',
      es: 'PDF a Markdown - Extrae texto limpio con formato | BoardPDF',
    },
  },
  'help-documentation': {
    descriptions: {
      en: 'Comprehensive user guides and tutorials to make the most of every tool on BoardPDF.',
      es: 'Guías completas y tutoriales paso a paso para utilizar cada una de las herramientas de BoardPDF.',
    },
    routeId: 'help-documentation',
    slugs: { en: 'documentation', es: 'herramientas' },
    titles: {
      en: 'Tools Documentation & Guides - BoardPDF',
      es: 'Centro de Herramientas y Documentación - BoardPDF',
    },
  },
  'help-faq': {
    descriptions: {
      en: 'Find clear answers to common questions about security, limits, privacy, and plans on BoardPDF.',
      es: 'Respuestas a las dudas más comunes sobre privacidad, conversión, planes y seguridad en BoardPDF.',
    },
    routeId: 'help-faq',
    slugs: { en: 'faq', es: 'preguntas-frecuentes' },
    titles: {
      en: 'Frequently Asked Questions (FAQ) - BoardPDF',
      es: 'Preguntas Frecuentes (FAQ) - BoardPDF',
    },
  },
  'help-security': {
    descriptions: {
      en: 'Learn about our rigorous security standards, end-to-end encryption, and automated file deletion.',
      es: 'Conoce nuestros estrictos estándares de seguridad, cifrado TLS 1.3 y borrado automático de archivos.',
    },
    routeId: 'help-security',
    slugs: { en: 'security', es: 'seguridad' },
    titles: {
      en: 'Security & Data Protection - BoardPDF',
      es: 'Seguridad y Privacidad de Datos - BoardPDF',
    },
  },
  'help-privacy': {
    descriptions: {
      en: 'Transparent information on how we safeguard your data and protect your privacy in compliance with global standards.',
      es: 'Información transparente sobre cómo tratamos tus datos y protegemos tu privacidad conforme a normativas globales.',
    },
    routeId: 'help-privacy',
    slugs: { en: 'privacy', es: 'privacidad' },
    titles: {
      en: 'Privacy Policy - BoardPDF',
      es: 'Política de Privacidad - BoardPDF',
    },
  },
  'help-terms': {
    descriptions: {
      en: 'Review our terms of use and conditions governing the access and utilization of BoardPDF tools.',
      es: 'Consulta las condiciones legales y términos aplicables al uso de nuestros servicios y herramientas web.',
    },
    routeId: 'help-terms',
    slugs: { en: 'terms', es: 'terminos' },
    titles: {
      en: 'Terms and Conditions of Service - BoardPDF',
      es: 'Términos y Condiciones de Uso - BoardPDF',
    },
  },
  'help-cookies': {
    descriptions: {
      en: 'Clear details regarding our responsible use of essential cookies and preference settings.',
      es: 'Información clara sobre el uso responsable de cookies técnicas y de preferencias en nuestro sitio web.',
    },
    routeId: 'help-cookies',
    slugs: { en: 'cookies', es: 'cookies' },
    titles: {
      en: 'Cookie Policy - BoardPDF',
      es: 'Política de Cookies - BoardPDF',
    },
  },
  about: {
    descriptions: {
      en: 'Learn about the story, mission, and core values driving BoardPDF.',
      es: 'Conoce la historia, la misión y los valores fundamentales que impulsan a BoardPDF.',
    },
    routeId: 'about',
    slugs: { en: 'about', es: 'sobre-nosotros' },
    titles: {
      en: 'About Us - Our Story | BoardPDF',
      es: 'Sobre Nosotros - Nuestra Historia | BoardPDF',
    },
  },
  contact: {
    descriptions: {
      en: 'Get in touch with the BoardPDF team for inquiries, support, or partnership opportunities.',
      es: 'Ponte en contacto con el equipo de BoardPDF para consultas, soporte o alianzas.',
    },
    routeId: 'contact',
    slugs: { en: 'contact', es: 'contacto' },
    titles: {
      en: 'Contact Us | BoardPDF',
      es: 'Contacto | BoardPDF',
    },
  },
};

const SERVER_SLUG_MAP = new Map<string, string>();
for (const [routeId, info] of Object.entries(SERVER_SEO_ROUTES)) {
  SERVER_SLUG_MAP.set(routeId.toLowerCase(), routeId);
  for (const s of Object.values(info.slugs)) {
    if (s) SERVER_SLUG_MAP.set(s.toLowerCase(), routeId);
  }
}

SERVER_SLUG_MAP.set('add-page-numbers', 'page-numbers');
SERVER_SLUG_MAP.set('numerar-pdf', 'page-numbers');
SERVER_SLUG_MAP.set('add-watermark', 'watermark-pdf');
SERVER_SLUG_MAP.set('marca-de-agua-pdf', 'watermark-pdf');
SERVER_SLUG_MAP.set('redactar-pdf', 'redact-pdf');
SERVER_SLUG_MAP.set('documentation', 'help-documentation');
SERVER_SLUG_MAP.set('herramientas', 'help-documentation');
SERVER_SLUG_MAP.set('faq', 'help-faq');
SERVER_SLUG_MAP.set('preguntas-frecuentes', 'help-faq');
SERVER_SLUG_MAP.set('security-policy', 'help-security');
SERVER_SLUG_MAP.set('privacy-policy', 'help-privacy');
SERVER_SLUG_MAP.set('terms-and-conditions', 'help-terms');
SERVER_SLUG_MAP.set('cookie-policy', 'help-cookies');
SERVER_SLUG_MAP.set('about', 'about');
SERVER_SLUG_MAP.set('sobre-nosotros', 'about');
SERVER_SLUG_MAP.set('contact', 'contact');
SERVER_SLUG_MAP.set('contacto', 'contact');

export function getServerCanonicalSlug(routeId: string, lang = DEFAULT_LANGUAGE): string {
  const norm = normalizeLanguageCode(lang);
  const info = SERVER_SEO_ROUTES[routeId];
  if (!info) return routeId;
  if (routeId === 'home') return '';
  return info.slugs[norm] || info.slugs.en || info.slugs.es || routeId;
}

export function getServerLocalizedPath(routeId: string, lang = DEFAULT_LANGUAGE): string {
  const norm = normalizeLanguageCode(lang);
  if (routeId === 'home') return `/${norm}`;
  const slug = getServerCanonicalSlug(routeId, norm);
  return `/${norm}/${slug}`;
}

export function parseRequestPath(rawPath: string): { isKnownRoute: boolean; lang: string; routeId: string } {
  const clean = (rawPath || '').split('?')[0].replace(/^\/+|\/+$/g, '');
  if (!clean) {
    return { isKnownRoute: true, lang: DEFAULT_LANGUAGE, routeId: 'home' };
  }

  const parts = clean.split('/');
  const first = parts[0].toLowerCase();

  if (isSupportedLanguage(first)) {
    const lang = normalizeLanguageCode(first);
    const remaining = parts.slice(1).join('/');
    if (!remaining) {
      return { isKnownRoute: true, lang, routeId: 'home' };
    }
    const resolved = SERVER_SLUG_MAP.get(remaining.toLowerCase());
    return {
      isKnownRoute: Boolean(resolved),
      lang,
      routeId: resolved || remaining,
    };
  }

  const resolved = SERVER_SLUG_MAP.get(clean.toLowerCase());
  return {
    isKnownRoute: Boolean(resolved),
    lang: DEFAULT_LANGUAGE,
    routeId: resolved || clean,
  };
}

export function generateSitemapIndexXml(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const today = new Date().toISOString().split('T')[0];

  const sitemaps = SUPPORTED_LANGUAGES.map((l) => `  <sitemap>
    <loc>${base}/sitemap-${l.code}.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps}
</sitemapindex>`;
}

export function generateLanguageSitemapXml(lang: string, baseUrl: string): string {
  const norm = normalizeLanguageCode(lang);
  const base = baseUrl.replace(/\/+$/, '');
  const today = new Date().toISOString().split('T')[0];

  const routeIds = Object.keys(SERVER_SEO_ROUTES);

  const urlBlocks = routeIds.map((routeId) => {
    const loc = `${base}${getServerLocalizedPath(routeId, norm)}`;
    const alternates = SUPPORTED_LANGUAGES.map((l) => {
      const altLoc = `${base}${getServerLocalizedPath(routeId, l.code)}`;
      return `    <xhtml:link rel="alternate" hreflang="${l.code}" href="${altLoc}"/>`;
    }).join('\n');

    const defaultAlt = `    <xhtml:link rel="alternate" hreflang="x-default" href="${base}${getServerLocalizedPath(routeId, DEFAULT_LANGUAGE)}"/>`;

    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${routeId === 'home' ? '1.0' : (SERVER_SEO_ROUTES[routeId]?.isTool ? '0.9' : '0.7')}</priority>
${alternates}
${defaultAlt}
  </url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urlBlocks}
</urlset>`;
}

export function generateRobotsTxt(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return `User-agent: *
Allow: /
Disallow: /api/
Disallow: /download/
Disallow: /download-ready/
Disallow: /workflow/

Sitemap: ${base}/sitemap.xml
`;
}

export function injectHtmlSeo(templateHtml: string, reqPath: string, baseUrl: string): string {
  const { lang, routeId } = parseRequestPath(reqPath);
  const info = SERVER_SEO_ROUTES[routeId] || SERVER_SEO_ROUTES.home;
  const base = baseUrl.replace(/\/+$/, '');

  const title = info.titles[lang] || info.titles.es || info.titles.en || `${info.routeId} - BoardPDF`;
  const description = info.descriptions[lang] || info.descriptions.es || info.descriptions.en || 'Herramientas PDF online y seguras.';
  const canonicalUrl = `${base}${getServerLocalizedPath(info.routeId, lang)}`;

  const hreflangTags = SUPPORTED_LANGUAGES.map(
    (l) => `<link rel="alternate" hreflang="${l.code}" href="${base}${getServerLocalizedPath(info.routeId, l.code)}" />`
  ).join('\n  ');

  const defaultHreflang = `<link rel="alternate" hreflang="x-default" href="${base}${getServerLocalizedPath(info.routeId, DEFAULT_LANGUAGE)}" />`;

  const ogLocale = lang === 'en' ? 'en_US' : `${lang}_${lang.toUpperCase()}`;

  const jsonLd = info.isTool
    ? {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        applicationCategory: 'BusinessApplication',
        description,
        name: title.split('-')[0].trim(),
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        operatingSystem: 'All',
        url: canonicalUrl,
      }
    : {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        description,
        name: 'BoardPDF',
        url: canonicalUrl,
      };

  let html = templateHtml;
  html = html.replace(/<html(\s+[^>]*)?>/i, `<html lang="${lang}" data-theme="light">`);
  html = html.replace(/<title>.*?<\/title>/i, `<title>${title}</title>`);

  const seoMetaBlock = `
  <meta name="description" content="${description}">
  <link rel="canonical" href="${canonicalUrl}">
  ${hreflangTags}
  ${defaultHreflang}
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="${ogLocale}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <script type="application/ld+json" data-ref="structured-data-jsonld">${JSON.stringify(jsonLd)}</script>
`;

  return html.replace('</head>', `${seoMetaBlock}</head>`);
}
