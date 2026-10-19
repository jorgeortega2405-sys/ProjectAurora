import { CreateBucketCommand, HeadBucketCommand, PutBucketLifecycleConfigurationCommand, S3Client, S3ClientConfig } from '@aws-sdk/client-s3';
import fs from 'fs';
import { logger } from '../services/logger.service.js';
import { config } from './env.config.js';

const isDocker = fs.existsSync('/.dockerenv');

function resolveS3Endpoint(): string | undefined {
  if (!config.s3.endpoint || config.s3.endpoint.trim().length === 0) {
    return undefined;
  }
  const raw = config.s3.endpoint.trim();
  if (isDocker && (raw.includes('127.0.0.1') || raw.includes('localhost'))) {
    return raw.replace('127.0.0.1', 'aurora-minio').replace('localhost', 'aurora-minio');
  }
  return raw;
}

const clientConfig: S3ClientConfig = {
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
  forcePathStyle: config.s3.forcePathStyle,
  region: config.s3.region,
};

const resolvedEndpoint = resolveS3Endpoint();
if (resolvedEndpoint) {
  clientConfig.endpoint = resolvedEndpoint;
}

export const s3Client = new S3Client(clientConfig);
export const S3_BUCKET_NAME = config.s3.bucket;

let isBucketReady = false;

export function isS3Configured(): boolean {
  return Boolean(config.s3.accessKeyId && config.s3.secretAccessKey && config.s3.bucket);
}

export async function ensureBucketExists(): Promise<boolean> {
  if (isBucketReady) {
    return true;
  }

  if (!isS3Configured()) {
    return false;
  }

  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET_NAME }));
    isBucketReady = true;
    logger.db.info(`Bucket S3/MinIO "${S3_BUCKET_NAME}" verificado y disponible.`);
    return true;
  } catch (err: any) {
    const isNotFound = err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound' || err?.name === 'NoSuchBucket';
    if (isNotFound) {
      try {
        await s3Client.send(new CreateBucketCommand({ Bucket: S3_BUCKET_NAME }));
        isBucketReady = true;
        logger.db.info(`Bucket S3/MinIO "${S3_BUCKET_NAME}" creado exitosamente.`);

        try {
          await s3Client.send(
            new PutBucketLifecycleConfigurationCommand({
              Bucket: S3_BUCKET_NAME,
              LifecycleConfiguration: {
                Rules: [
                  {
                    Expiration: { Days: 1 },
                    Filter: { Prefix: 'temp/' },
                    ID: 'AutoDeleteTempFiles',
                    Status: 'Enabled',
                  },
                ],
              },
            })
          );
          logger.db.info('Regla de ciclo de vida (Lifecycle Rule) configurada en bucket S3/MinIO.');
        } catch (lifecycleErr) {
          logger.db.warn('No se pudo aplicar la regla de ciclo de vida en S3/MinIO', lifecycleErr);
        }

        return true;
      } catch (createErr) {
        logger.db.warn(`No se pudo crear automáticamente el bucket S3/MinIO "${S3_BUCKET_NAME}"`, createErr);
        return false;
      }
    }

    logger.db.warn(`Aviso de conexión al verificar bucket S3/MinIO "${S3_BUCKET_NAME}"`, err);
    return false;
  }
}
