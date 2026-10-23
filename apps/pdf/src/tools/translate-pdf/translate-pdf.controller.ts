import { Request, Response } from 'express';
import multer from 'multer';
import { getToolLimits } from '../../config/tools-limits.config.js';
import { AI_CREDIT_COSTS, deductUserCredits } from '../../services/credits.service.js';
import { logger } from '../../services/logger.service.js';
import { getTranslatedPdf, translatePdf } from './translate-pdf.service.js';

const storage = multer.memoryStorage();
export const uploadPdf = multer({
  limits: {
    fileSize: 200 * 1024 * 1024,
  },
  storage,
  fileFilter: (_req, file, cb) => {
    const isPdfMime = file.mimetype === 'application/pdf';
    const isPdfExt = file.originalname.toLowerCase().endsWith('.pdf');
    if (isPdfMime || isPdfExt) {
      cb(null, true);
    } else {
      cb(new Error('INVALID_FILE_TYPE'));
    }
  },
});

export async function translatePdfHandler(req: Request, res: Response): Promise<void> {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({
        error: 'Por favor selecciona un archivo PDF válido.',
        success: false,
      });
      return;
    }

    const user = (req as any).user;
    const userPerms: string[] = user?.permissions || [];
    const limits = getToolLimits('translate-pdf', userPerms);
    const maxBytes = limits.maxFileSizeMB * 1024 * 1024;

    if (file.buffer.length > maxBytes) {
      res.status(400).json({
        error: `El archivo PDF seleccionado supera el límite permitido de ${limits.maxFileSizeMB} MB. Actualiza a Pro para procesar documentos de hasta 200 MB.`,
        success: false,
      });
      return;
    }

    const mode = req.body.mode === 'advanced' ? 'advanced' : 'standard';

    if (mode === 'advanced') {
      if (!user) {
        res.status(401).json({
          error: 'Debes iniciar sesión con una cuenta Pro o Empresas para utilizar Advanced AI.',
          success: false,
        });
        return;
      }

      const deduction = await deductUserCredits(user.id, AI_CREDIT_COSTS.advancedTranslate, 'translate_pdf_advanced');
      if (!deduction.success) {
        res.status(403).json({
          error: `Créditos de IA insuficientes (${deduction.remaining} disponibles). Esta tarea requiere ${AI_CREDIT_COSTS.advancedTranslate} créditos.`,
          success: false,
        });
        return;
      }
    }

    const targetLang = typeof req.body.targetLang === 'string' ? req.body.targetLang.trim() : '';
    const sourceLang = typeof req.body.sourceLang === 'string' ? req.body.sourceLang.trim() : undefined;

    if (!targetLang) {
      res.status(400).json({
        error: 'Debes seleccionar un idioma de destino para la traducción.',
        success: false,
      });
      return;
    }

    const result = await translatePdf({
      buffer: file.buffer,
      filename: file.filename || file.originalname,
      originalname: file.originalname,
      sourceLang,
      targetLang,
    });

    res.status(200).json({
      data: result,
      success: true,
    });
  } catch (error: any) {
    logger.app.error('Error al procesar la traducción del PDF', {
      error: error?.message || error,
    });

    if (error?.message === 'DEEPL_QUOTA_EXCEEDED') {
      res.status(429).json({
        error: 'Se ha alcanzado la cuota mensual de traducción de documentos de DeepL Free. Por favor intenta más tarde o actualiza el plan.',
        success: false,
      });
      return;
    }

    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al traducir el documento PDF. Por favor intenta de nuevo más tarde.',
      success: false,
    });
  }
}

export async function downloadTranslatedPdfHandler(req: Request, res: Response): Promise<void> {
  try {
    const fileId = req.params.fileId;
    if (!fileId) {
      res.status(400).json({
        error: 'Identificador de archivo no válido.',
        success: false,
      });
      return;
    }

    const stored = await getTranslatedPdf(fileId);
    if (!stored) {
      res.status(404).json({
        error: 'El archivo traducido ha expirado o no existe. Por favor realiza la traducción nuevamente.',
        success: false,
      });
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(stored.filename)}"`);
    res.setHeader('Content-Length', stored.size);
    res.send(stored.buffer);
  } catch (error: any) {
    logger.app.error('Error al descargar el PDF traducido', {
      error: error?.message || error,
    });
    res.status(500).json({
      error: 'Ha ocurrido un error al descargar el archivo.',
      success: false,
    });
  }
}
