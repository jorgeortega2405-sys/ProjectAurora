import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { logger } from '../../services/logger.service.js';
import { convertPdfFile, getStoredConversionFile, UPLOADS_DIR } from './pdf-converter.service.js';
import { ConversionType } from './pdf-converter.types.js';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}${ext}`);
  },
});

export const uploadPdf = multer({
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos en formato PDF.'));
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  storage,
});

const VALID_CONVERSION_TYPES: ConversionType[] = [
  'pdf-to-jpg',
  'pdf-to-word',
  'pdf-to-powerpoint',
  'pdf-to-excel',
  'pdf-to-pdfa',
];

export async function handleConvertPdf(req: Request, res: Response): Promise<void> {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Debes seleccionar un archivo PDF para convertir.', success: false });
      return;
    }

    const targetType = req.body.targetType as ConversionType;
    if (!targetType || !VALID_CONVERSION_TYPES.includes(targetType)) {
      res.status(400).json({ error: 'Tipo de conversión inválido o no especificado.', success: false });
      return;
    }

    const result = await convertPdfFile(file, targetType);
    res.status(200).json({
      data: result,
      message: 'Conversión completada exitosamente.',
      success: true,
    });
  } catch (error) {
    logger.app.error('Error durante la conversión de PDF', error);
    res.status(500).json({
      error: 'Ha ocurrido un error al convertir el documento. Asegúrate de que el archivo no esté protegido con contraseña.',
      success: false,
    });
  }
}

export async function handleDownloadConvertedFile(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.params;
    if (!token) {
      res.status(400).json({ error: 'Token de descarga no proporcionado.', success: false });
      return;
    }

    const stored = await getStoredConversionFile(token);
    if (!stored || !stored.buffer) {
      res.status(404).json({ error: 'El archivo ha expirado o no fue encontrado.', success: false });
      return;
    }

    res.setHeader('Content-Type', stored.contentType || stored.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(stored.filename)}"`);
    res.setHeader('Content-Length', stored.buffer.length);
    res.send(stored.buffer);
  } catch (error) {
    logger.app.error('Error al descargar archivo convertido', error);
    res.status(500).json({
      error: 'Error inesperado al descargar el archivo.',
      success: false,
    });
  }
}
