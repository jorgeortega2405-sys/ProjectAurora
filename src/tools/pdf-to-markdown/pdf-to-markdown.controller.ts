import { logger } from '../../services/logger.service.js';
import { convertPdfToMarkdown, getStoredMarkdown } from './pdf-to-markdown.service.js';
import { MarkdownConversionMode } from './pdf-to-markdown.types.js';
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
      logger.app.error('Error inesperado al cargar PDF para conversión a Markdown', err);
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar el archivo.',
        success: false,
      });
      return;
    }

    next();
  });
}

export async function handleConvertPdfToMarkdown(req: Request, res: Response): Promise<void> {
  const file = req.file;

  if (!file) {
    res.status(400).json({
      error: 'Debes seleccionar un archivo PDF para convertir a Markdown.',
      success: false,
    });
    return;
  }

  const mode = (typeof req.body?.mode === 'string' ? req.body.mode : 'structured') as MarkdownConversionMode;
  const customPrompt = typeof req.body?.customPrompt === 'string' ? req.body.customPrompt : undefined;
  const includeMathLatex = req.body?.includeMathLatex === 'true' || req.body?.includeMathLatex === true;
  const removeHeadersFooters = req.body?.removeHeadersFooters !== 'false' && req.body?.removeHeadersFooters !== false;
  const preserveTables = req.body?.preserveTables !== 'false' && req.body?.preserveTables !== false;

  try {
    const result = await convertPdfToMarkdown({
      buffer: file.buffer,
      customPrompt,
      includeMathLatex,
      mode,
      originalname: file.originalname,
      preserveTables,
      removeHeadersFooters,
    });

    res.status(200).json({
      data: result,
      success: true,
    });
  } catch (error: any) {
    logger.app.error('Error al procesar conversión de PDF a Markdown con IA', error);

    if (error?.message === 'EMPTY_PDF_TEXT') {
      res.status(400).json({
        error: 'El documento PDF no contiene texto legible ni elementos estructurados para convertir.',
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
      error: 'No se pudo convertir el documento PDF a Markdown. Por favor intenta de nuevo en unos momentos.',
      success: false,
    });
  }
}

export async function handleDownloadMarkdown(req: Request, res: Response): Promise<void> {
  const fileId = req.params.fileId;

  if (!fileId || typeof fileId !== 'string') {
    res.status(400).json({
      error: 'Identificador de archivo no válido.',
      success: false,
    });
    return;
  }

  try {
    const stored = await getStoredMarkdown(fileId);

    if (!stored || !stored.buffer) {
      res.status(404).json({
        error: 'El archivo solicitado ha expirado o no existe. Por favor realiza la conversión nuevamente.',
        success: false,
      });
      return;
    }

    const safeFilename = encodeURIComponent(stored.filename);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${stored.filename}"; filename*=UTF-8''${safeFilename}`);
    res.setHeader('Content-Length', stored.buffer.length);
    res.status(200).send(stored.buffer);
  } catch (error: any) {
    logger.app.error('Error al descargar archivo Markdown generado', error);
    res.status(500).json({
      error: 'Ha ocurrido un error al descargar el archivo.',
      success: false,
    });
  }
}
