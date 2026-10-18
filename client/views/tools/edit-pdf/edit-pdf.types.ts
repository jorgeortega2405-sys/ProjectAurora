export type EditPdfMode = 'annotate' | 'edit';
export type EditPdfTool = 'circle' | 'draw' | 'image' | 'line' | 'rect' | 'select' | 'text';
export type EditShapeType = 'circle' | 'line' | 'rect';

export interface EditTextAddition {
  color?: string;
  fontFamily?: string;
  fontSize: number;
  id: string;
  pageIndex: number;
  text: string;
  x: number;
  y: number;
}

export interface EditTextReplacement {
  color?: string;
  fontFamily?: string;
  fontSize: number;
  height: number;
  id: string;
  newText: string;
  originalText: string;
  pageIndex: number;
  width: number;
  x: number;
  y: number;
}

export interface EditShapeItem {
  fillColor?: string;
  height?: number;
  id: string;
  pageIndex: number;
  strokeColor: string;
  strokeWidth: number;
  type: EditShapeType;
  width?: number;
  x: number;
  x2?: number;
  y: number;
  y2?: number;
}

export interface EditDrawingStroke {
  color: string;
  id: string;
  pageIndex: number;
  points: Array<{ x: number; y: number }>;
  width: number;
}

export interface EditImageItem {
  dataUrl: string;
  file: File;
  height: number;
  id: string;
  pageIndex: number;
  width: number;
  x: number;
  y: number;
}

export interface NativeTextItem {
  fontName: string;
  fontSize: number;
  height: number;
  originalText: string;
  pageIndex: number;
  transform: number[];
  width: number;
  x: number;
  y: number;
}

export interface EditPdfResponseData {
  downloadUrl: string;
  fileId: string;
  filename: string;
  fileSize: number;
  pageCount: number;
}

export interface EditorProperties {
  fillColor: string;
  fontFamily: string;
  fontSize: number;
  strokeColor: string;
  strokeWidth: number;
}
