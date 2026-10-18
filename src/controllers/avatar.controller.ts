import { Request, Response } from 'express';
import { generateAvatarSvg } from '../services/avatar.service.js';
import { logger } from '../services/logger.service.js';

export function handleAvatarRequest(req: Request, res: Response): void {
  try {
    const name = String(req.query.name || req.query.username || 'User').trim();
    const size = Number(req.query.size) || 80;

    const svg = generateAvatarSvg(name, size);

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(svg);
  } catch (err) {
    logger.app.error('Error al generar avatar SVG', err);
    res.status(500).json({ error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.' });
  }
}
