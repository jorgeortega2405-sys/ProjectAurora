import crypto from 'crypto';
import { config } from '../config/env.config.js';
import { logger } from './logger.service.js';

const PREFIX = 'v1:enc:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const rawKey = config.sessionSecret || 'aurora_encryption_key_default';
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

export function decryptAtRest(cipherText?: string | null): string {
  if (!cipherText || typeof cipherText !== 'string') return '';
  if (!isEncrypted(cipherText)) return cipherText;

  try {
    const parts = cipherText.split(':');
    if (parts.length !== 5) return cipherText;

    const iv = Buffer.from(parts[2], 'hex');
    const authTag = Buffer.from(parts[3], 'hex');
    const encryptedHex = parts[4];
    const key = getEncryptionKey();

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    logger.security.error('Error al descifrar datos en reposo', err);
    return '';
  }
}
