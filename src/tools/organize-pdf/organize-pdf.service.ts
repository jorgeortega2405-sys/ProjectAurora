import crypto from 'crypto';
import path from 'path';
import { degrees, PDFDocument } from 'pdf-lib';
import { logger } from '../../services/logger.service.js';
import { getTempFile, storeTempFile } from '../../services/temp-storage.service.js';
import { OrganizePdfOptions, OrganizePdfResponse, StoredOrganizePdfResult } from './organize-pdf.types.js';

function sanitizePdfFilename(rawName?: string, defaultName = 'documento_organizado.pdf'): string {
  if (!rawName || typeof rawName !== 'string') {
    return defaultName;
  }
  const clean = path.basename(rawName).trim().replace(/[^a-zA-Z0-9_\-\. ]/g, '_');
  if (!clean) {
    return defaultName;
  }
  return clean.toLowerCase().endsWith('.pdf') ? clean : `${clean}.pdf`;
}

export async function organizePdf(
  fileBuffer: Buffer,
  originalFilename: string,
  options: OrganizePdfOptions
): Promise<OrganizePdfResponse> {
  let srcDoc: PDFDocument;
  try {
    srcDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
  } catch (err) {
    logger.app.error(`Error al cargar documento PDF para ordenar páginas: ${originalFilename}`, err);
    throw new Error('El archivo seleccionado no es un documento PDF válido o está protegido contra lectura.');
  }

  const totalPages = srcDoc.getPageCount();
  if (totalPages === 0) {
    throw new Error('El documento no contiene páginas válidas.');
  }

  let orderList = options.pagesOrder || [];
  if (orderList.length === 0) {
    const indices = options.order === 'reverse'
      ? Array.from({ length: totalPages }, (_, i) => totalPages - 1 - i)
      : Array.from({ length: totalPages }, (_, i) => i);
    orderList = indices.map((pageIndex) => ({ pageIndex }));
  }

  if (orderList.length === 0) {
    throw new Error('Debes incluir al menos una página en el orden final.');
  }

  for (const item of orderList) {
    if (typeof item.pageIndex !== 'number' || item.pageIndex < 0 || item.pageIndex >= totalPages) {
      throw new Error(`Índice de página inválido: ${item.pageIndex + 1}. El documento tiene ${totalPages} páginas.`);
    }
  }

  const newDoc = await PDFDocument.create();

  for (const item of orderList) {
    const [copiedPage] = await newDoc.copyPages(srcDoc, [item.pageIndex]);
    const rot = typeof item.rotation === 'number' ? ((item.rotation % 360) + 360) % 360 : 0;
    if (rot !== 0) {
      const currentAngle = copiedPage.getRotation().angle;
      copiedPage.setRotation(degrees((currentAngle + rot) % 360));
    }
    newDoc.addPage(copiedPage);
  }

  const savedBytes = await newDoc.save({ useObjectStreams: true });
  const finalBuffer = Buffer.from(savedBytes);
  const fileId = crypto.randomUUID();
  const filename = sanitizePdfFilename(options.filename, `${originalFilename.replace(/\.pdf$/i, '')}_organizado.pdf`);

  const storedItem: StoredOrganizePdfResult = {
    buffer: finalBuffer,
    contentType: 'application/pdf',
    createdAt: Date.now(),
    filename,
    id: fileId,
    pagesCount: orderList.length,
    size: finalBuffer.length,
  };

  await storeTempFile(fileId, storedItem);

  return {
    downloadUrl: `/api/tools/organize-pdf/download/${fileId}`,
    fileId,
    filename,
    fileSize: finalBuffer.length,
    totalPages,
  };
}

export async function getOrganizePdfResult(fileId: string): Promise<StoredOrganizePdfResult | null> {
  return getTempFile<StoredOrganizePdfResult>(fileId);
}
