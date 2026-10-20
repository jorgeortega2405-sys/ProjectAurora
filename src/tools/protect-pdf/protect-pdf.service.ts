import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { logger } from '../../services/logger.service.js';
import { getTempFile, storeTempFile } from '../../services/temp-storage.service.js';
import { executeProcessWithTimeout } from '../../utils/process.util.js';
import { ProtectPdfOptions, ProtectPdfResponse, StoredProtectPdfResult } from './protect-pdf.types.js';

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
    await fs.promises.writeFile(tempInput, fileBuffer);

    const pythonScript = `import sys, pikepdf
input_path = sys.argv[1]
output_path = sys.argv[2]
password = sys.argv[3]
with pikepdf.open(input_path) as pdf:
    num_pages = len(pdf.pages)
    enc = pikepdf.Encryption(user=password, owner=password, R=6)
    pdf.save(output_path, encryption=enc)
    print(num_pages)
`;

    const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
    const result = await executeProcessWithTimeout(pyCmd, ['-c', pythonScript, tempInput, tempOutput, password], { timeoutMs: 45000 });
    if (result.timedOut || result.code !== 0) {
      throw new Error(result.stderr || 'El proceso de cifrado no pudo completarse.');
    }

    const totalPages = parseInt(result.stdout.trim(), 10) || 1;
    const encryptedBuffer = await fs.promises.readFile(tempOutput);
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
    await Promise.allSettled([
      fs.promises.unlink(tempInput),
      fs.promises.unlink(tempOutput),
    ]);
  }
}

export async function getProtectPdfResult(fileId: string): Promise<StoredProtectPdfResult | null> {
  return getTempFile<StoredProtectPdfResult>(fileId);
}
