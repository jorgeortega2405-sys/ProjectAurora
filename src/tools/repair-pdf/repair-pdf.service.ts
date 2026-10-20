import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { logger } from '../../services/logger.service.js';
import { getTempFile, storeTempFile } from '../../services/temp-storage.service.js';
import { executeProcessWithTimeout } from '../../utils/process.util.js';
import { RepairPdfParams, RepairPdfResponse, StoredRepairedPdf } from './repair-pdf.types.js';

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
    return 'documento_reparado.pdf';
  }
  const clean = path.basename(rawName).trim().replace(/[^a-zA-Z0-9_\-\. ]/g, '_');
  if (!clean) {
    return 'documento_reparado.pdf';
  }
  return clean.toLowerCase().endsWith('.pdf') ? clean : `${clean}.pdf`;
}

async function runGhostscriptRepair(inputPath: string, outputPath: string): Promise<boolean> {
  const gsCmd = getGhostscriptCommand();
  const args = [
    '-sDEVICE=pdfwrite',
    '-dPDFSETTINGS=/default',
    '-dCompatibilityLevel=1.4',
    '-dNOPAUSE',
    '-dQUIET',
    '-dBATCH',
    `-sOutputFile=${outputPath}`,
    inputPath,
  ];

  const result = await executeProcessWithTimeout(gsCmd, args, { timeoutMs: 60000 });
  if (result.timedOut) {
    logger.app.warn('Ghostscript excedió el tiempo límite al reparar PDF (timeout 60s)');
    return false;
  }

  if (result.code === 0) {
    try {
      const stats = await fs.promises.stat(outputPath);
      if (stats.size > 0) return true;
    } catch {}
  }

  try {
    const stats = await fs.promises.stat(outputPath);
    if (stats.size > 0) return true;
  } catch {}

  logger.app.warn(`Ghostscript finalizó con código ${result.code} al reparar PDF`, { stderr: result.stderr });
  return false;
}

async function runQpdfLinearize(inputPath: string, outputPath: string): Promise<boolean> {
  const result = await executeProcessWithTimeout('qpdf', ['--linearize', inputPath, outputPath], { timeoutMs: 30000 });
  if (result.code === 0) {
    try {
      const stats = await fs.promises.stat(outputPath);
      if (stats.size > 0) return true;
    } catch {}
  }
  return false;
}

export async function repairPdfFile(params: RepairPdfParams): Promise<RepairPdfResponse> {
  const { buffer, filename: customFilename, originalname } = params;
  const originalSize = buffer.length;
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pdf_repair_'));
  const inputTempPath = path.join(tempDir, 'broken.pdf');
  const gsOutTempPath = path.join(tempDir, 'repaired_gs.pdf');
  const qpdfOutTempPath = path.join(tempDir, 'repaired_qpdf.pdf');

  await fs.promises.writeFile(inputTempPath, buffer);

  let finalBuffer: Buffer | null = null;
  let pageCount = 1;

  try {
    const gsSuccess = await runGhostscriptRepair(inputTempPath, gsOutTempPath);
    if (gsSuccess) {
      const qpdfSuccess = await runQpdfLinearize(gsOutTempPath, qpdfOutTempPath);
      if (qpdfSuccess) {
        try {
          finalBuffer = await fs.promises.readFile(qpdfOutTempPath);
        } catch {}
      }
      if (!finalBuffer) {
        try {
          finalBuffer = await fs.promises.readFile(gsOutTempPath);
        } catch {}
      }
    }

    if (!finalBuffer) {
      try {
        const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        pageCount = doc.getPageCount();
        const savedBytes = await doc.save({ useObjectStreams: true });
        finalBuffer = Buffer.from(savedBytes);
      } catch (pdfLibErr) {
        logger.app.error('Error al reconstruir PDF con pdf-lib', pdfLibErr);
      }
    }

    if (finalBuffer) {
      try {
        const checkDoc = await PDFDocument.load(finalBuffer, { ignoreEncryption: true });
        pageCount = checkDoc.getPageCount() || pageCount;
      } catch {}
    }
  } finally {
    await Promise.allSettled([
      fs.promises.unlink(inputTempPath),
      fs.promises.unlink(gsOutTempPath),
      fs.promises.unlink(qpdfOutTempPath),
      fs.promises.rm(tempDir, { force: true, recursive: true }),
    ]);
  }

  if (!finalBuffer || finalBuffer.length === 0) {
    throw new Error('No se pudo reconstruir la estructura del archivo PDF dañado.');
  }

  const repairedSize = finalBuffer.length;
  const fileId = crypto.randomUUID();
  const filename = sanitizePdfFilename(customFilename || originalname);

  const storedItem: StoredRepairedPdf = {
    buffer: finalBuffer,
    contentType: 'application/pdf',
    createdAt: Date.now(),
    filename,
    id: fileId,
    originalSize,
    pageCount,
    size: repairedSize,
  };

  await storeTempFile(fileId, storedItem);

  return {
    downloadUrl: `/api/tools/repair-pdf/download/${fileId}`,
    fileId,
    filename,
    originalSize,
    pageCount,
    repairedSize,
    status: 'repaired',
  };
}

export async function getRepairedPdf(fileId: string): Promise<StoredRepairedPdf | null> {
  return getTempFile<StoredRepairedPdf>(fileId);
}
