import crypto from 'crypto';
import { redis } from '../config/redis.config.js';

export interface PendingRegistration {
  attempts: number;
  code: string;
  createdAt: number;
  email: string;
  expiresAt: number;
  passwordHash: string;
  username: string;
}

export interface PasswordResetPayload {
  createdAt: number;
  email: string;
  expiresAt: number;
  userId: string;
}

export interface EmailChangeCodePayload {
  attempts: number;
  code: string;
  createdAt: number;
  currentEmail: string;
  expiresAt: number;
  lastSentAt: number;
  userId: string;
}

const DEFAULT_TTL_SECONDS = 900;
const MAX_ATTEMPTS = 5;

const REDIS_REG_PREFIX = 'reg_pending:';
const REDIS_RESET_PREFIX = 'pwd_reset:';
const REDIS_EMAIL_PREFIX = 'email_change:';
const REDIS_AUTH_PREFIX = 'email_auth:';
const REDIS_PWDAUTH_PREFIX = 'pwd_auth:';

const memoryPending = new Map<string, PendingRegistration>();
const memoryPasswordReset = new Map<string, PasswordResetPayload>();
const memoryEmailCodes = new Map<string, EmailChangeCodePayload>();
const memoryEmailAuth = new Map<string, number>();
const memoryPasswordAuth = new Map<string, number>();

export function generateSixDigitCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export async function savePendingRegistration(
  email: string,
  data: { code: string; passwordHash: string; username: string },
  ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  const now = Date.now();
  const payload: PendingRegistration = {
    attempts: 0,
    code: data.code,
    createdAt: now,
    email: normalizedEmail,
    expiresAt: now + ttlSeconds * 1000,
    passwordHash: data.passwordHash,
    username: data.username.trim(),
  };

  memoryPending.set(normalizedEmail, payload);

  if (redis.status === 'ready') {
    try {
      await redis.setex(`${REDIS_REG_PREFIX}${normalizedEmail}`, ttlSeconds, JSON.stringify(payload));
    } catch {}
  }
}

export async function getPendingRegistration(email: string): Promise<PendingRegistration | null> {
  const normalizedEmail = email.toLowerCase().trim();

  if (redis.status === 'ready') {
    try {
      const raw = await redis.get(`${REDIS_REG_PREFIX}${normalizedEmail}`);
      if (raw) {
        return JSON.parse(raw) as PendingRegistration;
      }
    } catch {}
  }

  const item = memoryPending.get(normalizedEmail);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    memoryPending.delete(normalizedEmail);
    return null;
  }
  return item;
}

export async function verifyAndConsumeCode(
  email: string,
  inputCode: string
): Promise<{ data?: PendingRegistration; error?: string; success: boolean }> {
  const normalizedEmail = email.toLowerCase().trim();
  const cleanCode = String(inputCode).trim();
  const item = await getPendingRegistration(normalizedEmail);

  if (!item || Date.now() > item.expiresAt) {
    await deletePendingRegistration(normalizedEmail);
    return { error: 'El código ha expirado o no existe. Inicia el registro de nuevo.', success: false };
  }

  if (item.attempts >= MAX_ATTEMPTS) {
    await deletePendingRegistration(normalizedEmail);
    return { error: 'Has superado el número máximo de intentos permitidos. Inicia el registro de nuevo.', success: false };
  }

  if (item.code !== cleanCode) {
    item.attempts += 1;
    memoryPending.set(normalizedEmail, item);
    if (redis.status === 'ready') {
      try {
        const remainingTtl = Math.max(1, Math.floor((item.expiresAt - Date.now()) / 1000));
        await redis.setex(`${REDIS_REG_PREFIX}${normalizedEmail}`, remainingTtl, JSON.stringify(item));
      } catch {}
    }
    const remaining = MAX_ATTEMPTS - item.attempts;
    return {
      error: `Código incorrecto. Te quedan ${remaining} ${remaining === 1 ? 'intento' : 'intentos'}.`,
      success: false,
    };
  }

  await deletePendingRegistration(normalizedEmail);
  return { data: item, success: true };
}

export async function deletePendingRegistration(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  memoryPending.delete(normalizedEmail);
  if (redis.status === 'ready') {
    try {
      await redis.del(`${REDIS_REG_PREFIX}${normalizedEmail}`);
    } catch {}
  }
}

export async function saveEmailChangeCode(
  userId: string,
  currentEmail: string,
  code: string,
  ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<void> {
  const now = Date.now();
  const payload: EmailChangeCodePayload = {
    attempts: 0,
    code: code.trim(),
    createdAt: now,
    currentEmail: currentEmail.toLowerCase().trim(),
    expiresAt: now + ttlSeconds * 1000,
    lastSentAt: now,
    userId,
  };

  memoryEmailCodes.set(userId, payload);
  if (redis.status === 'ready') {
    try {
      await redis.setex(`${REDIS_EMAIL_PREFIX}${userId}`, ttlSeconds, JSON.stringify(payload));
    } catch {}
  }
}

export async function getEmailChangeCode(userId: string): Promise<EmailChangeCodePayload | null> {
  let item = memoryEmailCodes.get(userId);

  if (redis.status === 'ready') {
    try {
      const raw = await redis.get(`${REDIS_EMAIL_PREFIX}${userId}`);
      if (raw) {
        item = JSON.parse(raw) as EmailChangeCodePayload;
      }
    } catch {}
  }

  if (!item) return null;

  if (Date.now() > item.expiresAt || item.attempts >= MAX_ATTEMPTS) {
    await deleteEmailChangeCode(userId);
    return null;
  }

  return item;
}

export async function updateEmailChangeCodeLastSent(
  userId: string,
  lastSentAt = Date.now()
): Promise<boolean> {
  const item = await getEmailChangeCode(userId);
  if (!item) return false;

  item.lastSentAt = lastSentAt;
  memoryEmailCodes.set(userId, item);
  if (redis.status === 'ready') {
    try {
      const remainingTtl = Math.max(1, Math.floor((item.expiresAt - Date.now()) / 1000));
      await redis.setex(`${REDIS_EMAIL_PREFIX}${userId}`, remainingTtl, JSON.stringify(item));
    } catch {}
  }
  return true;
}

export const touchEmailChangeCodeSentAt = updateEmailChangeCodeLastSent;

export async function deleteEmailChangeCode(userId: string): Promise<void> {
  memoryEmailCodes.delete(userId);
  if (redis.status === 'ready') {
    try {
      await redis.del(`${REDIS_EMAIL_PREFIX}${userId}`);
    } catch {}
  }
}

export async function verifyEmailChangeCode(
  userId: string,
  inputCode: string
): Promise<{ error?: string; success: boolean; token?: string }> {
  const cleanInput = String(inputCode).trim();
  let item = memoryEmailCodes.get(userId);

  if (redis.status === 'ready') {
    try {
      const raw = await redis.get(`${REDIS_EMAIL_PREFIX}${userId}`);
      if (raw) {
        item = JSON.parse(raw) as EmailChangeCodePayload;
      }
    } catch {}
  }

  if (!item || Date.now() > item.expiresAt) {
    await deleteEmailChangeCode(userId);
    return {
      error: 'El código de verificación ha expirado o no existe. Solicita uno nuevo.',
      success: false,
    };
  }

  if (item.attempts >= MAX_ATTEMPTS) {
    await deleteEmailChangeCode(userId);
    return {
      error: 'Demasiados intentos fallidos. El código ha sido invalidado. Solicita uno nuevo.',
      success: false,
    };
  }

  if (item.code !== cleanInput) {
    item.attempts += 1;
    if (item.attempts >= MAX_ATTEMPTS) {
      await deleteEmailChangeCode(userId);
      return {
        error: 'Demasiados intentos fallidos. El código ha sido invalidado. Solicita uno nuevo.',
        success: false,
      };
    }
    memoryEmailCodes.set(userId, item);
    if (redis.status === 'ready') {
      try {
        const remainingTtl = Math.max(1, Math.floor((item.expiresAt - Date.now()) / 1000));
        await redis.setex(`${REDIS_EMAIL_PREFIX}${userId}`, remainingTtl, JSON.stringify(item));
      } catch {}
    }
    const remaining = MAX_ATTEMPTS - item.attempts;
    return {
      error: `Código incorrecto. Te quedan ${remaining} ${remaining === 1 ? 'intento' : 'intentos'}.`,
      success: false,
    };
  }

  await deleteEmailChangeCode(userId);
  if (redis.status === 'ready') {
    try {
      await redis.setex(`${REDIS_AUTH_PREFIX}${userId}`, 300, '1');
    } catch {}
  }
  memoryEmailAuth.set(userId, Date.now() + 300 * 1000);
  return { success: true, token: 'authorized' };
}

export async function isEmailChangeAuthorized(userId: string): Promise<boolean> {
  if (redis.status === 'ready') {
    try {
      const auth = await redis.get(`${REDIS_AUTH_PREFIX}${userId}`);
      if (auth) return true;
    } catch {}
  }
  const expiresAt = memoryEmailAuth.get(userId);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    memoryEmailAuth.delete(userId);
    return false;
  }
  return true;
}

export async function consumeEmailChangeAuthorization(
  userId: string
): Promise<{ error?: string; valid: boolean }> {
  const isAuth = await isEmailChangeAuthorized(userId);
  if (!isAuth) {
    return {
      error: 'La autorización de 5 minutos para cambiar de correo ha expirado. Por favor verifica tu código de nuevo.',
      valid: false,
    };
  }
  memoryEmailAuth.delete(userId);
  if (redis.status === 'ready') {
    try {
      await redis.del(`${REDIS_AUTH_PREFIX}${userId}`);
    } catch {}
  }
  return { valid: true };
}

export async function savePasswordResetToken(
  email: string,
  userId: string,
  token: string,
  ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<void> {
  const key = token.trim();
  const now = Date.now();
  const payload: PasswordResetPayload = {
    createdAt: now,
    email: email.toLowerCase().trim(),
    expiresAt: now + ttlSeconds * 1000,
    userId,
  };

  memoryPasswordReset.set(key, payload);
  if (redis.status === 'ready') {
    try {
      await redis.setex(`${REDIS_RESET_PREFIX}${key}`, ttlSeconds, JSON.stringify(payload));
    } catch {}
  }
}

export async function verifyPasswordResetToken(
  token: string
): Promise<{ email?: string; error?: string; userId?: string; valid: boolean }> {
  if (!token || typeof token !== 'string' || !token.trim()) {
    return { error: 'Token de recuperación no proporcionado o inválido.', valid: false };
  }

  const key = token.trim();
  let payload: PasswordResetPayload | undefined = memoryPasswordReset.get(key);

  if (redis.status === 'ready') {
    try {
      const raw = await redis.get(`${REDIS_RESET_PREFIX}${key}`);
      if (raw) {
        payload = JSON.parse(raw) as PasswordResetPayload;
      }
    } catch {}
  }

  if (!payload || Date.now() > payload.expiresAt) {
    await consumePasswordResetToken(key);
    return { error: 'El enlace de recuperación ha expirado o no es válido.', valid: false };
  }

  return { email: payload.email, userId: payload.userId, valid: true };
}

export async function consumePasswordResetToken(
  token: string
): Promise<{ email?: string; error?: string; success: boolean; userId?: string }> {
  if (!token || typeof token !== 'string' || !token.trim()) {
    return { error: 'Token de recuperación no proporcionado o inválido.', success: false };
  }

  const key = token.trim();
  let payload: PasswordResetPayload | undefined = memoryPasswordReset.get(key);

  if (redis.status === 'ready') {
    try {
      const raw = await redis.get(`${REDIS_RESET_PREFIX}${key}`);
      if (raw) {
        payload = JSON.parse(raw) as PasswordResetPayload;
      }
      await redis.del(`${REDIS_RESET_PREFIX}${key}`);
    } catch {}
  }

  memoryPasswordReset.delete(key);

  if (!payload || Date.now() > payload.expiresAt) {
    return {
      error: 'El enlace de recuperación ha expirado o ya ha sido utilizado. Solicita uno nuevo.',
      success: false,
    };
  }

  return { email: payload.email, success: true, userId: payload.userId };
}

export async function savePasswordChangeAuth(userId: string, ttlSeconds = 300): Promise<void> {
  memoryPasswordAuth.set(userId, Date.now() + ttlSeconds * 1000);
  if (redis.status === 'ready') {
    try {
      await redis.setex(`${REDIS_PWDAUTH_PREFIX}${userId}`, ttlSeconds, '1');
    } catch {}
  }
}

export async function isPasswordChangeAuthorized(userId: string): Promise<boolean> {
  if (redis.status === 'ready') {
    try {
      const auth = await redis.get(`${REDIS_PWDAUTH_PREFIX}${userId}`);
      if (auth) return true;
    } catch {}
  }
  const expiresAt = memoryPasswordAuth.get(userId);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    memoryPasswordAuth.delete(userId);
    return false;
  }
  return true;
}

export async function consumePasswordChangeAuth(userId: string): Promise<{ error?: string; valid: boolean }> {
  const isAuth = await isPasswordChangeAuthorized(userId);
  if (!isAuth) {
    return {
      error: 'La autorización de 5 minutos para cambiar la contraseña ha expirado. Por favor confirma tu identidad de nuevo.',
      valid: false,
    };
  }
  memoryPasswordAuth.delete(userId);
  if (redis.status === 'ready') {
    try {
      await redis.del(`${REDIS_PWDAUTH_PREFIX}${userId}`);
    } catch {}
  }
  return { valid: true };
}
