export interface RemovePagesOptions {
  filename?: string;
  pagesToRemove: number[];
}

export interface StoredRemovePagesResult {
  buffer: Buffer;
  contentType: string;
  createdAt: number;
  filename: string;
  id: string;
  originalPages: number;
  remainingPages: number;
  removedPages: number;
  size: number;
}

export interface RemovePagesResponse {
  downloadUrl: string;
  fileId: string;
  filename: string;
  fileSize: number;
  originalPages: number;
  remainingPages: number;
  removedPages: number;
}
