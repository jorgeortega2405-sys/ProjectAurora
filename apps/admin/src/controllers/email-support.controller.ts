import { Request, Response } from 'express';
import { getEmailTicketById, listEmailTickets, replyToEmailTicket, updateEmailTicket } from '../services/email-support.service.js';
import { logger } from '../services/logger.service.js';

export async function listEmailTicketsController(req: Request, res: Response): Promise<void> {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const priority = typeof req.query.priority === 'string' ? req.query.priority : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const websiteId = typeof req.query.websiteId === 'string' ? req.query.websiteId : undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

    const result = await listEmailTickets({
      category,
      limit,
      offset,
      priority,
      search,
      status,
      websiteId,
    });

    res.json({
      stats: result.stats,
      success: true,
      tickets: result.tickets,
    });
  } catch (error) {
    logger.app.error('Error al listar tickets de soporte por correo', { error });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function getEmailTicketByIdController(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Identificador de ticket no proporcionado.', success: false });
      return;
    }

    const ticket = await getEmailTicketById(id);
    if (!ticket) {
      res.status(404).json({ error: 'La incidencia solicitada no fue encontrada.', success: false });
      return;
    }

    res.json({
      success: true,
      ticket,
    });
  } catch (error) {
    logger.app.error('Error al consultar detalle del ticket de correo', { error, ticketId: req.params.id });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function replyEmailTicketController(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const isInternalNote = Boolean(req.body?.isInternalNote);
    const newStatus = typeof req.body?.newStatus === 'string' ? req.body.newStatus : undefined;

    if (!id) {
      res.status(400).json({ error: 'Identificador de ticket no proporcionado.', success: false });
      return;
    }

    if (!message) {
      res.status(400).json({ error: 'Por favor redacta un mensaje para enviar.', success: false });
      return;
    }

    const adminUser = (req as any).adminUser || {};
    const agentId = adminUser.id || 'system-admin';
    const agentName = adminUser.username || adminUser.name || 'Soporte Aurora';
    const agentEmail = adminUser.email || undefined;

    const reply = await replyToEmailTicket(id, {
      agentEmail,
      agentId,
      agentName,
      isInternalNote,
      message,
      newStatus: newStatus as any,
    });

    res.status(201).json({
      message: reply,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al responder ticket de correo desde admin', { error, ticketId: req.params.id });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function updateEmailTicketStatusController(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    const status = typeof req.body?.status === 'string' ? req.body.status : undefined;
    const priority = typeof req.body?.priority === 'string' ? req.body.priority : undefined;
    const assignedAgentId = req.body?.assignedAgentId !== undefined ? req.body.assignedAgentId : undefined;
    const assignedAgentName = req.body?.assignedAgentName !== undefined ? req.body.assignedAgentName : undefined;

    if (!id) {
      res.status(400).json({ error: 'Identificador de ticket no proporcionado.', success: false });
      return;
    }

    const updated = await updateEmailTicket(id, {
      assignedAgentId,
      assignedAgentName,
      priority,
      status,
    });

    if (!updated) {
      res.status(400).json({ error: 'No se realizaron modificaciones en la incidencia.', success: false });
      return;
    }

    res.json({
      message: 'Estado de la incidencia actualizado exitosamente.',
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al actualizar estado del ticket de correo', { error, ticketId: req.params.id });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}
