export interface PageOrderOption {
  pageIndex: number;
  rotation?: number;
}

export interface OrganizePdfOptions {
  filename?: string;
  order?: 'asc' | 'reverse' | 'default';
  pagesOrder?: PageOrderOption[];
}

export interface StoredOrganizePdfResult {
  buffer: Buffer;
  contentType: string;
  createdAt: number;
  filename: string;
  id: string;
  pagesCount: number;
  size: number;
}

export interface OrganizePdfResponse {
  downloadUrl: string;
  fileId: string;
  filename: string;
  fileSize: number;
  totalPages: number;
}
