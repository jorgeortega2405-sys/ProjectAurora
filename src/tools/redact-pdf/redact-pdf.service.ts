import { logger } from '../../services/logger.service.js';
import { getTempFile, storeTempFile } from '../../services/temp-storage.service.js';
import { PageRedaction, RedactPdfParams, RedactPdfResponse, StoredRedactedPdf } from './redact-pdf.types.js';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import zlib from 'node:zlib';
import { PDFArray, PDFDocument, PDFName, PDFRawStream, PDFStream, rgb } from 'pdf-lib';

function sanitizePdfFilename(rawName?: string, defaultName = 'documento_censurado.pdf'): string {
  if (!rawName || typeof rawName !== 'string') {
    return defaultName;
  }
  const clean = path.basename(rawName).trim().replace(/[^a-zA-Z0-9_\-\. ]/g, '_');
  if (!clean) {
    return defaultName;
  }
  const base = clean.replace(/\.pdf$/i, '');
  return base.endsWith('_censurado') ? `${base}.pdf` : `${base}_censurado.pdf`;
}

function purgeTextFromPageStreams(pdfDoc: PDFDocument, page: any, targetTexts: string[]): void {
  if (targetTexts.length === 0) return;
  try {
    const contents = page.node.Contents();
    if (!contents) return;

    const streams: any[] = [];
    if (contents instanceof PDFArray) {
      for (let i = 0; i < contents.size(); i++) {
        const item = pdfDoc.context.lookup(contents.get(i));
        if (item instanceof PDFStream || item instanceof PDFRawStream) {
          streams.push(item);
        }
      }
    } else {
      const item = pdfDoc.context.lookup(contents);
      if (item instanceof PDFStream || item instanceof PDFRawStream) {
        streams.push(item);
      }
    }

    for (const stream of streams) {
      const rawBytes = stream.getContents();
      if (!rawBytes || rawBytes.length === 0) continue;

      let isCompressed = false;
      let textStream: string;

      try {
        const decompressed = zlib.inflateSync(rawBytes);
        textStream = decompressed.toString('latin1');
        isCompressed = true;
      } catch {
        textStream = Buffer.from(rawBytes).toString('latin1');
      }

      let modified = false;
      for (const text of targetTexts) {
        if (!text || text.length < 2) continue;
        if (textStream.includes(text)) {
          const replacement = ' '.repeat(text.length);
          textStream = textStream.split(text).join(replacement);
          modified = true;
        }
        const hex = Buffer.from(text, 'utf-8').toString('hex').toUpperCase();
        if (textStream.toUpperCase().includes(hex)) {
          const blankHex = '20'.repeat(text.length);
          const regex = new RegExp(hex, 'gi');
          textStream = textStream.replace(regex, blankHex);
          modified = true;
        }
      }

      if (modified) {
        const newBytes = Buffer.from(textStream, 'latin1');
        stream.contents = isCompressed ? zlib.deflateSync(newBytes) : newBytes;
      }
    }
  } catch (err) {
    logger.app.warn('Advertencia al sanitizar stream de texto en censura', { error: err });
  }
}

export async function getStoredRedactedPdf(fileId: string): Promise<StoredRedactedPdf | null> {
  return getTempFile<StoredRedactedPdf>(fileId);
}

export async function redactPdfDocument(params: RedactPdfParams): Promise<RedactPdfResponse> {
  const { buffer, originalFilename, redactions, sanitizeMetadata = true } = params;

  if (!buffer || buffer.length === 0) {
    throw new Error('EMPTY_PDF_BUFFER');
  }

  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;

  let redactedBoxesCount = 0;
  let redactedPagesCount = 0;

  if (Array.isArray(redactions)) {
    for (const item of redactions) {
      if (item.pageIndex < 0 || item.pageIndex >= totalPages) continue;

      const page = pages[item.pageIndex];
      const pageWidth = page.getWidth();
      const pageHeight = page.getHeight();

      if (item.fullPage) {
        page.node.delete(PDFName.of('Contents'));
        page.node.delete(PDFName.of('Annots'));

        page.drawRectangle({
          color: rgb(0, 0, 0),
          height: pageHeight,
          opacity: 1,
          width: pageWidth,
          x: 0,
          y: 0,
        });

        redactedPagesCount++;
        continue;
      }

      let pageHadRedaction = false;

      if (Array.isArray(item.boxes) && item.boxes.length > 0) {
        const textsToPurge: string[] = [];

        for (const box of item.boxes) {
          const boxX = Number(box.x) || 0;
          const boxY = Number(box.y) || 0;
          const boxW = Number(box.width) || 0;
          const boxH = Number(box.height) || 0;

          if (boxW <= 0 || boxH <= 0) continue;

          const pdfX = Math.max(0, boxX);
          const pdfY = Math.max(0, pageHeight - boxY - boxH);
          const pdfW = Math.min(pageWidth - pdfX, boxW);
          const pdfH = Math.min(pageHeight - pdfY, boxH);

          if (pdfW > 0 && pdfH > 0) {
            page.drawRectangle({
              color: rgb(0, 0, 0),
              height: pdfH,
              opacity: 1,
              width: pdfW,
              x: pdfX,
              y: pdfY,
            });

            redactedBoxesCount++;
            pageHadRedaction = true;

            if (box.text && typeof box.text === 'string' && box.text.trim().length > 0) {
              textsToPurge.push(box.text.trim());
            }
          }
        }

        if (pageHadRedaction) {
          redactedPagesCount++;
        }

        if (textsToPurge.length > 0) {
          purgeTextFromPageStreams(pdfDoc, page, textsToPurge);
        }
      }
    }
  }

  if (sanitizeMetadata) {
    try {
      pdfDoc.setTitle('');
      pdfDoc.setAuthor('');
      pdfDoc.setSubject('');
      pdfDoc.setKeywords([]);
      pdfDoc.setProducer('ProjectAurora Redaction Engine');
      pdfDoc.setCreator('ProjectAurora');
    } catch (metaErr) {
      logger.app.warn('Error al sanitizar metadatos en documento PDF censurado', { error: metaErr });
    }
  }

  const outputBytes = await pdfDoc.save();
  const outFilename = sanitizePdfFilename(originalFilename);
  const fileId = `redact_${Date.now()}_${randomUUID().replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}`;
  const outBuffer = Buffer.from(outputBytes);

  await storeTempFile(fileId, {
    buffer: outBuffer,
    contentType: 'application/pdf',
    createdAt: Date.now(),
    fileId,
    filename: outFilename,
    fileSize: outBuffer.length,
  });

  return {
    downloadUrl: `/api/tools/redact-pdf/download/${fileId}`,
    fileId,
    fileSize: outBuffer.length,
    filename: outFilename,
    redactedBoxesCount,
    redactedPagesCount,
    totalPages,
  };
}

export { redactPdfDocument as redactPdf };
