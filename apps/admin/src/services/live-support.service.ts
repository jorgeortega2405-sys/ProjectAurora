import crypto from 'crypto';
import { RowDataPacket } from 'mysql2';
import { adminDbPool } from './db.service.js';
import { logger } from './logger.service.js';
import { publishSupportEvent } from './redis.service.js';

export interface AdminLiveChatRecord {
  assigned_agent_id: string | null;
  assigned_agent_name: string | null;
  closed_at: string | null;
  created_at: string;
  id: string;
  last_message?: string;
  message_count?: number;
  session_id: string;
  status: 'pending' | 'active' | 'closed';
  subject: string;
  tier: 'L1' | 'L2' | 'L3';
  updated_at: string;
  user_email: string;
  user_id: string | null;
  user_name: string;
}

export interface AdminLiveMessageRecord {
  chat_id: string;
  created_at: string;
  id: string;
  message: string;
  sender_id: string | null;
  sender_name: string;
  sender_type: 'user' | 'agent' | 'system';
}

interface ChatRowPacket extends RowDataPacket, AdminLiveChatRecord {}
interface MessageRowPacket extends RowDataPacket, AdminLiveMessageRecord {}

export class AdminLiveSupportService {
  static async listChats(filters: {
    search?: string;
    status?: string;
    tier?: string;
  } = {}): Promise<AdminLiveChatRecord[]> {
    let sql = `
      SELECT c.*,
        (SELECT COUNT(*) FROM live_support_messages m WHERE m.chat_id = c.id) AS message_count,
        (SELECT m2.message FROM live_support_messages m2 WHERE m2.chat_id = c.id ORDER BY m2.created_at DESC LIMIT 1) AS last_message
      FROM live_support_chats c
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (filters.status && filters.status !== 'all') {
      sql += ' AND c.status = ?';
      params.push(filters.status);
    }

    if (filters.tier && filters.tier !== 'all') {
      sql += ' AND c.tier = ?';
      params.push(filters.tier);
    }

    if (filters.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      sql += ' AND (c.user_name LIKE ? OR c.user_email LIKE ? OR c.subject LIKE ?)';
      params.push(term, term, term);
    }

    sql += ' ORDER BY c.created_at DESC LIMIT 100';

    const [rows] = await adminDbPool.query<ChatRowPacket[]>(sql, params);
    return rows;
  }

  static async getChatById(id: string): Promise<AdminLiveChatRecord | null> {
    const [rows] = await adminDbPool.query<ChatRowPacket[]>(
      'SELECT * FROM live_support_chats WHERE id = ? LIMIT 1',
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  static async getMessages(chatId: string): Promise<AdminLiveMessageRecord[]> {
    const [rows] = await adminDbPool.query<MessageRowPacket[]>(
      'SELECT * FROM live_support_messages WHERE chat_id = ? ORDER BY created_at ASC',
      [chatId]
    );
    return rows;
  }

  static async claimChat(
    chatId: string,
    agentId: string | null,
    agentName: string
  ): Promise<AdminLiveChatRecord> {
    const chat = await this.getChatById(chatId);
    if (!chat) {
      throw new Error('El caso de soporte no existe.');
    }

    await adminDbPool.query(
      `UPDATE live_support_chats 
       SET status = 'active', assigned_agent_id = ?, assigned_agent_name = ?, updated_at = NOW() 
       WHERE id = ?`,
      [agentId, agentName, chatId]
    );

    const msgId = crypto.randomUUID();
    const text = `El agente ${agentName} ha aceptado y tomado el caso de soporte.`;
    await adminDbPool.query(
      `INSERT INTO live_support_messages (id, chat_id, sender_type, sender_id, sender_name, message)
       VALUES (?, ?, 'system', NULL, 'Sistema', ?)`,
      [msgId, chatId, text]
    );

    const updated = await this.getChatById(chatId);
    if (!updated) {
      throw new Error('Fallo al obtener caso actualizado.');
    }

    await publishSupportEvent({
      agentId,
      agentName,
      chatId,
      message: text,
      sessionId: chat.session_id,
      status: 'active',
      target: 'admin_support',
      tier: updated.tier,
      type: 'chat_claimed',
    });

    return updated;
  }

  static async transferChat(
    chatId: string,
    newTier: 'L1' | 'L2' | 'L3',
    agentName: string,
    notes?: string
  ): Promise<AdminLiveChatRecord> {
    const chat = await this.getChatById(chatId);
    if (!chat) {
      throw new Error('El caso de soporte no existe.');
    }

    await adminDbPool.query(
      `UPDATE live_support_chats 
       SET tier = ?, updated_at = NOW() 
       WHERE id = ?`,
      [newTier, chatId]
    );

    const msgId = crypto.randomUUID();
    const reasonText = notes && notes.trim() ? ` (Motivo: ${notes.trim()})` : '';
    const text = `Caso transferido/escalado a Soporte Nivel ${newTier} por ${agentName}${reasonText}.`;

    await adminDbPool.query(
      `INSERT INTO live_support_messages (id, chat_id, sender_type, sender_id, sender_name, message)
       VALUES (?, ?, 'system', NULL, 'Sistema', ?)`,
      [msgId, chatId, text]
    );

    const updated = await this.getChatById(chatId);
    if (!updated) {
      throw new Error('Fallo al obtener caso actualizado.');
    }

    await publishSupportEvent({
      agentName,
      chatId,
      message: text,
      notes: notes || null,
      sessionId: chat.session_id,
      status: updated.status,
      target: 'admin_support',
      tier: newTier,
      type: 'chat_transferred',
    });

    return updated;
  }

  static async closeChat(
    chatId: string,
    agentName: string
  ): Promise<AdminLiveChatRecord> {
    const chat = await this.getChatById(chatId);
    if (!chat) {
      throw new Error('El caso de soporte no existe.');
    }

    await adminDbPool.query(
      `UPDATE live_support_chats 
       SET status = 'closed', closed_at = NOW(), updated_at = NOW() 
       WHERE id = ?`,
      [chatId]
    );

    const msgId = crypto.randomUUID();
    const text = `Caso de soporte cerrado y marcado como resuelto por ${agentName}.`;

    await adminDbPool.query(
      `INSERT INTO live_support_messages (id, chat_id, sender_type, sender_id, sender_name, message)
       VALUES (?, ?, 'system', NULL, 'Sistema', ?)`,
      [msgId, chatId, text]
    );

    const updated = await this.getChatById(chatId);
    if (!updated) {
      throw new Error('Fallo al obtener caso actualizado.');
    }

    await publishSupportEvent({
      agentName,
      chatId,
      message: text,
      sessionId: chat.session_id,
      status: 'closed',
      target: 'admin_support',
      tier: updated.tier,
      type: 'chat_closed',
    });

    return updated;
  }

  static async addAgentMessage(
    chatId: string,
    agentId: string | null,
    agentName: string,
    message: string
  ): Promise<AdminLiveMessageRecord> {
    const chat = await this.getChatById(chatId);
    if (!chat) {
      throw new Error('El caso de soporte no existe.');
    }

    if (chat.status !== 'active') {
      throw new Error('El caso de soporte no se encuentra en estado activo.');
    }

    if (!chat.assigned_agent_id || (agentId && chat.assigned_agent_id !== agentId)) {
      throw new Error('El caso de soporte no está asignado a este agente.');
    }

    const id = crypto.randomUUID();
    const sql = `
      INSERT INTO live_support_messages (id, chat_id, sender_type, sender_id, sender_name, message)
      VALUES (?, ?, 'agent', ?, ?, ?)
    `;

    await adminDbPool.query(sql, [id, chatId, agentId, agentName, message.trim()]);

    const msgRecord: AdminLiveMessageRecord = {
      chat_id: chatId,
      created_at: new Date().toISOString(),
      id,
      message: message.trim(),
      sender_id: agentId,
      sender_name: agentName,
      sender_type: 'agent',
    };

    await publishSupportEvent({
      chatId,
      createdAt: msgRecord.created_at,
      id,
      message: msgRecord.message,
      senderId: agentId,
      senderName: agentName,
      senderType: 'agent',
      sessionId: chat.session_id,
      type: 'chat_message',
    });

    return msgRecord;
  }
}
