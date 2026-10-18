import { Redis } from 'ioredis';
import { logger } from '../services/logger.service.js';
import { config } from './env.config.js';

export const redis = new Redis({
  enableOfflineQueue: false,
  host: config.redis.host,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  password: config.redis.password,
  port: config.redis.port,
  retryStrategy(times) {
    if (times > 3) {
      return null;
    }
    return Math.min(times * 100, 1000);
  },
});

redis.on('error', (err) => {
  logger.db.warn('Advertencia en cliente Redis:', err);
});

export async function checkRedisConnection(retries = 2, delayMs = 500): Promise<boolean> {
  for (let i = 1; i <= retries; i++) {
    try {
      if (redis.status !== 'ready' && redis.status !== 'connecting') {
        await redis.connect();
      }
      const pong = await redis.ping();
      if (pong === 'PONG') {
        logger.db.info('Conexión establecida exitosamente con Redis.');
        return true;
      }
    } catch {
      if (i === retries) {
        logger.db.warn(`No se pudo conectar a Redis en ${config.redis.host}:${config.redis.port}. El servidor continuará operando en modo fail-open.`);
        try {
          redis.disconnect(false);
        } catch {}
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

