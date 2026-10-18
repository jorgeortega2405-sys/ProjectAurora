import { Request, Response } from 'express';
import { logger } from '../../services/logger.service.js';
import { getTempFile } from '../../services/temp-storage.service.js';
import { editPdfDocument } from './edit-pdf.service.js';
import { EditPdfModifications } from './edit-pdf.types.js';

export async function editPdfHandler(req: Request, res: Response): Promise<void> {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const pdfFile = files?.file?.[0] || req.file;

    if (!pdfFile) {
      res.status(400).json({ error: 'Debes seleccionar un archivo PDF.', success: false });
      return;
    }

    const imageFiles = files?.images || [];
    const imageBuffers = imageFiles.map((f) => f.buffer);

    let modifications: EditPdfModifications = {};
    if (req.body?.modifications) {
      try {
        modifications = typeof req.body.modifications === 'string'
          ? JSON.parse(req.body.modifications)
          : req.body.modifications;
      } catch {
        modifications = {};
      }
    }

    const result = await editPdfDocument(
      pdfFile.buffer,
      pdfFile.originalname,
      modifications,
      imageBuffers
    );

    res.json({ data: result, success: true });
  } catch (err: unknown) {
    logger.app.error('Fallo en endpoint editPdfHandler', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la edición del PDF. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function downloadEditedPdfHandler(req: Request, res: Response): Promise<void> {
  try {
    const { fileId } = req.params;
    if (!fileId) {
      res.status(400).json({ error: 'Identificador de archivo no proporcionado.', success: false });
      return;
    }

    const item = await getTempFile(fileId);
    if (!item) {
      res.status(404).json({ error: 'El archivo solicitado ha expirado o no existe.', success: false });
      return;
    }

    res.setHeader('Content-Type', item.contentType || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(item.filename)}"`);
    res.send(item.buffer);
  } catch (err: unknown) {
    logger.app.error('Fallo al descargar PDF editado', err);
    res.status(500).json({
      error: 'Error al descargar el archivo PDF editado.',
      success: false,
    });
  }
}
