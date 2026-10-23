import { Request, Response } from 'express';
import { addTicketComment, createInternalTicket, getDepartmentsAndStaff, getInternalTicketById, getTicketComments, getTicketSummaryStats, listInternalTickets, updateInternalTicket } from '../services/internal-tickets.service.js';
import { logger } from '../services/logger.service.js';
import { CreateTicketInput, TicketCategory, TicketPriority, TicketStatus, UpdateTicketInput } from '../types/tickets.types.js';

const VALID_CATEGORIES: TicketCategory[] = ['access', 'facilities', 'finance', 'hardware', 'hr', 'network', 'other', 'software'];
const VALID_PRIORITIES: TicketPriority[] = ['high', 'low', 'medium', 'urgent'];
const VALID_STATUSES: TicketStatus[] = ['closed', 'in_progress', 'open', 'resolved'];

export async function getInternalTicketsController(req: Request, res: Response): Promise<void> {
  try {
    const { assigned_to, department, priority, search, status } = req.query;

    const tickets = await listInternalTickets({
      assigned_to: typeof assigned_to === 'string' ? assigned_to : undefined,
      department: typeof department === 'string' ? department : undefined,
      priority: typeof priority === 'string' ? priority : undefined,
      search: typeof search === 'string' ? search : undefined,
      status: typeof status === 'string' ? status : undefined,
    });

    res.json({ success: true, tickets });
  } catch (err) {
    logger.app.error('Error en controlador al obtener tickets internos', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al consultar los tickets internos. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function getInternalTicketByIdController(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      res.status(400).json({ error: 'Identificador de ticket no proporcionado.', success: false });
      return;
    }

    const ticket = await getInternalTicketById(id);
    if (!ticket) {
      res.status(404).json({ error: 'El ticket solicitado no fue encontrado.', success: false });
      return;
    }

    const comments = await getTicketComments(ticket.id);
    res.json({ comments, success: true, ticket });
  } catch (err) {
    logger.app.error('Error en controlador al consultar ticket interno por ID', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al consultar el detalle del ticket.',
      success: false,
    });
  }
}

export async function createInternalTicketController(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).adminUser;
    if (!user || !user.id) {
      res.status(401).json({ error: 'Sesión no válida.', success: false });
      return;
    }

    const body = req.body as CreateTicketInput;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const targetDeptId = typeof body.target_department_id === 'string' ? body.target_department_id.trim() : '';
    const category = body.category && VALID_CATEGORIES.includes(body.category) ? body.category : 'other';
    const priority = body.priority && VALID_PRIORITIES.includes(body.priority) ? body.priority : 'medium';
    const sourceDeptId = typeof body.source_department_id === 'string' ? body.source_department_id.trim() : null;

    if (!title || title.length < 3) {
      res.status(400).json({ error: 'El título del reporte debe contener al menos 3 caracteres.', success: false });
      return;
    }

    if (!description || description.length < 5) {
      res.status(400).json({ error: 'La descripción del problema debe contener al menos 5 caracteres.', success: false });
      return;
    }

    if (!targetDeptId) {
      res.status(400).json({ error: 'Debes seleccionar el departamento destinatario.', success: false });
      return;
    }

    const ticket = await createInternalTicket(
      {
        category,
        description,
        priority,
        source_department_id: sourceDeptId,
        target_department_id: targetDeptId,
        title,
      },
      user.id
    );

    logger.app.info('Nuevo ticket departamental creado exitosamente', {
      creatorId: user.id,
      targetDepartment: targetDeptId,
      ticketId: ticket.id,
      ticketNumber: ticket.ticket_number,
    });

    res.status(201).json({ success: true, ticket });
  } catch (err) {
    logger.app.error('Error en controlador al crear ticket interno', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al registrar el reporte. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function updateInternalTicketController(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).adminUser;
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      res.status(400).json({ error: 'Identificador de ticket no válido.', success: false });
      return;
    }

    const body = req.body as UpdateTicketInput;
    const updatePayload: UpdateTicketInput = {};

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        res.status(400).json({ error: 'Estado de ticket no válido.', success: false });
        return;
      }
      updatePayload.status = body.status;
    }

    if (body.priority !== undefined) {
      if (!VALID_PRIORITIES.includes(body.priority)) {
        res.status(400).json({ error: 'Prioridad de ticket no válida.', success: false });
        return;
      }
      updatePayload.priority = body.priority;
    }

    if (body.category !== undefined) {
      if (!VALID_CATEGORIES.includes(body.category)) {
        res.status(400).json({ error: 'Categoría de ticket no válida.', success: false });
        return;
      }
      updatePayload.category = body.category;
    }

    if (body.target_department_id !== undefined) {
      updatePayload.target_department_id = body.target_department_id;
    }

    if (body.assigned_to !== undefined) {
      updatePayload.assigned_to = body.assigned_to;
    }

    if (body.resolution_notes !== undefined) {
      updatePayload.resolution_notes = typeof body.resolution_notes === 'string' ? body.resolution_notes.trim() : null;
    }

    const updated = await updateInternalTicket(id, updatePayload, user?.id || '');
    if (!updated) {
      res.status(404).json({ error: 'Ticket no encontrado para actualización.', success: false });
      return;
    }

    logger.app.info('Ticket departamental actualizado exitosamente', {
      ticketId: updated.id,
      ticketNumber: updated.ticket_number,
      updaterId: user?.id,
    });

    res.json({ success: true, ticket: updated });
  } catch (err) {
    logger.app.error('Error en controlador al actualizar ticket interno', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al actualizar el ticket. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function addInternalTicketCommentController(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).adminUser;
    if (!user || !user.id) {
      res.status(401).json({ error: 'Sesión no válida.', success: false });
      return;
    }

    const { id } = req.params;
    const { is_internal_note, message } = req.body;

    const trimmedMsg = typeof message === 'string' ? message.trim() : '';
    if (!trimmedMsg) {
      res.status(400).json({ error: 'El mensaje de comentario o nota no puede estar vacío.', success: false });
      return;
    }

    const comment = await addTicketComment(id, user.id, trimmedMsg, Boolean(is_internal_note));
    res.status(201).json({ comment, success: true });
  } catch (err) {
    logger.app.error('Error en controlador al agregar comentario a ticket', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al publicar la nota o comentario.',
      success: false,
    });
  }
}

export async function getInternalTicketStatsController(_req: Request, res: Response): Promise<void> {
  try {
    const stats = await getTicketSummaryStats();
    res.json({ stats, success: true });
  } catch (err) {
    logger.app.error('Error en controlador al obtener estadísticas de tickets', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al consultar métricas de tickets.',
      success: false,
    });
  }
}

export async function getInternalTicketOptionsController(_req: Request, res: Response): Promise<void> {
  try {
    const options = await getDepartmentsAndStaff();
    res.json({ ...options, success: true });
  } catch (err) {
    logger.app.error('Error en controlador al obtener opciones de departamentos y personal', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al consultar los departamentos disponibles.',
      success: false,
    });
  }
}
