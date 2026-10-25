import cassandra from 'cassandra-driver';
import crypto from 'crypto';
import { adminConfig } from '../config/env.config.js';
import { logger } from './logger.service.js';

export interface AdminAuditRecord {
  action: string;
  actorEmail: string;
  actorId: string;
  actorRole: string;
  actorUsername: string;
  checksum: string;
  createdAt: string;
  details: Record<string, unknown> | null;
  eventDate: string;
  ipAddress: string;
  logId: string;
  status: 'failure' | 'success';
  targetId: string;
  targetName: string;
  targetType: string;
  userAgent: string;
}

export interface SecurityAccessRecord {
  accessId: string;
  checksum: string;
  createdAt: string;
  eventDate: string;
  eventType: string;
  failureReason: string | null;
  identifier: string;
  ipAddress: string;
  isSuspicious: boolean;
  riskScore: number;
  userAgent: string;
  userId: string | null;
}

export interface SecurityStats {
  actionsToday: number;
  failedLogins24h: number;
  suspiciousEventsCount: number;
  totalAuditEntries: number;
}

let clientInstance: cassandra.Client | null = null;

function getCassandraClient(): cassandra.Client {
  if (!clientInstance) {
    clientInstance = new cassandra.Client({
      contactPoints: [adminConfig.cassandra.host],
      keyspace: adminConfig.cassandra.keyspace,
      localDataCenter: 'datacenter1',
    });
  }
  return clientInstance;
}

function computeChecksum(dataString: string): string {
  return crypto
    .createHmac('sha256', adminConfig.sessionSecret)
    .update(dataString)
    .digest('hex');
}

export class SecurityAuditService {
  static async recordAdminAction(data: {
    action: string;
    actorEmail?: string | null;
    actorId: string;
    actorRole: string;
    actorUsername: string;
    details?: Record<string, unknown> | null;
    ipAddress?: string | null;
    status?: 'failure' | 'success';
    targetId?: string | null;
    targetName?: string | null;
    targetType: string;
    userAgent?: string | null;
  }): Promise<void> {
    try {
      const client = getCassandraClient();
      const logId = cassandra.types.TimeUuid.now();
      const now = new Date();
      const eventDate = now.toISOString().slice(0, 10);
      const detailsStr = data.details ? JSON.stringify(data.details) : '{}';
      const actorEmail = data.actorEmail || '';
      const targetId = data.targetId || '';
      const targetName = data.targetName || '';
      const ipAddress = data.ipAddress || '127.0.0.1';
      const userAgent = data.userAgent || 'Unknown';
      const status = data.status || 'success';

      const payloadForChecksum = `${eventDate}|${logId.toString()}|${data.actorId}|${data.action}|${data.targetType}|${targetId}|${detailsStr}|${ipAddress}|${status}`;
      const checksum = computeChecksum(payloadForChecksum);

      const queryTimeline = `
        INSERT INTO admin_audit_logs (
          event_date, created_at, log_id, actor_id, actor_username,
          actor_email, actor_role, action, target_type, target_id,
          target_name, details_json, ip_address, user_agent, status, checksum
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const queryTarget = `
        INSERT INTO admin_audit_by_target (
          target_type, created_at, log_id, event_date, actor_id,
          actor_username, actor_email, actor_role, action, target_id,
          target_name, details_json, ip_address, user_agent, status, checksum
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        eventDate,
        now,
        logId,
        data.actorId,
        data.actorUsername,
        actorEmail,
        data.actorRole,
        data.action,
        data.targetType,
        targetId,
        targetName,
        detailsStr,
        ipAddress,
        userAgent,
        status,
        checksum,
      ];

      await Promise.all([
        client.execute(queryTimeline, params, { prepare: true }),
        client.execute(
          queryTarget,
          [
            data.targetType,
            now,
            logId,
            eventDate,
            data.actorId,
            data.actorUsername,
            actorEmail,
            data.actorRole,
            data.action,
            targetId,
            targetName,
            detailsStr,
            ipAddress,
            userAgent,
            status,
            checksum,
          ],
          { prepare: true }
        ),
      ]);

      logger.security.info(`Auditoría Admin: [${data.action}] ejecutada por ${data.actorUsername}`, {
        action: data.action,
        actorId: data.actorId,
        ip: ipAddress,
        targetId,
        targetType: data.targetType,
      });
    } catch (err) {
      logger.db.warn('No se pudo registrar acción de auditoría administrativa en Cassandra', {
        action: data.action,
        error: err,
      });
    }
  }

  static async recordAccessEvent(data: {
    eventType: string;
    failureReason?: string | null;
    identifier: string;
    ipAddress?: string | null;
    isSuspicious?: boolean;
    riskScore?: number;
    userAgent?: string | null;
    userId?: string | null;
  }): Promise<void> {
    try {
      const client = getCassandraClient();
      const accessId = cassandra.types.TimeUuid.now();
      const now = new Date();
      const eventDate = now.toISOString().slice(0, 10);
      const ipAddress = data.ipAddress || '127.0.0.1';
      const userAgent = data.userAgent || 'Unknown';
      const userId = data.userId || '';
      const failureReason = data.failureReason || '';
      const isSuspicious = Boolean(data.isSuspicious);
      const riskScore = typeof data.riskScore === 'number' ? data.riskScore : 0;

      const payloadForChecksum = `${eventDate}|${accessId.toString()}|${data.eventType}|${data.identifier}|${userId}|${ipAddress}|${riskScore}`;
      const checksum = computeChecksum(payloadForChecksum);

      const queryDate = `
        INSERT INTO security_access_logs (
          event_date, created_at, access_id, event_type, identifier,
          user_id, ip_address, user_agent, failure_reason, is_suspicious,
          risk_score, checksum
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const queryIp = `
        INSERT INTO security_access_by_ip (
          ip_address, created_at, access_id, event_date, event_type,
          identifier, user_id, user_agent, failure_reason, is_suspicious,
          risk_score, checksum
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await Promise.all([
        client.execute(
          queryDate,
          [
            eventDate,
            now,
            accessId,
            data.eventType,
            data.identifier,
            userId,
            ipAddress,
            userAgent,
            failureReason,
            isSuspicious,
            riskScore,
            checksum,
          ],
          { prepare: true }
        ),
        client.execute(
          queryIp,
          [
            ipAddress,
            now,
            accessId,
            eventDate,
            data.eventType,
            data.identifier,
            userId,
            userAgent,
            failureReason,
            isSuspicious,
            riskScore,
            checksum,
          ],
          { prepare: true }
        ),
      ]);
    } catch (err) {
      logger.db.warn('No se pudo registrar evento de acceso en Cassandra', {
        error: err,
        eventType: data.eventType,
      });
    }
  }

  static async getAdminAuditTrail(filters: {
    date?: string;
    limit?: number;
    targetType?: string;
  } = {}): Promise<AdminAuditRecord[]> {
    try {
      const client = getCassandraClient();
      const limit = Math.min(Math.max(Number(filters.limit) || 100, 1), 500);

      if (filters.targetType && filters.targetType !== 'all') {
        const query = 'SELECT * FROM admin_audit_by_target WHERE target_type = ? LIMIT ?';
        const result = await client.execute(query, [filters.targetType, limit], { prepare: true });
        return result.rows.map(mapRowToAuditRecord);
      }

      const eventDate = filters.date || new Date().toISOString().slice(0, 10);
      const query = 'SELECT * FROM admin_audit_logs WHERE event_date = ? LIMIT ?';
      const result = await client.execute(query, [eventDate, limit], { prepare: true });

      if (result.rows.length === 0 && !filters.date) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const yResult = await client.execute(query, [yesterday, limit], { prepare: true });
        return yResult.rows.map(mapRowToAuditRecord);
      }

      return result.rows.map(mapRowToAuditRecord);
    } catch (err) {
      logger.db.error('Error al consultar registros de auditoría administrativa en Cassandra', err);
      return [];
    }
  }

  static async getSecurityAccessLogs(filters: {
    date?: string;
    ip?: string;
    limit?: number;
  } = {}): Promise<SecurityAccessRecord[]> {
    try {
      const client = getCassandraClient();
      const limit = Math.min(Math.max(Number(filters.limit) || 100, 1), 500);

      if (filters.ip) {
        const query = 'SELECT * FROM security_access_by_ip WHERE ip_address = ? LIMIT ?';
        const result = await client.execute(query, [filters.ip, limit], { prepare: true });
        return result.rows.map(mapRowToAccessRecord);
      }

      const eventDate = filters.date || new Date().toISOString().slice(0, 10);
      const query = 'SELECT * FROM security_access_logs WHERE event_date = ? LIMIT ?';
      const result = await client.execute(query, [eventDate, limit], { prepare: true });

      if (result.rows.length === 0 && !filters.date) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const yResult = await client.execute(query, [yesterday, limit], { prepare: true });
        return yResult.rows.map(mapRowToAccessRecord);
      }

      return result.rows.map(mapRowToAccessRecord);
    } catch (err) {
      logger.db.error('Error al consultar logs de acceso de seguridad en Cassandra', err);
      return [];
    }
  }

  static async getSecurityStats(): Promise<SecurityStats> {
    try {
      const client = getCassandraClient();
      const today = new Date().toISOString().slice(0, 10);

      const [auditResult, accessResult] = await Promise.all([
        client.execute('SELECT log_id FROM admin_audit_logs WHERE event_date = ? LIMIT 1000', [today], { prepare: true }).catch(() => ({ rows: [] })),
        client.execute('SELECT event_type, is_suspicious FROM security_access_logs WHERE event_date = ? LIMIT 1000', [today], { prepare: true }).catch(() => ({ rows: [] })),
      ]);

      const actionsToday = auditResult.rows.length;
      let failedLogins24h = 0;
      let suspiciousEventsCount = 0;

      for (const row of accessResult.rows) {
        if (row.event_type === 'login_failed' || row.event_type === 'brute_force_blocked') {
          failedLogins24h++;
        }
        if (row.is_suspicious) {
          suspiciousEventsCount++;
        }
      }

      return {
        actionsToday,
        failedLogins24h,
        suspiciousEventsCount,
        totalAuditEntries: actionsToday,
      };
    } catch {
      return {
        actionsToday: 0,
        failedLogins24h: 0,
        suspiciousEventsCount: 0,
        totalAuditEntries: 0,
      };
    }
  }

  static async closeClient(): Promise<void> {
    if (clientInstance) {
      await clientInstance.shutdown();
      clientInstance = null;
    }
  }
}

function mapRowToAuditRecord(row: cassandra.types.Row): AdminAuditRecord {
  let details: Record<string, unknown> | null = null;
  try {
    if (row.details_json) {
      details = JSON.parse(row.details_json);
    }
  } catch {
    details = null;
  }

  const createdAt = row.created_at instanceof Date
    ? row.created_at.toISOString()
    : new Date(row.created_at).toISOString();

  const eventDate = row.event_date ? String(row.event_date) : createdAt.slice(0, 10);

  return {
    action: row.action || '',
    actorEmail: row.actor_email || '',
    actorId: row.actor_id || '',
    actorRole: row.actor_role || '',
    actorUsername: row.actor_username || '',
    checksum: row.checksum || '',
    createdAt,
    details,
    eventDate,
    ipAddress: row.ip_address || '',
    logId: row.log_id ? row.log_id.toString() : '',
    status: row.status === 'failure' ? 'failure' : 'success',
    targetId: row.target_id || '',
    targetName: row.target_name || '',
    targetType: row.target_type || '',
    userAgent: row.user_agent || '',
  };
}

function mapRowToAccessRecord(row: cassandra.types.Row): SecurityAccessRecord {
  const createdAt = row.created_at instanceof Date
    ? row.created_at.toISOString()
    : new Date(row.created_at).toISOString();

  const eventDate = row.event_date ? String(row.event_date) : createdAt.slice(0, 10);

  return {
    accessId: row.access_id ? row.access_id.toString() : '',
    checksum: row.checksum || '',
    createdAt,
    eventDate,
    eventType: row.event_type || '',
    failureReason: row.failure_reason || null,
    identifier: row.identifier || '',
    ipAddress: row.ip_address || '',
    isSuspicious: Boolean(row.is_suspicious),
    riskScore: typeof row.risk_score === 'number' ? row.risk_score : 0,
    userAgent: row.user_agent || '',
    userId: row.user_id || null,
  };
}
