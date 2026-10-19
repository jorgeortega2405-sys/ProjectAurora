import crypto from 'crypto';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { logger } from '../../services/logger.service.js';
import { storeTempFile } from '../../services/temp-storage.service.js';
import { EditPdfModifications, EditPdfResult } from './edit-pdf.types.js';

function sanitizePdfFilename(rawName?: string, defaultName = 'documento_editado.pdf'): string {
  if (!rawName || typeof rawName !== 'string') {
    return defaultName;
  }
  const clean = path.basename(rawName).trim().replace(/[^a-zA-Z0-9_\-\. ]/g, '_');
  if (!clean) {
    return defaultName;
  }
  return clean.toLowerCase().endsWith('.pdf') ? clean : `${clean}.pdf`;
}

function parseHexColor(hex?: string): { b: number; g: number; r: number } {
  if (!hex || typeof hex !== 'string' || hex === 'transparent' || hex === 'none') {
    return { b: 0, g: 0, r: 0 };
  }
  const clean = hex.replace('#', '').trim();
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    return { b, g, r };
  }
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    return { b, g, r };
  }
  return { b: 0, g: 0, r: 0 };
}

function cleanTextForPdf(input: string): string {
  const str = input.replace(/\uFFFD/g, '');
  let result = '';
  for (const char of str) {
    const code = char.charCodeAt(0);
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
      result += char;
    } else {
      const decomposed = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      for (const d of decomposed) {
        const dCode = d.charCodeAt(0);
        if (dCode >= 0x20 && dCode <= 0x7e) {
          result += d;
        }
      }
    }
  }
  return result;
}

export async function editPdfDocument(
  pdfBuffer: Buffer,
  originalFilename: string,
  modifications: EditPdfModifications,
  imageBuffers: Buffer[] = [],
  customFilename?: string
): Promise<EditPdfResult> {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontTimes = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const fontCourier = await pdfDoc.embedFont(StandardFonts.Courier);

  const resolveFont = (fontFamily?: string) => {
    if (!fontFamily) return fontHelvetica;
    const lower = fontFamily.toLowerCase();
    if (lower.includes('times') || lower.includes('serif')) return fontTimes;
    if (lower.includes('courier') || lower.includes('mono')) return fontCourier;
    return fontHelvetica;
  };

  const embeddedImages: any[] = [];
  for (const imgBuf of imageBuffers) {
    try {
      if (imgBuf[0] === 0x89 && imgBuf[1] === 0x50) {
        const embedded = await pdfDoc.embedPng(imgBuf);
        embeddedImages.push(embedded);
      } else {
        const embedded = await pdfDoc.embedJpg(imgBuf);
        embeddedImages.push(embedded);
      }
    } catch (err) {
      logger.app.warn('Error al incrustar imagen en PDF', err);
      embeddedImages.push(null);
    }
  }

  const pages = pdfDoc.getPages();
  const pageCount = pages.length;

  const resolvePageIndex = (item: any): number => {
    if (!item || typeof item !== 'object') return -1;
    const idx = typeof item.pageIndex === 'number'
      ? item.pageIndex
      : typeof item.page === 'number'
        ? item.page - 1
        : -1;
    return idx >= 0 && idx < pageCount ? idx : -1;
  };

  if (modifications.replacements && modifications.replacements.length > 0) {
    for (const rep of modifications.replacements) {
      const pageIdx = resolvePageIndex(rep);
      if (pageIdx < 0) continue;
      const page = pages[pageIdx];
      const pageHeight = page.getHeight();

      const coverX = Math.max(0, rep.x - 1);
      const coverY = Math.max(0, pageHeight - rep.y - rep.height - 1);
      const coverW = rep.width + 2;
      const coverH = rep.height + 2;

      page.drawRectangle({
        color: rgb(1, 1, 1),
        height: coverH,
        width: coverW,
        x: coverX,
        y: coverY,
      });

      const font = resolveFont(rep.fontFamily);
      const colorRgb = parseHexColor(rep.color || '#000000');
      const safeText = cleanTextForPdf(rep.newText);
      const fontSize = Math.max(6, rep.fontSize || 12);

      page.drawText(safeText, {
        color: rgb(colorRgb.r, colorRgb.g, colorRgb.b),
        font,
        size: fontSize,
        x: rep.x,
        y: pageHeight - rep.y - rep.height * 0.82,
      });
    }
  }

  if (modifications.drawings && modifications.drawings.length > 0) {
    for (const stroke of modifications.drawings) {
      const pageIdx = resolvePageIndex(stroke);
      if (pageIdx < 0 || !Array.isArray(stroke.points) || stroke.points.length < 2) continue;
      const page = pages[pageIdx];
      const pageHeight = page.getHeight();
      const colorRgb = parseHexColor(stroke.color || '#000000');
      const thickness = Math.max(1, stroke.width || 2);

      for (let i = 0; i < stroke.points.length - 1; i++) {
        const p1 = stroke.points[i];
        const p2 = stroke.points[i + 1];
        page.drawLine({
          color: rgb(colorRgb.r, colorRgb.g, colorRgb.b),
          end: { x: p2.x, y: pageHeight - p2.y },
          start: { x: p1.x, y: pageHeight - p1.y },
          thickness,
        });
      }
    }
  }

  if (modifications.shapes && modifications.shapes.length > 0) {
    for (const shape of modifications.shapes) {
      const pageIdx = resolvePageIndex(shape);
      if (pageIdx < 0) continue;
      const page = pages[pageIdx];
      const pageHeight = page.getHeight();
      const strokeRgb = parseHexColor(shape.strokeColor || '#000000');
      const strokeWidth = Math.max(1, shape.strokeWidth || 2);
      const hasFill = shape.fillColor && shape.fillColor !== 'transparent' && shape.fillColor !== 'none';
      const fillRgb = hasFill ? parseHexColor(shape.fillColor) : undefined;

      if (shape.type === 'line') {
        const x2 = shape.x2 !== undefined ? shape.x2 : shape.x + (shape.width || 100);
        const y2 = shape.y2 !== undefined ? shape.y2 : shape.y + (shape.height || 0);
        page.drawLine({
          color: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
          end: { x: x2, y: pageHeight - y2 },
          start: { x: shape.x, y: pageHeight - shape.y },
          thickness: strokeWidth,
        });
      } else if (shape.type === 'rect') {
        const w = shape.width || 50;
        const h = shape.height || 50;
        page.drawRectangle({
          borderColor: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
          borderWidth: strokeWidth,
          color: fillRgb ? rgb(fillRgb.r, fillRgb.g, fillRgb.b) : undefined,
          height: h,
          width: w,
          x: shape.x,
          y: pageHeight - shape.y - h,
        });
      } else if (shape.type === 'circle') {
        const w = shape.width || 50;
        const h = shape.height || 50;
        const radiusX = Math.abs(w / 2);
        const radiusY = Math.abs(h / 2);
        page.drawEllipse({
          borderColor: rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b),
          borderWidth: strokeWidth,
          color: fillRgb ? rgb(fillRgb.r, fillRgb.g, fillRgb.b) : undefined,
          x: shape.x + radiusX,
          xScale: radiusX,
          y: pageHeight - shape.y - radiusY,
          yScale: radiusY,
        });
      }
    }
  }

  if (modifications.texts && modifications.texts.length > 0) {
    for (const item of modifications.texts) {
      const pageIdx = resolvePageIndex(item);
      if (pageIdx < 0 || !item.text) continue;
      const page = pages[pageIdx];
      const pageHeight = page.getHeight();
      const font = resolveFont(item.fontFamily);
      const colorRgb = parseHexColor(item.color || '#000000');
      const safeText = cleanTextForPdf(item.text);
      const fontSize = Math.max(8, item.fontSize || 14);

      page.drawText(safeText, {
        color: rgb(colorRgb.r, colorRgb.g, colorRgb.b),
        font,
        size: fontSize,
        x: item.x || 50,
        y: pageHeight - (item.y || 50) - fontSize * 0.85,
      });
    }
  }

  if (modifications.images && modifications.images.length > 0) {
    for (const imgItem of modifications.images) {
      const pageIdx = resolvePageIndex(imgItem);
      if (pageIdx < 0) continue;
      const embeddedImg = embeddedImages[imgItem.imageIndex];
      if (!embeddedImg) continue;
      const page = pages[pageIdx];
      const pageHeight = page.getHeight();

      page.drawImage(embeddedImg, {
        height: imgItem.height,
        width: imgItem.width,
        x: imgItem.x,
        y: pageHeight - imgItem.y - imgItem.height,
      });
    }
  }

  const modifiedPdfBytes = await pdfDoc.save();
  const outputBuffer = Buffer.from(modifiedPdfBytes);

  const baseName = originalFilename.replace(/\.[^/.]+$/, '');
  const finalFilename = sanitizePdfFilename(customFilename || `${baseName}_editado.pdf`);
  const token = crypto.randomUUID();

  await storeTempFile(token, {
    buffer: outputBuffer,
    contentType: 'application/pdf',
    createdAt: Date.now(),
    filename: finalFilename,
  });

  return {
    downloadUrl: `/api/download/${token}`,
    fileId: token,
    filename: finalFilename,
    fileSize: outputBuffer.length,
    pageCount,
  };
}
