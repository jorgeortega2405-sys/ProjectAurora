import { Request, Response } from 'express';
import { logger } from '../services/logger.service.js';
import { DEFAULT_TTL_SECONDS, deleteTempFile, getTempFile, getTempFileMeta, getTempFilePresignedUrl, getTempFileStream } from '../services/temp-storage.service.js';

export async function handleDownloadFile(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.params;
    if (!token) {
      res.status(400).json({ error: 'Token de descarga inválido.', success: false });
      return;
    }

    const streamResult = await getTempFileStream(token);
    if (streamResult) {
      res.setHeader('Content-Type', streamResult.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(streamResult.filename)}"`);
      if (streamResult.fileSize > 0) {
        res.setHeader('Content-Length', streamResult.fileSize);
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

      streamResult.stream.on('error', (streamErr) => {
        logger.app.error('Error durante la transmisión del archivo en descarga', streamErr);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Ha ocurrido un error durante la descarga del archivo.', success: false });
        }
      });

      streamResult.stream.pipe(res);
      return;
    }

    const item = await getTempFile(token);
    if (!item) {
      res.status(404).json({ error: 'El archivo solicitado ha expirado o no existe.', success: false });
      return;
    }

    res.setHeader('Content-Type', item.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(item.filename)}"`);
    res.setHeader('Content-Length', item.buffer.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(item.buffer);
  } catch (err) {
    logger.app.error('Error al descargar archivo temporal', err);
    res.status(500).json({ error: 'Ha ocurrido un error inesperado al procesar la descarga.', success: false });
  }
}

export async function handleDownloadInfo(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.params;
    if (!token) {
      res.status(400).json({ error: 'Token de descarga inválido.', success: false });
      return;
    }

    const meta = await getTempFileMeta(token);
    if (!meta) {
      res.status(404).json({ error: 'El archivo solicitado ha expirado o no existe.', success: false });
      return;
    }

    const fileSize = meta.fileSize || meta.size || 0;
    const createdAt = meta.createdAt || Date.now();
    const expiresAt = createdAt + DEFAULT_TTL_SECONDS * 1000;
    const presignedUrl = await getTempFilePresignedUrl(token);

    res.status(200).json({
      data: {
        contentType: meta.contentType || 'application/pdf',
        createdAt,
        downloadUrl: `/api/download/${encodeURIComponent(token)}`,
        expiresAt,
        fileSize,
        filename: meta.filename,
        presignedUrl,
        token,
      },
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al obtener información de archivo temporal', err);
    res.status(500).json({ error: 'Ha ocurrido un error inesperado al consultar el archivo.', success: false });
  }
}

export async function handleDeleteDownloadFile(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.params;
    if (!token) {
      res.status(400).json({ error: 'Token de descarga inválido.', success: false });
      return;
    }

    await deleteTempFile(token);
    res.status(200).json({
      message: 'Archivo eliminado correctamente.',
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al eliminar archivo temporal', err);
    res.status(500).json({ error: 'Ha ocurrido un error inesperado al eliminar el archivo.', success: false });
  }
}
