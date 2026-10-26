import { Request, Response } from 'express';
import { getToolLimits } from '../../config/tools-limits.config.js';
import { logger } from '../../services/logger.service.js';
import { getUnlockPdfResult, unlockPdf } from './unlock-pdf.service.js';
import { UnlockPdfOptions } from './unlock-pdf.types.js';

export async function unlockPdfHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Debes seleccionar un archivo PDF.', success: false });
      return;
    }

    const userPermissions = (req as any).user?.permissions || [];
    const limits = getToolLimits('unlock-pdf', userPermissions);

    if (req.file.size > limits.maxFileSizeMB * 1024 * 1024) {
      res.status(403).json({
        error: `El archivo supera el límite permitido de ${limits.maxFileSizeMB} MB para tu plan actual. Actualiza tu suscripción para procesar archivos más grandes.`,
        success: false,
      });
      return;
    }

    let options: UnlockPdfOptions = {};
    if (req.body?.options) {
      try {
        options = typeof req.body.options === 'string' ? JSON.parse(req.body.options) : req.body.options;
      } catch {
        options = { password: req.body.password || '' };
      }
    } else if (req.body?.password) {
      options = { password: req.body.password };
    }

    const result = await unlockPdf(req.file.buffer, req.file.originalname, options);
    res.json({ data: result, success: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'PASSWORD_INVALID') {
      res.status(400).json({
        error: 'La contraseña introducida es incorrecta o el archivo está protegido con contraseña.',
        requiresPassword: true,
        success: false,
      });
      return;
    }

    logger.app.error('Fallo en endpoint unlockPdfHandler', err);
    res.status(500).json({
      error: 'Ha ocurrido un error al desbloquear el documento PDF. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function downloadUnlockPdfHandler(req: Request, res: Response): Promise<void> {
  try {
    const { fileId } = req.params;
    if (!fileId) {
      res.status(400).json({ error: 'Identificador de archivo no proporcionado.', success: false });
      return;
    }

    const item = await getUnlockPdfResult(fileId);
    if (!item) {
      res.status(404).json({ error: 'El archivo solicitado ha expirado o no existe.', success: false });
      return;
    }

    res.setHeader('Content-Type', item.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(item.filename)}"`);
    res.send(item.buffer);
  } catch (err: unknown) {
    logger.app.error('Fallo al descargar PDF desbloqueado', err);
    res.status(500).json({
      error: 'Error al descargar el archivo PDF desbloqueado.',
      success: false,
    });
  }
}
