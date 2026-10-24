import { adminConfig } from '../config/env.config.js';
import { logger } from './logger.service.js';

export interface TurnstileVerificationResult {
  error?: string;
  hostname?: string;
  success: boolean;
}

const CLOUDFLARE_TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstileToken(token: string, remoteIp?: string): Promise<TurnstileVerificationResult> {
  if (!adminConfig.turnstile.enabled) {
    return { success: true };
  }

  const secretKey = adminConfig.turnstile.secretKey;
  if (!secretKey) {
    logger.security.warn('Turnstile habilitado sin TURNSTILE_SECRET_KEY configurada, omitiendo validación');
    return { success: true };
  }

  if (!token || typeof token !== 'string' || !token.trim()) {
    return { error: 'Token de seguridad ausente.', success: false };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token.trim());
    if (remoteIp && remoteIp !== '127.0.0.1' && !remoteIp.startsWith('::')) {
      formData.append('remoteip', remoteIp);
    }

    const response = await fetch(CLOUDFLARE_TURNSTILE_VERIFY_URL, {
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
      logger.security.error('Respuesta HTTP no satisfactoria desde endpoint de verificación Turnstile', {
        status: response.status,
      });
      return { error: 'Error al contactar con el servicio de verificación de seguridad.', success: false };
    }

    const outcome = (await response.json()) as {
      'error-codes'?: string[];
      hostname?: string;
      success: boolean;
    };

    if (!outcome.success) {
      logger.security.warn('Desafío Turnstile rechazado por Cloudflare en consola de administración', {
        errorCodes: outcome['error-codes'] || [],
      });
      return {
        error: 'Verificación de seguridad no superada.',
        hostname: outcome.hostname,
        success: false,
      };
    }

    return {
      hostname: outcome.hostname,
      success: true,
    };
  } catch (error) {
    logger.security.error('Excepción al validar token Turnstile con Cloudflare en administración', error);
    return { error: 'Error de conexión al procesar verificación de seguridad.', success: false };
  }
}
