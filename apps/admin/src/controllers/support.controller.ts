import { Request, Response } from 'express';
import { AdminLiveSupportService } from '../services/live-support.service.js';
import { logger } from '../services/logger.service.js';
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
