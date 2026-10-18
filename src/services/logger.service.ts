import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGS_ROOT_DIR = path.resolve(__dirname, '../../logs');

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
export type LogCategory = 'app' | 'db' | 'security';

const SENSITIVE_KEYS = new Set([
  'access',
  'accesstoken',
  'apikey',
  'authorization',
  'bearer',
  'cardnumber',
  'cookie',
  'csrf',
  'csrftoken',
  'cvv',
  'password',
  'passwordhash',
  'privatekey',
  'refreshtoken',
  'secret',
  'secretkey',
  'session',
  'smtppass',
  'token',
]);

const SENSITIVE_PATTERN = /(password|secret|token|auth|credential|card_?number|cvv|private_?key|cookie|session|smtp_?pass)/i;

function sanitize(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    return obj;
  }

  if (obj instanceof Error) {
    const errorDetails: Record<string, unknown> = {
      message: obj.message,
      name: obj.name,
      stack: obj.stack,
    };
    for (const [key, value] of Object.entries(obj)) {
      const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
      if (SENSITIVE_KEYS.has(normalizedKey) || SENSITIVE_PATTERN.test(key)) {
        errorDetails[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        errorDetails[key] = sanitize(value);
      } else {
        errorDetails[key] = value;
      }
    }
    return errorDetails;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitize(item));
  }

  if (typeof obj === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
      if (SENSITIVE_KEYS.has(normalizedKey) || SENSITIVE_PATTERN.test(key)) {
        cleaned[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        cleaned[key] = sanitize(value);
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

  return obj;
}

class CategoryLogger {
  private category: LogCategory;

  constructor(category: LogCategory) {
    this.category = category;
  }

  private write(level: LogLevel, message: string, meta?: unknown): void {
    try {
      if (!fs.existsSync(LOGS_ROOT_DIR)) {
        fs.mkdirSync(LOGS_ROOT_DIR, { recursive: true });
      }

      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toISOString();

      const logFile = path.join(LOGS_ROOT_DIR, `${this.category}-${dateStr}.log`);

      const payload: Record<string, unknown> = {
        category: this.category,
        level,
        message,
        timestamp: timeStr,
      };

      if (meta !== undefined) {
        payload.meta = sanitize(meta);
      }

      const line = `${JSON.stringify(payload)}\n`;
      fs.appendFileSync(logFile, line, 'utf8');
    } catch {}
  }

  info(message: string, meta?: unknown): void {
    this.write('INFO', message, meta);
  }

  warn(message: string, meta?: unknown): void {
    this.write('WARN', message, meta);
  }

  error(message: string, meta?: unknown): void {
    this.write('ERROR', message, meta);
  }

  debug(message: string, meta?: unknown): void {
    this.write('DEBUG', message, meta);
  }
}

export const logger = {
  app: new CategoryLogger('app'),
  db: new CategoryLogger('db'),
  security: new CategoryLogger('security'),
};
