import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { getToolLimits } from '../../config/tools-limits.config.js';
import { logger } from '../../services/logger.service.js';
import { getMergedPdf, mergePdfFiles } from './merge-pdf.service.js';

const MAX_BATCH_LIMIT = 500;
const MAX_UPLOAD_FILE_SIZE = 1000 * 1024 * 1024;

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
    fileSize: MAX_UPLOAD_FILE_SIZE,
    files: MAX_BATCH_LIMIT,
  },
  storage: multer.memoryStorage(),
}).array('pdfs', MAX_BATCH_LIMIT);

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
          error: 'Uno o más archivos superan el límite permitido de 50 MB.',
          success: false,
        });
        return;
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        res.status(400).json({
          error: `Puedes unir un máximo de ${MAX_BATCH_LIMIT} archivos PDF por tarea.`,
          success: false,
        });
        return;
      }
      res.status(400).json({
        error: 'Error al subir los archivos seleccionados.',
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
      logger.app.error('Error inesperado al cargar archivos PDF en el servidor', err);
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar los archivos.',
        success: false,
      });
      return;
    }

    next();
  });
}

export async function handleMergePdf(req: Request, res: Response): Promise<void> {
  const files = (req.files as Express.Multer.File[]) || [];

  if (!files || files.length < 2) {
    res.status(400).json({
      error: 'Debes seleccionar al menos 2 archivos PDF para poder unirlos.',
      success: false,
    });
    return;
  }

  const userPerms: string[] = (req as any).user?.permissions || [];
  const limits = getToolLimits('merge-pdf', userPerms);

  if (files.length > limits.maxFiles) {
    res.status(400).json({
      error: `El plan gratuito permite unir hasta ${limits.maxFiles} archivos por tarea. Actualiza a Pro para unir hasta 500 archivos.`,
      success: false,
    });
    return;
  }

  const maxBytes = limits.maxFileSizeMB * 1024 * 1024;
  const maxTotalBytes = limits.maxTotalSizeMB * 1024 * 1024;
  let totalSize = 0;
  for (const file of files) {
    totalSize += file.buffer.length;
    if (file.buffer.length > maxBytes) {
      res.status(400).json({
        error: `El archivo "${file.originalname}" supera el límite permitido de ${limits.maxFileSizeMB} MB.`,
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
  }

  if (totalSize > maxTotalBytes) {
    res.status(400).json({
      error: `El tamaño total acumulado de los archivos supera el límite de ${limits.maxTotalSizeMB} MB.`,
      success: false,
    });
    return;
  }

  try {
    const customFilename = typeof req.body?.filename === 'string' ? req.body.filename : undefined;
    const result = await mergePdfFiles(
      files.map((f) => ({
        buffer: f.buffer,
        originalname: f.originalname,
      })),
      customFilename
    );

    res.status(200).json({
      data: result,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al unir documentos PDF', error);
    const friendlyMessage = error instanceof Error && error.message.includes('válido')
      ? error.message
      : 'Ha ocurrido un error inesperado al unir los archivos PDF. Por favor intenta más tarde.';
    res.status(500).json({
      error: friendlyMessage,
      success: false,
    });
  }
}

export async function handleDownloadMergedPdf(req: Request, res: Response): Promise<void> {
  const { fileId } = req.params;

  const item = await getMergedPdf(fileId);
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
