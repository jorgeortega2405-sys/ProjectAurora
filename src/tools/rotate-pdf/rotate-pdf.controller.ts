import { Request, Response } from 'express';
import { logger } from '../../services/logger.service.js';
import { getRotatePdfResult, rotatePdf } from './rotate-pdf.service.js';
import { RotatePdfOptions } from './rotate-pdf.types.js';

export async function rotatePdfHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Debes seleccionar un archivo PDF para rotar.', success: false });
      return;
    }

    let options: RotatePdfOptions = { pages: [] };
    if (req.body?.options) {
      try {
        options = typeof req.body.options === 'string' ? JSON.parse(req.body.options) : req.body.options;
      } catch {
        options = { pages: [] };
      }
    }

    const result = await rotatePdf(req.file.buffer, req.file.originalname, options);
    res.json({ data: result, success: true });
  } catch (err: unknown) {
    logger.app.error('Fallo en endpoint rotatePdfHandler', err);
    res.status(500).json({
      error: 'Ha ocurrido un error al procesar la rotación del PDF. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function downloadRotatePdfHandler(req: Request, res: Response): Promise<void> {
  try {
    const { fileId } = req.params;
    if (!fileId) {
      res.status(400).json({ error: 'Identificador de archivo no proporcionado.', success: false });
      return;
    }

    const item = await getRotatePdfResult(fileId);
    if (!item) {
      res.status(404).json({ error: 'El archivo solicitado ha expirado o no existe.', success: false });
      return;
    }

    res.setHeader('Content-Type', item.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(item.filename)}"`);
    res.send(item.buffer);
  } catch (err: unknown) {
    logger.app.error('Fallo al descargar PDF rotado', err);
    res.status(500).json({
      error: 'Error al descargar el archivo PDF rotado.',
      success: false,
    });
  }
}
