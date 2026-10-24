import { adminConfig } from '../config/env.config.js';
import { logger } from '../services/logger.service.js';
import { verifyTurnstileToken } from '../services/turnstile.service.js';
import type { NextFunction, Request, Response } from 'express';

function getAdminClientIp(req: Request): string {
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  if (typeof cfConnectingIp === 'string' && cfConnectingIp.trim()) {
    return cfConnectingIp.trim();
  }
  let ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  return ip;
}

export function requireAdminTurnstile() {
  return async function adminTurnstileMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!adminConfig.turnstile.enabled || !adminConfig.turnstile.secretKey) {
      return next();
    }

    const bodyToken = req.body && typeof req.body === 'object'
      ? (req.body.turnstileToken || req.body.cf_turnstile_token || req.body['cf-turnstile-response'])
      : undefined;

    const token = (req.headers['x-turnstile-token'] as string) ||
      (req.headers['cf-turnstile-response'] as string) ||
      (typeof bodyToken === 'string' ? bodyToken : undefined);

    if (!token || typeof token !== 'string' || !token.trim()) {
      logger.security.warn('Petición administrativa bloqueada: token Turnstile ausente', {
        ip: getAdminClientIp(req),
        method: req.method,
        path: req.path,
      });
      res.status(400).json({
        error: 'Verificación de seguridad requerida. Por favor recarga e intenta de nuevo.',
        success: false,
      });
      return;
    }

    const verification = await verifyTurnstileToken(token.trim(), getAdminClientIp(req));
    if (!verification.success) {
      logger.security.warn('Petición administrativa bloqueada: token Turnstile no válido', {
        ip: getAdminClientIp(req),
        method: req.method,
        path: req.path,
      });
      res.status(400).json({
        error: 'Verificación de seguridad no superada. Por favor recarga e intenta de nuevo.',
        success: false,
      });
      return;
    }

    next();
  };
}
