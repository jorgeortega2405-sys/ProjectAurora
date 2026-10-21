import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { logger } from '../../services/logger.service.js';
import { getTempFile, storeTempFile } from '../../services/temp-storage.service.js';
import { executeProcessWithTimeout, getPythonCommand } from '../../utils/process.util.js';
import { StoredUnlockPdfResult, UnlockPdfOptions, UnlockPdfResponse } from './unlock-pdf.types.js';

function sanitizePdfFilename(rawName?: string, defaultName = 'documento_desbloqueado.pdf'): string {
  if (!rawName || typeof rawName !== 'string') {
    return defaultName;
  }
  const clean = path.basename(rawName).trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  if (!clean) {
    return defaultName;
  }
  return clean.toLowerCase().endsWith('.pdf') ? clean : `${clean}.pdf`;
}

export async function unlockPdf(
  fileBuffer: Buffer,
  originalFilename: string,
  options: UnlockPdfOptions
): Promise<UnlockPdfResponse> {
  const password = options.password ? options.password.trim() : '';

  const tempId = `unlock_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const tempInput = path.join(os.tmpdir(), `${tempId}_in.pdf`);
  const tempOutput = path.join(os.tmpdir(), `${tempId}_out.pdf`);

  try {
    await fs.promises.writeFile(tempInput, fileBuffer);

    const pythonScript = `import sys, pikepdf
input_path = sys.argv[1]
output_path = sys.argv[2]
password = sys.argv[3] if len(sys.argv) > 3 else ''
try:
    with pikepdf.open(input_path, password=password) as pdf:
        num_pages = len(pdf.pages)
        pdf.save(output_path)
        print(num_pages)
except pikepdf.PasswordError:
    print('PASSWORD_REQUIRED')
    sys.exit(2)
`;

    const pyCmd = await getPythonCommand();
    const result = await executeProcessWithTimeout(pyCmd, ['-c', pythonScript, tempInput, tempOutput, password], { timeoutMs: 45000 });
    if (result.code === 2 || result.stdout?.includes('PASSWORD_REQUIRED') || result.stderr?.includes('PASSWORD_REQUIRED')) {
      throw new Error('PASSWORD_INVALID');
    }
    if (result.timedOut || result.code !== 0) {
      throw new Error(result.stderr || 'El proceso de desbloqueo no pudo completarse.');
    }

    const totalPages = parseInt(result.stdout.trim(), 10) || 1;
    const decryptedBuffer = await fs.promises.readFile(tempOutput);
    const fileId = crypto.randomUUID();
    const filename = sanitizePdfFilename(options.filename, `${originalFilename.replace(/\.pdf$/i, '')}_desbloqueado.pdf`);

    const storedItem: StoredUnlockPdfResult = {
      buffer: decryptedBuffer,
      contentType: 'application/pdf',
      createdAt: Date.now(),
      filename,
      id: fileId,
      pagesCount: totalPages,
      size: decryptedBuffer.length,
    };

    await storeTempFile(fileId, storedItem);

    return {
      downloadUrl: `/api/tools/unlock-pdf/download/${fileId}`,
      fileId,
      filename,
      fileSize: decryptedBuffer.length,
      totalPages,
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'PASSWORD_INVALID') {
      throw err;
    }
    logger.app.error(`Error al desbloquear documento PDF: ${originalFilename}`, err);
    throw new Error('No se pudo desbloquear el archivo PDF. Asegúrate de que sea un archivo PDF válido.');
  } finally {
    await Promise.allSettled([
      fs.promises.unlink(tempInput),
      fs.promises.unlink(tempOutput),
    ]);
  }
}

export async function getUnlockPdfResult(fileId: string): Promise<StoredUnlockPdfResult | null> {
  return getTempFile<StoredUnlockPdfResult>(fileId);
}
