import { RowDataPacket } from 'mysql2';
import { adminDbPool } from './db.service.js';
import { logger } from './logger.service.js';
import { adminRedis, publishSupportEvent } from './redis.service.js';
import { SupportAuditService } from './support-audit.service.js';

export type AgentPresenceStatus = 'available' | 'away' | 'busy' | 'offline';

export interface AgentPresenceRecord {
  active_chats_count: number;
  agent_id: string;
  agent_name: string;
  last_status_change: string;
  status: AgentPresenceStatus;
  tier: 'L1' | 'L2' | 'L3';
  updated_at: string;
}

interface PresenceRowPacket extends RowDataPacket, AgentPresenceRecord {}

const REDIS_KEY_PRESENCE_HASH = 'aurora:support:presence:agents';

export class AgentPresenceService {
  static async getPresence(agentId: string): Promise<AgentPresenceRecord | null> {
    try {
      if (adminRedis.status === 'ready') {
        const cached = await adminRedis.hget(REDIS_KEY_PRESENCE_HASH, agentId);
        if (cached) {
          return JSON.parse(cached) as AgentPresenceRecord;
        }
      }
    } catch (err) {
      logger.app.warn('Fallo al consultar presencia de agente en Redis', { agentId, error: err });
    }

    const [rows] = await adminDbPool.query<PresenceRowPacket[]>(
      'SELECT * FROM support_agent_presence WHERE agent_id = ? LIMIT 1',
      [agentId]
    );

    if (rows.length > 0) {
      try {
        if (adminRedis.status === 'ready') {
          await adminRedis.hset(REDIS_KEY_PRESENCE_HASH, agentId, JSON.stringify(rows[0]));
        }
      } catch {
        // ignore
      }
      return rows[0];
    }

    return null;
  }

  static async listPresences(): Promise<AgentPresenceRecord[]> {
    const [rows] = await adminDbPool.query<PresenceRowPacket[]>(
      'SELECT * FROM support_agent_presence ORDER BY FIELD(status, \'available\', \'busy\', \'away\', \'offline\'), agent_name ASC'
    );
    return rows;
  }

  static async updatePresence(
    agentId: string,
    status: AgentPresenceStatus,
    agentName?: string,
    tier?: 'L1' | 'L2' | 'L3',
    note?: string | null
  ): Promise<AgentPresenceRecord> {
    const existing = await this.getPresence(agentId);
    const previousStatus: AgentPresenceStatus = existing ? existing.status : 'offline';
    const finalName = agentName || existing?.agent_name || 'Agente de Soporte';
    const finalTier = tier || existing?.tier || 'L1';

    const sql = `
      INSERT INTO support_agent_presence (agent_id, agent_name, status, tier, last_status_change, updated_at)
      VALUES (?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        agent_name = VALUES(agent_name),
        status = VALUES(status),
        tier = VALUES(tier),
        last_status_change = IF(status != VALUES(status), NOW(), last_status_change),
        updated_at = NOW()
    `;

    await adminDbPool.query(sql, [agentId, finalName, status, finalTier]);

    const [rows] = await adminDbPool.query<PresenceRowPacket[]>(
      'SELECT * FROM support_agent_presence WHERE agent_id = ? LIMIT 1',
      [agentId]
    );
    const resultRecord: AgentPresenceRecord = rows[0] || {
      active_chats_count: 0,
      agent_id: agentId,
      agent_name: finalName,
      last_status_change: new Date().toISOString(),
      status,
      tier: finalTier,
      updated_at: new Date().toISOString(),
    };

    try {
      if (adminRedis.status === 'ready') {
        await adminRedis.hset(REDIS_KEY_PRESENCE_HASH, agentId, JSON.stringify(resultRecord));
      }
    } catch (err) {
      logger.app.warn('Fallo al sincronizar presencia de agente en Redis', { agentId, error: err });
    }

    await publishSupportEvent({
      activeChatsCount: resultRecord.active_chats_count,
      agentId,
      agentName: finalName,
      previousStatus,
      status,
      target: 'admin_support',
      tier: finalTier,
      timestamp: new Date().toISOString(),
      type: 'agent_presence_updated',
    });

    await SupportAuditService.recordPresenceLog({
      agentId,
      agentName: finalName,
      note: note || null,
      previousStatus,
      status,
      tier: finalTier,
    });

    return resultRecord;
  }

  static async checkAvailability(tierFilter?: string): Promise<{
    agents: AgentPresenceRecord[];
    available: boolean;
    availableCount: number;
  }> {
    let sql = 'SELECT * FROM support_agent_presence WHERE status = \'available\'';
    const params: unknown[] = [];

    if (tierFilter && ['L1', 'L2', 'L3'].includes(tierFilter)) {
      sql += ' AND tier = ?';
      params.push(tierFilter);
    }

    const [rows] = await adminDbPool.query<PresenceRowPacket[]>(sql, params);
    return {
      agents: rows,
      available: rows.length > 0,
      availableCount: rows.length,
    };
  }

  static async incrementActiveChats(agentId: string): Promise<void> {
    await adminDbPool.query(
      'UPDATE support_agent_presence SET active_chats_count = active_chats_count + 1, updated_at = NOW() WHERE agent_id = ?',
      [agentId]
    );
    try {
      if (adminRedis.status === 'ready') {
        await adminRedis.hdel(REDIS_KEY_PRESENCE_HASH, agentId);
      }
    } catch {
      // ignore
    }
  }

  static async decrementActiveChats(agentId: string): Promise<void> {
    await adminDbPool.query(
      'UPDATE support_agent_presence SET active_chats_count = GREATEST(0, active_chats_count - 1), updated_at = NOW() WHERE agent_id = ?',
      [agentId]
    );
    try {
      if (adminRedis.status === 'ready') {
        await adminRedis.hdel(REDIS_KEY_PRESENCE_HASH, agentId);
      }
    } catch {
      // ignore
    }
  }
}
