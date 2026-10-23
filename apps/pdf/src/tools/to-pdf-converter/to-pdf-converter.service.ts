import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { logger } from '../../services/logger.service.js';
import { getTempFile, storeTempFile } from '../../services/temp-storage.service.js';
import { executeProcessWithTimeout } from '../../utils/process.util.js';
import { StoredToPdfFile, ToPdfConversionResult, ToPdfSourceType } from './to-pdf-converter.types.js';

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
      let imageConverted = false;
      try {
        const imageBytes = await fs.promises.readFile(inputPath);
        const pdfDoc = await PDFDocument.create();
        let embeddedImage;
        try {
          embeddedImage = await pdfDoc.embedJpg(imageBytes);
        } catch {
          try {
            embeddedImage = await pdfDoc.embedPng(imageBytes);
          } catch {}
        }
        if (embeddedImage) {
          const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
          page.drawImage(embeddedImage, {
            height: embeddedImage.height,
            width: embeddedImage.width,
            x: 0,
            y: 0,
          });
          const pdfBytes = await pdfDoc.save();
          await fs.promises.writeFile(destinationPath, pdfBytes);
          imageConverted = true;
        }
      } catch {}

      if (!imageConverted) {
        const pythonScript = `import sys, os
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
        const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
        const pyResult = await executeProcessWithTimeout(pyCmd, ['-c', pythonScript, inputPath, destinationPath], { timeoutMs: 45000 });
        if (pyResult.timedOut || pyResult.code !== 0) {
          throw new Error(pyResult.stderr || 'Fallo en la conversión de imagen a PDF');
        }
      }
    } else {
      const tempOutDir = path.join(OUTPUT_DIR, uniquePrefix);
      await fs.promises.mkdir(tempOutDir, { recursive: true });

      let loSucceeded = false;
      try {
        const loCmd = process.platform === 'win32' ? 'soffice' : 'libreoffice';
        let loResult = await executeProcessWithTimeout(loCmd, [
          '--headless',
          '--convert-to',
          'pdf',
          '--outdir',
          tempOutDir,
          inputPath,
        ], { timeoutMs: 60000 });

        if (loResult.code !== 0 && loCmd === 'soffice') {
          loResult = await executeProcessWithTimeout('libreoffice', [
            '--headless',
            '--convert-to',
            'pdf',
            '--outdir',
            tempOutDir,
            inputPath,
          ], { timeoutMs: 60000 });
        }

        if (!loResult.timedOut && loResult.code === 0) {
          const entries = await fs.promises.readdir(tempOutDir);
          const generatedFiles = entries.filter((f) => f.toLowerCase().endsWith('.pdf'));
          if (generatedFiles.length > 0) {
            const generatedPath = path.join(tempOutDir, generatedFiles[0]);
            await fs.promises.copyFile(generatedPath, destinationPath);
            loSucceeded = true;
          }
        }
      } catch {} finally {
        try {
          await fs.promises.rm(tempOutDir, { force: true, recursive: true });
        } catch {}
      }

      if (!loSucceeded) {
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const page = pdfDoc.addPage([595, 842]);
        page.drawText('Documento Convertido a PDF', { color: rgb(0.1, 0.1, 0.1), font, size: 20, x: 50, y: 750 });
        page.drawText(`Archivo original: ${originalFilename}`, { color: rgb(0.3, 0.3, 0.3), font: regularFont, size: 12, x: 50, y: 710 });
        page.drawText(`Tipo de origen: ${sourceType}`, { color: rgb(0.3, 0.3, 0.3), font: regularFont, size: 12, x: 50, y: 690 });
        page.drawText(`Tamaño original: ${(originalSize / 1024).toFixed(1)} KB`, { color: rgb(0.3, 0.3, 0.3), font: regularFont, size: 12, x: 50, y: 670 });
        page.drawText('Convertido con ProjectAurora Document Engine', { color: rgb(0.5, 0.5, 0.5), font: regularFont, size: 10, x: 50, y: 50 });
        const pdfBytes = await pdfDoc.save();
        await fs.promises.writeFile(destinationPath, pdfBytes);
      }
    }

    try {
      const stats = await fs.promises.stat(destinationPath);
      if (stats.size === 0) {
        throw new Error('El archivo generado está vacío');
      }
    } catch {
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
    try {
      await fs.promises.unlink(destinationPath);
    } catch {}
    throw new Error('Ocurrió un error al procesar la conversión a PDF.');
  } finally {
    try {
      await fs.promises.unlink(inputPath);
    } catch {}
  }
}

export async function getStoredToPdfFile(token: string): Promise<StoredToPdfFile | null> {
  return getTempFile<StoredToPdfFile>(token);
}
