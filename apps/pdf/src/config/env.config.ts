import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();
const localEnvPath = path.resolve(import.meta.dirname, '../../.env');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}

export const config = {
  appName: process.env.APP_NAME || 'ProjectAurora',
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  cors: {
    allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    name: process.env.DB_NAME || 'db_aurora',
    password: process.env.DB_PASSWORD || 'aurora_password',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'aurora_user',
  },
  google: {
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    password: process.env.REDIS_PASSWORD || undefined,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  s3: {
    accessKeyId: process.env.S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID || '',
    bucket: process.env.S3_BUCKET_NAME || '',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    region: process.env.S3_REGION || process.env.AWS_REGION || 'us-east-1',
    secretAccessKey: process.env.S3_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY || '',
  },
  sessionSecret: process.env.SESSION_SECRET || 'aurora_session_secret_key_2026',
  smtp: {
    fromEmail: process.env.SMTP_FROM_EMAIL || '',
    fromName: process.env.SMTP_FROM_NAME || 'ProjectAurora',
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    pass: process.env.SMTP_PASS || '',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    user: process.env.SMTP_USER || '',
  },
  stripe: {
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  },
  photoroom: {
    apiKey: process.env.PHOTOROOM_API_KEY || '',
    endpoint: process.env.PHOTOROOM_ENDPOINT || 'https://sdk.photoroom.com/v1/segment',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
  },
  deepl: {
    apiKey: process.env.DEEPL_API_KEY || '',
  },
  dropbox: {
    appKey: process.env.DROPBOX_APP_KEY || '',
    appSecret: process.env.DROPBOX_APP_SECRET || '',
  },
  googlePicker: {
    apiKey: process.env.VITE_GOOGLE_API_KEY || '',
    clientId: process.env.VITE_GOOGLE_CLIENT_ID || '',
  },
  turnstile: {
    enabled: process.env.TURNSTILE_ENABLED === 'true' || Boolean(process.env.TURNSTILE_SECRET_KEY),
    secretKey: process.env.TURNSTILE_SECRET_KEY || '',
    siteKey: process.env.TURNSTILE_SITE_KEY || process.env.VITE_TURNSTILE_SITE_KEY || '',
  },
  originProtection: {
    enforceCloudflare: process.env.ENFORCE_CLOUDFLARE_ORIGIN === 'true',
    secret: process.env.CLOUDFLARE_ORIGIN_SECRET || '',
  },
};

