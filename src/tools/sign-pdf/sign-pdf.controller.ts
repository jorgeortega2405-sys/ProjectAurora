import { Request, Response } from 'express';
import { logger } from '../../services/logger.service.js';
import { getTempFile } from '../../services/temp-storage.service.js';
import { signPdfDocument } from './sign-pdf.service.js';
import { SignPdfModifications } from './sign-pdf.types.js';

export async function signPdfHandler(req: Request, res: Response): Promise<void> {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const pdfFile = files?.file?.[0] || req.file;

    if (!pdfFile) {
      res.status(400).json({ error: 'Debes seleccionar un archivo PDF.', success: false });
      return;
    }

    const signatureFiles = files?.signatures || [];
    const signatureBuffers = signatureFiles.map((f) => f.buffer);

    let modifications: SignPdfModifications = {
      elements: [],
      signType: 'simple',
      signerName: 'Firmante',
    };

    if (req.body?.modifications) {
      try {
        modifications = typeof req.body.modifications === 'string'
          ? JSON.parse(req.body.modifications)
          : req.body.modifications;
      } catch {
        modifications = {
          elements: [],
          signType: 'simple',
          signerName: 'Firmante',
        };
      }
    }

    const result = await signPdfDocument(
      pdfFile.buffer,
      pdfFile.originalname,
      modifications,
      signatureBuffers
    );

    res.json({ data: result, success: true });
  } catch (err: unknown) {
    logger.app.error('Fallo en endpoint signPdfHandler', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la firma del PDF. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function downloadSignedPdfHandler(req: Request, res: Response): Promise<void> {
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
    logger.app.error('Fallo al descargar PDF firmado', err);
    res.status(500).json({
      error: 'Error al descargar el archivo PDF firmado.',
      success: false,
    });
  }
}
