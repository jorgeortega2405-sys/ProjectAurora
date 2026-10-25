import crypto from 'crypto';
import nodemailer, { SendMailOptions } from 'nodemailer';
import { adminConfig } from '../config/env.config.js';
import { adminDbPool } from './db.service.js';
import { logger } from './logger.service.js';

export interface EmailTicketSummary {
  assigned_agent_id: string | null;
  assigned_agent_name: string | null;
  closed_at: string | null;
  created_at: string;
  email: string;
  id: string;
  last_message_excerpt: string | null;
  last_message_sender_type: 'agent' | 'customer' | 'system' | null;
  messages_count: number;
  name: string;
  priority: 'high' | 'low' | 'normal' | 'urgent';
  resolved_at: string | null;
  status: 'closed' | 'open' | 'resolved' | 'waiting_user';
  subject: string;
  subject_category: string;
  ticket_number: string;
  tracking_token: string;
  updated_at: string;
  website_id: string;
}

export interface EmailTicketMessageItem {
  created_at: string;
  id: string;
  in_reply_to: string | null;
  is_internal_note: boolean;
  message: string;
  sender_email: string | null;
  sender_id: string | null;
  sender_name: string;
  sender_type: 'agent' | 'customer' | 'system';
  smtp_message_id: string | null;
  ticket_id: string;
}

export interface EmailTicketDetail extends EmailTicketSummary {
  initial_message_id: string | null;
  last_message_id: string | null;
  messages: EmailTicketMessageItem[];
}

export interface EmailSupportStats {
  closed: number;
  open: number;
  resolved: number;
  total: number;
  waiting_user: number;
}

const isMockOrTest =
  adminConfig.nodeEnv === 'test' ||
  !adminConfig.smtp.user ||
  !adminConfig.smtp.pass ||
  process.env.SMTP_MOCK === 'true';

const transporter = isMockOrTest
  ? nodemailer.createTransport({ jsonTransport: true })
  : nodemailer.createTransport({
      auth: {
        pass: adminConfig.smtp.pass,
        user: adminConfig.smtp.user,
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      host: adminConfig.smtp.host,
      port: adminConfig.smtp.port,
      secure: adminConfig.smtp.port === 465,
      socketTimeout: 10000,
    });

export async function listEmailTickets(filters: {
  category?: string;
  limit?: number;
  offset?: number;
  priority?: string;
  search?: string;
  status?: string;
  websiteId?: string;
}): Promise<{ stats: EmailSupportStats; tickets: EmailTicketSummary[] }> {
  let whereConditions = ['1=1'];
  const params: any[] = [];

  if (filters.websiteId) {
    whereConditions.push('t.website_id = ?');
    params.push(filters.websiteId);
  }

  if (filters.status && filters.status !== 'all') {
    whereConditions.push('t.status = ?');
    params.push(filters.status);
  }

  if (filters.priority && filters.priority !== 'all') {
    whereConditions.push('t.priority = ?');
    params.push(filters.priority);
  }

  if (filters.category && filters.category !== 'all') {
    whereConditions.push('t.subject_category = ?');
    params.push(filters.category);
  }

  if (filters.search && filters.search.trim()) {
    const q = `%${filters.search.trim().toLowerCase()}%`;
    whereConditions.push('(LOWER(t.ticket_number) LIKE ? OR LOWER(t.name) LIKE ? OR LOWER(t.email) LIKE ? OR LOWER(t.subject) LIKE ?)');
    params.push(q, q, q, q);
  }

  const whereClause = whereConditions.join(' AND ');

  const [statsRows] = await adminDbPool.query<any[]>(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as \`open\`,
       SUM(CASE WHEN status = 'waiting_user' THEN 1 ELSE 0 END) as waiting_user,
       SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
       SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed
     FROM contact_tickets
     ${filters.websiteId ? 'WHERE website_id = ?' : ''}`,
    filters.websiteId ? [filters.websiteId] : []
  );

  const statsRow = statsRows[0] || {};
  const stats: EmailSupportStats = {
    closed: Number(statsRow.closed || 0),
    open: Number(statsRow.open || 0),
    resolved: Number(statsRow.resolved || 0),
    total: Number(statsRow.total || 0),
    waiting_user: Number(statsRow.waiting_user || 0),
  };

  const limit = Math.min(Math.max(Number(filters.limit || 50), 1), 100);
  const offset = Math.max(Number(filters.offset || 0), 0);

  const querySql = `
    SELECT
      t.id, t.ticket_number, t.website_id, t.user_id, t.name, t.email,
      t.subject_category, t.subject, t.status, t.priority,
      t.assigned_agent_id, t.assigned_agent_name, t.tracking_token,
      t.created_at, t.updated_at, t.resolved_at, t.closed_at,
      COUNT(m.id) as messages_count,
      (SELECT SUBSTRING(message, 1, 100) FROM contact_ticket_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message_excerpt,
      (SELECT sender_type FROM contact_ticket_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message_sender_type
    FROM contact_tickets t
    LEFT JOIN contact_ticket_messages m ON m.ticket_id = t.id
    WHERE ${whereClause}
    GROUP BY t.id
    ORDER BY t.updated_at DESC
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);
  const [rows] = await adminDbPool.query<any[]>(querySql, params);

  const tickets: EmailTicketSummary[] = (rows || []).map((r: any) => ({
    assigned_agent_id: r.assigned_agent_id || null,
    assigned_agent_name: r.assigned_agent_name || null,
    closed_at: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
    email: r.email,
    id: r.id,
    last_message_excerpt: r.last_message_excerpt || null,
    last_message_sender_type: r.last_message_sender_type || null,
    messages_count: Number(r.messages_count || 0),
    name: r.name,
    priority: r.priority,
    resolved_at: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
    status: r.status,
    subject: r.subject,
    subject_category: r.subject_category,
    ticket_number: r.ticket_number,
    tracking_token: r.tracking_token,
    updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : '',
    website_id: r.website_id,
  }));

  return { stats, tickets };
}

export async function getEmailTicketById(id: string): Promise<EmailTicketDetail | null> {
  const [rows] = await adminDbPool.query<any[]>(
    `SELECT
       t.id, t.ticket_number, t.website_id, t.user_id, t.name, t.email,
       t.subject_category, t.subject, t.status, t.priority,
       t.assigned_agent_id, t.assigned_agent_name, t.tracking_token,
       t.initial_message_id, t.last_message_id,
       t.created_at, t.updated_at, t.resolved_at, t.closed_at
     FROM contact_tickets t
     WHERE t.id = ? LIMIT 1`,
    [id]
  );

  if (!rows || rows.length === 0) {
    return null;
  }

  const t = rows[0];

  const [messageRows] = await adminDbPool.query<any[]>(
    `SELECT
       id, ticket_id, sender_type, sender_id, sender_name, sender_email,
       message, is_internal_note, smtp_message_id, in_reply_to, created_at
     FROM contact_ticket_messages
     WHERE ticket_id = ?
     ORDER BY created_at ASC`,
    [id]
  );

  const messages: EmailTicketMessageItem[] = (messageRows || []).map((m: any) => ({
    created_at: m.created_at ? new Date(m.created_at).toISOString() : '',
    id: m.id,
    in_reply_to: m.in_reply_to || null,
    is_internal_note: Boolean(m.is_internal_note),
    message: m.message,
    sender_email: m.sender_email || null,
    sender_id: m.sender_id || null,
    sender_name: m.sender_name,
    sender_type: m.sender_type,
    smtp_message_id: m.smtp_message_id || null,
    ticket_id: m.ticket_id,
  }));

  const lastMsg = messages[messages.length - 1];

  return {
    assigned_agent_id: t.assigned_agent_id || null,
    assigned_agent_name: t.assigned_agent_name || null,
    closed_at: t.closed_at ? new Date(t.closed_at).toISOString() : null,
    created_at: t.created_at ? new Date(t.created_at).toISOString() : '',
    email: t.email,
    id: t.id,
    initial_message_id: t.initial_message_id || null,
    last_message_excerpt: lastMsg ? lastMsg.message.slice(0, 100) : null,
    last_message_id: t.last_message_id || null,
    last_message_sender_type: lastMsg ? lastMsg.sender_type : null,
    messages,
    messages_count: messages.length,
    name: t.name,
    priority: t.priority,
    resolved_at: t.resolved_at ? new Date(t.resolved_at).toISOString() : null,
    status: t.status,
    subject: t.subject,
    subject_category: t.subject_category,
    ticket_number: t.ticket_number,
    tracking_token: t.tracking_token,
    updated_at: t.updated_at ? new Date(t.updated_at).toISOString() : '',
    website_id: t.website_id,
  };
}

export async function replyToEmailTicket(
  ticketId: string,
  input: {
    agentEmail?: string;
    agentId: string;
    agentName: string;
    isInternalNote: boolean;
    message: string;
    newStatus?: 'closed' | 'open' | 'resolved' | 'waiting_user';
  }
): Promise<EmailTicketMessageItem> {
  const [rows] = await adminDbPool.query<any[]>(
    `SELECT id, ticket_number, name, email, subject, status, initial_message_id, last_message_id, tracking_token
     FROM contact_tickets WHERE id = ? LIMIT 1`,
    [ticketId]
  );

  if (!rows || rows.length === 0) {
    throw new Error('Ticket no encontrado');
  }

  const ticket = rows[0];
  const messageId = crypto.randomUUID();
  const domain = 'projectaurora.com';
  const replySmtpId = `<ticket-${ticket.ticket_number}-reply-${Date.now()}@${domain}>`;
  const inReplyTo = ticket.last_message_id || ticket.initial_message_id;

  const conn = await adminDbPool.getConnection();
  try {
    await conn.beginTransaction();

    const [userRows] = await conn.execute<any[]>(
      `SELECT id FROM users WHERE id = ? LIMIT 1`,
      [input.agentId]
    );
    const validAgentId = userRows && userRows.length > 0 ? input.agentId : null;

    await conn.execute(
      `INSERT INTO contact_ticket_messages (
        id, ticket_id, sender_type, sender_id, sender_name,
        sender_email, message, is_internal_note, smtp_message_id, in_reply_to
      ) VALUES (?, ?, 'agent', ?, ?, ?, ?, ?, ?, ?)`,
      [
        messageId,
        ticket.id,
        validAgentId,
        input.agentName,
        input.agentEmail || adminConfig.smtp.fromEmail,
        input.message,
        input.isInternalNote ? 1 : 0,
        input.isInternalNote ? null : replySmtpId,
        input.isInternalNote ? null : inReplyTo,
      ]
    );

    let nextStatus = ticket.status;
    if (input.newStatus) {
      nextStatus = input.newStatus;
    } else if (!input.isInternalNote) {
      nextStatus = 'waiting_user';
    }

    const resolvedAt = nextStatus === 'resolved' ? new Date() : null;
    const closedAt = nextStatus === 'closed' ? new Date() : null;

    if (input.isInternalNote) {
      await conn.execute(
        `UPDATE contact_tickets
         SET status = ?, resolved_at = COALESCE(?, resolved_at), closed_at = COALESCE(?, closed_at), updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nextStatus, resolvedAt, closedAt, ticket.id]
      );
    } else {
      await conn.execute(
        `UPDATE contact_tickets
         SET status = ?, last_message_id = ?, resolved_at = COALESCE(?, resolved_at), closed_at = COALESCE(?, closed_at), updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nextStatus, replySmtpId, resolvedAt, closedAt, ticket.id]
      );
    }

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    logger.db.error('Error al guardar respuesta de agente en base de datos', { error, ticketId });
    throw error;
  } finally {
    conn.release();
  }

  if (!input.isInternalNote) {
    const portalUrl = `${adminConfig.publicBaseUrl}/contact/ticket?token=${ticket.tracking_token}`;
    const escapedMessage = input.message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb; margin: 0; padding: 32px 16px; color: #111827;">
        <div style="max-width: 540px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);">
          <div style="padding: 20px 24px; border-bottom: 1px solid #f3f4f6; display: flex; align-items: center; justify-content: space-between;">
            <strong style="font-size: 16px; color: #111827;">Soporte Aurora</strong>
            <span style="background-color: #f3f4f6; color: #374151; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 8px;">#${ticket.ticket_number}</span>
          </div>
          <div style="padding: 28px 24px;">
            <p style="margin: 0 0 12px 0; font-size: 14px; color: #4b5563;">Respuesta de <strong>${input.agentName}</strong>:</p>
            <div style="background-color: #f8fafc; border-left: 4px solid #2563eb; padding: 16px; border-radius: 6px; margin: 0 0 24px 0; font-size: 14.5px; color: #0f172a; line-height: 1.6;">
              ${escapedMessage}
            </div>
            <div style="text-align: center; margin: 28px 0 16px 0;">
              <a href="${portalUrl}" style="display: inline-block; background-color: #111827; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 10px;">Ver Historial y Responder en el Portal</a>
            </div>
            <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">Este correo continúa el hilo de tu incidencia #${ticket.ticket_number}.</p>
          </div>
          <div style="background-color: #f9fafb; padding: 16px 24px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6;">
            © ${new Date().getFullYear()} ProjectAurora. Todos los derechos reservados.
          </div>
        </div>
      </body>
      </html>
    `;

    const textBody = `Hola ${ticket.name},\n\n${input.agentName} ha respondido a tu ticket #${ticket.ticket_number}:\n\n${input.message}\n\nPuedes consultar o continuar la conversación en:\n${portalUrl}`;

    const references = [ticket.initial_message_id, inReplyTo].filter(Boolean).join(' ');

    const mailOptions: SendMailOptions = {
      from: `"${adminConfig.smtp.fromName}" <${adminConfig.smtp.fromEmail}>`,
      html: htmlBody,
      inReplyTo: inReplyTo || undefined,
      messageId: replySmtpId,
      references: references || undefined,
      subject: `Re: [Ticket #${ticket.ticket_number}] ${ticket.subject}`,
      text: textBody,
      to: ticket.email,
    };

    try {
      await transporter.sendMail(mailOptions);
      logger.app.info('Correo de respuesta enviado con éxito al cliente en hilo SMTP', {
        inReplyTo,
        messageId: replySmtpId,
        ticketNumber: ticket.ticket_number,
        to: ticket.email,
      });
    } catch (mailError) {
      logger.app.error('Error al enviar correo de respuesta de ticket al usuario', { mailError, ticketId });
    }
  }

  return {
    created_at: new Date().toISOString(),
    id: messageId,
    in_reply_to: inReplyTo || null,
    is_internal_note: input.isInternalNote,
    message: input.message,
    sender_email: input.agentEmail || adminConfig.smtp.fromEmail,
    sender_id: input.agentId,
    sender_name: input.agentName,
    sender_type: 'agent',
    smtp_message_id: input.isInternalNote ? null : replySmtpId,
    ticket_id: ticket.id,
  };
}

export async function updateEmailTicket(
  ticketId: string,
  updates: {
    assignedAgentId?: string | null;
    assignedAgentName?: string | null;
    priority?: string;
    status?: string;
  }
): Promise<boolean> {
  const setClauses: string[] = [];
  const params: any[] = [];

  if (updates.status) {
    setClauses.push('status = ?');
    params.push(updates.status);

    if (updates.status === 'resolved') {
      setClauses.push('resolved_at = CURRENT_TIMESTAMP');
    } else if (updates.status === 'closed') {
      setClauses.push('closed_at = CURRENT_TIMESTAMP');
    }
  }

  if (updates.priority) {
    setClauses.push('priority = ?');
    params.push(updates.priority);
  }

  if (updates.assignedAgentId !== undefined) {
    setClauses.push('assigned_agent_id = ?');
    params.push(updates.assignedAgentId);
    setClauses.push('assigned_agent_name = ?');
    params.push(updates.assignedAgentName || null);
  }

  if (setClauses.length === 0) {
    return false;
  }

  setClauses.push('updated_at = CURRENT_TIMESTAMP');
  params.push(ticketId);

  const [result] = await adminDbPool.query<any>(
    `UPDATE contact_tickets SET ${setClauses.join(', ')} WHERE id = ?`,
    params
  );

  return result.affectedRows > 0;
}
