import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { getToolLimits } from '../../config/tools-limits.config.js';
import { logger } from '../../services/logger.service.js';
import { getOcrPdf, processOcrPdf } from './ocr-pdf.service.js';
import { OcrLanguage } from './ocr-pdf.types.js';

const MAX_FILE_SIZE = 500 * 1024 * 1024;

const upload = multer({
  fileFilter: (_req, file, cb) => {
    const isPdfExt = file.originalname.toLowerCase().endsWith('.pdf');
    const isPdfMime = file.mimetype === 'application/pdf' || file.mimetype === 'application/x-pdf';
    if (isPdfExt || isPdfMime) {
      cb(null, true);
    } else {
      cb(new Error('INVALID_FORMAT'));
    }
  },
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
  storage: multer.memoryStorage(),
}).single('pdf');

function isPdfBuffer(buffer: Buffer): boolean {
  if (buffer.length < 5) return false;
  return (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  );
}

export function handleUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          error: 'El archivo supera el límite permitido de 500 MB.',
          success: false,
        });
        return;
      }
      res.status(400).json({
        error: 'Error al subir el archivo seleccionado.',
        success: false,
      });
      return;
    }

    if (err) {
      if (err.message === 'INVALID_FORMAT') {
        res.status(400).json({
          error: 'Formato no compatible. Solo se permiten documentos en formato PDF.',
          success: false,
        });
        return;
      }
      logger.app.error('Error inesperado al cargar archivo PDF para OCR', err);
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar el archivo.',
        success: false,
      });
      return;
    }

    next();
  });
}

export async function handleProcessOcrPdf(req: Request, res: Response): Promise<void> {
  const file = req.file;

  if (!file) {
    res.status(400).json({
      error: 'Debes seleccionar un archivo PDF para poder aplicarle OCR.',
      success: false,
    });
    return;
  }

  const userPermissions = (req as any).user?.permissions || [];
  const limits = getToolLimits('ocr-pdf', userPermissions);

  if (file.size > limits.maxFileSizeMB * 1024 * 1024) {
    res.status(403).json({
      error: `El archivo supera el límite permitido de ${limits.maxFileSizeMB} MB para tu plan actual. Actualiza tu suscripción para procesar archivos más grandes.`,
      success: false,
    });
    return;
  }

  if (!isPdfBuffer(file.buffer)) {
    res.status(400).json({
      error: `El archivo "${file.originalname}" no tiene un formato PDF válido.`,
      success: false,
    });
    return;
  }

  const rawLanguage = req.body?.language;
  const language: OcrLanguage = rawLanguage === 'eng' || rawLanguage === 'spa+eng' ? rawLanguage : 'spa';
  const deskew = req.body?.deskew === 'true' || req.body?.deskew === true;
  const customFilename = typeof req.body?.filename === 'string' ? req.body.filename : undefined;

  try {
    const result = await processOcrPdf({
      buffer: file.buffer,
      deskew,
      filename: customFilename,
      language,
      originalname: file.originalname,
    });

    res.status(200).json({
      data: result,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al aplicar OCR en documento PDF', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar el texto óptico del PDF. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function handleDownloadOcrPdf(req: Request, res: Response): Promise<void> {
  const { fileId } = req.params;

  const item = await getOcrPdf(fileId);
  if (!item) {
    res.status(404).json({
      error: 'El archivo solicitado ha expirado o no existe.',
      success: false,
    });
    return;
  }

  res.setHeader('Content-Type', item.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(item.filename)}"`);
  res.setHeader('Content-Length', item.size);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(item.buffer);
}
