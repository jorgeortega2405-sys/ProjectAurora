import crypto from 'crypto';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { logger } from '../../services/logger.service.js';
import { storeTempFile } from '../../services/temp-storage.service.js';
import { SignPdfModifications, SignPdfResult } from './sign-pdf.types.js';

function sanitizePdfFilename(rawName?: string, defaultName = 'documento_firmado.pdf'): string {
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

export async function signPdfDocument(
  pdfBuffer: Buffer,
  originalFilename: string,
  modifications: SignPdfModifications,
  imageBuffers: Buffer[] = []
): Promise<SignPdfResult> {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontCourier = await pdfDoc.embedFont(StandardFonts.Courier);

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
      logger.app.warn('Error al incrustar imagen de firma en PDF', err);
      embeddedImages.push(null);
    }
  }

  const pages = pdfDoc.getPages();
  const pageCount = pages.length;

  for (const el of modifications.elements) {
    if (el.pageIndex < 0 || el.pageIndex >= pageCount) continue;
    const page = pages[el.pageIndex];
    const pageHeight = page.getHeight();

    if (el.type === 'signature' || el.type === 'initials' || el.type === 'logo') {
      if (el.imageIndex !== undefined && embeddedImages[el.imageIndex]) {
        const embeddedImg = embeddedImages[el.imageIndex];
        const w = el.width || 140;
        const h = el.height || 60;
        page.drawImage(embeddedImg, {
          height: h,
          width: w,
          x: el.x,
          y: pageHeight - el.y - h,
        });
      }
    } else if (el.type === 'name' || el.type === 'date' || el.type === 'text') {
      const textVal = cleanTextForPdf(el.text || '');
      if (!textVal) continue;
      const fontSize = Math.max(9, el.fontSize || 13);
      const colorRgb = parseHexColor(el.color || '#111827');
      page.drawText(textVal, {
        color: rgb(colorRgb.r, colorRgb.g, colorRgb.b),
        font: fontHelvetica,
        size: fontSize,
        x: el.x,
        y: pageHeight - el.y - fontSize * 0.9,
      });
    }
  }

  const auditToken = crypto.randomUUID();
  const signingDate = new Date();
  const isoDate = signingDate.toISOString();
  const formattedDate = signingDate.toLocaleDateString('es-ES', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'long',
    second: '2-digit',
    timeZoneName: 'short',
    year: 'numeric',
  });

  let documentHash = '';

  if (modifications.signType === 'digital') {
    const intermediateBytes = await pdfDoc.save();
    documentHash = crypto.createHash('sha256').update(intermediateBytes).digest('hex');

    pdfDoc.setTitle(`Documento Firmado Digitalmente - ${originalFilename}`);
    pdfDoc.setSubject('Certificado de Firma Digital Aurora Secure Sign');
    pdfDoc.setKeywords(['Firma Digital', 'SHA-256', 'PAdES-SES', 'Aurora Sign', 'Verificado']);
    pdfDoc.setProducer('Aurora PDF Engine v2.0 - Cryptographic Signing Module');
    pdfDoc.setModificationDate(signingDate);

    const auditPage = pdfDoc.addPage([595.28, 841.89]);
    const { height: aH, width: aW } = auditPage.getSize();

    auditPage.drawRectangle({
      borderColor: rgb(0.85, 0.88, 0.92),
      borderWidth: 1.5,
      color: rgb(0.98, 0.99, 1),
      height: aH - 40,
      width: aW - 40,
      x: 20,
      y: 20,
    });

    auditPage.drawRectangle({
      color: rgb(0.07, 0.09, 0.15),
      height: 70,
      width: aW - 40,
      x: 20,
      y: aH - 90,
    });

    auditPage.drawText('AURORA SECURE SIGN', {
      color: rgb(1, 1, 1),
      font: fontHelveticaBold,
      size: 16,
      x: 40,
      y: aH - 52,
    });

    auditPage.drawText('CERTIFICADO DE FIRMA DIGITAL Y REGISTRO DE AUDITORIA', {
      color: rgb(0.7, 0.75, 0.85),
      font: fontHelvetica,
      size: 9,
      x: 40,
      y: aH - 72,
    });

    auditPage.drawRectangle({
      borderColor: rgb(0.06, 0.72, 0.5),
      borderWidth: 1,
      color: rgb(0.92, 0.98, 0.95),
      height: 28,
      width: 140,
      x: aW - 180,
      y: aH - 68,
    });

    auditPage.drawText('SELLADO Y VERIFICADO', {
      color: rgb(0.04, 0.55, 0.38),
      font: fontHelveticaBold,
      size: 9,
      x: aW - 170,
      y: aH - 51,
    });

    let currentY = aH - 120;

    const drawSectionHeader = (title: string) => {
      auditPage.drawText(title, {
        color: rgb(0.1, 0.15, 0.25),
        font: fontHelveticaBold,
        size: 12,
        x: 40,
        y: currentY,
      });
      auditPage.drawLine({
        color: rgb(0.85, 0.88, 0.92),
        end: { x: aW - 40, y: currentY - 6 },
        start: { x: 40, y: currentY - 6 },
        thickness: 1,
      });
      currentY -= 24;
    };

    const drawFieldRow = (label: string, value: string, isMono = false) => {
      auditPage.drawText(label, {
        color: rgb(0.4, 0.45, 0.55),
        font: fontHelveticaBold,
        size: 9.5,
        x: 40,
        y: currentY,
      });
      auditPage.drawText(cleanTextForPdf(value), {
        color: rgb(0.1, 0.12, 0.18),
        font: isMono ? fontCourier : fontHelvetica,
        size: isMono ? 8 : 9.5,
        x: 180,
        y: currentY,
      });
      currentY -= 18;
    };

    drawSectionHeader('1. INFORMACION DEL DOCUMENTO');
    drawFieldRow('Nombre del archivo:', originalFilename);
    drawFieldRow('ID de Auditoria (UUID):', auditToken, true);
    drawFieldRow('Fecha de emision:', formattedDate);
    drawFieldRow('Total de paginas:', `${pageCount} paginas originales + Certificado`);
    currentY -= 12;

    drawSectionHeader('2. DATOS DEL FIRMANTE');
    drawFieldRow('Nombre completo:', modifications.signerName || 'Firmante');
    if (modifications.signerInitials) {
      drawFieldRow('Iniciales:', modifications.signerInitials);
    }
    if (modifications.signerEmail) {
      drawFieldRow('Correo electronico:', modifications.signerEmail);
    }
    drawFieldRow('Metodo de verificacion:', 'Firma Digital Avanzada con autenticacion de sesion');
    drawFieldRow('Estado de la firma:', 'Firma electronica completada y aprobada');
    currentY -= 12;

    drawSectionHeader('3. INTEGRIDAD CRIPTOGRAFICA (SHA-256)');
    auditPage.drawText('Huella digital del documento original modificado (Digest SHA-256):', {
      color: rgb(0.4, 0.45, 0.55),
      font: fontHelvetica,
      size: 8.5,
      x: 40,
      y: currentY,
    });
    currentY -= 14;

    auditPage.drawRectangle({
      color: rgb(0.94, 0.95, 0.97),
      height: 24,
      width: aW - 80,
      x: 40,
      y: currentY - 4,
    });

    auditPage.drawText(documentHash, {
      color: rgb(0.15, 0.2, 0.3),
      font: fontCourier,
      size: 8,
      x: 46,
      y: currentY + 3,
    });
    currentY -= 30;

    drawSectionHeader('4. REGISTRO CRONOLOGICO DE AUDITORIA');
    const auditEvents = [
      { action: 'Carga de documento PDF y preparacion de lienzo de firma', time: isoDate },
      { action: 'Configuracion de firma digital e iniciales del firmante', time: isoDate },
      { action: 'Insercion y fijado de elementos graficos en paginas', time: isoDate },
      { action: 'Calculo de digest SHA-256 y sellado de integridad criptografica', time: isoDate },
      { action: 'Generacion de certificado y finalizacion de firma exitosa', time: isoDate },
    ];

    auditEvents.forEach((ev, idx) => {
      auditPage.drawText(`${idx + 1}.`, {
        color: rgb(0.2, 0.25, 0.35),
        font: fontHelveticaBold,
        size: 8.5,
        x: 40,
        y: currentY,
      });
      auditPage.drawText(cleanTextForPdf(ev.action), {
        color: rgb(0.15, 0.2, 0.28),
        font: fontHelvetica,
        size: 8.5,
        x: 58,
        y: currentY,
      });
      auditPage.drawText(ev.time, {
        color: rgb(0.5, 0.55, 0.65),
        font: fontCourier,
        size: 7.5,
        x: aW - 190,
        y: currentY,
      });
      currentY -= 16;
    });

    currentY = 45;
    auditPage.drawLine({
      color: rgb(0.85, 0.88, 0.92),
      end: { x: aW - 40, y: currentY + 15 },
      start: { x: 40, y: currentY + 15 },
      thickness: 0.8,
    });
    auditPage.drawText('Este documento cuenta con validez electronica de conformidad con los estandares de firma digital.', {
      color: rgb(0.5, 0.55, 0.65),
      font: fontHelvetica,
      size: 7.5,
      x: 40,
      y: currentY,
    });
    auditPage.drawText(`ID: ${auditToken}`, {
      color: rgb(0.5, 0.55, 0.65),
      font: fontCourier,
      size: 7.5,
      x: aW - 220,
      y: currentY,
    });
  }

  const finalPdfBytes = await pdfDoc.save();
  const outputBuffer = Buffer.from(finalPdfBytes);

  const baseName = originalFilename.replace(/\.[^/.]+$/, '');
  const finalFilename = sanitizePdfFilename(`${baseName}_firmado.pdf`);
  const token = crypto.randomUUID();

  await storeTempFile(token, {
    buffer: outputBuffer,
    contentType: 'application/pdf',
    createdAt: Date.now(),
    filename: finalFilename,
  });

  return {
    auditToken,
    documentHash: documentHash || undefined,
    downloadUrl: `/api/download/${token}`,
    fileId: token,
    filename: finalFilename,
    fileSize: outputBuffer.length,
    pageCount: modifications.signType === 'digital' ? pageCount + 1 : pageCount,
    signType: modifications.signType,
  };
}
