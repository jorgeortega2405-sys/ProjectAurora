import { AVAILABLE_LANGUAGES, DEFAULT_LANGUAGE, normalizeLanguageCode } from '../utils/languages.util.js';

export interface RouteSeoInfo {
  category?: string;
  descriptions: Record<string, string>;
  isTool?: boolean;
  routeId: string;
  slugs: Record<string, string>;
  titles: Record<string, string>;
}

export const SEO_ROUTES: Record<string, RouteSeoInfo> = {
  home: {
    descriptions: {
      en: 'Free and secure online PDF tools. Merge, split, compress, edit, convert, and protect your PDF documents with ease.',
      es: 'Herramientas PDF online 100% gratis y seguras. Une, divide, comprime, edita, convierte y protege tus documentos PDF con facilidad.',
    },
    routeId: 'home',
    slugs: {
      de: '',
      en: '',
      es: '',
      fr: '',
      it: '',
      pt: '',
    },
    titles: {
      en: 'ProjectAurora - Free & Secure Online PDF Tools',
      es: 'ProjectAurora - Herramientas PDF online 100% gratis y seguras',
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
    slugs: {
      de: 'pdf-zusammenfuegen',
      en: 'merge-pdf',
      es: 'unir-pdf',
      fr: 'fusionner-pdf',
      it: 'unire-pdf',
      pt: 'juntar-pdf',
    },
    titles: {
      en: 'Merge PDF - Combine PDF files online for free | ProjectAurora',
      es: 'Unir PDF - Combina archivos PDF online gratis | ProjectAurora',
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
    slugs: {
      de: 'pdf-teilen',
      en: 'split-pdf',
      es: 'dividir-pdf',
      fr: 'diviser-pdf',
      it: 'dividere-pdf',
      pt: 'dividir-pdf',
    },
    titles: {
      en: 'Split PDF - Separate PDF pages online | ProjectAurora',
      es: 'Dividir PDF - Separa páginas de tus documentos PDF | ProjectAurora',
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
    slugs: {
      de: 'pdf-seiten-loeschen',
      en: 'remove-pdf-pages',
      es: 'eliminar-paginas-pdf',
      fr: 'supprimer-pages-pdf',
      it: 'eliminare-pagine-pdf',
      pt: 'remover-paginas-pdf',
    },
    titles: {
      en: 'Remove PDF Pages - Delete unwanted pages | ProjectAurora',
      es: 'Eliminar Páginas PDF - Borra hojas innecesarias | ProjectAurora',
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
    slugs: {
      de: 'pdf-seiten-extrahieren',
      en: 'extract-pdf-pages',
      es: 'extraer-paginas-pdf',
      fr: 'extraire-pages-pdf',
      it: 'estrarre-pagine-pdf',
      pt: 'extrair-paginas-pdf',
    },
    titles: {
      en: 'Extract PDF Pages - Save selected pages | ProjectAurora',
      es: 'Extraer Páginas de PDF - Guarda páginas seleccionadas | ProjectAurora',
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
    slugs: {
      de: 'pdf-organisieren',
      en: 'organize-pdf',
      es: 'organizar-pdf',
      fr: 'organiser-pdf',
      it: 'organizzare-pdf',
      pt: 'organizar-pdf',
    },
    titles: {
      en: 'Organize PDF - Reorder, rotate and sort pages | ProjectAurora',
      es: 'Organizar PDF - Reordena, rota y ordena páginas | ProjectAurora',
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
    slugs: {
      de: 'pdf-verkleinern',
      en: 'compress-pdf',
      es: 'comprimir-pdf',
      fr: 'compresser-pdf',
      it: 'comprimere-pdf',
      pt: 'comprimir-pdf',
    },
    titles: {
      en: 'Compress PDF - Reduce PDF file size online | ProjectAurora',
      es: 'Comprimir PDF - Reduce el tamaño de tu archivo PDF | ProjectAurora',
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
    slugs: {
      de: 'pdf-reparieren',
      en: 'repair-pdf',
      es: 'reparar-pdf',
      fr: 'reparer-pdf',
      it: 'riparare-pdf',
      pt: 'reparar-pdf',
    },
    titles: {
      en: 'Repair PDF - Fix corrupt and damaged PDF files | ProjectAurora',
      es: 'Reparar PDF - Recupera archivos PDF dañados o corruptos | ProjectAurora',
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
    slugs: {
      de: 'ocr-pdf',
      en: 'ocr-pdf',
      es: 'ocr-pdf',
      fr: 'ocr-pdf',
      it: 'ocr-pdf',
      pt: 'ocr-pdf',
    },
    titles: {
      en: 'OCR PDF - Convert scanned PDF to searchable text | ProjectAurora',
      es: 'OCR PDF - Convierte texto escaneado a PDF editable | ProjectAurora',
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
    slugs: {
      de: 'jpg-in-pdf',
      en: 'jpg-to-pdf',
      es: 'jpg-a-pdf',
      fr: 'jpg-en-pdf',
      it: 'da-jpg-a-pdf',
      pt: 'jpg-para-pdf',
    },
    titles: {
      en: 'JPG to PDF - Convert images to PDF documents | ProjectAurora',
      es: 'JPG a PDF - Convierte imágenes a documentos PDF | ProjectAurora',
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
    slugs: {
      de: 'word-in-pdf',
      en: 'word-to-pdf',
      es: 'word-a-pdf',
      fr: 'word-en-pdf',
      it: 'da-word-a-pdf',
      pt: 'word-para-pdf',
    },
    titles: {
      en: 'Word to PDF - Convert DOCX files to PDF | ProjectAurora',
      es: 'Word a PDF - Convierte archivos DOCX a PDF | ProjectAurora',
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
    slugs: {
      de: 'powerpoint-in-pdf',
      en: 'powerpoint-to-pdf',
      es: 'powerpoint-a-pdf',
      fr: 'powerpoint-en-pdf',
      it: 'da-powerpoint-a-pdf',
      pt: 'powerpoint-para-pdf',
    },
    titles: {
      en: 'PowerPoint to PDF - Convert PPT slides to PDF | ProjectAurora',
      es: 'PowerPoint a PDF - Convierte diapositivas PPT a PDF | ProjectAurora',
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
    slugs: {
      de: 'excel-in-pdf',
      en: 'excel-to-pdf',
      es: 'excel-a-pdf',
      fr: 'excel-en-pdf',
      it: 'da-excel-a-pdf',
      pt: 'excel-para-pdf',
    },
    titles: {
      en: 'Excel to PDF - Convert XLS spreadsheets to PDF | ProjectAurora',
      es: 'Excel a PDF - Convierte hojas de cálculo XLS a PDF | ProjectAurora',
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
    slugs: {
      de: 'html-in-pdf',
      en: 'html-to-pdf',
      es: 'html-a-pdf',
      fr: 'html-en-pdf',
      it: 'da-html-a-pdf',
      pt: 'html-para-pdf',
    },
    titles: {
      en: 'HTML to PDF - Convert web pages and HTML to PDF | ProjectAurora',
      es: 'HTML a PDF - Convierte páginas web y código a PDF | ProjectAurora',
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
    slugs: {
      de: 'pdf-in-jpg',
      en: 'pdf-to-jpg',
      es: 'pdf-a-jpg',
      fr: 'pdf-en-jpg',
      it: 'da-pdf-a-jpg',
      pt: 'pdf-para-jpg',
    },
    titles: {
      en: 'PDF to JPG - Extract images or convert pages to JPG | ProjectAurora',
      es: 'PDF a JPG - Extrae imágenes o convierte páginas a JPG | ProjectAurora',
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
    slugs: {
      de: 'pdf-in-word',
      en: 'pdf-to-word',
      es: 'pdf-a-word',
      fr: 'pdf-en-word',
      it: 'da-pdf-a-word',
      pt: 'pdf-para-word',
    },
    titles: {
      en: 'PDF to Word - Convert PDF files to editable DOCX | ProjectAurora',
      es: 'PDF a Word - Convierte archivos PDF a DOCX editable | ProjectAurora',
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
    slugs: {
      de: 'pdf-in-powerpoint',
      en: 'pdf-to-powerpoint',
      es: 'pdf-a-powerpoint',
      fr: 'pdf-en-powerpoint',
      it: 'da-pdf-a-powerpoint',
      pt: 'pdf-para-powerpoint',
    },
    titles: {
      en: 'PDF to PowerPoint - Convert PDF to PPTX slides | ProjectAurora',
      es: 'PDF a PowerPoint - Convierte tu PDF a diapositivas PPTX | ProjectAurora',
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
    slugs: {
      de: 'pdf-in-excel',
      en: 'pdf-to-excel',
      es: 'pdf-a-excel',
      fr: 'pdf-en-excel',
      it: 'da-pdf-a-excel',
      pt: 'pdf-para-excel',
    },
    titles: {
      en: 'PDF to Excel - Extract PDF tables to XLSX spreadsheets | ProjectAurora',
      es: 'PDF a Excel - Extrae tablas de PDF a hojas XLSX | ProjectAurora',
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
    slugs: {
      de: 'pdf-in-pdfa',
      en: 'pdf-to-pdfa',
      es: 'pdf-a-pdfa',
      fr: 'pdf-en-pdfa',
      it: 'da-pdf-a-pdfa',
      pt: 'pdf-para-pdfa',
    },
    titles: {
      en: 'PDF to PDF/A - Convert documents for long-term archiving | ProjectAurora',
      es: 'PDF a PDF/A - Convierte documentos para archivo a largo plazo | ProjectAurora',
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
    slugs: {
      de: 'pdf-drehen',
      en: 'rotate-pdf',
      es: 'rotar-pdf',
      fr: 'pivoter-pdf',
      it: 'ruotare-pdf',
      pt: 'rodar-pdf',
    },
    titles: {
      en: 'Rotate PDF - Turn PDF pages online | ProjectAurora',
      es: 'Rotar PDF - Gira páginas PDF online | ProjectAurora',
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
    slugs: {
      de: 'seitenzahlen-pdf',
      en: 'page-numbers',
      es: 'numeros-de-pagina',
      fr: 'numeroter-pdf',
      it: 'numeri-di-pagina-pdf',
      pt: 'numerar-pdf',
    },
    titles: {
      en: 'Page Numbers in PDF - Number your PDF pages | ProjectAurora',
      es: 'Números de Página en PDF - Numera tus documentos | ProjectAurora',
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
    slugs: {
      de: 'pdf-wasserzeichen',
      en: 'watermark-pdf',
      es: 'marca-de-agua',
      fr: 'filigrane-pdf',
      it: 'filigrana-pdf',
      pt: 'marca-dagua',
    },
    titles: {
      en: 'Watermark PDF - Add watermarks to your documents | ProjectAurora',
      es: 'Marca de Agua en PDF - Protege tus documentos | ProjectAurora',
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
    slugs: {
      de: 'pdf-zuschneiden',
      en: 'crop-pdf',
      es: 'recortar-pdf',
      fr: 'recadrer-pdf',
      it: 'ritagliare-pdf',
      pt: 'cortar-pdf',
    },
    titles: {
      en: 'Crop PDF - Trim margins and crop PDF pages | ProjectAurora',
      es: 'Recortar PDF - Ajusta márgenes y recorta páginas | ProjectAurora',
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
    slugs: {
      de: 'pdf-bearbeiten',
      en: 'edit-pdf',
      es: 'editar-pdf',
      fr: 'modifier-pdf',
      it: 'modificare-pdf',
      pt: 'editar-pdf',
    },
    titles: {
      en: 'Edit PDF - Add text, shapes and drawings online | ProjectAurora',
      es: 'Editar PDF - Agrega texto, formas y dibujos online | ProjectAurora',
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
    slugs: {
      de: 'pdf-entsperren',
      en: 'unlock-pdf',
      es: 'desbloquear-pdf',
      fr: 'deverrouiller-pdf',
      it: 'sbloccare-pdf',
      pt: 'desbloquear-pdf',
    },
    titles: {
      en: 'Unlock PDF - Remove password and permissions | ProjectAurora',
      es: 'Desbloquear PDF - Quita la contraseña de seguridad | ProjectAurora',
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
    slugs: {
      de: 'pdf-schuetzen',
      en: 'protect-pdf',
      es: 'proteger-pdf',
      fr: 'proteger-pdf',
      it: 'proteggere-pdf',
      pt: 'proteger-pdf',
    },
    titles: {
      en: 'Protect PDF - Encrypt and password protect your PDF | ProjectAurora',
      es: 'Proteger PDF - Encripta y pon contraseña a tu PDF | ProjectAurora',
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
    slugs: {
      de: 'pdf-schwaerzen',
      en: 'redact-pdf',
      es: 'censurar-pdf',
      fr: 'biffer-pdf',
      it: 'censurare-pdf',
      pt: 'censurar-pdf',
    },
    titles: {
      en: 'Redact PDF - Permanently blackout sensitive info | ProjectAurora',
      es: 'Censurar PDF - Oculta datos y texto confidencial | ProjectAurora',
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
    slugs: {
      de: 'pdf-vergleichen',
      en: 'compare-pdf',
      es: 'comparar-pdf',
      fr: 'comparer-pdf',
      it: 'confrontare-pdf',
      pt: 'comparar-pdf',
    },
    titles: {
      en: 'Compare PDF - Spot differences between two files | ProjectAurora',
      es: 'Comparar PDF - Resalta diferencias entre dos archivos | ProjectAurora',
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
    slugs: {
      de: 'pdf-zusammenfassen',
      en: 'summarize-pdf',
      es: 'resumir-pdf',
      fr: 'resumer-pdf',
      it: 'riassumere-pdf',
      pt: 'resumir-pdf',
    },
    titles: {
      en: 'Summarize PDF - Smart automatic summaries | ProjectAurora',
      es: 'Resumir PDF - Extrae resúmenes inteligentes | ProjectAurora',
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
    slugs: {
      de: 'pdf-uebersetzen',
      en: 'translate-pdf',
      es: 'traducir-pdf',
      fr: 'traduire-pdf',
      it: 'tradurre-pdf',
      pt: 'traduzir-pdf',
    },
    titles: {
      en: 'Translate PDF - Translate complete documents | ProjectAurora',
      es: 'Traducir PDF - Traduce documentos completos | ProjectAurora',
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
    slugs: {
      de: 'pdf-in-markdown',
      en: 'pdf-to-markdown',
      es: 'pdf-a-markdown',
      fr: 'pdf-en-markdown',
      it: 'da-pdf-a-markdown',
      pt: 'pdf-para-markdown',
    },
    titles: {
      en: 'PDF to Markdown - Clean text and table extraction | ProjectAurora',
      es: 'PDF a Markdown - Extrae texto limpio con formato | ProjectAurora',
    },
  },
  ai: {
    descriptions: {
      en: 'AI Assistant for intelligent document processing and natural language workflows.',
      es: 'Asistente de IA para procesamiento inteligente de documentos y flujos de trabajo.',
    },
    routeId: 'ai',
    slugs: {
      en: 'ai',
      es: 'ai',
    },
    titles: {
      en: 'AI Assistant - ProjectAurora',
      es: 'Asistente IA - ProjectAurora',
    },
  },
  about: {
    descriptions: {
      en: 'Learn about the story, mission, and core values driving ProjectAurora.',
      es: 'Conoce la historia, la misión y los valores fundamentales que impulsan a ProjectAurora.',
    },
    routeId: 'about',
    slugs: {
      en: 'about',
      es: 'sobre-nosotros',
    },
    titles: {
      en: 'About Us - Our Story | ProjectAurora',
      es: 'Sobre Nosotros - Nuestra Historia | ProjectAurora',
    },
  },
  contact: {
    descriptions: {
      en: 'Get in touch with the ProjectAurora team for inquiries, support, or partnership opportunities.',
      es: 'Ponte en contacto con el equipo de ProjectAurora para consultas, soporte o alianzas.',
    },
    routeId: 'contact',
    slugs: {
      en: 'contact',
      es: 'contacto',
    },
    titles: {
      en: 'Contact Us | ProjectAurora',
      es: 'Contacto | ProjectAurora',
    },
  },
  'help-documentation': {
    descriptions: {
      en: 'Complete documentation and user guides for all ProjectAurora PDF tools, security features, and workflows.',
      es: 'Guía detallada y documentación completa de todas las herramientas PDF, seguridad y flujos de trabajo en ProjectAurora.',
    },
    routeId: 'help-documentation',
    slugs: {
      de: 'dokumentation',
      en: 'documentation',
      es: 'herramientas',
      fr: 'outils',
      it: 'strumenti',
      pt: 'ferramentas',
    },
    titles: {
      en: 'Tools Documentation | ProjectAurora',
      es: 'Documentación de Herramientas | ProjectAurora',
    },
  },
  'help-faq': {
    descriptions: {
      en: 'Find answers to common questions about ProjectAurora PDF tools, security, privacy, pricing, and document lifecycle.',
      es: 'Encuentra respuestas a preguntas frecuentes sobre herramientas PDF, seguridad, privacidad, planes y retención en ProjectAurora.',
    },
    routeId: 'help-faq',
    slugs: {
      de: 'faq',
      en: 'faq',
      es: 'preguntas-frecuentes',
      fr: 'faq',
      it: 'faq',
      pt: 'perguntas-frequentes',
    },
    titles: {
      en: 'Frequently Asked Questions (FAQ) | ProjectAurora',
      es: 'Preguntas Frecuentes (FAQ) | ProjectAurora',
    },
  },
  'help-security': {
    descriptions: {
      en: 'Learn how ProjectAurora protects your documents with TLS 1.3, AES-GCM-256 encryption, zero-knowledge architecture, and automated ephemeral deletion.',
      es: 'Conoce cómo protege ProjectAurora tus documentos con cifrado TLS 1.3, AES-GCM-256, arquitectura de cero conocimiento y borrado efímero automático.',
    },
    routeId: 'help-security',
    slugs: {
      de: 'sicherheit',
      en: 'security',
      es: 'seguridad',
      fr: 'securite',
      it: 'sicurezza',
      pt: 'seguranca',
    },
    titles: {
      en: 'Security Policy | ProjectAurora',
      es: 'Política de Seguridad | ProjectAurora',
    },
  },
  'help-privacy': {
    descriptions: {
      en: 'ProjectAurora Privacy Policy. 100% ephemeral document processing, max 2-hour retention, zero AI training, and full GDPR & CCPA/CPRA compliance.',
      es: 'Política de Privacidad de ProjectAurora. Procesamiento 100% efímero, borrado en < 2 horas, cero entrenamiento de IA y cumplimiento GDPR y CCPA/CPRA.',
    },
    routeId: 'help-privacy',
    slugs: {
      de: 'datenschutz',
      en: 'privacy',
      es: 'privacidad',
      fr: 'confidentialite',
      it: 'privacy',
      pt: 'privacidade',
    },
    titles: {
      en: 'Privacy Policy | ProjectAurora',
      es: 'Política de Privacidad | ProjectAurora',
    },
  },
  'help-terms': {
    descriptions: {
      en: 'Terms and conditions for using ProjectAurora. Transparent guidelines, service rules, binding individual arbitration, and class action waiver.',
      es: 'Términos y condiciones de uso de ProjectAurora. Lineamientos transparentes, reglas de servicio, arbitraje individual vinculante y renuncia a demandas colectivas.',
    },
    routeId: 'help-terms',
    slugs: {
      de: 'agb',
      en: 'terms',
      es: 'terminos',
      fr: 'conditions',
      it: 'termini',
      pt: 'termos',
    },
    titles: {
      en: 'Terms of Service | ProjectAurora',
      es: 'Términos y Condiciones | ProjectAurora',
    },
  },
  'help-cookies': {
    descriptions: {
      en: 'ProjectAurora Cookie Policy. Detailed technical breakdown of cookies used, browser management guides, and privacy controls.',
      es: 'Política de Cookies de ProjectAurora. Desglose técnico de cookies utilizadas, guías de configuración en navegadores y control de privacidad.',
    },
    routeId: 'help-cookies',
    slugs: {
      de: 'cookies',
      en: 'cookies',
      es: 'cookies',
      fr: 'cookies',
      it: 'cookie',
      pt: 'cookies',
    },
    titles: {
      en: 'Cookie Policy | ProjectAurora',
      es: 'Política de Cookies | ProjectAurora',
    },
  },
};

const SLUG_TO_ROUTE_MAP = new Map<string, string>();
for (const [routeId, info] of Object.entries(SEO_ROUTES)) {
  SLUG_TO_ROUTE_MAP.set(routeId.toLowerCase(), routeId);
  for (const slug of Object.values(info.slugs)) {
    if (slug) {
      SLUG_TO_ROUTE_MAP.set(slug.toLowerCase(), routeId);
    }
  }
}

SLUG_TO_ROUTE_MAP.set('add-page-numbers', 'page-numbers');
SLUG_TO_ROUTE_MAP.set('numerar-pdf', 'page-numbers');
SLUG_TO_ROUTE_MAP.set('add-watermark', 'watermark-pdf');
SLUG_TO_ROUTE_MAP.set('marca-de-agua-pdf', 'watermark-pdf');
SLUG_TO_ROUTE_MAP.set('redactar-pdf', 'redact-pdf');
SLUG_TO_ROUTE_MAP.set('documentation', 'help-documentation');
SLUG_TO_ROUTE_MAP.set('documentacion', 'help-documentation');
SLUG_TO_ROUTE_MAP.set('herramientas', 'help-documentation');
SLUG_TO_ROUTE_MAP.set('help/documentation', 'help-documentation');
SLUG_TO_ROUTE_MAP.set('help-documentation', 'help-documentation');
SLUG_TO_ROUTE_MAP.set('faq', 'help-faq');
SLUG_TO_ROUTE_MAP.set('preguntas-frecuentes', 'help-faq');
SLUG_TO_ROUTE_MAP.set('help/faq', 'help-faq');
SLUG_TO_ROUTE_MAP.set('help-faq', 'help-faq');
SLUG_TO_ROUTE_MAP.set('security-policy', 'help-security');
SLUG_TO_ROUTE_MAP.set('security', 'help-security');
SLUG_TO_ROUTE_MAP.set('seguridad', 'help-security');
SLUG_TO_ROUTE_MAP.set('help/security', 'help-security');
SLUG_TO_ROUTE_MAP.set('help-security', 'help-security');
SLUG_TO_ROUTE_MAP.set('privacy-policy', 'help-privacy');
SLUG_TO_ROUTE_MAP.set('privacy', 'help-privacy');
SLUG_TO_ROUTE_MAP.set('privacidad', 'help-privacy');
SLUG_TO_ROUTE_MAP.set('help/privacy', 'help-privacy');
SLUG_TO_ROUTE_MAP.set('help-privacy', 'help-privacy');
SLUG_TO_ROUTE_MAP.set('terms-and-conditions', 'help-terms');
SLUG_TO_ROUTE_MAP.set('terms', 'help-terms');
SLUG_TO_ROUTE_MAP.set('terminos', 'help-terms');
SLUG_TO_ROUTE_MAP.set('help/terms', 'help-terms');
SLUG_TO_ROUTE_MAP.set('help-terms', 'help-terms');
SLUG_TO_ROUTE_MAP.set('cookie-policy', 'help-cookies');
SLUG_TO_ROUTE_MAP.set('cookies', 'help-cookies');
SLUG_TO_ROUTE_MAP.set('help/cookies', 'help-cookies');
SLUG_TO_ROUTE_MAP.set('help-cookies', 'help-cookies');
SLUG_TO_ROUTE_MAP.set('about', 'about');
SLUG_TO_ROUTE_MAP.set('sobre-nosotros', 'about');
SLUG_TO_ROUTE_MAP.set('contact', 'contact');
SLUG_TO_ROUTE_MAP.set('contacto', 'contact');

export function getCanonicalSlug(routeId: string, lang = DEFAULT_LANGUAGE): string {
  const cleanLang = (lang || '').trim().toLowerCase();
  const info = SEO_ROUTES[routeId];
  if (!info) return routeId;
  if (routeId === 'home') return '';
  const base = cleanLang.split('-')[0];
  const normLang = normalizeLanguageCode(lang);
  const normBase = normLang.split('-')[0];
  return (
    info.slugs[cleanLang] ||
    info.slugs[base] ||
    info.slugs[normLang] ||
    info.slugs[normBase] ||
    (base === 'es' || normBase === 'es' ? info.slugs.es : info.slugs.en) ||
    info.slugs.es ||
    info.slugs.en ||
    routeId
  );
}

export function resolveRouteFromSlug(slug: string, lang = DEFAULT_LANGUAGE): { canonicalSlug: string; isCanonical: boolean; routeId: string } | null {
  const clean = (slug || '').toLowerCase().replace(/^\/+|\/+$/g, '');
  if (!clean) {
    return {
      canonicalSlug: '',
      isCanonical: true,
      routeId: 'home',
    };
  }

  const routeId = SLUG_TO_ROUTE_MAP.get(clean);
  if (!routeId) return null;

  const canonical = getCanonicalSlug(routeId, lang);
  return {
    canonicalSlug: canonical,
    isCanonical: clean === canonical.toLowerCase(),
    routeId,
  };
}

export function getLocalizedPath(routeId: string, lang = DEFAULT_LANGUAGE): string {
  const cleanLang = (lang || '').trim().toLowerCase();
  const normLang = normalizeLanguageCode(lang);
  const targetLang = cleanLang === 'es' || cleanLang === 'en' ? cleanLang : normLang;
  if (routeId === 'home') {
    return `/${targetLang}`;
  }
  const slug = getCanonicalSlug(routeId, targetLang);
  return `/${targetLang}/${slug}`;
}

export interface PageSeoResult {
  canonicalUrl: string;
  description: string;
  hreflangs: Array<{ href: string; lang: string }>;
  jsonLd: Record<string, unknown>;
  title: string;
}

export function getPageSeo(routeId: string, lang = DEFAULT_LANGUAGE, origin = ''): PageSeoResult {
  const normLang = normalizeLanguageCode(lang);
  const info = SEO_ROUTES[routeId] || SEO_ROUTES.home;

  const title = info.titles[normLang] || info.titles.es || info.titles.en || `${info.routeId} - ProjectAurora`;
  const description = info.descriptions[normLang] || info.descriptions.es || info.descriptions.en || 'Herramientas PDF online y seguras.';

  const canonicalPath = getLocalizedPath(info.routeId, normLang);
  const baseUrl = origin.replace(/\/+$/, '');
  const canonicalUrl = `${baseUrl}${canonicalPath}`;

  const hreflangs: Array<{ href: string; lang: string }> = AVAILABLE_LANGUAGES.map((l) => ({
    href: `${baseUrl}${getLocalizedPath(info.routeId, l.code)}`,
    lang: l.code,
  }));

  hreflangs.push({
    href: `${baseUrl}${getLocalizedPath(info.routeId, 'es')}`,
    lang: 'x-default',
  });

  const jsonLd: Record<string, unknown> = info.isTool
    ? {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        applicationCategory: 'BusinessApplication',
        description,
        name: title.split('-')[0].trim(),
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
        operatingSystem: 'All',
        url: canonicalUrl,
      }
    : {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        description,
        name: 'ProjectAurora',
        url: canonicalUrl,
      };

  return {
    canonicalUrl,
    description,
    hreflangs,
    jsonLd,
    title,
  };
}

export function updateDomSeo(routeId: string, lang = DEFAULT_LANGUAGE): void {
  const origin = window.location.origin;
  const seo = getPageSeo(routeId, lang, origin);

  document.title = seo.title;
  document.documentElement.lang = normalizeLanguageCode(lang);

  let descEl = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!descEl) {
    descEl = document.createElement('meta');
    descEl.name = 'description';
    document.head.appendChild(descEl);
  }
  descEl.content = seo.description;

  let canEl = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canEl) {
    canEl = document.createElement('link');
    canEl.rel = 'canonical';
    document.head.appendChild(canEl);
  }
  canEl.href = seo.canonicalUrl;

  const existingHreflangs = document.querySelectorAll('link[rel="alternate"][hreflang]');
  existingHreflangs.forEach((el) => el.remove());

  for (const h of seo.hreflangs) {
    const linkEl = document.createElement('link');
    linkEl.rel = 'alternate';
    linkEl.setAttribute('hreflang', h.lang);
    linkEl.href = h.href;
    document.head.appendChild(linkEl);
  }

  const setMetaProp = (prop: string, content: string) => {
    let el = document.querySelector<HTMLMetaElement>(`meta[property="${prop}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('property', prop);
      document.head.appendChild(el);
    }
    el.content = content;
  };

  setMetaProp('og:title', seo.title);
  setMetaProp('og:description', seo.description);
  setMetaProp('og:url', seo.canonicalUrl);
  setMetaProp('og:type', 'website');
  setMetaProp('og:locale', lang === 'en' ? 'en_US' : `${lang}_${lang.toUpperCase()}`);

  const setMetaName = (name: string, content: string) => {
    let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', name);
      document.head.appendChild(el);
    }
    el.content = content;
  };

  setMetaName('twitter:card', 'summary_large_image');
  setMetaName('twitter:title', seo.title);
  setMetaName('twitter:description', seo.description);

  let scriptEl = document.querySelector<HTMLScriptElement>('script[data-ref="structured-data-jsonld"]');
  if (!scriptEl) {
    scriptEl = document.createElement('script');
    scriptEl.type = 'application/ld+json';
    scriptEl.setAttribute('data-ref', 'structured-data-jsonld');
    document.head.appendChild(scriptEl);
  }
  scriptEl.textContent = JSON.stringify(seo.jsonLd);
}
