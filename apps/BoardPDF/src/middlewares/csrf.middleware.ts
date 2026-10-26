import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/env.config.js';
import { logger } from '../services/logger.service.js';

const CSRF_COOKIE_NAME = 'boardpdf_csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  let token = req.cookies[CSRF_COOKIE_NAME];
  if (!token) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      path: '/',
      sameSite: 'lax',
      secure: config.nodeEnv === 'production',
    });
  }

  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const clientToken = req.headers[CSRF_HEADER_NAME] || (req.body && typeof req.body === 'object' ? req.body._csrf : undefined);
  if (!clientToken || clientToken !== token) {
    logger.security.warn('Petición bloqueada por fallo o ausencia de token CSRF', {
      method: req.method,
      path: req.path,
    });
    res.status(403).json({
      error: 'Token CSRF inválido o ausente.',
      success: false,
    });
    return;
  }

  next();
}
