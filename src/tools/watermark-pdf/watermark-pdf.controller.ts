import { Request, Response } from 'express';
import { logger } from '../../services/logger.service.js';
import { addWatermarkToPdf, getWatermarkPdfResult } from './watermark-pdf.service.js';
import { WatermarkOptions } from './watermark-pdf.types.js';

export async function addWatermarkHandler(req: Request, res: Response): Promise<void> {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const pdfFile = files?.file?.[0] || req.file;

    if (!pdfFile) {
      res.status(400).json({ error: 'Debes seleccionar un archivo PDF.', success: false });
      return;
    }

    const watermarkImageFile = files?.watermarkImage?.[0];

    let options: WatermarkOptions = {};
    if (req.body?.options) {
      try {
        options = typeof req.body.options === 'string' ? JSON.parse(req.body.options) : req.body.options;
      } catch {
        options = {};
      }
    }

    const result = await addWatermarkToPdf(
      pdfFile.buffer,
      pdfFile.originalname,
      options,
      watermarkImageFile?.buffer
    );

    res.json({ data: result, success: true });
  } catch (err: unknown) {
    logger.app.error('Fallo en endpoint addWatermarkHandler', err);
    res.status(500).json({
      error: 'Ha ocurrido un error al insertar la marca de agua en el PDF. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function downloadWatermarkPdfHandler(req: Request, res: Response): Promise<void> {
  try {
    const { fileId } = req.params;
    if (!fileId) {
      res.status(400).json({ error: 'Identificador de archivo no proporcionado.', success: false });
      return;
    }

    const item = await getWatermarkPdfResult(fileId);
    if (!item) {
      res.status(404).json({ error: 'El archivo solicitado ha expirado o no existe.', success: false });
      return;
    }

    res.setHeader('Content-Type', item.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(item.filename)}"`);
    res.send(item.buffer);
  } catch (err: unknown) {
    logger.app.error('Fallo al descargar PDF con marca de agua', err);
    res.status(500).json({
      error: 'Error al descargar el archivo PDF con marca de agua.',
      success: false,
    });
  }
}
