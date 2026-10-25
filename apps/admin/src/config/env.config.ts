import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();
const localEnvPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}
const adminEnvPath = path.resolve(import.meta.dirname, '../../.env');
if (fs.existsSync(adminEnvPath)) {
  dotenv.config({ path: adminEnvPath });
}

export const adminConfig = {
  appName: process.env.ADMIN_APP_NAME || 'ProjectAurora Admin',
  baseUrl: process.env.ADMIN_BASE_URL || 'http://localhost:3005',
  cassandra: {
    host: process.env.CASSANDRA_HOST || '127.0.0.1',
    keyspace: process.env.CASSANDRA_KEYSPACE || 'aurora_telemetry',
    port: parseInt(process.env.CASSANDRA_PORT || '9042', 10),
  },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    name: process.env.DB_NAME || 'db_aurora',
    password: process.env.DB_PASSWORD || 'aurora_password',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'aurora_user',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
  },
  nodeEnv: process.env.NODE_ENV || 'development',
  originProtection: {
    enforceCloudflare: process.env.ENFORCE_CLOUDFLARE_ORIGIN === 'true',
    secret: process.env.CLOUDFLARE_ORIGIN_SECRET || '',
  },
  port: parseInt(process.env.ADMIN_PORT || '3005', 10),
  publicBaseUrl: process.env.BASE_URL || 'http://localhost:3000',
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    password: process.env.REDIS_PASSWORD || undefined,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  s3: {
    accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
    bucket: process.env.S3_BUCKET_NAME || 'aurora-storage',
    endpoint: process.env.S3_ENDPOINT || 'http://127.0.0.1:9000',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    region: process.env.S3_REGION || 'us-east-1',
    secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin',
  },
  sessionSecret: process.env.SESSION_SECRET || 'aurora_session_secret_key_2026',
  smtp: {
    fromEmail: process.env.SMTP_FROM_EMAIL || 'soporte@projectaurora.com',
    fromName: process.env.SMTP_FROM_NAME || 'ProjectAurora Soporte',
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    pass: process.env.SMTP_PASS || '',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    user: process.env.SMTP_USER || '',
  },
  turnstile: {
    enabled: process.env.TURNSTILE_ENABLED === 'true' || Boolean(process.env.TURNSTILE_SECRET_KEY),
    secretKey: process.env.TURNSTILE_SECRET_KEY || '',
    siteKey: process.env.TURNSTILE_SITE_KEY || process.env.VITE_TURNSTILE_SITE_KEY || '',
  },
  vitePort: parseInt(process.env.ADMIN_VITE_PORT || '5175', 10),
};
