import { logger } from '../../services/logger.service.js';
import { Request, Response } from 'express';
import { URL } from 'url';

const ALLOWED_HOST_SUFFIXES = [
  'dl.dropboxusercontent.com',
  'dropbox.com',
  'dropboxusercontent.com',
  'googleapis.com',
  'googleusercontent.com',
];

function isAllowedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((allowed) => lower === allowed || lower.endsWith(`.${allowed}`));
}

export async function handleFetchCloudFile(req: Request, res: Response): Promise<void> {
  try {
    const { filename, url } = req.body;

    if (!url || typeof url !== 'string' || !url.startsWith('https://')) {
      res.status(400).json({
        error: 'La URL proporcionada no es válida.',
        success: false,
      });
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      res.status(400).json({
        error: 'La URL proporcionada tiene un formato incorrecto.',
        success: false,
      });
      return;
    }

    if (!isAllowedHost(parsedUrl.hostname)) {
      logger.security.warn('Intento de descarga de nube con host no permitido', { host: parsedUrl.hostname });
      res.status(403).json({
        error: 'El origen del archivo no está permitido.',
        success: false,
      });
      return;
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 30000);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'ProjectAurora/1.0',
        },
        signal: abortController.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        logger.app.error('Error de respuesta al obtener archivo de la nube', { host: parsedUrl.hostname, status: response.status });
        res.status(502).json({
          error: 'No se pudo obtener el archivo desde el proveedor en la nube.',
          success: false,
        });
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length === 0) {
        res.status(422).json({
          error: 'El archivo descargado está vacío.',
          success: false,
        });
        return;
      }

      const safeName = (typeof filename === 'string' && filename.trim() ? filename.trim() : 'documento.pdf')
        .replace(/[^a-zA-Z0-9._-]/g, '_');

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (fetchErr) {
      clearTimeout(timeout);
      logger.app.error('Fallo de red al descargar archivo en la nube', fetchErr);
      res.status(504).json({
        error: 'Tiempo de espera agotado al descargar el archivo desde el proveedor.',
        success: false,
      });
    }
  } catch (err) {
    logger.app.error('Excepción inesperada en controlador de archivos en la nube', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}
