export type DiffChangeType = 'addition' | 'deletion' | 'modification' | 'unchanged';

export interface DiffChangeItem {
  diffCount: number;
  id: string;
  newText?: string;
  oldText?: string;
  pageIndex: number;
  type: DiffChangeType;
}

export interface PageComparison {
  changes: DiffChangeItem[];
  differencesCount: number;
  hasDifferences: boolean;
  pageIndex: number;
}

export interface ComparePdfParams {
  buffer1: Buffer;
  buffer2: Buffer;
  comparisonMode?: 'semantic' | 'overlay';
  filename1?: string;
  filename2?: string;
}

export interface ComparePdfResponse {
  additionsCount: number;
  deletionsCount: number;
  downloadUrl: string;
  fileId: string;
  fileSize: number;
  filename: string;
  pageComparisons: PageComparison[];
  pagesCompared: number;
  similarityPercentage: number;
  totalChanges: number;
}

export interface StoredComparisonReport {
  buffer: Buffer;
  contentType: string;
  createdAt: number;
  fileId: string;
  fileSize: number;
  filename: string;
}
