import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import { AgentPresenceService, AgentPresenceStatus } from '../services/agent-presence.service.js';
import { adminDbPool } from '../services/db.service.js';
import { AdminLiveSupportService } from '../services/live-support.service.js';
import { logger } from '../services/logger.service.js';
import { SupportAuditService } from '../services/support-audit.service.js';
import { SupportQualityService } from '../services/support-quality.service.js';

export async function listLiveChatsController(req: Request, res: Response): Promise<void> {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const tier = typeof req.query.tier === 'string' ? req.query.tier : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;

    const chats = await AdminLiveSupportService.listChats({ search, status, tier });
    res.json({ chats, success: true });
  } catch (error) {
    logger.app.error('Error al listar chats de soporte en vivo', { error });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function getLiveChatByIdController(req: Request, res: Response): Promise<void> {
  try {
    const chatId = String(req.params.id || '');
    if (!chatId) {
      res.status(400).json({ error: 'ID de chat no proporcionado.', success: false });
      return;
    }

    const chat = await AdminLiveSupportService.getChatById(chatId);
    if (!chat) {
      res.status(404).json({ error: 'Caso de soporte no encontrado.', success: false });
      return;
    }

    res.json({ chat, success: true });
  } catch (error) {
    logger.app.error('Error al consultar chat de soporte en vivo', { error });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function getLiveChatMessagesController(req: Request, res: Response): Promise<void> {
  try {
    const chatId = String(req.params.id || '');
    if (!chatId) {
      res.status(400).json({ error: 'ID de chat no proporcionado.', success: false });
      return;
    }

    const messages = await AdminLiveSupportService.getMessages(chatId);
    res.json({ messages, success: true });
  } catch (error) {
    logger.app.error('Error al consultar mensajes de chat de soporte en vivo', { error });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function claimLiveChatController(req: Request, res: Response): Promise<void> {
  try {
    const chatId = String(req.params.id || '');
    if (!chatId) {
      res.status(400).json({ error: 'ID de chat no proporcionado.', success: false });
      return;
    }

    const authUser = (req as any).adminUser || (req as any).user;
    const agentId = authUser?.id || null;
    const agentName = authUser?.username || authUser?.name || 'Agente de Soporte';

    const chat = await AdminLiveSupportService.claimChat(chatId, agentId, agentName);
    res.json({ chat, success: true });
  } catch (error) {
    logger.app.error('Error al tomar caso de soporte en vivo', { error });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function transferLiveChatController(req: Request, res: Response): Promise<void> {
  try {
    const chatId = String(req.params.id || '');
    const targetTier = req.body?.tier;
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : undefined;

    if (!chatId) {
      res.status(400).json({ error: 'ID de chat no proporcionado.', success: false });
      return;
    }

    if (!['L1', 'L2', 'L3'].includes(targetTier)) {
      res.status(400).json({ error: 'Nivel de soporte inválido. Debe ser L1, L2 o L3.', success: false });
      return;
    }

    const authUser = (req as any).adminUser || (req as any).user;
    const agentName = authUser?.username || authUser?.name || 'Agente de Soporte';

    const chat = await AdminLiveSupportService.transferChat(chatId, targetTier, agentName, notes);
    res.json({ chat, success: true });
  } catch (error) {
    logger.app.error('Error al transferir caso de soporte en vivo', { error });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function closeLiveChatController(req: Request, res: Response): Promise<void> {
  try {
    const chatId = String(req.params.id || '');
    if (!chatId) {
      res.status(400).json({ error: 'ID de chat no proporcionado.', success: false });
      return;
    }

    const authUser = (req as any).adminUser || (req as any).user;
    const agentName = authUser?.username || authUser?.name || 'Agente de Soporte';

    const chat = await AdminLiveSupportService.closeChat(chatId, agentName);
    res.json({ chat, success: true });
  } catch (error) {
    logger.app.error('Error al cerrar caso de soporte en vivo', { error });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function sendAgentMessageController(req: Request, res: Response): Promise<void> {
  try {
    const chatId = String(req.params.id || '');
    const rawMessage = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

    if (!chatId) {
      res.status(400).json({ error: 'ID de chat no proporcionado.', success: false });
      return;
    }

    if (!rawMessage) {
      res.status(400).json({ error: 'El mensaje no puede estar vacío.', success: false });
      return;
    }

    const authUser = (req as any).adminUser || (req as any).user;
    const agentId = authUser?.id || null;
    const agentName = authUser?.username || authUser?.name || 'Agente de Soporte';

    const chat = await AdminLiveSupportService.getChatById(chatId);
    if (!chat) {
      res.status(404).json({ error: 'Caso de soporte no encontrado.', success: false });
      return;
    }

    if (chat.status !== 'active') {
      res.status(400).json({
        error: chat.status === 'pending'
          ? 'El caso de soporte no ha sido tomado aún.'
          : 'El caso de soporte ya se encuentra cerrado.',
        success: false,
      });
      return;
    }

    if (!chat.assigned_agent_id || (agentId && chat.assigned_agent_id !== agentId)) {
      res.status(403).json({
        error: 'No tienes autorización para enviar mensajes en un caso no asignado o asignado a otro agente.',
        success: false,
      });
      return;
    }

    const moderation = await SupportQualityService.refineAndModerateMessage(rawMessage, {
      subject: chat.subject,
      tier: chat.tier,
      userName: chat.user_name,
    });

    if (moderation.isOffensive) {
      logger.security.warn('Bloqueo definitivo de mensaje ofensivo en persistencia', {
        agentId,
        chatId,
        reason: moderation.reason,
      });
      res.status(400).json({
        error: 'El mensaje contiene lenguaje ofensivo o inapropiado y no puede ser enviado.',
        reason: moderation.reason,
        success: false,
      });
      return;
    }

    const message = await AdminLiveSupportService.addAgentMessage(chatId, agentId, agentName, rawMessage);
    res.status(201).json({ message, success: true });
  } catch (error) {
    logger.app.error('Error al enviar mensaje de agente en soporte en vivo', { error });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function refineAgentMessageController(req: Request, res: Response): Promise<void> {
  try {
    const chatId = String(req.params.id || req.body?.chatId || '');
    const rawMessage = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

    if (!chatId) {
      res.status(400).json({ error: 'ID de chat no proporcionado.', success: false });
      return;
    }

    if (!rawMessage) {
      res.status(400).json({ error: 'El mensaje a evaluar no puede estar vacío.', success: false });
      return;
    }

    const chat = await AdminLiveSupportService.getChatById(chatId);
    if (!chat) {
      res.status(404).json({ error: 'Caso de soporte no encontrado.', success: false });
      return;
    }

    const authUser = (req as any).adminUser || (req as any).user;
    const agentId = authUser?.id || null;

    if (!chat.assigned_agent_id || (agentId && chat.assigned_agent_id !== agentId)) {
      res.status(403).json({
        error: 'No tienes autorización para operar sobre un caso no asignado o asignado a otro agente.',
        success: false,
      });
      return;
    }

    const result = await SupportQualityService.refineAndModerateMessage(rawMessage, {
      subject: chat.subject,
      tier: chat.tier,
      userName: chat.user_name,
    });

    if (result.isOffensive) {
      logger.security.warn('Intento de mensaje ofensivo detectado y bloqueado en soporte', {
        agentId,
        chatId,
        reason: result.reason,
      });
    }

    res.json({
      isOffensive: result.isOffensive,
      reason: result.reason,
      refinedMessage: result.refinedMessage,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al procesar refinamiento y moderación de mensaje con IA', { error });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function getAgentPresenceController(req: Request, res: Response): Promise<void> {
  try {
    const authUser = (req as any).adminUser || (req as any).user;
    const currentAgentId = authUser?.id || '';
    const presences = await AgentPresenceService.listPresences();
    const myPresence = currentAgentId ? await AgentPresenceService.getPresence(currentAgentId) : null;

    res.json({
      myPresence,
      presences,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al obtener estados de presencia de agentes', { error });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function updateAgentPresenceController(req: Request, res: Response): Promise<void> {
  try {
    const authUser = (req as any).adminUser || (req as any).user;
    const agentId = authUser?.id;
    const agentName = authUser?.username || authUser?.name || 'Agente de Soporte';
    const rawStatus = String(req.body?.status || '').trim().toLowerCase();
    const rawTier = String(req.body?.tier || '').trim().toUpperCase();
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : null;

    if (!agentId) {
      res.status(401).json({ error: 'No autorizado.', success: false });
      return;
    }

    const validStatuses: AgentPresenceStatus[] = ['available', 'away', 'busy', 'offline'];
    if (!validStatuses.includes(rawStatus as AgentPresenceStatus)) {
      res.status(400).json({
        error: 'Estado de presencia inválido. Debe ser available, away, busy u offline.',
        success: false,
      });
      return;
    }

    const tier = ['L1', 'L2', 'L3'].includes(rawTier) ? (rawTier as 'L1' | 'L2' | 'L3') : undefined;
    const presence = await AgentPresenceService.updatePresence(
      agentId,
      rawStatus as AgentPresenceStatus,
      agentName,
      tier,
      note
    );

    res.json({ presence, success: true });
  } catch (error) {
    logger.app.error('Error al actualizar estado de presencia de agente', { error });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function getChatAuditTrailController(req: Request, res: Response): Promise<void> {
  try {
    const chatId = String(req.params.id || '').trim();
    if (!chatId) {
      res.status(400).json({ error: 'ID de chat no proporcionado.', success: false });
      return;
    }

    const chat = await AdminLiveSupportService.getChatById(chatId);
    if (!chat) {
      res.status(404).json({ error: 'Caso de soporte no encontrado.', success: false });
      return;
    }

    const [auditTrail, transfers, immutableMessages] = await Promise.all([
      SupportAuditService.getChatAuditTrail(chatId),
      SupportAuditService.getChatTransfers(chatId),
      SupportAuditService.getImmutableMessages(chatId),
    ]);

    res.json({
      auditTrail,
      chat,
      immutableMessages,
      success: true,
      transfers,
    });
  } catch (error) {
    logger.app.error('Error al consultar auditoría inmutable de soporte en Cassandra', { error });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function getSupportRatingsController(req: Request, res: Response): Promise<void> {
  try {
    const agentId = typeof req.query.agentId === 'string' && req.query.agentId.trim()
      ? req.query.agentId.trim()
      : undefined;

    let cassandraRatings = await SupportAuditService.getAgentRatings(agentId);

    let sql = `
      SELECT 
        c.id AS chatId,
        c.assigned_agent_id AS agentId,
        c.assigned_agent_name AS agentName,
        c.tier,
        c.rating,
        c.feedback_comment AS feedbackComment,
        c.rated_at AS ratedAt,
        c.user_name AS userName,
        c.user_email AS userEmail
      FROM live_support_chats c
      WHERE c.rating IS NOT NULL
    `;
    const params: unknown[] = [];
    if (agentId) {
      sql += ' AND c.assigned_agent_id = ?';
      params.push(agentId);
    }
    sql += ' ORDER BY c.rated_at DESC LIMIT 100';

    const [mysqlRows] = await adminDbPool.query<RowDataPacket[]>(sql, params);

    const mergedMap = new Map<string, any>();
    for (const r of mysqlRows) {
      mergedMap.set(String(r.chatId), {
        agentId: r.agentId,
        agentName: r.agentName,
        chatId: r.chatId,
        feedbackComment: r.feedbackComment,
        ratedAt: r.ratedAt ? new Date(r.ratedAt).toISOString() : new Date().toISOString(),
        rating: Number(r.rating),
        tier: r.tier,
        userName: r.userName,
      });
    }

    for (const cr of cassandraRatings) {
      if (!mergedMap.has(cr.chatId)) {
        mergedMap.set(cr.chatId, cr);
      }
    }

    const allRatings = Array.from(mergedMap.values());
    const totalCount = allRatings.length;
    const starBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;

    for (const r of allRatings) {
      const val = Math.max(1, Math.min(5, Math.round(r.rating)));
      starBreakdown[val as 1 | 2 | 3 | 4 | 5] = (starBreakdown[val as 1 | 2 | 3 | 4 | 5] || 0) + 1;
      sum += val;
    }

    const averageRating = totalCount > 0 ? Number((sum / totalCount).toFixed(2)) : 5.0;

    res.json({
      ratings: allRatings,
      success: true,
      summary: {
        averageRating,
        starBreakdown,
        totalRatings: totalCount,
      },
    });
  } catch (error) {
    logger.app.error('Error al consultar calificaciones de soporte', { error });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}
