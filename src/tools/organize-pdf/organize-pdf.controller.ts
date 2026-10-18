import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { logger } from '../../services/logger.service.js';
import { getOrganizePdfResult, organizePdf } from './organize-pdf.service.js';
import { OrganizePdfOptions, PageOrderOption } from './organize-pdf.types.js';

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

export function handleOrganizePdfUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          error: 'El archivo PDF seleccionado supera el límite permitido de 50 MB.',
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
      logger.app.error('Error inesperado al cargar archivo PDF para ordenar páginas', err);
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar el archivo.',
        success: false,
      });
      return;
    }

    next();
  });
}

export async function handleOrganizePdf(req: Request, res: Response): Promise<void> {
  const file = req.file;

  if (!file) {
    res.status(400).json({
      error: 'Debes seleccionar un archivo PDF para procesar.',
      success: false,
    });
    return;
  }

  if (!isPdfBuffer(file.buffer)) {
    res.status(400).json({
      error: 'El archivo enviado no corresponde a un documento PDF válido.',
      success: false,
    });
    return;
  }

  let pagesOrder: PageOrderOption[] = [];
  try {
    if (typeof req.body?.pagesOrder === 'string') {
      pagesOrder = JSON.parse(req.body.pagesOrder);
    } else if (Array.isArray(req.body?.pagesOrder)) {
      pagesOrder = req.body.pagesOrder;
    }
  } catch {
    res.status(400).json({
      error: 'El formato de ordenamiento de páginas es inválido.',
      success: false,
    });
    return;
  }

  if (!Array.isArray(pagesOrder) || pagesOrder.length === 0) {
    res.status(400).json({
      error: 'Debes incluir al menos una página en el ordenamiento.',
      success: false,
    });
    return;
  }

  const customFilename = typeof req.body?.filename === 'string' ? req.body.filename : undefined;

  const options: OrganizePdfOptions = {
    filename: customFilename,
    pagesOrder,
  };

  try {
    const result = await organizePdf(file.buffer, file.originalname, options);

    res.status(200).json({
      data: result,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al ordenar páginas del documento PDF', error);
    const isValidationError = error instanceof Error && (
      error.message.includes('página') ||
      error.message.includes('protegido') ||
      error.message.includes('válido')
    );
    const friendlyMessage = isValidationError
      ? (error as Error).message
      : 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.';
    res.status(isValidationError ? 400 : 500).json({
      error: friendlyMessage,
      success: false,
    });
  }
}

export async function handleDownloadOrganizePdf(req: Request, res: Response): Promise<void> {
  const { fileId } = req.params;

  const item = await getOrganizePdfResult(fileId);
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
