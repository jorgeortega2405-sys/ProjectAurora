import { logger } from '../../services/logger.service.js';
import { getStoredRedactedPdf, redactPdfDocument } from './redact-pdf.service.js';
import { PageRedaction } from './redact-pdf.types.js';
import { NextFunction, Request, Response } from 'express';
import multer from 'multer';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const upload = multer({
  fileFilter: (_req, file, cb) => {
    const isAllowedExt = /\.pdf$/i.test(file.originalname);
    const isAllowedMime = file.mimetype === 'application/pdf';

    if (isAllowedExt || isAllowedMime) {
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

export function handlePdfUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          error: 'El archivo PDF supera el límite permitido de 50 MB.',
          success: false,
        });
        return;
      }
      res.status(400).json({
        error: 'Error al subir el archivo PDF seleccionado.',
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
      logger.app.error('Error inesperado al cargar PDF para censura', err);
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar el archivo.',
        success: false,
      });
      return;
    }

    next();
  });
}

export async function handleRedactPdf(req: Request, res: Response): Promise<void> {
  const file = req.file;

  if (!file) {
    res.status(400).json({
      error: 'Debes seleccionar un archivo PDF para aplicar la censura.',
      success: false,
    });
    return;
  }

  let redactions: PageRedaction[] = [];
  try {
    if (typeof req.body?.redactions === 'string') {
      redactions = JSON.parse(req.body.redactions);
    } else if (Array.isArray(req.body?.redactions)) {
      redactions = req.body.redactions;
    }
  } catch {
    res.status(400).json({
      error: 'Los parámetros de censura enviados no son válidos.',
      success: false,
    });
    return;
  }

  const sanitizeMetadata = req.body?.sanitizeMetadata !== 'false' && req.body?.sanitizeMetadata !== false;
  const redactionStyle = req.body?.redactionStyle === 'strike' ? 'strike' : 'solid';

  try {
    const result = await redactPdfDocument({
      buffer: file.buffer,
      originalFilename: file.originalname,
      redactions,
      redactionStyle,
      sanitizeMetadata,
    });

    res.status(200).json({
      data: result,
      success: true,
    });
  } catch (error: any) {
    logger.app.error('Error al procesar la censura del documento PDF', error);

    res.status(500).json({
      error: 'No se pudo aplicar la censura al documento PDF. Por favor intenta de nuevo en unos momentos.',
      success: false,
    });
  }
}

export async function handleDownloadRedactedPdf(req: Request, res: Response): Promise<void> {
  const fileId = req.params.fileId;

  if (!fileId || typeof fileId !== 'string') {
    res.status(400).json({
      error: 'Identificador de archivo no válido.',
      success: false,
    });
    return;
  }

  try {
    const stored = await getStoredRedactedPdf(fileId);

    if (!stored || !stored.buffer) {
      res.status(404).json({
        error: 'El archivo censurado ha expirado o no existe. Por favor realiza la censura nuevamente.',
        success: false,
      });
      return;
    }

    const safeFilename = encodeURIComponent(stored.filename);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${stored.filename}"; filename*=UTF-8''${safeFilename}`);
    res.setHeader('Content-Length', stored.buffer.length);
    res.status(200).send(stored.buffer);
  } catch (error: any) {
    logger.app.error('Error al descargar archivo PDF censurado', error);
    res.status(500).json({
      error: 'Ha ocurrido un error al descargar el archivo.',
      success: false,
    });
  }
}
