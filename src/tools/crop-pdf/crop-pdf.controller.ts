import { Request, Response } from 'express';
import { logger } from '../../services/logger.service.js';
import { cropPdf, getCropPdfResult } from './crop-pdf.service.js';
import { CropPdfOptions } from './crop-pdf.types.js';

export async function cropPdfHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Debes seleccionar un archivo PDF.', success: false });
      return;
    }

    let options: CropPdfOptions = { cropBox: { height: 100, width: 100, x: 0, y: 0 } };
    if (req.body?.options) {
      try {
        options = typeof req.body.options === 'string' ? JSON.parse(req.body.options) : req.body.options;
      } catch {
        options = { cropBox: { height: 100, width: 100, x: 0, y: 0 } };
      }
    }

    const result = await cropPdf(req.file.buffer, req.file.originalname, options);
    res.json({ data: result, success: true });
  } catch (err: unknown) {
    logger.app.error('Fallo en endpoint cropPdfHandler', err);
    res.status(500).json({
      error: 'Ha ocurrido un error al recortar el PDF. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function downloadCropPdfHandler(req: Request, res: Response): Promise<void> {
  try {
    const { fileId } = req.params;
    if (!fileId) {
      res.status(400).json({ error: 'Identificador de archivo no proporcionado.', success: false });
      return;
    }

    const item = await getCropPdfResult(fileId);
    if (!item) {
      res.status(404).json({ error: 'El archivo solicitado ha expirado o no existe.', success: false });
      return;
    }

    res.setHeader('Content-Type', item.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(item.filename)}"`);
    res.send(item.buffer);
  } catch (err: unknown) {
    logger.app.error('Fallo al descargar PDF recortado', err);
    res.status(500).json({
      error: 'Error al descargar el archivo PDF recortado.',
      success: false,
    });
  }
}
