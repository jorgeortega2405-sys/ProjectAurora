import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { getToolLimits } from '../../config/tools-limits.config.js';
import { logger } from '../../services/logger.service.js';
import { summarizePdf } from './summarize-pdf.service.js';
import { SummaryMode } from './summarize-pdf.types.js';

const MAX_FILE_SIZE = 200 * 1024 * 1024;

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
          error: 'El archivo PDF seleccionado supera el límite permitido de 200 MB.',
          success: false,
        });
        return;
      }
      res.status(400).json({
        error: 'Error al subir el archivo para generar resumen.',
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
      logger.app.error('Error inesperado al cargar archivo PDF para resumen', err);
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar el archivo.',
        success: false,
      });
      return;
    }

    next();
  });
}

export async function handleSummarizePdf(req: Request, res: Response): Promise<void> {
  const file = req.file;

  if (!file) {
    res.status(400).json({
      error: 'Debes seleccionar un archivo PDF para generar el resumen.',
      success: false,
    });
    return;
  }

  const limits = getToolLimits('summarize-pdf');
  const maxBytes = limits.maxFileSizeMB * 1024 * 1024;

  if (file.buffer.length > maxBytes) {
    res.status(400).json({
      error: `El archivo PDF seleccionado supera el límite permitido de ${limits.maxFileSizeMB} MB.`,
      success: false,
    });
    return;
  }

  const mode: SummaryMode = req.body?.mode === 'standard' ? 'standard' : 'advanced';
  const customPrompt = typeof req.body?.customPrompt === 'string' ? req.body.customPrompt : undefined;

  try {
    const result = await summarizePdf({
      buffer: file.buffer,
      customPrompt,
      mode,
      originalname: file.originalname,
    });

    res.status(200).json({
      data: result,
      success: true,
    });
  } catch (error: any) {
    logger.app.error('Error al procesar resumen de PDF con IA', error);

    if (error?.message === 'EMPTY_PDF_TEXT') {
      res.status(400).json({
        error: 'El documento PDF no contiene texto digital legible. Si es un archivo escaneado o una imagen, puedes procesarlo primero con nuestra herramienta de OCR PDF.',
        success: false,
      });
      return;
    }

    if (error?.message === 'CONFIG_GEMINI_KEY_MISSING') {
      res.status(503).json({
        error: 'El servicio de IA no está configurado temporalmente. Por favor intenta más tarde.',
        success: false,
      });
      return;
    }

    res.status(500).json({
      error: 'No se pudo generar el resumen del documento PDF. Por favor intenta de nuevo en unos momentos.',
      success: false,
    });
  }
}
