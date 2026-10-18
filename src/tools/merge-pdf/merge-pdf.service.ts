import { logger } from '../../services/logger.service.js';
import { getTempFile, storeTempFile } from '../../services/temp-storage.service.js';
import { MergePdfResponse, StoredMergedPdf } from './merge-pdf.types.js';
import crypto from 'crypto';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

function sanitizePdfFilename(rawName?: string): string {
  if (!rawName || typeof rawName !== 'string') {
    return 'documento_unido.pdf';
  }
  const clean = path.basename(rawName).trim().replace(/[^a-zA-Z0-9_\-\. ]/g, '_');
  if (!clean) {
    return 'documento_unido.pdf';
  }
  return clean.toLowerCase().endsWith('.pdf') ? clean : `${clean}.pdf`;
}

export async function mergePdfFiles(
  files: Array<{ buffer: Buffer; originalname: string }>,
  customFilename?: string
): Promise<MergePdfResponse> {
  const mergedDoc = await PDFDocument.create();
  let totalPages = 0;

  for (const file of files) {
    try {
      const srcDoc = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
      const indices = srcDoc.getPageIndices();
      const copiedPages = await mergedDoc.copyPages(srcDoc, indices);
      for (const page of copiedPages) {
        mergedDoc.addPage(page);
      }
      totalPages += indices.length;
    } catch (loadError) {
      logger.app.error(`Error al procesar archivo PDF "${file.originalname}"`, loadError);
      throw new Error(`El archivo "${file.originalname}" no es un documento PDF válido o está protegido.`);
    }
  }

  const mergedBytes = await mergedDoc.save();
  const fileBuffer = Buffer.from(mergedBytes);
  const fileId = crypto.randomUUID();
  const filename = sanitizePdfFilename(customFilename);

  const storedItem: StoredMergedPdf = {
    buffer: fileBuffer,
    contentType: 'application/pdf',
    createdAt: Date.now(),
    filename,
    id: fileId,
    pageCount: totalPages,
    size: fileBuffer.length,
  };

  await storeTempFile(fileId, storedItem);

  return {
    downloadUrl: `/api/tools/merge-pdf/download/${fileId}`,
    fileId,
    filename,
    fileSize: fileBuffer.length,
    pageCount: totalPages,
  };
}

export async function getMergedPdf(fileId: string): Promise<StoredMergedPdf | null> {
  return getTempFile<StoredMergedPdf>(fileId);
}
