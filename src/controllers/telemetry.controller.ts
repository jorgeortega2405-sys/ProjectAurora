import { bufferTelemetryEvents, getTelemetryQueueLength, IncomingTelemetryEvent } from '../services/telemetry-buffer.service.js';
import type { Request, Response } from 'express';

export async function ingestBatchHandler(req: Request, res: Response): Promise<void> {
  const body = req.body;
  let events: IncomingTelemetryEvent[] = [];

  if (Array.isArray(body)) {
    events = body;
  } else if (body && Array.isArray(body.events)) {
    events = body.events;
  }

  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
  const authUserId = (req as any).user?.id ? String((req as any).user.id) : undefined;

  const result = await bufferTelemetryEvents(events, clientIp, authUserId);

  res.status(202).json({
    accepted: result.accepted,
    dropped: result.dropped,
    success: true,
  });
}

export async function ingestBeaconHandler(req: Request, res: Response): Promise<void> {
  let events: IncomingTelemetryEvent[] = [];

  if (typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      events = Array.isArray(parsed) ? parsed : [parsed];
    } catch {}
  } else if (Array.isArray(req.body)) {
    events = req.body;
  } else if (req.body && typeof req.body === 'object') {
    events = Array.isArray(req.body.events) ? req.body.events : [req.body];
  }

  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
  const authUserId = (req as any).user?.id ? String((req as any).user.id) : undefined;

  await bufferTelemetryEvents(events, clientIp, authUserId);
  res.status(204).end();
}

export async function getTelemetryHealthHandler(_req: Request, res: Response): Promise<void> {
  const queueSize = await getTelemetryQueueLength();
  res.status(200).json({
    queue_size: queueSize,
    status: 'healthy',
    storage_engine: 'cassandra-4.1',
    stream_pipeline: 'redis-worker',
    success: true,
  });
}
