import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { logger } from '../../services/logger.service.js';
import { getTempFile, storeTempFile } from '../../services/temp-storage.service.js';
import { RepairPdfParams, RepairPdfResponse, StoredRepairedPdf } from './repair-pdf.types.js';

let resolvedGsCommand: string | null = null;

function getGhostscriptCommand(): string {
  if (resolvedGsCommand) return resolvedGsCommand;
  const candidates = process.platform === 'win32'
    ? ['gswin64c', 'gswin32c', 'gs']
    : ['gs'];
  for (const cmd of candidates) {
    try {
      const res = spawn(cmd, ['-version']);
      res.on('error', () => {});
      resolvedGsCommand = cmd;
      return cmd;
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

  return new Promise<boolean>((resolve) => {
    const proc = spawn(gsCmd, args);
    let stderr = '';

    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('error', (err) => {
      logger.app.warn('Ghostscript no disponible para reparar PDF', err);
      resolve(false);
    });

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        resolve(true);
      } else {
        logger.app.warn(`Ghostscript finalizó con código ${code} al reparar PDF`, { stderr });
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          resolve(true);
        } else {
          resolve(false);
        }
      }
    });
  });
}

async function runQpdfLinearize(inputPath: string, outputPath: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const proc = spawn('qpdf', ['--linearize', inputPath, outputPath]);
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

export async function repairPdfFile(params: RepairPdfParams): Promise<RepairPdfResponse> {
  const { buffer, filename: customFilename, originalname } = params;
  const originalSize = buffer.length;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf_repair_'));
  const inputTempPath = path.join(tempDir, 'broken.pdf');
  const gsOutTempPath = path.join(tempDir, 'repaired_gs.pdf');
  const qpdfOutTempPath = path.join(tempDir, 'repaired_qpdf.pdf');

  fs.writeFileSync(inputTempPath, buffer);

  let finalBuffer: Buffer | null = null;
  let pageCount = 1;

  try {
    const gsSuccess = await runGhostscriptRepair(inputTempPath, gsOutTempPath);
    if (gsSuccess) {
      const qpdfSuccess = await runQpdfLinearize(gsOutTempPath, qpdfOutTempPath);
      if (qpdfSuccess) {
        finalBuffer = fs.readFileSync(qpdfOutTempPath);
      } else {
        finalBuffer = fs.readFileSync(gsOutTempPath);
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
    try {
      if (fs.existsSync(inputTempPath)) fs.unlinkSync(inputTempPath);
      if (fs.existsSync(gsOutTempPath)) fs.unlinkSync(gsOutTempPath);
      if (fs.existsSync(qpdfOutTempPath)) fs.unlinkSync(qpdfOutTempPath);
      if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
    } catch {}
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
