import { adminRedis, publishSupportEvent } from './redis.service.js';
import { logger } from './logger.service.js';
import { SecurityAuditService } from './security-audit.service.js';

export interface AdminActiveSession {
  createdAt: string;
  email: string;
  ip: string;
  lastActivityAt: string;
  role: string;
  sessionId: string;
  status: 'active' | 'revoked';
  userAgent: string;
  userId: string;
  username: string;
}

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const FAILED_ATTEMPT_TTL_SECONDS = 15 * 60;
const BRUTE_FORCE_THRESHOLD = 5;

export class SessionSecurityService {
  static async registerSession(data: {
    email: string;
    ip?: string | null;
    role: string;
    sessionId: string;
    userAgent?: string | null;
    userId: string;
    username: string;
  }): Promise<void> {
    try {
      if (adminRedis.status !== 'ready' && adminRedis.status !== 'connecting') {
        await adminRedis.connect().catch(() => {});
      }
      if (adminRedis.status !== 'ready') return;

      const now = new Date().toISOString();
      const sessionKey = `aurora:admin:session:${data.sessionId}`;
      const userSessionsKey = `aurora:admin:user_sessions:${data.userId}`;
      const allSessionsKey = 'aurora:admin:all_sessions';

      const payload: Record<string, string> = {
        createdAt: now,
        email: data.email,
        ip: data.ip || '127.0.0.1',
        lastActivityAt: now,
        role: data.role,
        sessionId: data.sessionId,
        status: 'active',
        userAgent: data.userAgent || 'Unknown',
        userId: data.userId,
        username: data.username,
      };

      await adminRedis.hset(sessionKey, payload);
      await adminRedis.expire(sessionKey, SESSION_TTL_SECONDS);
      await adminRedis.sadd(userSessionsKey, data.sessionId);
      await adminRedis.expire(userSessionsKey, SESSION_TTL_SECONDS);
      await adminRedis.sadd(allSessionsKey, data.sessionId);
    } catch (err) {
      logger.db.warn('No se pudo registrar sesión administrativa en Redis', err);
    }
  }

  static async isSessionRevoked(sessionId: string): Promise<boolean> {
    try {
      if (!sessionId) return false;
      if (adminRedis.status !== 'ready' && adminRedis.status !== 'connecting') {
        await adminRedis.connect().catch(() => {});
      }
      if (adminRedis.status !== 'ready') return false;

      const revokedKey = `aurora:admin:revoked_sessions:${sessionId}`;
      const isRevokedKey = await adminRedis.exists(revokedKey);
      if (isRevokedKey) return true;

      const sessionKey = `aurora:admin:session:${sessionId}`;
      const status = await adminRedis.hget(sessionKey, 'status');
      return status === 'revoked';
    } catch {
      return false;
    }
  }

  static async updateSessionActivity(sessionId: string): Promise<void> {
    try {
      if (!sessionId) return;
      if (adminRedis.status !== 'ready' && adminRedis.status !== 'connecting') {
        await adminRedis.connect().catch(() => {});
      }
      if (adminRedis.status !== 'ready') return;

      const sessionKey = `aurora:admin:session:${sessionId}`;
      await adminRedis.hset(sessionKey, 'lastActivityAt', new Date().toISOString());
    } catch {
      // Best-effort activity update
    }
  }

  static async getActiveSessions(): Promise<AdminActiveSession[]> {
    try {
      if (adminRedis.status !== 'ready' && adminRedis.status !== 'connecting') {
        await adminRedis.connect().catch(() => {});
      }
      if (adminRedis.status !== 'ready') return [];

      const sessionIds = await adminRedis.smembers('aurora:admin:all_sessions');
      if (!sessionIds || sessionIds.length === 0) return [];

      const sessions: AdminActiveSession[] = [];
      const staleSessionIds: string[] = [];

      for (const sId of sessionIds) {
        const raw = await adminRedis.hgetall(`aurora:admin:session:${sId}`);
        if (!raw || !raw.sessionId || raw.status === 'revoked') {
          staleSessionIds.push(sId);
          continue;
        }

        sessions.push({
          createdAt: raw.createdAt || new Date().toISOString(),
          email: raw.email || '',
          ip: raw.ip || '127.0.0.1',
          lastActivityAt: raw.lastActivityAt || raw.createdAt || new Date().toISOString(),
          role: raw.role || 'ADMIN',
          sessionId: raw.sessionId,
          status: 'active',
          userAgent: raw.userAgent || 'Unknown',
          userId: raw.userId || '',
          username: raw.username || 'Admin',
        });
      }

      if (staleSessionIds.length > 0) {
        await adminRedis.srem('aurora:admin:all_sessions', ...staleSessionIds).catch(() => {});
      }

      sessions.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
      return sessions;
    } catch (err) {
      logger.db.error('Error al consultar sesiones activas en Redis', err);
      return [];
    }
  }

  static async revokeSession(
    sessionId: string,
    actor: { id: string; ip?: string; role: string; username: string }
  ): Promise<boolean> {
    try {
      if (adminRedis.status !== 'ready' && adminRedis.status !== 'connecting') {
        await adminRedis.connect().catch(() => {});
      }
      if (adminRedis.status !== 'ready') return false;

      const sessionKey = `aurora:admin:session:${sessionId}`;
      const sessionData = await adminRedis.hgetall(sessionKey);
      const targetUserId = sessionData.userId || '';
      const targetUsername = sessionData.username || '';

      await adminRedis.hset(sessionKey, {
        revokedAt: new Date().toISOString(),
        revokedBy: actor.username,
        status: 'revoked',
      });

      const revokedKey = `aurora:admin:revoked_sessions:${sessionId}`;
      await adminRedis.set(revokedKey, '1', 'EX', SESSION_TTL_SECONDS);
      await adminRedis.srem('aurora:admin:all_sessions', sessionId);

      if (targetUserId) {
        await adminRedis.srem(`aurora:admin:user_sessions:${targetUserId}`, sessionId);
      }

      await publishSupportEvent({
        actor: actor.username,
        sessionId,
        target: 'admin_support',
        targetUserId,
        type: 'admin_session_revoked',
      });

      await SecurityAuditService.recordAdminAction({
        action: 'session.revoke',
        actorEmail: null,
        actorId: actor.id,
        actorRole: actor.role,
        actorUsername: actor.username,
        details: {
          revokedSessionId: sessionId,
          targetUserId,
          targetUsername,
          userAgent: sessionData.userAgent || 'Unknown',
        },
        ipAddress: actor.ip || '127.0.0.1',
        status: 'success',
        targetId: sessionId,
        targetName: targetUsername ? `Sesión de ${targetUsername}` : sessionId,
        targetType: 'session',
      });

      logger.security.warn(`Sesión administrativa ${sessionId} revocada por ${actor.username}`, {
        actorId: actor.id,
        sessionId,
        targetUserId,
      });

      return true;
    } catch (err) {
      logger.db.error('Error al revocar sesión administrativa en Redis', err);
      return false;
    }
  }

  static async revokeAllUserSessions(
    targetUserId: string,
    actor: { id: string; ip?: string; role: string; username: string }
  ): Promise<number> {
    try {
      if (adminRedis.status !== 'ready' && adminRedis.status !== 'connecting') {
        await adminRedis.connect().catch(() => {});
      }
      if (adminRedis.status !== 'ready') return 0;

      const userSessionsKey = `aurora:admin:user_sessions:${targetUserId}`;
      const sessionIds = await adminRedis.smembers(userSessionsKey);
      if (!sessionIds || sessionIds.length === 0) return 0;

      let revokedCount = 0;
      for (const sId of sessionIds) {
        const ok = await this.revokeSession(sId, actor);
        if (ok) revokedCount++;
      }

      await adminRedis.del(userSessionsKey);
      return revokedCount;
    } catch (err) {
      logger.db.error('Error al revocar todas las sesiones del usuario', err);
      return 0;
    }
  }

  static async checkBruteForceRisk(ip: string, identifier: string): Promise<{
    attempts: number;
    isBlocked: boolean;
    riskScore: number;
  }> {
    try {
      if (adminRedis.status !== 'ready' && adminRedis.status !== 'connecting') {
        await adminRedis.connect().catch(() => {});
      }
      if (adminRedis.status !== 'ready') {
        return { attempts: 0, isBlocked: false, riskScore: 0 };
      }

      const ipKey = `aurora:security:failed_ip:${ip}`;
      const userKey = `aurora:security:failed_user:${identifier.toLowerCase()}`;

      const [ipAttemptsStr, userAttemptsStr] = await Promise.all([
        adminRedis.get(ipKey),
        adminRedis.get(userKey),
      ]);

      const ipAttempts = parseInt(ipAttemptsStr || '0', 10);
      const userAttempts = parseInt(userAttemptsStr || '0', 10);
      const maxAttempts = Math.max(ipAttempts, userAttempts);

      if (maxAttempts >= BRUTE_FORCE_THRESHOLD) {
        return { attempts: maxAttempts, isBlocked: true, riskScore: 95 };
      }
      if (maxAttempts >= 3) {
        return { attempts: maxAttempts, isBlocked: false, riskScore: 65 };
      }
      if (maxAttempts >= 1) {
        return { attempts: maxAttempts, isBlocked: false, riskScore: 25 };
      }
      return { attempts: 0, isBlocked: false, riskScore: 5 };
    } catch {
      return { attempts: 0, isBlocked: false, riskScore: 0 };
    }
  }

  static async recordFailedLoginAttempt(
    ip: string,
    identifier: string,
    reason: string,
    userAgent?: string
  ): Promise<{ isSuspicious: boolean; riskScore: number }> {
    try {
      if (adminRedis.status !== 'ready' && adminRedis.status !== 'connecting') {
        await adminRedis.connect().catch(() => {});
      }

      let attempts = 1;
      if (adminRedis.status === 'ready') {
        const ipKey = `aurora:security:failed_ip:${ip}`;
        const userKey = `aurora:security:failed_user:${identifier.toLowerCase()}`;

        const [ipCount] = await Promise.all([
          adminRedis.incr(ipKey),
          adminRedis.incr(userKey),
        ]);
        attempts = ipCount;
        await Promise.all([
          adminRedis.expire(ipKey, FAILED_ATTEMPT_TTL_SECONDS),
          adminRedis.expire(userKey, FAILED_ATTEMPT_TTL_SECONDS),
        ]);
      }

      const isSuspicious = attempts >= 3;
      const riskScore = attempts >= BRUTE_FORCE_THRESHOLD ? 95 : attempts >= 3 ? 65 : 25;
      const eventType = attempts >= BRUTE_FORCE_THRESHOLD ? 'brute_force_blocked' : 'login_failed';

      await SecurityAuditService.recordAccessEvent({
        eventType,
        failureReason: reason,
        identifier,
        ipAddress: ip,
        isSuspicious,
        riskScore,
        userAgent: userAgent || 'Unknown',
        userId: null,
      });

      return { isSuspicious, riskScore };
    } catch {
      return { isSuspicious: false, riskScore: 20 };
    }
  }

  static async recordSuccessfulLoginAttempt(
    ip: string,
    identifier: string,
    userId: string,
    userAgent?: string
  ): Promise<void> {
    try {
      if (adminRedis.status === 'ready') {
        const ipKey = `aurora:security:failed_ip:${ip}`;
        const userKey = `aurora:security:failed_user:${identifier.toLowerCase()}`;
        await Promise.all([
          adminRedis.del(ipKey),
          adminRedis.del(userKey),
        ]);
      }

      await SecurityAuditService.recordAccessEvent({
        eventType: 'login_success',
        failureReason: null,
        identifier,
        ipAddress: ip,
        isSuspicious: false,
        riskScore: 0,
        userAgent: userAgent || 'Unknown',
        userId,
      });
    } catch {
      // Best-effort
    }
  }
}
