import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { getToolLimits } from '../../config/tools-limits.config.js';
import { logger } from '../../services/logger.service.js';
import { hasPermission } from '../../services/pbac.service.js';
import { getSplitResult, splitPdfFile } from './split-pdf.service.js';
import { SplitPdfOptions } from './split-pdf.types.js';

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

export function handleSplitUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
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
      logger.app.error('Error inesperado al cargar archivo PDF para dividir', err);
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar el archivo.',
        success: false,
      });
      return;
    }

    next();
  });
}

export async function handleSplitPdf(req: Request, res: Response): Promise<void> {
  const file = req.file;

  if (!file) {
    res.status(400).json({
      error: 'Debes seleccionar un archivo PDF para poder dividirlo.',
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

  let options: SplitPdfOptions;
  try {
    if (typeof req.body?.options === 'string') {
      options = JSON.parse(req.body.options);
    } else if (req.body?.options && typeof req.body.options === 'object') {
      options = req.body.options;
    } else {
      options = {
        filename: req.body?.filename,
        fixedPageCount: req.body?.fixedPageCount ? parseInt(req.body.fixedPageCount, 10) : undefined,
        maxSizeBytes: req.body?.maxSizeBytes ? parseInt(req.body.maxSizeBytes, 10) : undefined,
        mergeSelected: req.body?.mergeSelected === 'true' || req.body?.mergeSelected === true,
        mode: req.body?.mode || 'range',
        ranges: req.body?.ranges ? (typeof req.body.ranges === 'string' ? JSON.parse(req.body.ranges) : req.body.ranges) : undefined,
        selectedPages: req.body?.selectedPages ? (typeof req.body.selectedPages === 'string' ? JSON.parse(req.body.selectedPages) : req.body.selectedPages) : undefined,
        submode: req.body?.submode,
      };
    }
  } catch {
    res.status(400).json({
      error: 'La configuración de división enviada es inválida.',
      success: false,
    });
    return;
  }

  const userPerms: string[] = (req as any).user?.permissions || [];
  const limits = getToolLimits('split-pdf', userPerms);
  const maxBytes = limits.maxFileSizeMB * 1024 * 1024;

  if (file.buffer.length > maxBytes) {
    res.status(400).json({
      error: `El archivo seleccionado supera el límite permitido de ${limits.maxFileSizeMB} MB. Actualiza a Pro para procesar documentos de hasta 1 GB.`,
      success: false,
    });
    return;
  }

  if (options.mode === 'size') {
    const canSplitBySize = hasPermission(userPerms, 'tools:split:by_size')
      || hasPermission(userPerms, 'subscription:feature:pro');
    if (!canSplitBySize) {
      res.status(403).json({
        error: 'La función de dividir por tamaño es exclusiva del plan Pro. Actualiza tu suscripción para utilizarla.',
        success: false,
      });
      return;
    }
  }

  try {
    const result = await splitPdfFile(file.buffer, file.originalname, options);

    res.status(200).json({
      data: result,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al dividir documento PDF', error);
    const friendlyMessage = error instanceof Error && error.message.includes('válid')
      ? error.message
      : 'Ha ocurrido un error inesperado al dividir el documento PDF. Por favor intenta más tarde.';
    res.status(500).json({
      error: friendlyMessage,
      success: false,
    });
  }
}

export async function handleDownloadSplitPdf(req: Request, res: Response): Promise<void> {
  const { fileId } = req.params;

  const item = await getSplitResult(fileId);
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
