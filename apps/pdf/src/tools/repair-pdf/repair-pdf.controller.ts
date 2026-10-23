import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { getToolLimits } from '../../config/tools-limits.config.js';
import { logger } from '../../services/logger.service.js';
import { getRepairedPdf, repairPdfFile } from './repair-pdf.service.js';

const MULTER_MAX_FILE_SIZE = 1000 * 1024 * 1024;

const upload = multer({
  fileFilter: (_req, file, cb) => {
    const isPdfExt = file.originalname.toLowerCase().endsWith('.pdf');
    const isPdfMime = file.mimetype === 'application/pdf' || file.mimetype === 'application/x-pdf' || file.mimetype === 'application/octet-stream';
    if (isPdfExt || isPdfMime) {
      cb(null, true);
    } else {
      cb(new Error('INVALID_FORMAT'));
    }
  },
  limits: {
    fileSize: MULTER_MAX_FILE_SIZE,
    files: 1,
  },
  storage: multer.memoryStorage(),
}).single('pdf');

function hasPdfSignature(buffer: Buffer): boolean {
  if (buffer.length < 5) return false;
  const headerSlice = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('latin1');
  return headerSlice.includes('%PDF-');
}

export function handleUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          error: 'El archivo supera el límite máximo permitido de 1000 MB.',
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
      logger.app.error('Error inesperado al cargar archivo PDF para reparar', err);
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar el archivo.',
        success: false,
      });
      return;
    }

    next();
  });
}

export async function handleRepairPdf(req: Request, res: Response): Promise<void> {
  const file = req.file;

  if (!file) {
    res.status(400).json({
      error: 'Debes seleccionar un archivo PDF para poder repararlo.',
      success: false,
    });
    return;
  }

  const userPerms = ((req as any).user?.permissions as string[]) || [];
  const limits = getToolLimits('repair-pdf', userPerms);

  if (file.size > limits.maxFileSizeMB * 1024 * 1024) {
    res.status(400).json({
      error: `El archivo supera el límite permitido de ${limits.maxFileSizeMB} MB para tu plan actual. Actualiza tu suscripción para procesar documentos de mayor tamaño.`,
      success: false,
    });
    return;
  }

  const isNamedPdf = file.originalname.toLowerCase().endsWith('.pdf');
  if (!hasPdfSignature(file.buffer) && !isNamedPdf) {
    res.status(400).json({
      error: `El archivo "${file.originalname}" no contiene una estructura identificable de PDF.`,
      success: false,
    });
    return;
  }

  const customFilename = typeof req.body?.filename === 'string' && req.body.filename.trim() ? req.body.filename.trim() : `${file.originalname.replace(/\.pdf$/i, '')}_reparado.pdf`;

  try {
    const result = await repairPdfFile({
      buffer: file.buffer,
      filename: customFilename,
      originalname: file.originalname,
    });

    res.status(200).json({
      data: result,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al reparar documento PDF', error);
    res.status(500).json({
      error: 'No se pudo reparar el archivo PDF seleccionado. El daño en el archivo puede ser irreversible.',
      success: false,
    });
  }
}

export async function handleDownloadRepairedPdf(req: Request, res: Response): Promise<void> {
  const { fileId } = req.params;

  const item = await getRepairedPdf(fileId);
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
