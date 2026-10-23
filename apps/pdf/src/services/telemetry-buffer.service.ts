import { redis } from '../config/redis.config.js';
import { logger } from './logger.service.js';
import crypto from 'crypto';

export const TELEMETRY_REDIS_QUEUE = 'telemetry:queue:incoming';
export const MAX_BATCH_ITEMS = 150;

export interface IncomingTelemetryEvent {
  payload?: Record<string, unknown>;
  route?: string;
  session_id?: string;
  timestamp?: string | number;
  type?: string;
  url?: string;
  user_id?: string;
}

export interface IngestionResult {
  accepted: number;
  dropped: number;
  queueLength: number;
}

function anonymizeIp(ip: string | undefined): string {
  if (!ip) return '0.0.0.0';
  const cleanIp = ip.replace(/^.*:/, '').trim();
  return crypto.createHash('sha256').update(cleanIp).digest('hex').substring(0, 16);
}

function sanitizeEventPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};
  const forbiddenPatterns = /(password|token|secret|cookie|auth|card_?number|cvv|key)/i;

  for (const [key, val] of Object.entries(payload as Record<string, unknown>)) {
    if (forbiddenPatterns.test(key)) continue;
    if (typeof val === 'string' && val.length > 500) {
      sanitized[key] = val.substring(0, 500);
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitizeEventPayload(val);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized;
}

export async function bufferTelemetryEvents(
  rawEvents: IncomingTelemetryEvent[],
  clientIp?: string,
  authenticatedUserId?: string
): Promise<IngestionResult> {
  if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
    return { accepted: 0, dropped: 0, queueLength: 0 };
  }

  const eventsToProcess = rawEvents.slice(0, MAX_BATCH_ITEMS);
  const dropped = Math.max(0, rawEvents.length - MAX_BATCH_ITEMS);
  const nowIso = new Date().toISOString();
  const hashedIp = anonymizeIp(clientIp);

  const serializedList: string[] = [];

  for (const ev of eventsToProcess) {
    if (!ev || typeof ev !== 'object') continue;

    const eventType = typeof ev.type === 'string' && ev.type.trim() ? ev.type.trim().substring(0, 50) : 'generic';
    const route = typeof ev.route === 'string' ? ev.route.substring(0, 200) : '/';
    const url = typeof ev.url === 'string' ? ev.url.substring(0, 500) : '';
    const sessionId = typeof ev.session_id === 'string' ? ev.session_id.substring(0, 100) : 'anonymous_session';
    const userId = authenticatedUserId || (typeof ev.user_id === 'string' ? ev.user_id.substring(0, 100) : 'anonymous');
    const timestamp = ev.timestamp ? new Date(ev.timestamp).toISOString() : nowIso;

    const sanitizedPayload = sanitizeEventPayload(ev.payload);
    sanitizedPayload.client_ip_hash = hashedIp;

    const enrichedEvent = {
      payload: sanitizedPayload,
      route,
      server_received_at: nowIso,
      session_id: sessionId,
      timestamp,
      type: eventType,
      url,
      user_id: userId,
    };

    serializedList.push(JSON.stringify(enrichedEvent));
  }

  if (serializedList.length === 0) {
    return { accepted: 0, dropped, queueLength: 0 };
  }

  try {
    if (redis.status === 'ready' || redis.status === 'connecting') {
      const pipeline = redis.pipeline();
      pipeline.rpush(TELEMETRY_REDIS_QUEUE, ...serializedList);
      pipeline.llen(TELEMETRY_REDIS_QUEUE);
      const results = await pipeline.exec();
      const queueLen = typeof results?.[1]?.[1] === 'number' ? (results[1][1] as number) : serializedList.length;

      return {
        accepted: serializedList.length,
        dropped,
        queueLength: queueLen,
      };
    } else {
      logger.app.warn('Redis no disponible para buffering de telemetría; evento descartado en modo fail-open.');
      return { accepted: 0, dropped: rawEvents.length, queueLength: 0 };
    }
  } catch (error) {
    logger.app.warn('Error al encolar lote de telemetría en Redis:', error);
    return { accepted: 0, dropped: rawEvents.length, queueLength: 0 };
  }
}

export async function getTelemetryQueueLength(): Promise<number> {
  try {
    if (redis.status === 'ready') {
      return await redis.llen(TELEMETRY_REDIS_QUEUE);
    }
  } catch {}
  return 0;
}
