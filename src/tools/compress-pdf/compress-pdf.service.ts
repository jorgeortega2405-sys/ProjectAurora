import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { logger } from '../../services/logger.service.js';
import { getTempFile, storeTempFile } from '../../services/temp-storage.service.js';
import { executeProcessWithTimeout } from '../../utils/process.util.js';
import { CompressPdfParams, CompressPdfResponse, PdfCompressLevel, StoredCompressedPdf } from './compress-pdf.types.js';

let resolvedGsCommand: string | null = null;

function getGhostscriptCommand(): string {
  if (resolvedGsCommand) return resolvedGsCommand;
  const candidates = process.platform === 'win32'
    ? ['gswin64c', 'gswin32c', 'gs']
    : ['gs'];
  for (const cmd of candidates) {
    try {
      const res = spawnSync(cmd, ['-version']);
      if (!res.error) {
        resolvedGsCommand = cmd;
        return cmd;
      }
    } catch {
      continue;
    }
  }
  resolvedGsCommand = 'gs';
  return resolvedGsCommand;
}

function sanitizePdfFilename(rawName?: string): string {
  if (!rawName || typeof rawName !== 'string') {
    return 'documento_comprimido.pdf';
  }
  const clean = path.basename(rawName).trim().replace(/[^a-zA-Z0-9_\-\. ]/g, '_');
  if (!clean) {
    return 'documento_comprimido.pdf';
  }
  return clean.toLowerCase().endsWith('.pdf') ? clean : `${clean}.pdf`;
}

function getGhostscriptSetting(level: PdfCompressLevel): string {
  switch (level) {
    case 'extreme':
      return '/screen';
    case 'low':
      return '/printer';
    case 'recommended':
    default:
      return '/ebook';
  }
}

function getTargetDpi(level: PdfCompressLevel): number {
  switch (level) {
    case 'extreme':
      return 72;
    case 'low':
      return 300;
    case 'recommended':
    default:
      return 150;
  }
}

async function runGhostscriptCompression(inputPath: string, outputPath: string, level: PdfCompressLevel): Promise<boolean> {
  const gsCmd = getGhostscriptCommand();
  const setting = getGhostscriptSetting(level);
  const dpi = getTargetDpi(level);

  const args = [
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.4',
    `-dPDFSETTINGS=${setting}`,
    '-dNOPAUSE',
    '-dQUIET',
    '-dBATCH',
    '-dDetectDuplicateImages=true',
    `-dColorImageResolution=${dpi}`,
    `-dGrayImageResolution=${dpi}`,
    `-dMonoImageResolution=${dpi}`,
    '-dDownsampleColorImages=true',
    '-dDownsampleGrayImages=true',
    '-dDownsampleMonoImages=true',
    '-dColorImageDownsampleType=/Bicubic',
    '-dGrayImageDownsampleType=/Bicubic',
    '-dMonoImageDownsampleType=/Bicubic',
    '-dColorImageDownsampleThreshold=1.0',
    '-dGrayImageDownsampleThreshold=1.0',
    '-dMonoImageDownsampleThreshold=1.0',
    `-sOutputFile=${outputPath}`,
    inputPath,
  ];

  const result = await executeProcessWithTimeout(gsCmd, args, { timeoutMs: 60000 });
  if (result.timedOut) {
    logger.app.warn('Ghostscript excedió el tiempo límite de compresión (timeout 60s)');
    return false;
  }

  if (result.code === 0) {
    try {
      const stats = await fs.promises.stat(outputPath);
      if (stats.size > 0) return true;
    } catch {}
  }

  logger.app.warn(`Ghostscript finalizó con código ${result.code} al comprimir PDF`, { stderr: result.stderr });
  return false;
}

export async function compressPdfFile(params: CompressPdfParams): Promise<CompressPdfResponse> {
  const { buffer, filename: customFilename, level, originalname } = params;
  const originalSize = buffer.length;
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pdf_compress_'));
  const inputTempPath = path.join(tempDir, 'input.pdf');
  const outputTempPath = path.join(tempDir, 'output.pdf');

  await fs.promises.writeFile(inputTempPath, buffer);

  let finalBuffer: Buffer = buffer;
  let pageCount = 1;

  try {
    const originalDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    pageCount = originalDoc.getPageCount() || 1;
  } catch {
    pageCount = 1;
  }

  try {
    const gsSuccess = await runGhostscriptCompression(inputTempPath, outputTempPath, level);
    if (gsSuccess) {
      const gsBuffer = await fs.promises.readFile(outputTempPath);
      if (gsBuffer.length < originalSize) {
        finalBuffer = gsBuffer;
      } else {
        finalBuffer = buffer;
      }
    } else {
      try {
        const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        pageCount = doc.getPageCount();
        const savedBytes = await doc.save({ useObjectStreams: true });
        const fallbackBuffer = Buffer.from(savedBytes);
        if (fallbackBuffer.length < originalSize) {
          finalBuffer = fallbackBuffer;
        }
      } catch (fallbackErr) {
        logger.app.error('Fallback pdf-lib error durante compresión', fallbackErr);
      }
    }
  } finally {
    await Promise.allSettled([
      fs.promises.unlink(inputTempPath),
      fs.promises.unlink(outputTempPath),
      fs.promises.rm(tempDir, { force: true, recursive: true }),
    ]);
  }

  const compressedSize = finalBuffer.length;
  const savingsBytes = Math.max(0, originalSize - compressedSize);
  const savingsPercent = originalSize > 0
    ? Math.max(0, Math.round(((originalSize - compressedSize) / originalSize) * 100))
    : 0;

  const fileId = crypto.randomUUID();
  const filename = sanitizePdfFilename(customFilename || originalname);

  const storedItem: StoredCompressedPdf = {
    buffer: finalBuffer,
    compressedSize,
    contentType: 'application/pdf',
    createdAt: Date.now(),
    filename,
    id: fileId,
    originalSize,
    pageCount,
    savingsPercent,
    size: compressedSize,
  };

  await storeTempFile(fileId, storedItem);

  return {
    compressedSize,
    downloadUrl: `/api/tools/compress-pdf/download/${fileId}`,
    fileId,
    filename,
    originalSize,
    pageCount,
    savingsBytes,
    savingsPercent,
  };
}

export async function getCompressedPdf(fileId: string): Promise<StoredCompressedPdf | null> {
  return getTempFile<StoredCompressedPdf>(fileId);
}
