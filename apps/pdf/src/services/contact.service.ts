import crypto from 'crypto';
import { pool } from '../config/database.config.js';
import { config } from '../config/env.config.js';
import { logger } from './logger.service.js';
import { sendContactTicketConfirmationEmail } from './mail.service.js';

export interface CreateContactTicketInput {
  category: string;
  email: string;
  message: string;
  name: string;
  subject: string;
  userId?: string | null;
  websiteId?: string;
}

export interface PublicTicketMessage {
  createdAt: string;
  id: string;
  message: string;
  senderName: string;
  senderType: 'agent' | 'customer' | 'system';
}

export interface PublicTicketDetails {
  category: string;
  createdAt: string;
  email: string;
  id: string;
  messages: PublicTicketMessage[];
  name: string;
  priority: string;
  status: string;
  subject: string;
  ticketNumber: string;
  updatedAt: string;
}

function generateTicketNumber(): string {
  const year = new Date().getFullYear();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `TK-${year}-${randomSuffix}`;
}

export async function createContactTicket(input: CreateContactTicketInput): Promise<{
  portalUrl: string;
  ticketId: string;
  ticketNumber: string;
  trackingToken: string;
}> {
  const ticketId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const trackingToken = crypto.randomBytes(32).toString('hex');
  const ticketNumber = generateTicketNumber();
  const websiteId = input.websiteId || 'aurora-pdf';
  const domain = new URL(config.baseUrl).hostname || 'projectaurora.com';
  const smtpMessageId = `<ticket-${ticketNumber}-init@${domain}>`;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `INSERT INTO contact_tickets (
        id, ticket_number, website_id, user_id, name, email,
        subject_category, subject, status, priority, tracking_token,
        initial_message_id, last_message_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 'normal', ?, ?, ?)`,
      [
        ticketId,
        ticketNumber,
        websiteId,
        input.userId || null,
        input.name,
        input.email,
        input.category,
        input.subject,
        trackingToken,
        smtpMessageId,
        smtpMessageId,
      ]
    );

    await conn.execute(
      `INSERT INTO contact_ticket_messages (
        id, ticket_id, sender_type, sender_id, sender_name,
        sender_email, message, is_internal_note, smtp_message_id, in_reply_to
      ) VALUES (?, ?, 'customer', ?, ?, ?, ?, FALSE, ?, NULL)`,
      [
        messageId,
        ticketId,
        input.userId || null,
        input.name,
        input.email,
        input.message,
        smtpMessageId,
      ]
    );

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    logger.db.error('Error al insertar ticket de contacto en base de datos', { error, ticketNumber });
    throw error;
  } finally {
    conn.release();
  }

  const portalUrl = `${config.baseUrl}/contact/ticket?token=${trackingToken}`;
  const messageExcerpt = input.message.length > 250 ? `${input.message.slice(0, 250)}...` : input.message;

  try {
    await sendContactTicketConfirmationEmail(
      input.email,
      input.name,
      ticketNumber,
      input.subject,
      messageExcerpt,
      portalUrl,
      smtpMessageId
    );
  } catch (mailError) {
    logger.app.error('Error al enviar correo de confirmación de ticket al usuario', { mailError, ticketNumber });
  }

  return {
    portalUrl,
    ticketId,
    ticketNumber,
    trackingToken,
  };
}

export async function getPublicTicketByToken(token: string): Promise<PublicTicketDetails | null> {
  const [rows] = await pool.execute<any[]>(
    `SELECT id, ticket_number, website_id, name, email, subject_category, subject, status, priority, created_at, updated_at
     FROM contact_tickets
     WHERE tracking_token = ? LIMIT 1`,
    [token]
  );

  if (!rows || rows.length === 0) {
    return null;
  }

  const ticket = rows[0];

  const [messageRows] = await pool.execute<any[]>(
    `SELECT id, sender_type, sender_name, message, created_at
     FROM contact_ticket_messages
     WHERE ticket_id = ? AND is_internal_note = FALSE
     ORDER BY created_at ASC`,
    [ticket.id]
  );

  const messages: PublicTicketMessage[] = (messageRows || []).map((m: any) => ({
    createdAt: m.created_at ? new Date(m.created_at).toISOString() : '',
    id: String(m.id),
    message: String(m.message),
    senderName: String(m.sender_name),
    senderType: m.sender_type as 'agent' | 'customer' | 'system',
  }));

  return {
    category: ticket.subject_category,
    createdAt: ticket.created_at ? new Date(ticket.created_at).toISOString() : '',
    email: ticket.email,
    id: ticket.id,
    messages,
    name: ticket.name,
    priority: ticket.priority,
    status: ticket.status,
    subject: ticket.subject,
    ticketNumber: ticket.ticket_number,
    updatedAt: ticket.updated_at ? new Date(ticket.updated_at).toISOString() : '',
  };
}

export async function addPublicTicketReply(
  token: string,
  message: string,
  senderName?: string
): Promise<boolean> {
  const [rows] = await pool.execute<any[]>(
    `SELECT id, name, email, ticket_number, status, last_message_id FROM contact_tickets WHERE tracking_token = ? LIMIT 1`,
    [token]
  );

  if (!rows || rows.length === 0) {
    return false;
  }

  const ticket = rows[0];
  const messageId = crypto.randomUUID();
  const domain = new URL(config.baseUrl).hostname || 'projectaurora.com';
  const replySmtpId = `<ticket-${ticket.ticket_number}-reply-${Date.now()}@${domain}>`;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `INSERT INTO contact_ticket_messages (
        id, ticket_id, sender_type, sender_id, sender_name,
        sender_email, message, is_internal_note, smtp_message_id, in_reply_to
      ) VALUES (?, ?, 'customer', NULL, ?, ?, ?, FALSE, ?, ?)`,
      [
        messageId,
        ticket.id,
        senderName || ticket.name,
        ticket.email,
        message,
        replySmtpId,
        ticket.last_message_id,
      ]
    );

    const nextStatus = ticket.status === 'closed' ? 'open' : 'open';
    await conn.execute(
      `UPDATE contact_tickets SET status = ?, last_message_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [nextStatus, replySmtpId, ticket.id]
    );

    await conn.commit();
    return true;
  } catch (error) {
    await conn.rollback();
    logger.db.error('Error al registrar respuesta de usuario a ticket', { error, ticketId: ticket.id });
    throw error;
  } finally {
    conn.release();
  }
}

export async function handleInboundWebhookPayload(payload: {
  from: string;
  inReplyTo?: string;
  messageId?: string;
  subject?: string;
  text: string;
}): Promise<boolean> {
  const match = (payload.subject || '').match(/\[Ticket\s*#?([A-Z0-9-]+)\]/i);
  if (!match) {
    logger.app.warn('Inbound webhook descartado: no se encontró número de ticket en asunto', { subject: payload.subject });
    return false;
  }

  const ticketNumber = match[1];
  const [rows] = await pool.execute<any[]>(
    `SELECT id, name, email, last_message_id FROM contact_tickets WHERE ticket_number = ? LIMIT 1`,
    [ticketNumber]
  );

  if (!rows || rows.length === 0) {
    logger.app.warn('Inbound webhook descartado: ticket no encontrado en base de datos', { ticketNumber });
    return false;
  }

  const ticket = rows[0];
  const msgId = crypto.randomUUID();

  await pool.execute(
    `INSERT INTO contact_ticket_messages (
      id, ticket_id, sender_type, sender_id, sender_name,
      sender_email, message, is_internal_note, smtp_message_id, in_reply_to
    ) VALUES (?, ?, 'customer', NULL, ?, ?, ?, FALSE, ?, ?)`,
    [
      msgId,
      ticket.id,
      ticket.name,
      payload.from || ticket.email,
      payload.text,
      payload.messageId || null,
      payload.inReplyTo || ticket.last_message_id,
    ]
  );

  await pool.execute(
    `UPDATE contact_tickets SET status = 'open', last_message_id = COALESCE(?, last_message_id), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [payload.messageId || null, ticket.id]
  );

  logger.app.info('Inbound webhook procesado exitosamente', { ticketNumber, ticketId: ticket.id });
  return true;
}
