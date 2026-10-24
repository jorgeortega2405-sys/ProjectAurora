import { Redis } from 'ioredis';
import { adminConfig } from '../config/env.config.js';
import { logger } from './logger.service.js';

export const adminRedis = new Redis({
  enableOfflineQueue: false,
  host: adminConfig.redis.host,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  password: adminConfig.redis.password,
  port: adminConfig.redis.port,
  retryStrategy: (times) => (times > 3 ? null : Math.min(times * 300, 1500)),
});

adminRedis.on('error', (err) => {
  logger.db.warn('Advertencia en conexión Redis de administración:', err);
});

export async function publishSupportEvent(payload: Record<string, unknown>): Promise<void> {
  try {
    if (adminRedis.status !== 'ready' && adminRedis.status !== 'connecting') {
      await adminRedis.connect().catch(() => {});
    }
    if (adminRedis.status === 'ready') {
      await adminRedis.publish('aurora:support:events', JSON.stringify(payload));
    }
  } catch (err) {
    logger.db.warn('Error al publicar evento de soporte en Redis (admin):', err);
  }
}
