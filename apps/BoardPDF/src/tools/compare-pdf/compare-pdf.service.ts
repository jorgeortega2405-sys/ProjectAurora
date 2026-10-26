import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { logger } from '../../services/logger.service.js';
import { getTempFile, storeTempFile } from '../../services/temp-storage.service.js';
import { ComparePdfParams, ComparePdfResponse, DiffChangeItem, PageComparison, StoredComparisonReport } from './compare-pdf.types.js';

function sanitizePdfFilename(rawName?: string, defaultName = 'informe_comparacion.pdf'): string {
  if (!rawName || typeof rawName !== 'string') return defaultName;
  const base = path.basename(rawName).trim().replace(/[^a-zA-Z0-9_\-\. ]/g, '_').replace(/\.pdf$/i, '');
  return `${base}_comparacion.pdf`;
}

async function extractPagesText(buffer: Buffer): Promise<string[]> {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages: string[] = [];

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      const text = content.items
        .map((it: any) => ('str' in it ? it.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      pages.push(text);
    }

    return pages;
  } catch (err) {
    logger.app.warn('Error al extraer texto con pdfjs-dist en compare-pdf', { error: err });
    return [];
  }
}

function computeLineDiff(text1: string, text2: string, pageIndex: number): DiffChangeItem[] {
  const changes: DiffChangeItem[] = [];
  const words1 = text1.split(' ').filter(Boolean);
  const words2 = text2.split(' ').filter(Boolean);

  if (text1 === text2) {
    return changes;
  }

  const set1 = new Set(words1);
  const set2 = new Set(words2);

  const removedWords = words1.filter((w) => !set2.has(w));
  const addedWords = words2.filter((w) => !set1.has(w));

  if (removedWords.length > 0 || addedWords.length > 0) {
    const removedSnippet = removedWords.slice(0, 35).join(' ');
    const addedSnippet = addedWords.slice(0, 35).join(' ');

    changes.push({
      diffCount: addedWords.length - removedWords.length,
      id: randomUUID(),
      newText: addedSnippet || undefined,
      oldText: removedSnippet || undefined,
      pageIndex,
      type: removedWords.length > 0 && addedWords.length > 0 ? 'modification' : (addedWords.length > 0 ? 'addition' : 'deletion'),
    });
  }

  return changes;
}

function calculateSimilarity(pages1: string[], pages2: string[]): number {
  const all1 = pages1.join(' ').trim();
  const all2 = pages2.join(' ').trim();

  if (all1.length === 0 && all2.length === 0) return 100;
  if (all1.length === 0 || all2.length === 0) return 0;
  if (all1 === all2) return 100;

  const words1 = new Set(all1.toLowerCase().split(/\s+/));
  const words2 = new Set(all2.toLowerCase().split(/\s+/));

  let intersection = 0;
  words1.forEach((w) => {
    if (words2.has(w)) intersection++;
  });

  const union = new Set([...words1, ...words2]).size;
  if (union === 0) return 100;
  return Math.round((intersection / union) * 100);
}

async function generateReportPdf(
  filename1: string,
  filename2: string,
  pagesCompared: number,
  similarity: number,
  pageComparisons: PageComparison[]
): Promise<Buffer> {
  const reportDoc = await PDFDocument.create();
  const fontRegular = await reportDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await reportDoc.embedFont(StandardFonts.HelveticaBold);

  let page = reportDoc.addPage([595.28, 841.89]);
  const { height, width } = page.getSize();
  let currentY = height - 50;

  page.drawText('Informe de Comparación de Documentos PDF', {
    color: rgb(0.07, 0.09, 0.15),
    font: fontBold,
    size: 20,
    x: 50,
    y: currentY,
  });
  currentY -= 20;

  page.drawText('Generado automáticamente por BoardPDF', {
    color: rgb(0.4, 0.45, 0.55),
    font: fontRegular,
    size: 11,
    x: 50,
    y: currentY,
  });
  currentY -= 35;

  page.drawRectangle({
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 1,
    color: rgb(0.97, 0.98, 0.99),
    height: 90,
    width: width - 100,
    x: 50,
    y: currentY - 70,
  });

  page.drawText(`Archivo A (Base): ${filename1}`, {
    color: rgb(0.12, 0.14, 0.18),
    font: fontBold,
    size: 11,
    x: 65,
    y: currentY - 15,
  });

  page.drawText(`Archivo B (Modificado): ${filename2}`, {
    color: rgb(0.12, 0.14, 0.18),
    font: fontBold,
    size: 11,
    x: 65,
    y: currentY - 35,
  });

  page.drawText(`Páginas analizadas: ${pagesCompared}  |  Similitud global: ${similarity}%`, {
    color: rgb(0.3, 0.35, 0.45),
    font: fontRegular,
    size: 11,
    x: 65,
    y: currentY - 55,
  });
  currentY -= 105;

  page.drawText('Resumen detallado de cambios por página', {
    color: rgb(0.07, 0.09, 0.15),
    font: fontBold,
    size: 14,
    x: 50,
    y: currentY,
  });
  currentY -= 25;

  const changedPages = pageComparisons.filter((p) => p.hasDifferences);

  if (changedPages.length === 0) {
    page.drawText('No se encontraron diferencias de texto entre los documentos analizados.', {
      color: rgb(0.2, 0.6, 0.3),
      font: fontRegular,
      size: 11,
      x: 50,
      y: currentY,
    });
  } else {
    for (const comp of changedPages) {
      if (currentY < 120) {
        page = reportDoc.addPage([595.28, 841.89]);
        currentY = height - 50;
      }

      page.drawText(`Página ${comp.pageIndex + 1} (${comp.differencesCount} diferencia${comp.differencesCount > 1 ? 's' : ''}):`, {
        color: rgb(0.15, 0.2, 0.3),
        font: fontBold,
        size: 12,
        x: 50,
        y: currentY,
      });
      currentY -= 18;

      for (const ch of comp.changes) {
        if (currentY < 120) {
          page = reportDoc.addPage([595.28, 841.89]);
          currentY = height - 50;
        }

        if (ch.oldText) {
          const previewOld = ch.oldText.length > 75 ? `${ch.oldText.slice(0, 75)}...` : ch.oldText;
          page.drawText(`[-] ${previewOld}`, {
            color: rgb(0.85, 0.15, 0.15),
            font: fontRegular,
            size: 9.5,
            x: 65,
            y: currentY,
          });
          currentY -= 15;
        }

        if (ch.newText) {
          const previewNew = ch.newText.length > 75 ? `${ch.newText.slice(0, 75)}...` : ch.newText;
          page.drawText(`[+] ${previewNew}`, {
            color: rgb(0.1, 0.6, 0.25),
            font: fontRegular,
            size: 9.5,
            x: 65,
            y: currentY,
          });
          currentY -= 15;
        }

        currentY -= 6;
      }

      currentY -= 10;
    }
  }

  const pdfBytes = await reportDoc.save();
  return Buffer.from(pdfBytes);
}

export async function getStoredComparisonReport(fileId: string): Promise<StoredComparisonReport | null> {
  return getTempFile<StoredComparisonReport>(fileId);
}

export async function comparePdfDocuments(params: ComparePdfParams): Promise<ComparePdfResponse> {
  const { buffer1, buffer2, filename1 = 'documento_1.pdf', filename2 = 'documento_2.pdf' } = params;

  if (!buffer1 || buffer1.length === 0 || !buffer2 || buffer2.length === 0) {
    throw new Error('EMPTY_PDF_BUFFERS');
  }

  const [pagesText1, pagesText2] = await Promise.all([
    extractPagesText(buffer1),
    extractPagesText(buffer2),
  ]);

  const maxPages = Math.max(pagesText1.length, pagesText2.length);
  const pageComparisons: PageComparison[] = [];
  let totalChanges = 0;
  let additionsCount = 0;
  let deletionsCount = 0;

  for (let p = 0; p < maxPages; p++) {
    const text1 = pagesText1[p] || '';
    const text2 = pagesText2[p] || '';

    const changes = computeLineDiff(text1, text2, p);
    const hasDifferences = changes.length > 0;

    changes.forEach((c) => {
      totalChanges++;
      if (c.type === 'addition') additionsCount++;
      else if (c.type === 'deletion') deletionsCount++;
      else {
        additionsCount++;
        deletionsCount++;
      }
    });

    pageComparisons.push({
      changes,
      differencesCount: changes.length,
      hasDifferences,
      pageIndex: p,
    });
  }

  const similarityPercentage = calculateSimilarity(pagesText1, pagesText2);
  const reportBuffer = await generateReportPdf(
    filename1,
    filename2,
    maxPages,
    similarityPercentage,
    pageComparisons
  );

  const fileId = `comp_${Date.now()}_${randomUUID().replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}`;
  const outFilename = sanitizePdfFilename(filename1);

  await storeTempFile(fileId, {
    buffer: reportBuffer,
    contentType: 'application/pdf',
    createdAt: Date.now(),
    fileId,
    fileSize: reportBuffer.length,
    filename: outFilename,
  });

  return {
    additionsCount,
    deletionsCount,
    downloadUrl: `/api/tools/compare-pdf/download/${fileId}`,
    fileId,
    fileSize: reportBuffer.length,
    filename: outFilename,
    pageComparisons,
    pagesCompared: maxPages,
    similarityPercentage,
    totalChanges,
  };
}

export { comparePdfDocuments as comparePdfs };
