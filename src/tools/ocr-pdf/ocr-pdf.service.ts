import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { logger } from '../../services/logger.service.js';
import { getTempFile, storeTempFile } from '../../services/temp-storage.service.js';
import { executeProcessWithTimeout } from '../../utils/process.util.js';
import { OcrLanguage, OcrPdfParams, OcrPdfResponse, StoredOcrPdf } from './ocr-pdf.types.js';

function sanitizePdfFilename(rawName?: string): string {
  if (!rawName || typeof rawName !== 'string') {
    return 'documento_ocr.pdf';
  }
  const clean = path.basename(rawName).trim().replace(/[^a-zA-Z0-9_\-\. ]/g, '_');
  if (!clean) {
    return 'documento_ocr.pdf';
  }
  return clean.toLowerCase().endsWith('.pdf') ? clean : `${clean}.pdf`;
}

function resolveTesseractLang(lang?: OcrLanguage): string {
  if (lang === 'eng') return 'eng';
  if (lang === 'spa+eng') return 'spa+eng';
  return 'spa';
}

async function runOcrmypdf(inputPath: string, outputPath: string, language: string, deskew: boolean): Promise<boolean> {
  const args = [
    '-l',
    language,
    '--skip-text',
    '--output-type',
    'pdf',
  ];

  if (deskew) {
    args.push('--deskew');
  }

  args.push(inputPath, outputPath);

  const result = await executeProcessWithTimeout('ocrmypdf', args, { timeoutMs: 90000 });
  if (result.timedOut) {
    logger.app.warn('ocrmypdf excedió el tiempo límite (timeout 90s)');
    return false;
  }

  if (result.code === 0 || result.code === 6) {
    try {
      const stats = await fs.promises.stat(outputPath);
      if (stats.size > 0) return true;
    } catch {}
  }

  try {
    const stats = await fs.promises.stat(outputPath);
    if (stats.size > 0) return true;
  } catch {}

  logger.app.warn(`ocrmypdf finalizó con código ${result.code}`, { stderr: result.stderr });
  return false;
}

async function runTesseractFallback(
  inputPath: string,
  outputPath: string,
  tempDir: string,
  language: string
): Promise<boolean> {
  const pagePrefix = path.join(tempDir, 'page');
  const ppmResult = await executeProcessWithTimeout('pdftoppm', ['-png', '-r', '150', inputPath, pagePrefix], { timeoutMs: 45000 });
  if (ppmResult.code !== 0) return false;

  let imageFiles: string[] = [];
  try {
    const entries = await fs.promises.readdir(tempDir);
    imageFiles = entries
      .filter((f) => f.startsWith('page') && f.endsWith('.png'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((f) => path.join(tempDir, f));
  } catch {
    return false;
  }

  if (imageFiles.length === 0) return false;

  const pagePdfPaths: string[] = [];

  for (let i = 0; i < imageFiles.length; i++) {
    const imgPath = imageFiles[i];
    const outBase = path.join(tempDir, `ocr_page_${i + 1}`);
    const ocrResult = await executeProcessWithTimeout('tesseract', [imgPath, outBase, '-l', language, 'pdf'], { timeoutMs: 30000 });
    const singlePdf = `${outBase}.pdf`;
    if (ocrResult.code === 0) {
      try {
        const stats = await fs.promises.stat(singlePdf);
        if (stats.size > 0) pagePdfPaths.push(singlePdf);
      } catch {}
    }
  }

  if (pagePdfPaths.length === 0) return false;

  try {
    const mergedDoc = await PDFDocument.create();
    for (const pagePdfPath of pagePdfPaths) {
      const pageBytes = await fs.promises.readFile(pagePdfPath);
      const pageDoc = await PDFDocument.load(pageBytes);
      const copiedPages = await mergedDoc.copyPages(pageDoc, pageDoc.getPageIndices());
      for (const p of copiedPages) {
        mergedDoc.addPage(p);
      }
    }
    const finalBytes = await mergedDoc.save();
    await fs.promises.writeFile(outputPath, Buffer.from(finalBytes));
    return true;
  } catch (err) {
    logger.app.error('Error uniendo páginas OCR con pdf-lib', err);
    return false;
  }
}

export async function processOcrPdf(params: OcrPdfParams): Promise<OcrPdfResponse> {
  const { buffer, deskew = true, filename: customFilename, language = 'spa', originalname } = params;
  const originalSize = buffer.length;
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pdf_ocr_'));
  const inputTempPath = path.join(tempDir, 'source.pdf');
  const outputTempPath = path.join(tempDir, 'output_ocr.pdf');
  const resolvedLang = resolveTesseractLang(language);

  await fs.promises.writeFile(inputTempPath, buffer);

  let finalBuffer: Buffer | null = null;
  let pageCount = 1;

  try {
    const initialDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    pageCount = initialDoc.getPageCount() || 1;
  } catch {
    pageCount = 1;
  }

  try {
    const ocrmypdfOk = await runOcrmypdf(inputTempPath, outputTempPath, resolvedLang, deskew);
    if (ocrmypdfOk) {
      try {
        finalBuffer = await fs.promises.readFile(outputTempPath);
      } catch {}
    }

    if (!finalBuffer) {
      const tesseractOk = await runTesseractFallback(inputTempPath, outputTempPath, tempDir, resolvedLang);
      if (tesseractOk) {
        try {
          finalBuffer = await fs.promises.readFile(outputTempPath);
        } catch {}
      }
    }

    if (!finalBuffer) {
      finalBuffer = buffer;
    } else {
      try {
        const outDoc = await PDFDocument.load(finalBuffer, { ignoreEncryption: true });
        pageCount = outDoc.getPageCount() || pageCount;
      } catch {}
    }
  } finally {
    try {
      await fs.promises.rm(tempDir, { force: true, recursive: true });
    } catch {}
  }

  const processedSize = finalBuffer.length;
  const fileId = crypto.randomUUID();
  const filename = sanitizePdfFilename(customFilename || originalname);

  const storedItem: StoredOcrPdf = {
    buffer: finalBuffer,
    contentType: 'application/pdf',
    createdAt: Date.now(),
    filename,
    id: fileId,
    language: resolvedLang,
    originalSize,
    pageCount,
    size: processedSize,
  };

  await storeTempFile(fileId, storedItem);

  return {
    downloadUrl: `/api/tools/ocr-pdf/download/${fileId}`,
    fileId,
    filename,
    language: resolvedLang,
    originalSize,
    pageCount,
    processedSize,
  };
}

export async function getOcrPdf(fileId: string): Promise<StoredOcrPdf | null> {
  return getTempFile<StoredOcrPdf>(fileId);
}
