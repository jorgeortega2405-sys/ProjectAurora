import { Request, Response } from 'express';
import { logger } from '../../services/logger.service.js';
import { comparePdfDocuments, getStoredComparisonReport } from './compare-pdf.service.js';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

export async function handleComparePdf(req: Request, res: Response): Promise<Response> {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const file1 = files?.file1?.[0] || (Array.isArray(req.files) ? req.files[0] : undefined);
    const file2 = files?.file2?.[0] || (Array.isArray(req.files) ? req.files[1] : undefined);

    if (!file1 || !file2) {
      return res.status(400).json({
        error: 'Debes proporcionar dos archivos PDF para realizar la comparación.',
        success: false,
      });
    }

    if (file1.size > MAX_FILE_SIZE || file2.size > MAX_FILE_SIZE) {
      return res.status(400).json({
        error: 'Uno o ambos archivos exceden el tamaño máximo permitido de 50 MB.',
        success: false,
      });
    }

    if (
      (!file1.mimetype.includes('pdf') && !file1.originalname.toLowerCase().endsWith('.pdf')) ||
      (!file2.mimetype.includes('pdf') && !file2.originalname.toLowerCase().endsWith('.pdf'))
    ) {
      return res.status(400).json({
        error: 'Ambos archivos deben tener un formato PDF válido.',
        success: false,
      });
    }

    const comparisonMode = req.body?.comparisonMode === 'overlay' ? 'overlay' : 'semantic';

    const result = await comparePdfDocuments({
      buffer1: file1.buffer,
      buffer2: file2.buffer,
      comparisonMode,
      filename1: file1.originalname,
      filename2: file2.originalname,
    });

    return res.status(200).json({
      data: result,
      success: true,
    });
  } catch (err: any) {
    logger.app.error('Error al comparar documentos PDF', { error: err });
    return res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la comparación de los documentos PDF.',
      success: false,
    });
  }
}

export async function handleDownloadComparisonReport(req: Request, res: Response): Promise<void> {
  try {
    const { fileId } = req.params;

    if (!fileId || typeof fileId !== 'string') {
      res.status(400).json({
        error: 'Identificador de archivo inválido.',
        success: false,
      });
      return;
    }

    const stored = await getStoredComparisonReport(fileId);

    if (!stored || !stored.buffer) {
      res.status(404).json({
        error: 'El informe solicitado ha expirado o no existe.',
        success: false,
      });
      return;
    }

    res.setHeader('Content-Type', stored.contentType || 'application/pdf');
    res.setHeader('Content-Length', stored.fileSize || stored.buffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(stored.filename)}"`);
    res.send(stored.buffer);
  } catch (err: any) {
    logger.app.error('Error al descargar informe de comparación PDF', { error: err });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al descargar el informe.',
      success: false,
    });
  }
}
