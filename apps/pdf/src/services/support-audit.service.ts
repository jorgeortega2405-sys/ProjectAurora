import cassandra from 'cassandra-driver';
import { config } from '../config/env.config.js';
import { logger } from './logger.service.js';

let clientInstance: cassandra.Client | null = null;

function getCassandraClient(): cassandra.Client {
  if (!clientInstance) {
    clientInstance = new cassandra.Client({
      contactPoints: [config.cassandra.host],
      keyspace: config.cassandra.keyspace,
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
