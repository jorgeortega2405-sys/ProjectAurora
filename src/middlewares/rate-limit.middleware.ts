import { redis } from '../config/redis.config.js';
import { getCurrentUser } from '../services/auth.service.js';
import { logger } from '../services/logger.service.js';
import { NextFunction, Request, Response } from 'express';

export interface RateLimiterOptions {
  keyGenerator?: (req: Request) => string;
  max: number;
  message?: string;
  prefix: string;
  windowMs: number;
}

const memoryFallbackStore = new Map<string, number[]>();

function checkMemoryFallback(key: string, now: number, windowMs: number, max: number): { allowed: boolean; remaining: number; resetInSeconds: number } {
  const windowStart = now - windowMs;
  let timestamps = memoryFallbackStore.get(key) || [];
  timestamps = timestamps.filter((t) => t > windowStart);

  if (timestamps.length >= max) {
    const oldest = timestamps[0] || now;
    const resetInSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    memoryFallbackStore.set(key, timestamps);
    return { allowed: false, remaining: 0, resetInSeconds };
  }

  timestamps.push(now);
  memoryFallbackStore.set(key, timestamps);
  return { allowed: true, remaining: max - timestamps.length, resetInSeconds: Math.ceil(windowMs / 1000) };
}

const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local clearBefore = now - window

redis.call('ZREMRANGEBYSCORE', key, '-inf', clearBefore)

local currentRequests = redis.call('ZCARD', key)

if currentRequests < limit then
  local member = now .. '-' .. redis.call('INCR', key .. ':seq')
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, window)
  redis.call('PEXPIRE', key .. ':seq', window)

  local remaining = limit - currentRequests - 1
  local resetIn = math.ceil(window / 1000)
  return {1, remaining, resetIn}
else
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local resetIn = 1
  if oldest and #oldest >= 2 then
    resetIn = math.ceil((tonumber(oldest[2]) + window - now) / 1000)
  else
    resetIn = math.ceil(window / 1000)
  end
  if resetIn < 1 then resetIn = 1 end
  redis.call('PEXPIRE', key, window)
  return {0, 0, resetIn}
end
`;

export function getClientIp(req: Request): string {
  let ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  return ip;
}

export function getUserOrIpKey(req: Request): string {
  const user = (req as any).user || getCurrentUser(req);
  return user?.id ? `user:${user.id}` : getClientIp(req);
}

export function createRateLimiter(options: RateLimiterOptions) {
  const {
    keyGenerator = getClientIp,
    max,
    message = 'Has realizado demasiadas solicitudes. Por favor intenta más tarde.',
    prefix,
    windowMs,
  } = options;

  return async function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const identifier = keyGenerator(req);
      const redisKey = `ratelimit:${prefix}:${identifier}`;
      const now = Date.now();

      const result = (await redis.eval(
        SLIDING_WINDOW_LUA,
        1,
        redisKey,
        now,
        windowMs,
        max
      )) as [number, number, number];

      const [allowed, remaining, resetInSeconds] = result;

      res.setHeader('RateLimit-Limit', max);
      res.setHeader('RateLimit-Remaining', remaining);
      res.setHeader('RateLimit-Reset', resetInSeconds);

      if (allowed === 1) {
        return next();
      }

      res.setHeader('Retry-After', resetInSeconds);

      logger.security.warn(`Rate limit excedido en acción "${prefix}"`, {
        action: prefix,
        identifier,
        path: req.originalUrl || req.url,
        retryAfter: resetInSeconds,
      });

      const minutes = Math.ceil(resetInSeconds / 60);
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      let timeText = `${resetInSeconds} segundos`;
      if (hours > 0) {
        timeText = remainingMinutes > 0 ? `${hours} horas y ${remainingMinutes} minutos` : `${hours} horas`;
      } else if (minutes > 1) {
        timeText = `${minutes} minutos`;
      }
      const userMessage = `Has realizado demasiadas solicitudes. Por favor espera ${timeText} antes de intentar nuevamente.`;

      res.status(429).json({
        error: message || userMessage,
        retryAfter: resetInSeconds,
        success: false,
      });
    } catch (error) {
      logger.db.warn(`Redis no disponible para rate limiter "${prefix}". Activando limitador en memoria local.`);
      const now = Date.now();
      const identifier = keyGenerator(req);
      const fallbackKey = `${prefix}:${identifier}`;
      const fallback = checkMemoryFallback(fallbackKey, now, windowMs, max);

      res.setHeader('RateLimit-Limit', max);
      res.setHeader('RateLimit-Remaining', fallback.remaining);
      res.setHeader('RateLimit-Reset', fallback.resetInSeconds);

      if (fallback.allowed) {
        return next();
      }

      res.setHeader('Retry-After', fallback.resetInSeconds);
      logger.security.warn(`Rate limit en memoria local excedido en "${prefix}"`, { action: prefix, identifier });
      res.status(429).json({
        error: message,
        retryAfter: fallback.resetInSeconds,
        success: false,
      });
    }
  };
}

export const forgotPasswordLimiter = createRateLimiter({
  max: 3,
  message: 'Demasiadas solicitudes de recuperación de contraseña. Por favor espera 15 minutos antes de intentar de nuevo.',
  prefix: 'forgot_pwd',
  windowMs: 15 * 60 * 1000,
});

export const resetPasswordLimiter = createRateLimiter({
  max: 5,
  message: 'Demasiados intentos para restablecer contraseña. Por favor espera 15 minutos.',
  prefix: 'reset_pwd',
  windowMs: 15 * 60 * 1000,
});

export const loginLimiter = createRateLimiter({
  max: 5,
  message: 'Demasiados intentos de inicio de sesión. Por favor espera 5 minutos antes de volver a intentarlo.',
  prefix: 'login',
  windowMs: 5 * 60 * 1000,
});

export const registerLimiter = createRateLimiter({
  max: 5,
  message: 'Has intentado registrar demasiadas cuentas recientemente. Por favor espera 15 minutos.',
  prefix: 'register_stage1',
  windowMs: 15 * 60 * 1000,
});

export const sendCodeLimiter = createRateLimiter({
  max: 3,
  message: 'Demasiados códigos solicitados. Por favor espera 5 minutos para solicitar uno nuevo.',
  prefix: 'send_code',
  windowMs: 5 * 60 * 1000,
});

export const verifyCodeLimiter = createRateLimiter({
  max: 5,
  message: 'Demasiados intentos de verificación. Por favor espera 10 minutos.',
  prefix: 'verify_code',
  windowMs: 10 * 60 * 1000,
});

export const emailCodeLimiter = createRateLimiter({
  max: 3,
  message: 'Demasiadas solicitudes de código de cambio de correo. Por favor espera 5 minutos.',
  prefix: 'email_change_code',
  windowMs: 5 * 60 * 1000,
});

export const verifyEmailCodeLimiter = createRateLimiter({
  max: 5,
  message: 'Demasiados intentos de verificación de código de correo. Por favor espera 10 minutos.',
  prefix: 'email_change_verify',
  windowMs: 10 * 60 * 1000,
});

export const avatarLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 5,
  message: 'Has alcanzado el límite de cambios de foto de perfil. Por favor espera antes de intentar nuevamente.',
  prefix: 'avatar_mod',
  windowMs: 12 * 60 * 60 * 1000,
});

export const preferencesLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 30,
  message: 'Has realizado demasiados cambios de preferencias en poco tiempo. Por favor espera un momento.',
  prefix: 'preferences_mod',
  windowMs: 60 * 1000,
});

export const updateUsernameLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 5,
  message: 'Has intentado cambiar tu nombre de usuario demasiadas veces. Por favor espera 15 minutos.',
  prefix: 'update_username',
  windowMs: 15 * 60 * 1000,
});

export const verifyPasswordLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 5,
  message: 'Demasiados intentos de verificación de contraseña. Por favor espera 10 minutos.',
  prefix: 'verify_pwd',
  windowMs: 10 * 60 * 1000,
});

export const twoFactorGenerateLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 5,
  message: 'Demasiadas solicitudes de configuración de 2FA. Por favor espera 15 minutos.',
  prefix: '2fa_generate',
  windowMs: 15 * 60 * 1000,
});

export const twoFactorVerifyLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 10,
  message: 'Demasiados intentos de verificación de 2FA. Por favor espera 15 minutos.',
  prefix: '2fa_verify',
  windowMs: 15 * 60 * 1000,
});

export const updatePasswordLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 5,
  message: 'Has intentado cambiar tu contraseña demasiadas veces. Por favor espera 15 minutos.',
  prefix: 'update_pwd',
  windowMs: 15 * 60 * 1000,
});


export const videoInspectLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 20,
  message: 'Demasiadas consultas de video en poco tiempo. Por favor espera unos minutos.',
  prefix: 'video_inspect',
  windowMs: 5 * 60 * 1000,
});

export const videoDownloadLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 15,
  message: 'Has iniciado demasiadas descargas recientemente. Por favor espera unos minutos.',
  prefix: 'video_download',
  windowMs: 15 * 60 * 1000,
});

export const dynamicQrLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 60,
  message: 'Demasiadas solicitudes de códigos QR dinámicos. Por favor espera unos momentos.',
  prefix: 'dynamic_qr',
  windowMs: 60 * 1000,
});

export const imageCompressLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 40,
  message: 'Has realizado demasiadas solicitudes de compresión de imágenes. Por favor espera unos minutos.',
  prefix: 'image_compress',
  windowMs: 5 * 60 * 1000,
});

export const pdfMergeLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 30,
  message: 'Has realizado demasiadas solicitudes de unión de PDF. Por favor espera unos minutos.',
  prefix: 'pdf_merge',
  windowMs: 5 * 60 * 1000,
});

export const pdfSplitLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 30,
  message: 'Has realizado demasiadas solicitudes de división de PDF. Por favor espera unos minutos.',
  prefix: 'pdf_split',
  windowMs: 5 * 60 * 1000,
});

export const pdfRemovePagesLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 30,
  message: 'Has realizado demasiadas solicitudes para eliminar páginas de PDF. Por favor espera unos minutos.',
  prefix: 'pdf_remove_pages',
  windowMs: 5 * 60 * 1000,
});

export const pdfOrganizeLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 30,
  message: 'Has realizado demasiadas solicitudes para ordenar PDF. Por favor espera unos minutos.',
  prefix: 'pdf_organize',
  windowMs: 5 * 60 * 1000,
});

export const pdfCompressLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 30,
  message: 'Has realizado demasiadas solicitudes para comprimir PDF. Por favor espera unos minutos.',
  prefix: 'pdf_compress',
  windowMs: 5 * 60 * 1000,
});

export const pdfRepairLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 30,
  message: 'Has realizado demasiadas solicitudes para reparar PDF. Por favor espera unos minutos.',
  prefix: 'pdf_repair',
  windowMs: 5 * 60 * 1000,
});

export const pdfOcrLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 20,
  message: 'Has realizado demasiadas solicitudes para procesar OCR en PDF. Por favor espera unos minutos.',
  prefix: 'pdf_ocr',
  windowMs: 5 * 60 * 1000,
});

export const comparePdfLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 25,
  message: 'Has realizado demasiadas solicitudes para comparar documentos PDF. Por favor espera unos minutos.',
  prefix: 'compare_pdf',
  windowMs: 5 * 60 * 1000,
});

export const redactPdfLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 25,
  message: 'Has realizado demasiadas solicitudes para censurar documentos PDF. Por favor espera unos minutos.',
  prefix: 'redact_pdf',
  windowMs: 5 * 60 * 1000,
});

export const removeBackgroundLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 25,
  message: 'Has realizado demasiadas solicitudes para eliminar fondos de imagen. Por favor espera unos minutos.',
  prefix: 'remove_bg',
  windowMs: 5 * 60 * 1000,
});

export const pdfToMarkdownLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 20,
  message: 'Has realizado demasiadas solicitudes para convertir documentos PDF a Markdown. Por favor espera unos minutos.',
  prefix: 'pdf_to_markdown',
  windowMs: 5 * 60 * 1000,
});

export const summarizePdfLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 20,
  message: 'Has realizado demasiadas solicitudes para resumir documentos PDF. Por favor espera unos minutos.',
  prefix: 'summarize_pdf',
  windowMs: 5 * 60 * 1000,
});

export const upscaleImageLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 20,
  message: 'Has realizado demasiadas solicitudes para escalar imágenes. Por favor espera unos minutos.',
  prefix: 'upscale_img',
  windowMs: 5 * 60 * 1000,
});

export const translatePdfLimiter = createRateLimiter({
  keyGenerator: getUserOrIpKey,
  max: 15,
  message: 'Has realizado demasiadas solicitudes para traducir documentos PDF. Por favor espera unos minutos.',
  prefix: 'translate_pdf',
  windowMs: 5 * 60 * 1000,
});





