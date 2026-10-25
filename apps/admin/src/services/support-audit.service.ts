import cassandra from 'cassandra-driver';
import { adminConfig } from '../config/env.config.js';
import { logger } from './logger.service.js';

export interface ChatAuditEvent {
  actorId: string | null;
  actorName: string;
  actorType: 'agent' | 'system' | 'user';
  auditId: string;
  currentStatus: string;
  currentTier: string;
  eventTime: string;
  eventType: string;
  payload: Record<string, unknown> | null;
  subject: string;
}

export interface ChatTransferRecord {
  fromTier: string;
  notes: string | null;
  reason: string | null;
  timestamp: string;
  toTier: string;
  transferId: string;
  transferredById: string | null;
  transferredByName: string;
}

export interface ImmutableMessageRecord {
  message: string;
  messageId: string;
  senderId: string | null;
  senderName: string;
  senderType: 'agent' | 'system' | 'user';
  tier: string;
  timestamp: string;
}

export interface AgentRatingRecord {
  agentId: string;
  agentName?: string;
  chatId: string;
  feedbackComment: string | null;
  ratedAt: string;
  rating: number;
  ratingId: string;
  tier: string;
  userName: string | null;
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

export class SupportAuditService {
  static async recordChatEvent(data: {
    actorId?: string | null;
    actorName: string;
    actorType: 'agent' | 'system' | 'user';
    chatId: string;
    currentStatus?: string | null;
    currentTier?: string | null;
    eventType: string;
    payload?: Record<string, unknown>;
    sessionId?: string | null;
    subject?: string | null;
    userEmail?: string | null;
    userId?: string | null;
    userName?: string | null;
  }): Promise<void> {
    try {
      const client = getCassandraClient();
      const auditId = cassandra.types.TimeUuid.now();
      const eventTime = new Date();
      const query = `
        INSERT INTO support_chats_audit (
          chat_id, event_time, audit_id, event_type, session_id,
          user_id, user_email, user_name, subject, current_status,
          current_tier, actor_type, actor_id, actor_name, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const payloadStr = data.payload ? JSON.stringify(data.payload) : null;
      await client.execute(
        query,
        [
          data.chatId,
          eventTime,
          auditId,
          data.eventType,
          data.sessionId || null,
          data.userId || null,
          data.userEmail || null,
          data.userName || null,
          data.subject || null,
          data.currentStatus || 'pending',
          data.currentTier || 'L1',
          data.actorType,
          data.actorId || null,
          data.actorName,
          payloadStr,
        ],
        { prepare: true }
      );
    } catch (error) {
      logger.db.warn('No se pudo registrar evento inmutable de soporte en Cassandra', {
        chatId: data.chatId,
        error,
        eventType: data.eventType,
      });
    }
  }

  static async recordMessage(data: {
    chatId: string;
    message: string;
    messageId: string;
    senderId?: string | null;
    senderName: string;
    senderType: 'agent' | 'system' | 'user';
    tier?: string | null;
    timestamp?: Date;
  }): Promise<void> {
    try {
      const client = getCassandraClient();
      const msgTimestamp = data.timestamp || new Date();
      const query = `
        INSERT INTO support_messages_immutable (
          chat_id, timestamp, message_id, sender_type,
          sender_id, sender_name, tier, message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await client.execute(
        query,
        [
          data.chatId,
          msgTimestamp,
          data.messageId,
          data.senderType,
          data.senderId || null,
          data.senderName,
          data.tier || 'L1',
          data.message,
        ],
        { prepare: true }
      );
    } catch (error) {
      logger.db.warn('No se pudo registrar mensaje inmutable en Cassandra', {
        chatId: data.chatId,
        error,
        messageId: data.messageId,
      });
    }
  }

  static async recordTransfer(data: {
    chatId: string;
    fromTier: string;
    notes?: string | null;
    reason?: string | null;
    toTier: string;
    transferredById?: string | null;
    transferredByName: string;
  }): Promise<void> {
    try {
      const client = getCassandraClient();
      const transferId = cassandra.types.TimeUuid.now();
      const timestamp = new Date();
      const query = `
        INSERT INTO support_chat_transfers (
          chat_id, timestamp, transfer_id, from_tier,
          to_tier, transferred_by_id, transferred_by_name,
          reason, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await client.execute(
        query,
        [
          data.chatId,
          timestamp,
          transferId,
          data.fromTier,
          data.toTier,
          data.transferredById || null,
          data.transferredByName,
          data.reason || null,
          data.notes || null,
        ],
        { prepare: true }
      );

      await this.recordChatEvent({
        actorId: data.transferredById,
        actorName: data.transferredByName,
        actorType: 'agent',
        chatId: data.chatId,
        currentTier: data.toTier,
        eventType: 'transferred',
        payload: {
          fromTier: data.fromTier,
          notes: data.notes || null,
          reason: data.reason || null,
          toTier: data.toTier,
        },
      });
    } catch (error) {
      logger.db.warn('No se pudo registrar transferencia inmutable en Cassandra', {
        chatId: data.chatId,
        error,
      });
    }
  }

  static async recordRating(data: {
    agentId?: string | null;
    agentName?: string | null;
    chatId: string;
    feedbackComment?: string | null;
    rating: number;
    tier?: string | null;
    userEmail?: string | null;
    userId?: string | null;
    userName?: string | null;
  }): Promise<void> {
    try {
      const client = getCassandraClient();
      const ratingId = cassandra.types.TimeUuid.now();
      const ratedAt = new Date();
      const targetAgentId = data.agentId || 'unassigned';
      const targetAgentName = data.agentName || 'Equipo de Soporte';
      const targetTier = data.tier || 'L1';
      const comment = data.feedbackComment || null;

      const queryAgent = `
        INSERT INTO support_agent_ratings (
          agent_id, rated_at, rating_id, chat_id,
          rating, feedback_comment, tier, user_id,
          user_email, user_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await client.execute(
        queryAgent,
        [
          targetAgentId,
          ratedAt,
          ratingId,
          data.chatId,
          data.rating,
          comment,
          targetTier,
          data.userId || null,
          data.userEmail || null,
          data.userName || null,
        ],
        { prepare: true }
      );

      const bucketDate = ratedAt.toISOString().slice(0, 10);
      const queryDate = `
        INSERT INTO support_ratings_by_date (
          bucket_date, rated_at, rating_id, agent_id,
          agent_name, chat_id, rating, feedback_comment,
          tier, user_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await client.execute(
        queryDate,
        [
          bucketDate,
          ratedAt,
          ratingId,
          targetAgentId,
          targetAgentName,
          data.chatId,
          data.rating,
          comment,
          targetTier,
          data.userName || null,
        ],
        { prepare: true }
      );

      await this.recordChatEvent({
        actorId: data.userId || null,
        actorName: data.userName || 'Usuario',
        actorType: 'user',
        chatId: data.chatId,
        eventType: 'rated',
        payload: {
          agentId: targetAgentId,
          agentName: targetAgentName,
          comment,
          rating: data.rating,
        },
      });
    } catch (error) {
      logger.db.warn('No se pudo registrar calificación en Cassandra', {
        chatId: data.chatId,
        error,
      });
    }
  }

  static async recordPresenceLog(data: {
    agentId: string;
    agentName: string;
    note?: string | null;
    previousStatus: string;
    status: string;
    tier: string;
  }): Promise<void> {
    try {
      const client = getCassandraClient();
      const eventId = cassandra.types.TimeUuid.now();
      const timestamp = new Date();
      const query = `
        INSERT INTO support_agent_presence_logs (
          agent_id, timestamp, event_id, agent_name,
          tier, status, previous_status, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await client.execute(
        query,
        [
          data.agentId,
          timestamp,
          eventId,
          data.agentName,
          data.tier,
          data.status,
          data.previousStatus,
          data.note || null,
        ],
        { prepare: true }
      );
    } catch (error) {
      logger.db.warn('No se pudo registrar log de presencia en Cassandra', {
        agentId: data.agentId,
        error,
      });
    }
  }

  static async getChatAuditTrail(chatId: string): Promise<ChatAuditEvent[]> {
    try {
      const client = getCassandraClient();
      const query = 'SELECT * FROM support_chats_audit WHERE chat_id = ?';
      const result = await client.execute(query, [chatId], { prepare: true });
      return result.rows.map((row) => {
        let parsedPayload: Record<string, unknown> | null = null;
        if (typeof row.payload_json === 'string' && row.payload_json) {
          try {
            parsedPayload = JSON.parse(row.payload_json);
          } catch {
            parsedPayload = null;
          }
        }
        return {
          actorId: row.actor_id ? String(row.actor_id) : null,
          actorName: String(row.actor_name || ''),
          actorType: (row.actor_type as 'agent' | 'system' | 'user') || 'system',
          auditId: String(row.audit_id),
          currentStatus: String(row.current_status || ''),
          currentTier: String(row.current_tier || ''),
          eventTime: row.event_time ? new Date(row.event_time).toISOString() : new Date().toISOString(),
          eventType: String(row.event_type || ''),
          payload: parsedPayload,
          subject: String(row.subject || ''),
        };
      });
    } catch (error) {
      logger.db.warn('Fallo al consultar auditoría de chat en Cassandra', { chatId, error });
      return [];
    }
  }

  static async getChatTransfers(chatId: string): Promise<ChatTransferRecord[]> {
    try {
      const client = getCassandraClient();
      const query = 'SELECT * FROM support_chat_transfers WHERE chat_id = ?';
      const result = await client.execute(query, [chatId], { prepare: true });
      return result.rows.map((row) => ({
        fromTier: String(row.from_tier || ''),
        notes: row.notes ? String(row.notes) : null,
        reason: row.reason ? String(row.reason) : null,
        timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : new Date().toISOString(),
        toTier: String(row.to_tier || ''),
        transferId: String(row.transfer_id),
        transferredById: row.transferred_by_id ? String(row.transferred_by_id) : null,
        transferredByName: String(row.transferred_by_name || ''),
      }));
    } catch (error) {
      logger.db.warn('Fallo al consultar transferencias en Cassandra', { chatId, error });
      return [];
    }
  }

  static async getImmutableMessages(chatId: string): Promise<ImmutableMessageRecord[]> {
    try {
      const client = getCassandraClient();
      const query = 'SELECT * FROM support_messages_immutable WHERE chat_id = ?';
      const result = await client.execute(query, [chatId], { prepare: true });
      return result.rows.map((row) => ({
        message: String(row.message || ''),
        messageId: String(row.message_id || ''),
        senderId: row.sender_id ? String(row.sender_id) : null,
        senderName: String(row.sender_name || ''),
        senderType: (row.sender_type as 'agent' | 'system' | 'user') || 'system',
        tier: String(row.tier || 'L1'),
        timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : new Date().toISOString(),
      }));
    } catch (error) {
      logger.db.warn('Fallo al consultar mensajes inmutables en Cassandra', { chatId, error });
      return [];
    }
  }

  static async getAgentRatings(agentId?: string): Promise<AgentRatingRecord[]> {
    try {
      const client = getCassandraClient();
      if (agentId) {
        const query = 'SELECT * FROM support_agent_ratings WHERE agent_id = ?';
        const result = await client.execute(query, [agentId], { prepare: true });
        return result.rows.map((row) => ({
          agentId: String(row.agent_id),
          chatId: String(row.chat_id || ''),
          feedbackComment: row.feedback_comment ? String(row.feedback_comment) : null,
          ratedAt: row.rated_at ? new Date(row.rated_at).toISOString() : new Date().toISOString(),
          rating: Number(row.rating || 0),
          ratingId: String(row.rating_id),
          tier: String(row.tier || 'L1'),
          userName: row.user_name ? String(row.user_name) : null,
        }));
      }

      const today = new Date().toISOString().slice(0, 10);
      const query = 'SELECT * FROM support_ratings_by_date WHERE bucket_date = ?';
      const result = await client.execute(query, [today], { prepare: true });
      return result.rows.map((row) => ({
        agentId: String(row.agent_id || ''),
        agentName: row.agent_name ? String(row.agent_name) : undefined,
        chatId: String(row.chat_id || ''),
        feedbackComment: row.feedback_comment ? String(row.feedback_comment) : null,
        ratedAt: row.rated_at ? new Date(row.rated_at).toISOString() : new Date().toISOString(),
        rating: Number(row.rating || 0),
        ratingId: String(row.rating_id),
        tier: String(row.tier || 'L1'),
        userName: row.user_name ? String(row.user_name) : null,
      }));
    } catch (error) {
      logger.db.warn('Fallo al consultar calificaciones en Cassandra', { agentId, error });
      return [];
    }
  }

  static async closeClient(): Promise<void> {
    if (clientInstance) {
      try {
        await clientInstance.shutdown();
      } catch {
        // ignore
      }
      clientInstance = null;
    }
  }
}
