import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import type { RowDataPacket } from 'mysql2';
import path from 'path';
import { pool } from '../config/database.config.js';
import { redis } from '../config/redis.config.js';
import { ensureBucketExists, isS3Configured, S3_BUCKET_NAME, s3Client } from '../config/s3.config.js';
import { validatePassword } from '../utils/validators.util.js';
import { hashPassword, verifyPassword } from './crypto.service.js';
import { logger } from './logger.service.js';
import { sendEmailChangeCodeEmail } from './mail.service.js';
import { findUserByEmail, findUserById, findUserByUsername, unlinkUserGoogle, updateUserAvatar, updateUserEmail, updateUserPassword, updateUserUsername } from './user.service.js';
import { consumeEmailChangeAuthorization, consumePasswordChangeAuth, generateSixDigitCode, getEmailChangeCode, isEmailChangeAuthorized, saveEmailChangeCode, savePasswordChangeAuth, updateEmailChangeCodeLastSent, verifyEmailChangeCode } from './verification.service.js';

export interface UserPreferences {
  extended_alerts: boolean;
  high_contrast: boolean;
  language: string;
  open_links_new_tab: boolean;
  reduce_motion: boolean;
  telemetry: boolean;
  theme: string;
}

interface PreferenceRow extends RowDataPacket {
  extended_alerts: number | boolean;
  high_contrast: number | boolean;
  language: string;
  open_links_new_tab: number | boolean;
  reduce_motion: number | boolean;
  telemetry: number | boolean;
  theme: string;
  user_id: string;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  extended_alerts: false,
  high_contrast: false,
  language: 'es-MX',
  open_links_new_tab: true,
  reduce_motion: false,
  telemetry: false,
  theme: 'system',
};

const AVATARS_DIR = path.resolve(process.cwd(), 'public/uploads/avatars');

function ensureAvatarsDir(): void {
  if (!fs.existsSync(AVATARS_DIR)) {
    fs.mkdirSync(AVATARS_DIR, { recursive: true });
  }
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const [rows] = await pool.query<PreferenceRow[]>(
    'SELECT * FROM user_preferences WHERE user_id = ? LIMIT 1',
    [userId]
  );

  if (rows.length === 0) {
    return { ...DEFAULT_PREFERENCES };
  }

  const row = rows[0];
  return {
    extended_alerts: Boolean(row.extended_alerts),
    high_contrast: Boolean(row.high_contrast),
    language: row.language || DEFAULT_PREFERENCES.language,
    open_links_new_tab: Boolean(row.open_links_new_tab),
    reduce_motion: Boolean(row.reduce_motion),
    telemetry: Boolean(row.telemetry),
    theme: row.theme || DEFAULT_PREFERENCES.theme,
  };
}

export async function updateUserPreferences(
  userId: string,
  updates: Partial<UserPreferences>
): Promise<UserPreferences> {
  const current = await getUserPreferences(userId);
  const next: UserPreferences = {
    extended_alerts: updates.extended_alerts !== undefined ? Boolean(updates.extended_alerts) : current.extended_alerts,
    high_contrast: updates.high_contrast !== undefined ? Boolean(updates.high_contrast) : current.high_contrast,
    language: updates.language !== undefined ? String(updates.language).trim() : current.language,
    open_links_new_tab: updates.open_links_new_tab !== undefined ? Boolean(updates.open_links_new_tab) : current.open_links_new_tab,
    reduce_motion: updates.reduce_motion !== undefined ? Boolean(updates.reduce_motion) : current.reduce_motion,
    telemetry: updates.telemetry !== undefined ? Boolean(updates.telemetry) : current.telemetry,
    theme: updates.theme !== undefined ? String(updates.theme).toLowerCase() : current.theme,
  };

  const validThemes = ['system', 'light', 'dark'];
  if (!validThemes.includes(next.theme)) next.theme = 'system';

  await pool.query(
    `INSERT INTO user_preferences (user_id, theme, language, open_links_new_tab, telemetry, reduce_motion, high_contrast, extended_alerts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       theme = VALUES(theme),
       language = VALUES(language),
       open_links_new_tab = VALUES(open_links_new_tab),
       telemetry = VALUES(telemetry),
       reduce_motion = VALUES(reduce_motion),
       high_contrast = VALUES(high_contrast),
       extended_alerts = VALUES(extended_alerts)`,
    [
      userId,
      next.theme,
      next.language,
      next.open_links_new_tab ? 1 : 0,
      next.telemetry ? 1 : 0,
      next.reduce_motion ? 1 : 0,
      next.high_contrast ? 1 : 0,
      next.extended_alerts ? 1 : 0,
    ]
  );

  return next;
}

export async function deleteUserPreferences(userId: string): Promise<void> {
  await pool.query('DELETE FROM user_preferences WHERE user_id = ?', [userId]);
}

export async function updateAvatar(
  userId: string,
  file: Express.Multer.File
): Promise<{ avatar_url?: string; error?: string; success: boolean }> {
  if (!file) {
    return { error: 'No se ha subido ningún archivo.', success: false };
  }

  const maxBytes = 2 * 1024 * 1024;
  if (file.size > maxBytes) {
    return { error: 'La imagen no debe superar los 2 MB.', success: false };
  }

  const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!allowedMimes.includes(file.mimetype)) {
    return { error: 'Formato de imagen no compatible. Usa PNG, JPG o WEBP.', success: false };
  }

  const user = await findUserById(userId);
  if (!user) {
    return { error: 'Usuario no encontrado.', success: false };
  }

  ensureAvatarsDir();

  if (user.avatar_url && user.avatar_url.startsWith('/uploads/avatars/')) {
    const oldFileName = path.basename(user.avatar_url);
    const oldFilePath = path.join(AVATARS_DIR, oldFileName);
    try {
      if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
    } catch {}

    if (isS3Configured()) {
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: `avatars/${oldFileName}`,
          })
        );
      } catch (s3Err) {
        logger.db.warn('Error al eliminar avatar anterior de S3/MinIO', s3Err);
      }
    }

    if (redis.status === 'ready') {
      try {
        await Promise.all([
          redis.del(`avatar:file:${oldFileName}`),
          redis.del(`avatar:mime:${oldFileName}`),
        ]);
      } catch (err) {
        logger.db.warn('Error al eliminar avatar anterior de Redis', err);
      }
    }
  }

  const ext = file.mimetype.split('/')[1] === 'jpeg' ? 'jpg' : file.mimetype.split('/')[1] || 'png';
  const newFileName = `avatar_${userId}_${Date.now()}.${ext}`;
  const targetPath = path.join(AVATARS_DIR, newFileName);

  try {
    fs.writeFileSync(targetPath, file.buffer);
  } catch (err) {
    logger.app.error('Error al guardar avatar en disco', err);
    return { error: 'Error al guardar la imagen en el servidor.', success: false };
  }

  if (isS3Configured()) {
    try {
      await ensureBucketExists();
      await s3Client.send(
        new PutObjectCommand({
          Body: file.buffer,
          Bucket: S3_BUCKET_NAME,
          ContentType: file.mimetype,
          Key: `avatars/${newFileName}`,
        })
      );
    } catch (s3Err) {
      logger.db.warn('Error al persistir avatar en S3/MinIO', s3Err);
    }
  }

  if (redis.status === 'ready') {
    try {
      await Promise.all([
        redis.set(`avatar:file:${newFileName}`, file.buffer),
        redis.set(`avatar:mime:${newFileName}`, file.mimetype),
      ]);
    } catch (err) {
      logger.db.warn('Error al persistir avatar en Redis', err);
    }
  }

  const newAvatarUrl = `/uploads/avatars/${newFileName}`;
  await updateUserAvatar(userId, newAvatarUrl);

  return { avatar_url: newAvatarUrl, success: true };
}

export async function deleteAvatar(
  userId: string
): Promise<{ avatar_url: null; error?: string; success: boolean }> {
  const user = await findUserById(userId);
  if (!user) {
    return { avatar_url: null, error: 'Usuario no encontrado.', success: false };
  }

  if (user.avatar_url && user.avatar_url.startsWith('/uploads/avatars/')) {
    const oldFileName = path.basename(user.avatar_url);
    const oldFilePath = path.join(AVATARS_DIR, oldFileName);
    try {
      if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
    } catch {}

    if (isS3Configured()) {
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: `avatars/${oldFileName}`,
          })
        );
      } catch (s3Err) {
        logger.db.warn('Error al eliminar avatar de S3/MinIO', s3Err);
      }
    }

    if (redis.status === 'ready') {
      try {
        await Promise.all([
          redis.del(`avatar:file:${oldFileName}`),
          redis.del(`avatar:mime:${oldFileName}`),
        ]);
      } catch (err) {
        logger.db.warn('Error al eliminar avatar de Redis', err);
      }
    }
  }

  await updateUserAvatar(userId, null);
  return { avatar_url: null, success: true };
}

export async function updateUsername(
  userId: string,
  newUsername: string
): Promise<{ error?: string; status?: number; success: boolean; username?: string }> {
  const clean = newUsername.trim();
  if (clean.length < 3 || clean.length > 30) {
    return { error: 'El nombre de usuario debe tener entre 3 y 30 caracteres.', status: 400, success: false };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
    return { error: 'El nombre de usuario solo puede contener letras, números y guiones bajos.', status: 400, success: false };
  }

  const user = await findUserById(userId);
  if (!user) {
    return { error: 'Usuario no encontrado.', status: 404, success: false };
  }

  if (user.username.toLowerCase() === clean.toLowerCase()) {
    return { success: true, username: user.username };
  }

  const duplicate = await findUserByUsername(clean);
  if (duplicate && duplicate.id !== userId) {
    return { error: 'El nombre de usuario ya está en uso.', status: 409, success: false };
  }

  await updateUserUsername(userId, clean);
  return { success: true, username: clean };
}

const EMAIL_CODE_COOLDOWN_SECONDS = 60;
const EMAIL_CODE_TTL_SECONDS = 900;

const userLocks = new Map<string, Promise<void>>();

export async function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const previous = userLocks.get(userId) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  userLocks.set(userId, current);

  try {
    await previous.catch(() => {});
    return await fn();
  } finally {
    release();
    if (userLocks.get(userId) === current) {
      userLocks.delete(userId);
    }
  }
}

export async function requestEmailChangeCode(
  userId: string,
  isResend = true
): Promise<{ alreadyAuthorized?: boolean; codePending?: boolean; cooldownRemaining?: number; error?: string; retryAfter?: number; status?: number; success: boolean }> {
  return withUserLock(userId, async () => {
    const user = await findUserById(userId);
    if (!user) {
      return { error: 'Usuario no encontrado.', status: 404, success: false };
    }
    if (!user.email) {
      return { error: 'La cuenta no tiene un correo electrónico registrado.', status: 400, success: false };
    }

    const alreadyAuthorized = await isEmailChangeAuthorized(userId);
    if (alreadyAuthorized) {
      return { alreadyAuthorized: true, success: true };
    }

    const now = Date.now();
    const existing = await getEmailChangeCode(userId);

    if (existing) {
      if (isResend === false) {
        return { alreadyAuthorized: false, codePending: true, success: true };
      }

      const lastSent = existing.lastSentAt || existing.createdAt;
      const elapsedSeconds = Math.floor((now - lastSent) / 1000);

      if (elapsedSeconds < EMAIL_CODE_COOLDOWN_SECONDS) {
        const retryAfter = EMAIL_CODE_COOLDOWN_SECONDS - elapsedSeconds;
        return {
          cooldownRemaining: retryAfter,
          error: `Por favor espera ${retryAfter} segundos antes de solicitar otro código de verificación.`,
          retryAfter,
          status: 429,
          success: false,
        };
      }

      await updateEmailChangeCodeLastSent(userId, now);
      const remainingMinutes = Math.max(1, Math.ceil((existing.expiresAt - now) / 60000));

      try {
        await sendEmailChangeCodeEmail(user.email, user.username, existing.code, remainingMinutes);
        logger.app.info(`Código de verificación de email reutilizado para ${user.email}`);
      } catch (error) {
        logger.app.error('Error al reenviar correo de verificación para cambio de email', error);
        return { error: 'No se pudo enviar el correo de verificación. Intenta más tarde.', status: 500, success: false };
      }

      return { alreadyAuthorized: false, codePending: true, success: true };
    }

    const code = generateSixDigitCode();
    await saveEmailChangeCode(userId, user.email, code, EMAIL_CODE_TTL_SECONDS);
    logger.app.info(`Código de cambio de email generado para ${user.email}`);

    try {
      await sendEmailChangeCodeEmail(user.email, user.username, code, 15);
    } catch (error) {
      logger.app.error('Error al enviar correo de verificación para cambio de email', error);
      return { error: 'No se pudo enviar el correo de verificación. Intenta más tarde.', status: 500, success: false };
    }

    return { alreadyAuthorized: false, codePending: false, success: true };
  });
}

export async function verifyEmailChange(
  userId: string,
  code: string
): Promise<{ error?: string; status?: number; success: boolean; token?: string }> {
  if (!code || typeof code !== 'string' || !code.trim()) {
    return { error: 'El código de verificación es obligatorio.', status: 400, success: false };
  }

  const res = await verifyEmailChangeCode(userId, code.trim());
  if (!res.success) {
    return { error: res.error || 'Código incorrecto o expirado.', status: 400, success: false };
  }

  return { success: true, token: res.token };
}

export async function updateEmail(
  userId: string,
  newEmail: string
): Promise<{ email?: string; error?: string; status?: number; success: boolean }> {
  const auth = await consumeEmailChangeAuthorization(userId);
  if (!auth.valid) {
    return {
      error: auth.error || 'La autorización de 5 minutos para cambiar de correo ha expirado.',
      status: 403,
      success: false,
    };
  }

  const cleanEmail = newEmail.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { error: 'Por favor ingresa un correo electrónico válido.', status: 400, success: false };
  }

  const user = await findUserById(userId);
  if (!user) {
    return { error: 'Usuario no encontrado.', status: 404, success: false };
  }

  if (user.email.toLowerCase() === cleanEmail) {
    return { email: user.email, success: true };
  }

  const existing = await findUserByEmail(cleanEmail);
  if (existing && existing.id !== userId) {
    return { error: 'El correo electrónico ya está registrado.', status: 409, success: false };
  }

  await updateUserEmail(userId, cleanEmail);
  return { email: cleanEmail, success: true };
}

export async function getPasswordStatus(
  userId: string
): Promise<{ hasGoogle: boolean; hasPassword: boolean }> {
  const user = await findUserById(userId);
  if (!user) {
    return { hasGoogle: false, hasPassword: false };
  }
  return {
    hasGoogle: Boolean(user.google_id),
    hasPassword: Boolean(user.password_hash),
  };
}

export async function unlinkGoogle(
  userId: string
): Promise<{ error?: string; success: boolean }> {
  const user = await findUserById(userId);
  if (!user) {
    return { error: 'Usuario no encontrado.', success: false };
  }

  if (!user.password_hash) {
    return { error: 'Debes configurar una contraseña antes de desvincular Google.', success: false };
  }

  await unlinkUserGoogle(userId);
  return { success: true };
}

export async function verifyCurrentPassword(
  userId: string,
  currentPassword: string
): Promise<{ error?: string; status?: number; success: boolean }> {
  if (!currentPassword || typeof currentPassword !== 'string' || !currentPassword.trim()) {
    return { error: 'Por favor ingresa tu contraseña actual.', status: 400, success: false };
  }

  const user = await findUserById(userId);
  if (!user) {
    return { error: 'Usuario no encontrado.', status: 404, success: false };
  }

  if (!user.password_hash) {
    return {
      error: 'Esta cuenta no tiene una contraseña configurada.',
      status: 400,
      success: false,
    };
  }

  const isMatch = await verifyPassword(currentPassword, user.password_hash);
  if (!isMatch) {
    logger.security.warn('Fallo de verificación de contraseña actual en settings', { userId });
    return { error: 'La contraseña actual es incorrecta.', status: 400, success: false };
  }

  await savePasswordChangeAuth(userId, 300);
  logger.security.info('Contraseña actual verificada exitosamente para cambio de contraseña', { userId });
  return { success: true };
}

export async function updateUserPasswordFromSettings(
  userId: string,
  newPassword: string
): Promise<{ error?: string; status?: number; success: boolean }> {
  const user = await findUserById(userId);
  if (!user) {
    return { error: 'Usuario no encontrado.', status: 404, success: false };
  }

  const authValidation = await consumePasswordChangeAuth(userId);
  if (!authValidation.valid) {
    return {
      error: authValidation.error || 'La autorización de 5 minutos para cambiar la contraseña ha expirado. Por favor confirma tu identidad de nuevo.',
      status: 403,
      success: false,
    };
  }

  const validation = validatePassword(newPassword);
  if (!validation.valid) {
    return { error: validation.error || 'Contraseña inválida.', status: 400, success: false };
  }

  if (user.password_hash) {
    const isSame = await verifyPassword(newPassword, user.password_hash);
    if (isSame) {
      return { error: 'La nueva contraseña no puede ser igual a la actual.', status: 400, success: false };
    }
  }

  const hash = await hashPassword(newPassword);
  await updateUserPassword(userId, hash);
  logger.security.info('Contraseña actualizada exitosamente desde settings', { userId });

  return { success: true };
}
