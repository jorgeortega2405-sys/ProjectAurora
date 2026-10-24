import crypto from 'crypto';
import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.config.js';
import { redis } from '../config/redis.config.js';
import { logger } from './logger.service.js';

export interface LiveChatRecord {
  assigned_agent_id: string | null;
  assigned_agent_name: string | null;
  closed_at: string | null;
  created_at: string;
  feedback_comment: string | null;
  id: string;
  rated_at: string | null;
  rating: number | null;
  session_id: string;
  status: 'pending' | 'active' | 'closed';
  subject: string;
  tier: 'L1' | 'L2' | 'L3';
  updated_at: string;
  user_email: string;
  user_id: string | null;
  user_name: string;
}

export interface LiveChatMessageRecord {
  chat_id: string;
  created_at: string;
  id: string;
  message: string;
  sender_id: string | null;
  sender_name: string;
  sender_type: 'user' | 'agent' | 'system';
}

interface ChatRow extends RowDataPacket, LiveChatRecord {}
interface MessageRow extends RowDataPacket, LiveChatMessageRecord {}

export class LiveSupportService {
  static async createChat(data: {
    sessionId: string;
    subject: string;
    userEmail: string;
    userId?: string | null;
    userName: string;
  }): Promise<LiveChatRecord> {
    const existingActive = await this.getActiveChat({
      sessionId: data.sessionId,
      userEmail: data.userEmail,
      userId: data.userId,
    });
    if (existingActive) {
      return existingActive;
    }

    const id = crypto.randomUUID();
    const initialTier: 'L1' | 'L2' | 'L3' = 'L1';
    const initialStatus: 'pending' | 'active' | 'closed' = 'pending';

    const sql = `
      INSERT INTO live_support_chats (id, session_id, user_id, user_name, user_email, subject, status, tier)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await pool.query(sql, [
      id,
      data.sessionId,
      data.userId || null,
      data.userName.trim(),
      data.userEmail.trim().toLowerCase(),
      data.subject.trim(),
      initialStatus,
      initialTier,
    ]);

    const welcomeMsgId = crypto.randomUUID();
    const welcomeText = `Solicitud de atención iniciada con motivo: "${data.subject.trim()}". Un agente de Nivel L1 se conectará en breve.`;
    const msgSql = `
      INSERT INTO live_support_messages (id, chat_id, sender_type, sender_id, sender_name, message)
      VALUES (?, ?, 'system', NULL, 'Sistema', ?)
    `;
    await pool.query(msgSql, [welcomeMsgId, id, welcomeText]);

    const chat = await this.getChatById(id);
    if (!chat) {
      throw new Error('No se pudo verificar el chat creado.');
    }

    try {
      if (redis.status === 'ready') {
        const payload = JSON.stringify({
          chatId: id,
          createdAt: chat.created_at,
          sessionId: data.sessionId,
          status: chat.status,
          subject: chat.subject,
          target: 'admin_support',
          tier: chat.tier,
          type: 'chat_created',
          userEmail: chat.user_email,
          userName: chat.user_name,
        });
        await redis.publish('aurora:support:events', payload);
      }
    } catch (err) {
      logger.app.warn('Fallo al publicar evento de nuevo chat en Redis', { error: err });
    }

    return chat;
  }

  static async getChatById(id: string): Promise<LiveChatRecord | null> {
    const [rows] = await pool.query<ChatRow[]>(
      'SELECT * FROM live_support_chats WHERE id = ? LIMIT 1',
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  static async getChatBySessionId(sessionId: string): Promise<LiveChatRecord | null> {
    const [rows] = await pool.query<ChatRow[]>(
      'SELECT * FROM live_support_chats WHERE session_id = ? ORDER BY created_at DESC LIMIT 1',
      [sessionId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  static async getMessages(chatId: string): Promise<LiveChatMessageRecord[]> {
    const [rows] = await pool.query<MessageRow[]>(
      'SELECT * FROM live_support_messages WHERE chat_id = ? ORDER BY created_at ASC',
      [chatId]
    );
    return rows;
  }

  static async addUserMessage(data: {
    chatId: string;
    message: string;
    senderId?: string | null;
    senderName: string;
  }): Promise<LiveChatMessageRecord> {
    const chat = await this.getChatById(data.chatId);
    if (!chat) {
      throw new Error('El chat de soporte no existe.');
    }

    if (chat.status === 'closed') {
      throw new Error('No es posible enviar mensajes en una sesión cerrada.');
    }

    const id = crypto.randomUUID();
    const sql = `
      INSERT INTO live_support_messages (id, chat_id, sender_type, sender_id, sender_name, message)
      VALUES (?, ?, 'user', ?, ?, ?)
    `;

    await pool.query(sql, [
      id,
      data.chatId,
      data.senderId || null,
      data.senderName,
      data.message.trim(),
    ]);

    const msgRecord: LiveChatMessageRecord = {
      chat_id: data.chatId,
      created_at: new Date().toISOString(),
      id,
      message: data.message.trim(),
      sender_id: data.senderId || null,
      sender_name: data.senderName,
      sender_type: 'user',
    };

    try {
      if (redis.status === 'ready') {
        const payload = JSON.stringify({
          chatId: data.chatId,
          createdAt: msgRecord.created_at,
          id,
          message: msgRecord.message,
          senderId: msgRecord.sender_id,
          senderName: msgRecord.sender_name,
          senderType: 'user',
          sessionId: chat.session_id,
          type: 'chat_message',
        });
        await redis.publish('aurora:support:events', payload);
      }
    } catch (err) {
      logger.app.warn('Fallo al publicar mensaje de usuario en Redis', { error: err });
    }

    return msgRecord;
  }

  static async getActiveChat(criteria: {
    sessionId?: string | null;
    userEmail?: string | null;
    userId?: string | null;
  }): Promise<LiveChatRecord | null> {
    if (criteria.userId) {
      const [rows] = await pool.query<ChatRow[]>(
        'SELECT * FROM live_support_chats WHERE user_id = ? AND status IN (\'pending\', \'active\') ORDER BY created_at DESC LIMIT 1',
        [criteria.userId]
      );
      if (rows.length > 0) {
        return rows[0];
      }
    }

    if (criteria.sessionId) {
      const [rows] = await pool.query<ChatRow[]>(
        'SELECT * FROM live_support_chats WHERE session_id = ? AND status IN (\'pending\', \'active\') ORDER BY created_at DESC LIMIT 1',
        [criteria.sessionId]
      );
      if (rows.length > 0) {
        return rows[0];
      }
    }

    if (criteria.userEmail) {
      const [rows] = await pool.query<ChatRow[]>(
        'SELECT * FROM live_support_chats WHERE user_email = ? AND status IN (\'pending\', \'active\') ORDER BY created_at DESC LIMIT 1',
        [criteria.userEmail.trim().toLowerCase()]
      );
      if (rows.length > 0) {
        return rows[0];
      }
    }

    return null;
  }

  static async closeChat(chatId: string, closedBy: 'user' | 'agent' = 'user'): Promise<LiveChatRecord> {
    const chat = await this.getChatById(chatId);
    if (!chat) {
      throw new Error('El chat no existe.');
    }

    if (chat.status === 'closed') {
      return chat;
    }

    await pool.query(
      `UPDATE live_support_chats 
       SET status = 'closed', closed_at = NOW() 
       WHERE id = ?`,
      [chatId]
    );

    const closeMsgId = crypto.randomUUID();
    const closeText = closedBy === 'user'
      ? 'Sesión de soporte finalizada por el usuario.'
      : 'Sesión de soporte finalizada.';

    await pool.query(
      `INSERT INTO live_support_messages (id, chat_id, sender_type, sender_id, sender_name, message)
       VALUES (?, ?, 'system', NULL, 'Sistema', ?)`,
      [closeMsgId, chatId, closeText]
    );

    const updated = await this.getChatById(chatId);
    if (!updated) {
      throw new Error('No se pudo verificar el cierre del caso.');
    }

    try {
      if (redis.status === 'ready') {
        const payload = JSON.stringify({
          chatId,
          closedBy,
          sessionId: chat.session_id,
          status: 'closed',
          type: 'chat_closed',
        });
        await redis.publish('aurora:support:events', payload);
      }
    } catch (err) {
      logger.app.warn('Fallo al publicar evento de chat_closed en Redis', { error: err });
    }

    return updated;
  }

  static async rateChat(data: {
    chatId: string;
    feedbackComment?: string | null;
    rating: number;
  }): Promise<LiveChatRecord> {
    const chat = await this.getChatById(data.chatId);
    if (!chat) {
      throw new Error('El chat no existe.');
    }

    const ratingVal = Math.max(1, Math.min(5, Math.round(data.rating)));
    const comment = typeof data.feedbackComment === 'string' && data.feedbackComment.trim()
      ? data.feedbackComment.trim()
      : null;

    await pool.query(
      `UPDATE live_support_chats 
       SET rating = ?, feedback_comment = ?, rated_at = NOW() 
       WHERE id = ?`,
      [ratingVal, comment, data.chatId]
    );

    const updated = await this.getChatById(data.chatId);
    if (!updated) {
      throw new Error('No se pudo verificar el registro de la calificación.');
    }

    return updated;
  }
}
