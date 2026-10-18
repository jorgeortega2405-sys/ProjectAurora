import crypto from 'crypto';
import path from 'path';
import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { logger } from '../../services/logger.service.js';
import { getTempFile, storeTempFile } from '../../services/temp-storage.service.js';
import { StoredWatermarkPdfResult, WatermarkOptions, WatermarkPdfResponse, WatermarkPosition } from './watermark-pdf.types.js';

function sanitizePdfFilename(rawName?: string, defaultName = 'documento_marca_de_agua.pdf'): string {
  if (!rawName || typeof rawName !== 'string') {
    return defaultName;
  }
  const clean = path.basename(rawName).trim().replace(/[^a-zA-Z0-9_\-\. ]/g, '_');
  if (!clean) {
    return defaultName;
  }
  return clean.toLowerCase().endsWith('.pdf') ? clean : `${clean}.pdf`;
}

function cleanTextForWinAnsi(input: string): string {
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

function parseHexColor(hex?: string): { b: number; g: number; r: number } {
  if (!hex || typeof hex !== 'string') return { b: 0.6, g: 0.6, r: 0.6 };
  const clean = hex.replace('#', '');
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    return { b, g, r };
  }
  return { b: 0.6, g: 0.6, r: 0.6 };
}

function calculateCoords(
  pos: WatermarkPosition,
  pageWidth: number,
  pageHeight: number,
  itemWidth: number,
  itemHeight: number,
  margin = 36
): { x: number; y: number } {
  let x = margin;
  let y = margin;

  if (pos.includes('left')) {
    x = margin;
  } else if (pos.includes('right')) {
    x = Math.max(margin, pageWidth - margin - itemWidth);
  } else {
    x = Math.max(margin, (pageWidth - itemWidth) / 2);
  }

  if (pos.startsWith('top')) {
    y = Math.max(margin, pageHeight - margin - itemHeight);
  } else if (pos.startsWith('bottom')) {
    y = margin;
  } else {
    y = Math.max(margin, (pageHeight - itemHeight) / 2);
  }

  return { x, y };
}

export async function addWatermarkToPdf(
  fileBuffer: Buffer,
  originalFilename: string,
  options: WatermarkOptions,
  imageBuffer?: Buffer
): Promise<WatermarkPdfResponse> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
  } catch (err) {
    logger.app.error(`Error al cargar PDF para marca de agua: ${originalFilename}`, err);
    throw new Error('El archivo seleccionado no es un documento PDF válido o está protegido contra lectura.');
  }

  const totalPages = doc.getPageCount();
  if (totalPages === 0) {
    throw new Error('El documento no contiene páginas válidas.');
  }

  const isImageWatermark = options.type === 'image' && Boolean(imageBuffer);
  const transparencyPercent = Math.max(0, Math.min(95, Number(options.transparency) || 0));
  const opacity = Math.max(0.05, 1 - transparencyPercent / 100);
  const rotDegrees = Number(options.rotation) || 0;
  const rotAngle = degrees(rotDegrees);
  const fromPage = Math.max(1, Math.min(totalPages, Number(options.fromPage) || 1));
  const toPage = Math.max(fromPage, Math.min(totalPages, Number(options.toPage) || totalPages));
  const isMosaic = Boolean(options.mosaic);
  const basePos = options.position || 'center';

  let embeddedImage: any = null;
  let imgDims = { height: 100, width: 100 };

  if (isImageWatermark && imageBuffer) {
    try {
      embeddedImage = await doc.embedPng(imageBuffer);
    } catch {
      try {
        embeddedImage = await doc.embedJpg(imageBuffer);
      } catch {
        throw new Error('Formato de imagen no compatible para la marca de agua. Utiliza PNG o JPG.');
      }
    }
    const scaled = embeddedImage.scale(1);
    const maxDimension = 180;
    const scaleFactor = Math.min(maxDimension / scaled.width, maxDimension / scaled.height, 1);
    imgDims = {
      height: scaled.height * scaleFactor,
      width: scaled.width * scaleFactor,
    };
  }

  let font: any = null;
  let text = '';
  let fontSize = 36;
  let textColor = rgb(0.6, 0.6, 0.6);

  if (!isImageWatermark) {
    let fontName = StandardFonts.Helvetica;
    if (options.fontFamily === 'Helvetica-Bold' || options.isBold) fontName = StandardFonts.HelveticaBold;
    else if (options.fontFamily === 'Times-Roman') fontName = StandardFonts.TimesRoman;
    else if (options.fontFamily === 'Courier') fontName = StandardFonts.Courier;

    font = await doc.embedFont(fontName);
    fontSize = Math.max(12, Math.min(120, Number(options.fontSize) || 36));
    const c = parseHexColor(options.color);
    textColor = rgb(c.r, c.g, c.b);
    text = cleanTextForWinAnsi(options.text?.trim() || 'CONFIDENCIAL');
  }

  for (let i = fromPage - 1; i <= toPage - 1; i++) {
    const page = doc.getPage(i);
    const { height, width } = page.getSize();

    if (isImageWatermark && embeddedImage) {
      if (isMosaic) {
        const stepX = width / 3;
        const stepY = height / 3;
        for (let col = 0; col < 3; col++) {
          for (let row = 0; row < 3; row++) {
            const x = col * stepX + (stepX - imgDims.width) / 2;
            const y = row * stepY + (stepY - imgDims.height) / 2;
            page.drawImage(embeddedImage, {
              height: imgDims.height,
              opacity,
              rotate: rotAngle,
              width: imgDims.width,
              x,
              y,
            });
          }
        }
      } else {
        const coords = calculateCoords(basePos, width, height, imgDims.width, imgDims.height);
        page.drawImage(embeddedImage, {
          height: imgDims.height,
          opacity,
          rotate: rotAngle,
          width: imgDims.width,
          x: coords.x,
          y: coords.y,
        });
      }
    } else if (font && text) {
      const textWidth = font.widthOfTextAtSize(text, fontSize);
      const textHeight = font.heightAtSize(fontSize);

      if (isMosaic) {
        const stepX = width / 3;
        const stepY = height / 3;
        for (let col = 0; col < 3; col++) {
          for (let row = 0; row < 3; row++) {
            const x = col * stepX + (stepX - textWidth) / 2;
            const y = row * stepY + (stepY - textHeight) / 2;
            page.drawText(text, {
              color: textColor,
              font,
              opacity,
              rotate: rotAngle,
              size: fontSize,
              x,
              y,
            });
          }
        }
      } else {
        const coords = calculateCoords(basePos, width, height, textWidth, textHeight);
        page.drawText(text, {
          color: textColor,
          font,
          opacity,
          rotate: rotAngle,
          size: fontSize,
          x: coords.x,
          y: coords.y,
        });
      }
    }
  }

  const savedBytes = await doc.save();
  const finalBuffer = Buffer.from(savedBytes);
  const fileId = crypto.randomUUID();
  const filename = sanitizePdfFilename(options.filename, `${originalFilename.replace(/\.pdf$/i, '')}_marca_de_agua.pdf`);

  const storedItem: StoredWatermarkPdfResult = {
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
    downloadUrl: `/api/tools/watermark-pdf/download/${fileId}`,
    fileId,
    filename,
    fileSize: finalBuffer.length,
    totalPages,
  };
}

export async function getWatermarkPdfResult(fileId: string): Promise<StoredWatermarkPdfResult | null> {
  return getTempFile<StoredWatermarkPdfResult>(fileId);
}
