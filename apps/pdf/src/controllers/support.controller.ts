import { Request, Response } from 'express';
import { addPublicTicketReply, createContactTicket, getPublicTicketByToken, handleInboundWebhookPayload } from '../services/contact.service.js';
import { logger } from '../services/logger.service.js';
import { SupportAiService, SupportChatMessage } from '../services/support-ai.service.js';
import { validateEmail } from '../utils/validators.util.js';

export async function handleSupportChat(req: Request, res: Response): Promise<void> {
  try {
    const rawMessage = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

    if (!rawMessage) {
      res.status(400).json({
        error: 'Por favor, escribe una pregunta para el asistente de soporte.',
        success: false,
      });
      return;
    }

    if (rawMessage.length > 2000) {
      res.status(400).json({
        error: 'El mensaje no debe superar los 2000 caracteres.',
        success: false,
      });
      return;
    }

    let history: SupportChatMessage[] = [];
    if (Array.isArray(req.body?.history)) {
      history = req.body.history
        .filter((item: any) => item && typeof item.text === 'string' && (item.role === 'user' || item.role === 'assistant'))
        .slice(-10)
        .map((item: any) => ({
          role: item.role as 'assistant' | 'user',
          text: String(item.text).slice(0, 2000),
        }));
    }

    const result = await SupportAiService.askSupport(rawMessage, history);
    res.json(result);
  } catch (error) {
    logger.app.error('Error al procesar consulta de soporte técnico con IA', { error });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function handleCreateContactTicket(req: Request, res: Response): Promise<void> {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const category = typeof req.body?.category === 'string' ? req.body.category.trim() : 'general';
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';

    if (name.length < 2 || name.length > 120) {
      res.status(400).json({
        error: 'Por favor ingresa tu nombre completo (mínimo 2 caracteres).',
        success: false,
      });
      return;
    }

    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) {
      res.status(400).json({
        error: emailCheck.error || 'Ingresa un correo electrónico válido.',
        success: false,
      });
      return;
    }

    if (message.length < 10 || message.length > 5000) {
      res.status(400).json({
        error: 'Por favor escribe un mensaje de al menos 10 caracteres (máximo 5000).',
        success: false,
      });
      return;
    }

    const resolvedSubject = subject || `Consulta de ${category}`;
    const userId = (req as any).user?.id || null;

    const result = await createContactTicket({
      category,
      email,
      message,
      name,
      subject: resolvedSubject,
      userId,
      websiteId: 'aurora-pdf',
    });

    res.status(201).json({
      portalUrl: result.portalUrl,
      success: true,
      ticketNumber: result.ticketNumber,
      trackingToken: result.trackingToken,
    });
  } catch (error) {
    logger.app.error('Error en controlador al registrar ticket de contacto', { error });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function handleGetPublicTicketStatus(req: Request, res: Response): Promise<void> {
  try {
    const token = typeof req.params?.token === 'string' ? req.params.token.trim() : '';
    if (!token) {
      res.status(400).json({ error: 'Token de seguimiento no proporcionado.', success: false });
      return;
    }

    const ticket = await getPublicTicketByToken(token);
    if (!ticket) {
      res.status(404).json({ error: 'No se encontró la incidencia o el enlace es inválido.', success: false });
      return;
    }

    res.json({ success: true, ticket });
  } catch (error) {
    logger.app.error('Error al consultar ticket público por token', { error });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function handlePublicTicketReply(req: Request, res: Response): Promise<void> {
  try {
    const token = typeof req.params?.token === 'string' ? req.params.token.trim() : '';
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

    if (!token) {
      res.status(400).json({ error: 'Token de seguimiento no válido.', success: false });
      return;
    }

    if (message.length < 2 || message.length > 5000) {
      res.status(400).json({ error: 'Por favor escribe un mensaje válido (mínimo 2 caracteres).', success: false });
      return;
    }

    const senderName = typeof req.body?.senderName === 'string' ? req.body.senderName.trim() : undefined;
    const ok = await addPublicTicketReply(token, message, senderName);

    if (!ok) {
      res.status(404).json({ error: 'Incidencia no encontrada o cerrada.', success: false });
      return;
    }

    res.json({ message: 'Respuesta registrada exitosamente.', success: true });
  } catch (error) {
    logger.app.error('Error al responder ticket público por token', { error });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function handleInboundEmailWebhook(req: Request, res: Response): Promise<void> {
  try {
    const from = typeof req.body?.from === 'string' ? req.body.from : '';
    const subject = typeof req.body?.subject === 'string' ? req.body.subject : '';
    const text = typeof req.body?.text === 'string' ? req.body.text : typeof req.body?.html === 'string' ? req.body.html : '';
    const messageId = typeof req.body?.messageId === 'string' ? req.body.messageId : undefined;
    const inReplyTo = typeof req.body?.inReplyTo === 'string' ? req.body.inReplyTo : undefined;

    if (!from || !text) {
      res.status(400).json({ error: 'Payload de webhook incompleto.', success: false });
      return;
    }

    const processed = await handleInboundWebhookPayload({
      from,
      inReplyTo,
      messageId,
      subject,
      text,
    });

    res.json({ processed, success: true });
  } catch (error) {
    logger.app.error('Error en inbound email webhook', { error });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}
