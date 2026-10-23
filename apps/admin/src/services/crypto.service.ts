import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { adminConfig } from '../config/env.config.js';
import { logger } from './logger.service.js';

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

const PREFIX = 'v1:enc:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const rawKey = adminConfig.sessionSecret || 'aurora_encryption_key_default';
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  }
  return crypto.createHash('sha256').update(rawKey).digest();
}

export function isEncrypted(value?: string | null): boolean {
  if (!value || typeof value !== 'string') return false;
  return value.startsWith(PREFIX);
}

export function encryptAtRest(plainText: string): string {
  if (!plainText || typeof plainText !== 'string') return plainText;
  if (isEncrypted(plainText)) return plainText;

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `${PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (err) {
    logger.security.error('Error al cifrar datos en reposo', err);
    throw new Error('Error al procesar cifrado de seguridad.');
  }
}

export function decryptAtRest(cipherText: string): string {
  if (!isEncrypted(cipherText)) return cipherText;

  try {
    const key = getEncryptionKey();
    const payload = cipherText.substring(PREFIX.length);
    const parts = payload.split(':');
    if (parts.length !== 3) {
      throw new Error('Formato de texto cifrado no válido.');
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    logger.security.error('Error al descifrar datos en reposo', err);
    throw new Error('Error al procesar descifrado de seguridad.');
  }
}
