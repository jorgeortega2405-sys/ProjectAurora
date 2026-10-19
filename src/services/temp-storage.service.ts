import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { redis } from '../config/redis.config.js';
import { ensureBucketExists, isS3Configured, S3_BUCKET_NAME, s3Client } from '../config/s3.config.js';
import { logger } from './logger.service.js';

export interface StoredTempFile {
  buffer: Buffer;
  contentType: string;
  createdAt: number;
  filename: string;
  [key: string]: any;
}

export interface StoredTempFileMeta {
  contentType: string;
  createdAt: number;
  filename: string;
  fileSize?: number;
  size?: number;
  [key: string]: any;
}

export interface TempFileStreamResult {
  contentType: string;
  fileSize: number;
  filename: string;
  stream: Readable;
}

const memoryStore = new Map<string, StoredTempFile>();
const memoryMetaStore = new Map<string, StoredTempFileMeta>();
const PREFIX_META = 'tempfile:meta:';
export const DEFAULT_TTL_SECONDS = 60 * 60;

const TEMP_STORAGE_DIR = path.resolve(process.cwd(), 'temp_storage');
if (!fs.existsSync(TEMP_STORAGE_DIR)) {
  try {
    fs.mkdirSync(TEMP_STORAGE_DIR, { recursive: true });
  } catch {}
}

setInterval(() => {
  const now = Date.now();
  const maxAgeMs = DEFAULT_TTL_SECONDS * 1000;

  for (const [key, item] of memoryStore.entries()) {
    if (now - item.createdAt > maxAgeMs) {
      memoryStore.delete(key);
    }
  }

  for (const [key, item] of memoryMetaStore.entries()) {
    if (now - item.createdAt > maxAgeMs) {
      memoryMetaStore.delete(key);
    }
  }

  if (fs.existsSync(TEMP_STORAGE_DIR)) {
    try {
      const files = fs.readdirSync(TEMP_STORAGE_DIR);
      for (const file of files) {
        const fullPath = path.join(TEMP_STORAGE_DIR, file);
        try {
          const stats = fs.statSync(fullPath);
          if (now - stats.mtimeMs > maxAgeMs) {
            fs.unlinkSync(fullPath);
          }
        } catch {}
      }
    } catch {}
  }
}, 5 * 60 * 1000).unref();

function buildS3Key(token: string): string {
  return `temp/${token}`;
}

function getLocalBinPath(token: string): string {
  return path.join(TEMP_STORAGE_DIR, `${token}.bin`);
}

function getLocalMetaPath(token: string): string {
  return path.join(TEMP_STORAGE_DIR, `${token}.meta.json`);
}

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

  const { buffer, ...meta } = file;
  memoryMetaStore.set(token, meta);

  if (redis.status === 'ready') {
    try {
      await redis.set(`${PREFIX_META}${token}`, JSON.stringify(meta), 'EX', ttlSeconds);
    } catch {}
  }

  if (isS3Configured()) {
    const isReady = await ensureBucketExists();
    if (isReady) {
      try {
        const s3Key = buildS3Key(token);
        const metadata: Record<string, string> = {
          createdat: String(file.createdAt),
          filename: encodeURIComponent(file.filename || 'documento.pdf'),
          ttlseconds: String(ttlSeconds),
        };
        if (file.contentType) {
          metadata.contenttype = file.contentType;
        }

        await s3Client.send(
          new PutObjectCommand({
            Body: buffer,
            Bucket: S3_BUCKET_NAME,
            ContentType: file.contentType || 'application/octet-stream',
            Key: s3Key,
            Metadata: metadata,
          })
        );
        return;
      } catch (err) {
        logger.db.warn('Error al guardar archivo temporal en S3, recurriendo a disco local', err);
      }
    }
  }

  try {
    const binPath = getLocalBinPath(token);
    const metaPath = getLocalMetaPath(token);
    await fs.promises.writeFile(binPath, buffer);
    await fs.promises.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    return;
  } catch (diskErr) {
    logger.db.warn('Error al escribir archivo temporal en disco local, usando memoria volátil', diskErr);
    memoryStore.set(token, file);
  }
}

export async function getTempFile<T extends StoredTempFile = StoredTempFile>(
  token: string
): Promise<T | null> {
  const meta = await getTempFileMeta(token);
  if (meta && meta.createdAt) {
    const now = Date.now();
    const ttlMs = (meta.ttlSeconds || DEFAULT_TTL_SECONDS) * 1000;
    if (now - meta.createdAt > ttlMs) {
      await deleteTempFile(token);
      return null;
    }
  }

  if (isS3Configured()) {
    try {
      const s3Key = buildS3Key(token);
      const res = await s3Client.send(
        new GetObjectCommand({
          Bucket: S3_BUCKET_NAME,
          Key: s3Key,
        })
      );

      if (res.Body) {
        const byteArray = await res.Body.transformToByteArray();
        const buffer = Buffer.from(byteArray);
        const resolvedMeta = meta || {
          contentType: res.ContentType || 'application/octet-stream',
          createdAt: Number(res.Metadata?.createdat || Date.now()),
          filename: res.Metadata?.filename ? decodeURIComponent(res.Metadata.filename) : 'documento.pdf',
        };

        return {
          ...resolvedMeta,
          buffer,
          fileSize: buffer.length,
          size: buffer.length,
        } as unknown as T;
      }
    } catch (err: any) {
      const isNotFound = err?.$metadata?.httpStatusCode === 404 || err?.name === 'NoSuchKey';
      if (!isNotFound) {
        logger.db.warn('Error al recuperar archivo temporal de S3, verificando almacenamiento local', err);
      }
    }
  }

  const binPath = getLocalBinPath(token);
  if (fs.existsSync(binPath)) {
    try {
      const buffer = await fs.promises.readFile(binPath);
      const resolvedMeta = meta || {
        contentType: 'application/pdf',
        createdAt: Date.now(),
        filename: 'documento.pdf',
      };

      return {
        ...resolvedMeta,
        buffer,
        fileSize: buffer.length,
        size: buffer.length,
      } as unknown as T;
    } catch (err) {
      logger.db.warn('Error al leer archivo temporal desde disco local', err);
    }
  }

  const local = memoryStore.get(token);
  return (local as unknown as T) || null;
}

export async function getTempFileStream(token: string): Promise<TempFileStreamResult | null> {
  const meta = await getTempFileMeta(token);
  if (meta && meta.createdAt) {
    const now = Date.now();
    const ttlMs = (meta.ttlSeconds || DEFAULT_TTL_SECONDS) * 1000;
    if (now - meta.createdAt > ttlMs) {
      await deleteTempFile(token);
      return null;
    }
  }

  if (isS3Configured()) {
    try {
      const s3Key = buildS3Key(token);
      const res = await s3Client.send(
        new GetObjectCommand({
          Bucket: S3_BUCKET_NAME,
          Key: s3Key,
        })
      );

      if (res.Body) {
        const stream = res.Body as Readable;
        const resolvedFilename = meta?.filename || (res.Metadata?.filename ? decodeURIComponent(res.Metadata.filename) : 'documento.pdf');
        const resolvedContentType = res.ContentType || meta?.contentType || 'application/octet-stream';
        const resolvedSize = res.ContentLength || meta?.fileSize || meta?.size || 0;

        return {
          contentType: resolvedContentType,
          fileSize: resolvedSize,
          filename: resolvedFilename,
          stream,
        };
      }
    } catch (err: any) {
      const isNotFound = err?.$metadata?.httpStatusCode === 404 || err?.name === 'NoSuchKey';
      if (!isNotFound) {
        logger.db.warn('Error al obtener stream de S3', err);
      }
    }
  }

  const binPath = getLocalBinPath(token);
  if (fs.existsSync(binPath)) {
    try {
      const stats = fs.statSync(binPath);
      const stream = fs.createReadStream(binPath);
      const resolvedFilename = meta?.filename || 'documento.pdf';
      const resolvedContentType = meta?.contentType || 'application/pdf';

      return {
        contentType: resolvedContentType,
        fileSize: stats.size,
        filename: resolvedFilename,
        stream,
      };
    } catch (err) {
      logger.db.warn('Error al crear stream de lectura desde disco local', err);
    }
  }

  const fallbackFile = await getTempFile(token);
  if (fallbackFile && fallbackFile.buffer) {
    const stream = Readable.from(fallbackFile.buffer);
    return {
      contentType: fallbackFile.contentType || 'application/octet-stream',
      fileSize: fallbackFile.buffer.length,
      filename: fallbackFile.filename || 'documento.pdf',
      stream,
    };
  }

  return null;
}

export async function getTempFileMeta(token: string): Promise<StoredTempFileMeta | null> {
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

  const memoryMeta = memoryMetaStore.get(token);
  if (memoryMeta) {
    return memoryMeta;
  }

  const metaPath = getLocalMetaPath(token);
  if (fs.existsSync(metaPath)) {
    try {
      const raw = await fs.promises.readFile(metaPath, 'utf-8');
      return JSON.parse(raw);
    } catch {}
  }

  const local = memoryStore.get(token);
  if (local) {
    const { buffer, ...meta } = local;
    return meta;
  }

  if (isS3Configured()) {
    try {
      const s3Key = buildS3Key(token);
      const head = await s3Client.send(
        new HeadObjectCommand({
          Bucket: S3_BUCKET_NAME,
          Key: s3Key,
        })
      );

      const filename = head.Metadata?.filename ? decodeURIComponent(head.Metadata.filename) : 'documento.pdf';
      const createdAt = head.Metadata?.createdat ? Number(head.Metadata.createdat) : Date.now();
      const ttlSeconds = head.Metadata?.ttlseconds ? Number(head.Metadata.ttlseconds) : DEFAULT_TTL_SECONDS;

      return {
        contentType: head.ContentType || 'application/octet-stream',
        createdAt,
        fileSize: head.ContentLength || 0,
        filename,
        size: head.ContentLength || 0,
        ttlSeconds,
      };
    } catch {}
  }

  return null;
}

export async function getTempFilePresignedUrl(token: string, expiresInSeconds: number = DEFAULT_TTL_SECONDS): Promise<string | null> {
  if (!isS3Configured()) {
    return null;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: buildS3Key(token),
    });
    return await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
  } catch (err) {
    logger.db.warn('Error al generar URL prefirmada S3', err);
    return null;
  }
}

export async function deleteTempFile(token: string): Promise<void> {
  memoryStore.delete(token);
  memoryMetaStore.delete(token);

  if (isS3Configured()) {
    try {
      const s3Key = buildS3Key(token);
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: S3_BUCKET_NAME,
          Key: s3Key,
        })
      );
    } catch (err) {
      logger.db.warn('Error al eliminar archivo temporal en S3', err);
    }
  }

  const binPath = getLocalBinPath(token);
  const metaPath = getLocalMetaPath(token);
  try {
    if (fs.existsSync(binPath)) fs.unlinkSync(binPath);
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
  } catch {}

  if (redis.status === 'ready') {
    try {
      await redis.del(`${PREFIX_META}${token}`);
    } catch (err) {
      logger.db.warn('Error al eliminar metadatos de archivo temporal en Redis', err);
    }
  }
}
