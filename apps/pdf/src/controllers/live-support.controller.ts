import { Request, Response } from 'express';
import { LiveSupportService } from '../services/live-support.service.js';
import { logger } from '../services/logger.service.js';

export async function createLiveChatController(req: Request, res: Response): Promise<void> {
  try {
    const rawSubject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
    const rawSessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
    const rawName = typeof req.body?.userName === 'string' ? req.body.userName.trim() : '';
    const rawEmail = typeof req.body?.userEmail === 'string' ? req.body.userEmail.trim() : '';

    if (!rawSubject) {
      res.status(400).json({ error: 'Por favor indica el motivo o razón de la consulta.', success: false });
      return;
    }

    if (!rawSessionId) {
      res.status(400).json({ error: 'Identificador de sesión inválido.', success: false });
      return;
    }

    const authUser = (req as any).user;
    const userName = rawName || authUser?.username || authUser?.name || 'Usuario';
    const userEmail = rawEmail || authUser?.email || 'anonimo@aurora.app';
    const userId = authUser?.id || null;

    const chat = await LiveSupportService.createChat({
      sessionId: rawSessionId,
      subject: rawSubject,
      userEmail,
      userId,
      userName,
    });

    res.status(201).json({ chat, success: true });
  } catch (error) {
    logger.app.error('Error al registrar chat de soporte en vivo', { error });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function getLiveChatController(req: Request, res: Response): Promise<void> {
  try {
    const chatId = String(req.params.id || '');
    if (!chatId) {
      res.status(400).json({ error: 'ID de chat no proporcionado.', success: false });
      return;
    }

    const chat = await LiveSupportService.getChatById(chatId);
    if (!chat) {
      res.status(404).json({ error: 'Chat no encontrado.', success: false });
      return;
    }

    res.json({ chat, success: true });
  } catch (error) {
    logger.app.error('Error al obtener chat de soporte en vivo', { error });
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

    const messages = await LiveSupportService.getMessages(chatId);
    res.json({ messages, success: true });
  } catch (error) {
    logger.app.error('Error al obtener mensajes de soporte en vivo', { error });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function sendUserLiveMessageController(req: Request, res: Response): Promise<void> {
  try {
    const chatId = String(req.params.id || '');
    const rawMessage = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const rawSenderName = typeof req.body?.senderName === 'string' ? req.body.senderName.trim() : '';

    if (!chatId) {
      res.status(400).json({ error: 'ID de chat no proporcionado.', success: false });
      return;
    }

    if (!rawMessage) {
      res.status(400).json({ error: 'El mensaje no puede estar vacío.', success: false });
      return;
    }

    const authUser = (req as any).user;
    const senderName = rawSenderName || authUser?.username || authUser?.name || 'Usuario';
    const senderId = authUser?.id || null;

    const chat = await LiveSupportService.getChatById(chatId);
    if (!chat) {
      res.status(404).json({ error: 'Chat no encontrado.', success: false });
      return;
    }

    if (chat.status === 'closed') {
      res.status(400).json({ error: 'No es posible enviar mensajes en una sesión de soporte cerrada.', success: false });
      return;
    }

    const message = await LiveSupportService.addUserMessage({
      chatId,
      message: rawMessage,
      senderId,
      senderName,
    });

    res.status(201).json({ message, success: true });
  } catch (error) {
    logger.app.error('Error al enviar mensaje de usuario en soporte en vivo', { error });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}
