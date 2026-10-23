import crypto from 'crypto';
import path from 'path';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { logger } from '../../services/logger.service.js';
import { getTempFile, storeTempFile } from '../../services/temp-storage.service.js';
import { CropBoxPercent, CropPdfOptions, CropPdfResponse, StoredCropPdfResult } from './crop-pdf.types.js';

function sanitizePdfFilename(rawName?: string, defaultName = 'documento_recortado.pdf'): string {
  if (!rawName || typeof rawName !== 'string') {
    return defaultName;
  }
  const clean = path.basename(rawName).trim().replace(/[^a-zA-Z0-9_\-\. ]/g, '_');
  if (!clean) {
    return defaultName;
  }
  return clean.toLowerCase().endsWith('.pdf') ? clean : `${clean}.pdf`;
}

function applyCropToPage(page: PDFPage, box: CropBoxPercent): void {
  const mediaBox = page.getMediaBox();
  const rot = ((page.getRotation().angle % 360) + 360) % 360;

  const clampX = Math.max(0, Math.min(99, box.x));
  const clampY = Math.max(0, Math.min(99, box.y));
  const clampW = Math.max(1, Math.min(100 - clampX, box.width));
  const clampH = Math.max(1, Math.min(100 - clampY, box.height));

  if (rot === 90) {
    const pdfX = mediaBox.x + (clampY / 100) * mediaBox.width;
    const pdfWidth = (clampH / 100) * mediaBox.width;
    const pdfY = mediaBox.y + ((100 - (clampX + clampW)) / 100) * mediaBox.height;
    const pdfHeight = (clampW / 100) * mediaBox.height;
    page.setCropBox(pdfX, pdfY, pdfWidth, pdfHeight);
    page.setMediaBox(pdfX, pdfY, pdfWidth, pdfHeight);
  } else if (rot === 270) {
    const pdfX = mediaBox.x + ((100 - (clampY + clampH)) / 100) * mediaBox.width;
    const pdfWidth = (clampH / 100) * mediaBox.width;
    const pdfY = mediaBox.y + (clampX / 100) * mediaBox.height;
    const pdfHeight = (clampW / 100) * mediaBox.height;
    page.setCropBox(pdfX, pdfY, pdfWidth, pdfHeight);
    page.setMediaBox(pdfX, pdfY, pdfWidth, pdfHeight);
  } else if (rot === 180) {
    const pdfX = mediaBox.x + ((100 - (clampX + clampW)) / 100) * mediaBox.width;
    const pdfWidth = (clampW / 100) * mediaBox.width;
    const pdfY = mediaBox.y + (clampY / 100) * mediaBox.height;
    const pdfHeight = (clampH / 100) * mediaBox.height;
    page.setCropBox(pdfX, pdfY, pdfWidth, pdfHeight);
    page.setMediaBox(pdfX, pdfY, pdfWidth, pdfHeight);
  } else {
    const pdfX = mediaBox.x + (clampX / 100) * mediaBox.width;
    const pdfWidth = (clampW / 100) * mediaBox.width;
    const pdfY = mediaBox.y + mediaBox.height - ((clampY + clampH) / 100) * mediaBox.height;
    const pdfHeight = (clampH / 100) * mediaBox.height;
    page.setCropBox(pdfX, pdfY, pdfWidth, pdfHeight);
    page.setMediaBox(pdfX, pdfY, pdfWidth, pdfHeight);
  }
}

export async function cropPdf(
  fileBuffer: Buffer,
  originalFilename: string,
  options: CropPdfOptions
): Promise<CropPdfResponse> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
  } catch (err) {
    logger.app.error(`Error al cargar PDF para recortar: ${originalFilename}`, err);
    throw new Error('El archivo seleccionado no es un documento PDF válido o está protegido contra lectura.');
  }

  const totalPages = doc.getPageCount();
  if (totalPages === 0) {
    throw new Error('El documento no contiene páginas válidas.');
  }

  const cropBox = options.cropBox;
  if (!cropBox || typeof cropBox.width !== 'number' || typeof cropBox.height !== 'number') {
    throw new Error('Debes definir un área de recorte válida.');
  }

  const applyToAll = options.applyToAll !== false;

  if (applyToAll) {
    for (let i = 0; i < totalPages; i++) {
      applyCropToPage(doc.getPage(i), cropBox);
    }
  } else {
    const targetIdx = typeof options.targetPageIndex === 'number'
      ? Math.max(0, Math.min(totalPages - 1, options.targetPageIndex))
      : 0;
    applyCropToPage(doc.getPage(targetIdx), cropBox);
  }

  const savedBytes = await doc.save();
  const finalBuffer = Buffer.from(savedBytes);
  const fileId = crypto.randomUUID();
  const filename = sanitizePdfFilename(options.filename, `${originalFilename.replace(/\.pdf$/i, '')}_recortado.pdf`);

  const storedItem: StoredCropPdfResult = {
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
    downloadUrl: `/api/tools/crop-pdf/download/${fileId}`,
    fileId,
    filename,
    fileSize: finalBuffer.length,
    totalPages,
  };
}

export async function getCropPdfResult(fileId: string): Promise<StoredCropPdfResult | null> {
  return getTempFile<StoredCropPdfResult>(fileId);
}
