import { adminConfig } from '../config/env.config.js';
import { logger } from '../services/logger.service.js';
import type { NextFunction, Request, Response } from 'express';

export function buildAdminContentSecurityPolicy(): string {
  const isDev = adminConfig.nodeEnv !== 'production';
  const scriptDirectives = [
    "'self'",
    "'unsafe-inline'",
    'https://challenges.cloudflare.com',
  ];
  if (isDev) {
    scriptDirectives.push("'unsafe-eval'");
  }

  const directives: Record<string, string[]> = {
    'base-uri': ["'self'"],
    'connect-src': ["'self'", 'ws:', 'wss:', 'https://challenges.cloudflare.com'],
    'default-src': ["'self'"],
    'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'frame-src': ["'self'", 'https://challenges.cloudflare.com'],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'object-src': ["'self'", 'blob:'],
    'script-src': scriptDirectives,
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'worker-src': ["'self'", 'blob:'],
  };

  return Object.entries(directives)
    .map(([key, vals]) => `${key} ${vals.join(' ')}`)
    .join('; ');
}

export function adminSecurityHeaders() {
  const cspHeader = buildAdminContentSecurityPolicy();

  return function adminSecurityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
    res.setHeader('Content-Security-Policy', cspHeader);
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');

    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https' || adminConfig.nodeEnv === 'production';
    if (isSecure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    next();
  };
}

export function adminOriginProtection() {
  return function adminOriginProtectionMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!adminConfig.originProtection.enforceCloudflare) {
      return next();
    }

    const cfRay = req.headers['cf-ray'];
    const cfConnectingIp = req.headers['cf-connecting-ip'];

    if (!cfRay || !cfConnectingIp) {
      logger.security.warn('Acceso directo a consola de administración bloqueado: petición no canalizada a través de Cloudflare', {
        headers: req.headers,
        ip: req.ip,
        path: req.path,
      });
      res.status(403).json({
        error: 'Acceso directo al servidor de origen denegado.',
        success: false,
      });
      return;
    }

    if (adminConfig.originProtection.secret) {
      const secretHeader = req.headers['x-origin-verify-secret'];
      if (!secretHeader || secretHeader !== adminConfig.originProtection.secret) {
        logger.security.warn('Acceso a administración bloqueado: secreto de origen inválido o ausente', {
          ip: req.ip,
          path: req.path,
        });
        res.status(403).json({
          error: 'Acceso directo al servidor de origen denegado.',
          success: false,
        });
        return;
      }
    }

    next();
  };
}
