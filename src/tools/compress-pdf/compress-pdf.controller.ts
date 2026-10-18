import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { logger } from '../../services/logger.service.js';
import { compressPdfFile, getCompressedPdf } from './compress-pdf.service.js';
import { PdfCompressLevel } from './compress-pdf.types.js';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

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
          error: 'El archivo supera el límite permitido de 50 MB.',
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
      logger.app.error('Error inesperado al cargar archivo PDF para comprimir', err);
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar el archivo.',
        success: false,
      });
      return;
    }

    next();
  });
}

export async function handleCompressPdf(req: Request, res: Response): Promise<void> {
  const file = req.file;

  if (!file) {
    res.status(400).json({
      error: 'Debes seleccionar un archivo PDF para poder comprimirlo.',
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

  const rawLevel = req.body?.level;
  const level: PdfCompressLevel = rawLevel === 'extreme' || rawLevel === 'low' ? rawLevel : 'recommended';
  const customFilename = typeof req.body?.filename === 'string' ? req.body.filename : undefined;

  try {
    const result = await compressPdfFile({
      buffer: file.buffer,
      filename: customFilename,
      level,
      originalname: file.originalname,
    });

    res.status(200).json({
      data: result,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al comprimir documento PDF', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al comprimir el archivo PDF. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function handleDownloadCompressedPdf(req: Request, res: Response): Promise<void> {
  const { fileId } = req.params;

  const item = await getCompressedPdf(fileId);
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
