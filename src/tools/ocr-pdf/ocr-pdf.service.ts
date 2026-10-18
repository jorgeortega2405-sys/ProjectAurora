import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { logger } from '../../services/logger.service.js';
import { getTempFile, storeTempFile } from '../../services/temp-storage.service.js';
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

  return new Promise<boolean>((resolve) => {
    const proc = spawn('ocrmypdf', args);
    let stderr = '';

    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('error', (err) => {
      logger.app.warn('ocrmypdf no disponible en el sistema', err);
      resolve(false);
    });

    proc.on('close', (code) => {
      if ((code === 0 || code === 6) && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        resolve(true);
      } else {
        logger.app.warn(`ocrmypdf finalizó con código ${code}`, { stderr });
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          resolve(true);
        } else {
          resolve(false);
        }
      }
    });
  });
}

async function runTesseractFallback(
  inputPath: string,
  outputPath: string,
  tempDir: string,
  language: string
): Promise<boolean> {
  const pagePrefix = path.join(tempDir, 'page');
  const ppmSuccess = await new Promise<boolean>((resolve) => {
    const proc = spawn('pdftoppm', ['-png', '-r', '150', inputPath, pagePrefix]);
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });

  if (!ppmSuccess) return false;

  const imageFiles = fs.readdirSync(tempDir)
    .filter((f) => f.startsWith('page') && f.endsWith('.png'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((f) => path.join(tempDir, f));

  if (imageFiles.length === 0) return false;

  const pagePdfPaths: string[] = [];

  for (let i = 0; i < imageFiles.length; i++) {
    const imgPath = imageFiles[i];
    const outBase = path.join(tempDir, `ocr_page_${i + 1}`);
    const ocrSuccess = await new Promise<boolean>((resolve) => {
      const proc = spawn('tesseract', [imgPath, outBase, '-l', language, 'pdf']);
      proc.on('error', () => resolve(false));
      proc.on('close', (code) => resolve(code === 0));
    });

    const singlePdf = `${outBase}.pdf`;
    if (ocrSuccess && fs.existsSync(singlePdf)) {
      pagePdfPaths.push(singlePdf);
    }
  }

  if (pagePdfPaths.length === 0) return false;

  try {
    const mergedDoc = await PDFDocument.create();
    for (const pagePdfPath of pagePdfPaths) {
      const pageBytes = fs.readFileSync(pagePdfPath);
      const pageDoc = await PDFDocument.load(pageBytes);
      const copiedPages = await mergedDoc.copyPages(pageDoc, pageDoc.getPageIndices());
      for (const p of copiedPages) {
        mergedDoc.addPage(p);
      }
    }
    const finalBytes = await mergedDoc.save();
    fs.writeFileSync(outputPath, Buffer.from(finalBytes));
    return true;
  } catch (err) {
    logger.app.error('Error uniendo páginas OCR con pdf-lib', err);
    return false;
  }
}

export async function processOcrPdf(params: OcrPdfParams): Promise<OcrPdfResponse> {
  const { buffer, deskew = true, filename: customFilename, language = 'spa', originalname } = params;
  const originalSize = buffer.length;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf_ocr_'));
  const inputTempPath = path.join(tempDir, 'source.pdf');
  const outputTempPath = path.join(tempDir, 'output_ocr.pdf');
  const resolvedLang = resolveTesseractLang(language);

  fs.writeFileSync(inputTempPath, buffer);

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
    if (ocrmypdfOk && fs.existsSync(outputTempPath)) {
      finalBuffer = fs.readFileSync(outputTempPath);
    } else {
      const tesseractOk = await runTesseractFallback(inputTempPath, outputTempPath, tempDir, resolvedLang);
      if (tesseractOk && fs.existsSync(outputTempPath)) {
        finalBuffer = fs.readFileSync(outputTempPath);
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
      const files = fs.readdirSync(tempDir);
      for (const f of files) {
        fs.unlinkSync(path.join(tempDir, f));
      }
      fs.rmdirSync(tempDir);
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
