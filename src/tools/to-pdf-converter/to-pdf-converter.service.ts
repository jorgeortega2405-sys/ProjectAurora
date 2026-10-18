import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { logger } from '../../services/logger.service.js';
import { getTempFile, storeTempFile } from '../../services/temp-storage.service.js';
import { StoredToPdfFile, ToPdfConversionResult, ToPdfSourceType } from './to-pdf-converter.types.js';

const execFileAsync = promisify(execFile);

const TO_PDF_DIR = path.resolve(process.cwd(), 'data/to-pdf');
const UPLOADS_DIR = path.join(TO_PDF_DIR, 'uploads');
const OUTPUT_DIR = path.join(TO_PDF_DIR, 'output');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

export { UPLOADS_DIR };

function getBasePdfName(originalFilename: string): string {
  const ext = path.extname(originalFilename);
  const base = path.basename(originalFilename, ext);
  return `${base || 'documento'}.pdf`;
}

export async function convertToPdf(
  file: Express.Multer.File,
  sourceType: ToPdfSourceType
): Promise<ToPdfConversionResult> {
  const inputPath = file.path;
  const originalFilename = file.originalname;
  const originalSize = file.size;
  const targetPdfName = getBasePdfName(originalFilename);
  const uniquePrefix = `topdf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const destinationPath = path.join(OUTPUT_DIR, `${uniquePrefix}_${targetPdfName}`);

  try {
    if (sourceType === 'jpg-to-pdf') {
      const pythonScript = `
import sys, os
from PIL import Image
input_file = sys.argv[1]
output_file = sys.argv[2]
ext = os.path.splitext(input_file)[1].lower()
if ext in ['.jpg', '.jpeg']:
    try:
        import img2pdf
        with open(output_file, 'wb') as f:
            f.write(img2pdf.convert(input_file))
        sys.exit(0)
    except Exception:
        pass
im = Image.open(input_file)
if im.mode in ('RGBA', 'LA', 'P'):
    im = im.convert('RGB')
im.save(output_file, 'PDF', resolution=100.0)
`;
      await execFileAsync('python3', ['-c', pythonScript, inputPath, destinationPath]);
    } else {
      const tempOutDir = path.join(OUTPUT_DIR, uniquePrefix);
      fs.mkdirSync(tempOutDir, { recursive: true });

      try {
        await execFileAsync('libreoffice', [
          '--headless',
          '--convert-to',
          'pdf',
          '--outdir',
          tempOutDir,
          inputPath,
        ]);

        const generatedFiles = fs.readdirSync(tempOutDir).filter((f) => f.toLowerCase().endsWith('.pdf'));
        if (generatedFiles.length === 0) {
          throw new Error('No se pudo generar el documento PDF desde el archivo proporcionado.');
        }

        const generatedPath = path.join(tempOutDir, generatedFiles[0]);
        fs.copyFileSync(generatedPath, destinationPath);
      } finally {
        if (fs.existsSync(tempOutDir)) {
          try {
            fs.rmSync(tempOutDir, { force: true, recursive: true });
          } catch {}
        }
      }
    }

    if (!fs.existsSync(destinationPath)) {
      throw new Error('El archivo PDF resultante no fue generado correctamente.');
    }

    const buffer = await fs.promises.readFile(destinationPath);
    const fileSize = buffer.length;
    try {
      await fs.promises.unlink(destinationPath);
    } catch {}

    const token = `pdf_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

    await storeTempFile(token, {
      buffer,
      contentType: 'application/pdf',
      createdAt: Date.now(),
      filename: targetPdfName,
      mimeType: 'application/pdf',
      token,
    });

    return {
      downloadToken: token,
      downloadUrl: `/api/tools/to-pdf/download/${token}`,
      fileSize,
      filename: targetPdfName,
      originalSize,
      success: true,
    };
  } catch (err) {
    logger.app.error('Error durante la conversión hacia PDF', err);
    if (fs.existsSync(destinationPath)) {
      try {
        fs.unlinkSync(destinationPath);
      } catch {}
    }
    throw new Error('Ocurrió un error al procesar la conversión a PDF.');
  } finally {
    if (fs.existsSync(inputPath)) {
      try {
        fs.unlinkSync(inputPath);
      } catch {}
    }
  }
}

export async function getStoredToPdfFile(token: string): Promise<StoredToPdfFile | null> {
  return getTempFile<StoredToPdfFile>(token);
}
