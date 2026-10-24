import { config } from '../config/env.config.js';
import { logger } from '../services/logger.service.js';
import { verifyTurnstileToken } from '../services/turnstile.service.js';
import { getClientIp } from './rate-limit.middleware.js';
import type { NextFunction, Request, Response } from 'express';

export function requireTurnstile() {
  return async function turnstileMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!config.turnstile.enabled || !config.turnstile.secretKey) {
      return next();
    }

    const bodyToken = req.body && typeof req.body === 'object'
      ? (req.body.turnstileToken || req.body.cf_turnstile_token || req.body['cf-turnstile-response'])
      : undefined;

    const token = (req.headers['x-turnstile-token'] as string) ||
      (req.headers['cf-turnstile-response'] as string) ||
      (typeof bodyToken === 'string' ? bodyToken : undefined);

    if (!token || typeof token !== 'string' || !token.trim()) {
      logger.security.warn('Petición rechazada: token Turnstile ausente', {
        ip: getClientIp(req),
        method: req.method,
        path: req.path,
      });
      res.status(400).json({
        error: 'Verificación de seguridad requerida. Por favor recarga e intenta de nuevo.',
        success: false,
      });
      return;
    }

    const verification = await verifyTurnstileToken(token.trim(), getClientIp(req));
    if (!verification.success) {
      logger.security.warn('Petición rechazada: token Turnstile no válido', {
        ip: getClientIp(req),
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
