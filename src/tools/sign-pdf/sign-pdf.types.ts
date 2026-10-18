export interface SignPdfElement {
  color?: string;
  fontSize?: number;
  height?: number;
  id: string;
  imageIndex?: number;
  pageIndex: number;
  text?: string;
  type: 'date' | 'initials' | 'logo' | 'name' | 'signature' | 'text';
  width?: number;
  x: number;
  y: number;
}

export interface SignPdfModifications {
  elements: SignPdfElement[];
  includeAuditTrail?: boolean;
  signType: 'digital' | 'simple';
  signerEmail?: string;
  signerInitials?: string;
  signerName: string;
}

export interface SignPdfResult {
  auditToken?: string;
  documentHash?: string;
  downloadUrl: string;
  fileId: string;
  filename: string;
  fileSize: number;
  pageCount: number;
  signType: 'digital' | 'simple';
}
