export type ConversionType =
  | 'pdf-to-jpg'
  | 'pdf-to-word'
  | 'pdf-to-powerpoint'
  | 'pdf-to-excel'
  | 'pdf-to-pdfa';

export interface ConversionRouteConfig {
  actionText: string;
  convertingText: string;
  icon: string;
  path: string;
  subtitle: string;
  targetBadge: string;
  targetExtension: string;
  targetType: ConversionType;
  title: string;
}

export const CONVERSION_CONFIGS: Record<string, ConversionRouteConfig> = {
  '/pdf-to-excel': {
    actionText: 'Convertir a Excel',
    convertingText: 'Extrayendo tablas a Excel...',
    icon: 'table_chart',
    path: '/pdf-to-excel',
    subtitle: 'Extrae tablas y datos estructurados de tu PDF directamente a un archivo Excel XLSX editable.',
    targetBadge: 'XLSX',
    targetExtension: '.xlsx',
    targetType: 'pdf-to-excel',
    title: 'PDF a Excel',
  },
  '/pdf-to-jpg': {
    actionText: 'Convertir a JPG',
    convertingText: 'Convirtiendo páginas a JPG...',
    icon: 'photo_library',
    path: '/pdf-to-jpg',
    subtitle: 'Convierte cada página de tu archivo PDF en imágenes JPG de alta calidad o extrae tus imágenes.',
    targetBadge: 'JPG',
    targetExtension: '.jpg',
    targetType: 'pdf-to-jpg',
    title: 'PDF a JPG',
  },
  '/pdf-to-pdfa': {
    actionText: 'Convertir a PDF/A',
    convertingText: 'Estandarizando documento a PDF/A...',
    icon: 'verified',
    path: '/pdf-to-pdfa',
    subtitle: 'Convierte tu documento PDF al estándar ISO PDF/A para archivado a largo plazo y preservación digital.',
    targetBadge: 'PDF/A',
    targetExtension: '_pdfa.pdf',
    targetType: 'pdf-to-pdfa',
    title: 'PDF a PDF/A',
  },
  '/pdf-to-powerpoint': {
    actionText: 'Convertir a PowerPoint',
    convertingText: 'Generando presentación PPTX...',
    icon: 'slideshow',
    path: '/pdf-to-powerpoint',
    subtitle: 'Transforma tus presentaciones PDF en diapositivas PowerPoint PPTX listas para editar y proyectar.',
    targetBadge: 'PPTX',
    targetExtension: '.pptx',
    targetType: 'pdf-to-powerpoint',
    title: 'PDF a PowerPoint',
  },
  '/pdf-to-word': {
    actionText: 'Convertir a Word',
    convertingText: 'Convirtiendo documento a Word...',
    icon: 'description',
    path: '/pdf-to-word',
    subtitle: 'Convierte documentos PDF a archivos Word DOCX completamente editables manteniendo texto y formato.',
    targetBadge: 'DOCX',
    targetExtension: '.docx',
    targetType: 'pdf-to-word',
    title: 'PDF a Word',
  },
};
