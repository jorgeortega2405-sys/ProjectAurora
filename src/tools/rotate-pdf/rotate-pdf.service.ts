import crypto from 'crypto';
import path from 'path';
import { degrees, PDFDocument } from 'pdf-lib';
import { logger } from '../../services/logger.service.js';
import { getTempFile, storeTempFile } from '../../services/temp-storage.service.js';
import { RotatePdfOptions, RotatePdfResponse, StoredRotatePdfResult } from './rotate-pdf.types.js';

function sanitizePdfFilename(rawName?: string, defaultName = 'documento_rotado.pdf'): string {
  if (!rawName || typeof rawName !== 'string') {
    return defaultName;
  }
  const clean = path.basename(rawName).trim().replace(/[^a-zA-Z0-9_\-\. ]/g, '_');
  if (!clean) {
    return defaultName;
  }
  return clean.toLowerCase().endsWith('.pdf') ? clean : `${clean}.pdf`;
}

export async function rotatePdf(
  fileBuffer: Buffer,
  originalFilename: string,
  options: RotatePdfOptions
): Promise<RotatePdfResponse> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
  } catch (err) {
    logger.app.error(`Error al cargar PDF para rotar: ${originalFilename}`, err);
    throw new Error('El archivo seleccionado no es un documento PDF válido o está protegido contra lectura.');
  }

  const totalPages = doc.getPageCount();
  if (totalPages === 0) {
    throw new Error('El documento no contiene páginas válidas.');
  }

  const pagesMap = new Map<number, number>();
  if (Array.isArray(options.pages)) {
    for (const item of options.pages) {
      if (typeof item.pageIndex === 'number' && item.pageIndex >= 0 && item.pageIndex < totalPages) {
        pagesMap.set(item.pageIndex, item.rotation || 0);
      }
    }
  }

  const globalRot = typeof options.globalRotation === 'number' ? options.globalRotation : 0;

  for (let i = 0; i < totalPages; i++) {
    const page = doc.getPage(i);
    const pageSpecificRot = pagesMap.get(i) || 0;
    const additionalRot = ((pageSpecificRot + globalRot) % 360 + 360) % 360;

    if (additionalRot !== 0) {
      const currentAngle = page.getRotation().angle;
      page.setRotation(degrees((currentAngle + additionalRot) % 360));
    }
  }

  const savedBytes = await doc.save();
  const finalBuffer = Buffer.from(savedBytes);
  const fileId = crypto.randomUUID();
  const filename = sanitizePdfFilename(options.filename, `${originalFilename.replace(/\.pdf$/i, '')}_rotado.pdf`);

  const storedItem: StoredRotatePdfResult = {
    buffer: finalBuffer,
    contentType: 'application/pdf',
    createdAt: Date.now(),
    filename,
    id: fileId,
    pagesCount: totalPages,
    size: finalBuffer.length,
  };

  await storeTempFile(fileId, storedItem);

  return {
    downloadUrl: `/api/tools/rotate-pdf/download/${fileId}`,
    fileId,
    filename,
    fileSize: finalBuffer.length,
    totalPages,
  };
}

export async function getRotatePdfResult(fileId: string): Promise<StoredRotatePdfResult | null> {
  return getTempFile<StoredRotatePdfResult>(fileId);
}
