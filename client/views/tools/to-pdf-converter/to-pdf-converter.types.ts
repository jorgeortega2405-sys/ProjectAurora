export type ToPdfSourceType =
  | 'excel-to-pdf'
  | 'html-to-pdf'
  | 'jpg-to-pdf'
  | 'powerpoint-to-pdf'
  | 'word-to-pdf';

export interface ToPdfRouteConfig {
  accept: string;
  actionText: string;
  convertingText: string;
  formatBadge: string;
  icon: string;
  sourceType: ToPdfSourceType;
  subtitle: string;
  title: string;
}

export const TO_PDF_CONFIGS: Record<string, ToPdfRouteConfig> = {
  '/excel-to-pdf': {
    accept: '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel',
    actionText: 'Convertir a PDF',
    convertingText: 'Convirtiendo hojas de cálculo a PDF...',
    formatBadge: 'XLSX / XLS',
    icon: 'table_chart',
    sourceType: 'excel-to-pdf',
    subtitle: 'Convierte tus libros y hojas de Excel en documentos PDF de alta precisión.',
    title: 'Excel a PDF',
  },
  '/html-to-pdf': {
    accept: '.html,.htm,text/html',
    actionText: 'Convertir a PDF',
    convertingText: 'Renderizando página web a PDF...',
    formatBadge: 'HTML / HTM',
    icon: 'code',
    sourceType: 'html-to-pdf',
    subtitle: 'Transforma páginas web y archivos HTML en documentos PDF formateados.',
    title: 'HTML a PDF',
  },
  '/jpg-to-pdf': {
    accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp',
    actionText: 'Convertir a PDF',
    convertingText: 'Convirtiendo imágenes a PDF...',
    formatBadge: 'JPG / PNG',
    icon: 'image',
    sourceType: 'jpg-to-pdf',
    subtitle: 'Convierte tus imágenes JPG, JPEG o PNG en un documento PDF de alta calidad.',
    title: 'JPG a PDF',
  },
  '/powerpoint-to-pdf': {
    accept: '.pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint',
    actionText: 'Convertir a PDF',
    convertingText: 'Convirtiendo diapositivas a PDF...',
    formatBadge: 'PPTX / PPT',
    icon: 'slideshow',
    sourceType: 'powerpoint-to-pdf',
    subtitle: 'Convierte tus presentaciones de PowerPoint a PDF manteniendo diapositivas y formato.',
    title: 'PowerPoint a PDF',
  },
  '/word-to-pdf': {
    accept: '.docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword',
    actionText: 'Convertir a PDF',
    convertingText: 'Convirtiendo documento Word a PDF...',
    formatBadge: 'DOCX / DOC',
    icon: 'description',
    sourceType: 'word-to-pdf',
    subtitle: 'Convierte tus documentos de Word a archivos PDF conservando estilos y tipografía.',
    title: 'Word a PDF',
  },
};
