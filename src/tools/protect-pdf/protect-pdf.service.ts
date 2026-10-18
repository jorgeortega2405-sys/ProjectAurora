import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { logger } from '../../services/logger.service.js';
import { getTempFile, storeTempFile } from '../../services/temp-storage.service.js';
import { ProtectPdfOptions, ProtectPdfResponse, StoredProtectPdfResult } from './protect-pdf.types.js';

const execFileAsync = promisify(execFile);

function sanitizePdfFilename(rawName?: string, defaultName = 'documento_protegido.pdf'): string {
  if (!rawName || typeof rawName !== 'string') {
    return defaultName;
  }
  const clean = path.basename(rawName).trim().replace(/[^a-zA-Z0-9_\-\. ]/g, '_');
  if (!clean) {
    return defaultName;
  }
  return clean.toLowerCase().endsWith('.pdf') ? clean : `${clean}.pdf`;
}

export async function protectPdf(
  fileBuffer: Buffer,
  originalFilename: string,
  options: ProtectPdfOptions
): Promise<ProtectPdfResponse> {
  const password = options.password?.trim();
  if (!password) {
    throw new Error('Debes proporcionar una contraseña para proteger el documento PDF.');
  }

  const tempId = `protect_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const tempInput = path.join(os.tmpdir(), `${tempId}_in.pdf`);
  const tempOutput = path.join(os.tmpdir(), `${tempId}_out.pdf`);

  try {
    fs.writeFileSync(tempInput, fileBuffer);

    const pythonScript = `
import sys, pikepdf

input_path = sys.argv[1]
output_path = sys.argv[2]
password = sys.argv[3]

with pikepdf.open(input_path) as pdf:
    num_pages = len(pdf.pages)
    enc = pikepdf.Encryption(user=password, owner=password, R=6)
    pdf.save(output_path, encryption=enc)
    print(num_pages)
`;

    const { stdout } = await execFileAsync('python3', ['-c', pythonScript, tempInput, tempOutput, password]);
    const totalPages = parseInt(stdout.trim(), 10) || 1;

    const encryptedBuffer = fs.readFileSync(tempOutput);
    const fileId = crypto.randomUUID();
    const filename = sanitizePdfFilename(options.filename, `${originalFilename.replace(/\.pdf$/i, '')}_protegido.pdf`);

    const storedItem: StoredProtectPdfResult = {
      buffer: encryptedBuffer,
      contentType: 'application/pdf',
      createdAt: Date.now(),
      filename,
      id: fileId,
      pagesCount: totalPages,
      size: encryptedBuffer.length,
    };

    await storeTempFile(fileId, storedItem);

    return {
      downloadUrl: `/api/tools/protect-pdf/download/${fileId}`,
      fileId,
      filename,
      fileSize: encryptedBuffer.length,
      totalPages,
    };
  } catch (err: unknown) {
    logger.app.error(`Error al proteger PDF con contraseña: ${originalFilename}`, err);
    throw new Error('No se pudo proteger el archivo PDF. Asegúrate de que no esté corrupto.');
  } finally {
    if (fs.existsSync(tempInput)) {
      try { fs.unlinkSync(tempInput); } catch {}
    }
    if (fs.existsSync(tempOutput)) {
      try { fs.unlinkSync(tempOutput); } catch {}
    }
  }
}

export async function getProtectPdfResult(fileId: string): Promise<StoredProtectPdfResult | null> {
  return getTempFile<StoredProtectPdfResult>(fileId);
}
