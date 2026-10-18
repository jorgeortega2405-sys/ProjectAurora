import { redis } from '../config/redis.config.js';
import { logger } from './logger.service.js';

export interface StoredTempFile {
  buffer: Buffer;
  contentType: string;
  createdAt: number;
  filename: string;
  [key: string]: any;
}

const memoryStore = new Map<string, StoredTempFile>();
const PREFIX_META = 'tempfile:meta:';
const PREFIX_DATA = 'tempfile:data:';
export const DEFAULT_TTL_SECONDS = 60 * 60;

setInterval(() => {
  const now = Date.now();
  const maxAgeMs = DEFAULT_TTL_SECONDS * 1000;
  for (const [key, item] of memoryStore.entries()) {
    if (now - item.createdAt > maxAgeMs) {
      memoryStore.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

export async function storeTempFile(
  token: string,
  file: StoredTempFile,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  if (!file.createdAt) {
    file.createdAt = Date.now();
  }
  if (!file.fileSize && file.buffer) {
    file.fileSize = file.buffer.length;
  }
  if (!file.size && file.buffer) {
    file.size = file.buffer.length;
  }
  memoryStore.set(token, file);

  if (redis.status === 'ready') {
    try {
      const { buffer, ...meta } = file;
      const metaKey = `${PREFIX_META}${token}`;
      const dataKey = `${PREFIX_DATA}${token}`;

      await Promise.all([
        redis.set(metaKey, JSON.stringify(meta), 'EX', ttlSeconds),
        redis.set(dataKey, buffer, 'EX', ttlSeconds),
      ]);
      return;
    } catch (err) {
      logger.db.warn('Error al guardar archivo temporal en Redis, usando memoria local', err);
    }
  }
}

export async function getTempFile<T extends StoredTempFile = StoredTempFile>(
  token: string
): Promise<T | null> {
  if (redis.status === 'ready') {
    try {
      const metaKey = `${PREFIX_META}${token}`;
      const dataKey = `${PREFIX_DATA}${token}`;

      const [rawMeta, buffer] = await Promise.all([
        redis.get(metaKey),
        redis.getBuffer(dataKey),
      ]);

      if (rawMeta && buffer) {
        const meta = JSON.parse(rawMeta);
        return {
          ...meta,
          buffer,
        } as T;
      }
    } catch (err) {
      logger.db.warn('Error al recuperar archivo temporal de Redis, consultando memoria local', err);
    }
  }

  const local = memoryStore.get(token);
  return (local as T) || null;
}

export async function getTempFileMeta(token: string): Promise<Omit<StoredTempFile, 'buffer'> | null> {
  if (redis.status === 'ready') {
    try {
      const metaKey = `${PREFIX_META}${token}`;
      const rawMeta = await redis.get(metaKey);
      if (rawMeta) {
        return JSON.parse(rawMeta);
      }
    } catch (err) {
      logger.db.warn('Error al recuperar metadatos de archivo temporal de Redis', err);
    }
  }

  const local = memoryStore.get(token);
  if (local) {
    const { buffer, ...meta } = local;
    return meta;
  }
  return null;
}

export async function deleteTempFile(token: string): Promise<void> {
  memoryStore.delete(token);

  if (redis.status === 'ready') {
    try {
      await Promise.all([
        redis.del(`${PREFIX_META}${token}`),
        redis.del(`${PREFIX_DATA}${token}`),
      ]);
    } catch (err) {
      logger.db.warn('Error al eliminar archivo temporal en Redis', err);
    }
  }
}
