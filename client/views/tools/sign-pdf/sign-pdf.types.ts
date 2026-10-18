export type SignPdfType = 'digital' | 'simple';

export type SignFlowStep = 'details' | 'dropzone' | 'who_signs' | 'workspace';

export type SignatureTab = 'initials' | 'logo' | 'signature';

export type SignatureMode = 'draw' | 'type' | 'upload';

export interface SignPlacedElement {
  color?: string;
  dataUrl?: string;
  fontSize?: number;
  height: number;
  id: string;
  imageIndex?: number;
  pageIndex: number;
  text?: string;
  type: 'date' | 'initials' | 'logo' | 'name' | 'signature' | 'text';
  width: number;
  x: number;
  y: number;
}

export interface SignPdfResponseData {
  auditToken?: string;
  documentHash?: string;
  downloadUrl: string;
  fileId: string;
  filename: string;
  fileSize: number;
  pageCount: number;
  signType: SignPdfType;
}

export interface SignatureAsset {
  dataUrl: string;
  file?: File;
  mode: SignatureMode;
}
