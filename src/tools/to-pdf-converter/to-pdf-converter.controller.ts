import { Request, Response } from 'express';
import { getToolLimits } from '../../config/tools-limits.config.js';
import { logger } from '../../services/logger.service.js';
import { convertToPdf, getStoredToPdfFile } from './to-pdf-converter.service.js';
import { ToPdfSourceType } from './to-pdf-converter.types.js';

const ALLOWED_SOURCE_TYPES: Set<string> = new Set([
  'excel-to-pdf',
  'html-to-pdf',
  'jpg-to-pdf',
  'powerpoint-to-pdf',
  'word-to-pdf',
]);

export async function convertToPdfHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Debes seleccionar un archivo para convertir.', success: false });
      return;
    }

    const userPerms = ((req as any).user?.permissions as string[]) || [];
    const limits = getToolLimits('to-pdf-converter', userPerms);

    if (req.file.size > limits.maxFileSizeMB * 1024 * 1024) {
      res.status(400).json({
        error: `El archivo supera el límite permitido de ${limits.maxFileSizeMB} MB para tu plan actual. Actualiza tu suscripción para procesar documentos de mayor tamaño.`,
        success: false,
      });
      return;
    }

    const sourceType = (req.body?.sourceType || req.query?.sourceType) as ToPdfSourceType;
    if (!sourceType || !ALLOWED_SOURCE_TYPES.has(sourceType)) {
      res.status(400).json({ error: 'Tipo de conversión no válido.', success: false });
      return;
    }

    const result = await convertToPdf(req.file, sourceType);
    res.json({ data: result, success: true });
  } catch (err: unknown) {
    logger.app.error('Fallo en endpoint convertToPdfHandler', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la conversión del archivo. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function downloadConvertedPdfHandler(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.params;
    if (!token) {
      res.status(400).json({ error: 'Token de descarga no proporcionado.', success: false });
      return;
    }

    const file = await getStoredToPdfFile(token);
    if (!file || !file.buffer) {
      res.status(404).json({ error: 'El archivo solicitado ha expirado o no existe.', success: false });
      return;
    }

    res.setHeader('Content-Type', file.contentType || file.mimeType || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.filename)}"`);
    res.setHeader('Content-Length', file.buffer.length);
    res.send(file.buffer);
  } catch (err: unknown) {
    logger.app.error('Fallo al descargar archivo convertido a PDF', err);
    res.status(500).json({
      error: 'Error al descargar el archivo convertido.',
      success: false,
    });
  }
}
