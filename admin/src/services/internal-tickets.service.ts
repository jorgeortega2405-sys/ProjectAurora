import crypto from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { adminDbPool } from './db.service.js';
import { logger } from './logger.service.js';
import { CreateTicketInput, DepartmentOption, InternalTicket, InternalTicketComment, StaffOption, TicketCategory, TicketPriority, TicketStatus, TicketSummaryStats, UpdateTicketInput } from '../types/tickets.types.js';

interface TicketRowPacket extends RowDataPacket {
  assigned_to: string | null;
  assignee_avatar_url: string | null;
  assignee_job_title: string | null;
  assignee_username: string | null;
  category: TicketCategory;
  closed_at: Date | string | null;
  comments_count: number | string;
  created_at: Date | string;
  created_by: string;
  creator_avatar_url: string | null;
  creator_job_title: string | null;
  creator_username: string;
  description: string;
  id: string;
  priority: TicketPriority;
  resolution_notes: string | null;
  resolved_at: Date | string | null;
  source_department_color: string | null;
  source_department_id: string | null;
  source_department_name: string | null;
  status: TicketStatus;
  target_department_color: string;
  target_department_id: string;
  target_department_name: string;
  ticket_number: string;
  title: string;
  updated_at: Date | string;
}

interface CommentRowPacket extends RowDataPacket {
  avatar_url: string | null;
  created_at: Date | string;
  department_name: string | null;
  id: string;
  is_internal_note: number | boolean;
  job_title: string | null;
  message: string;
  ticket_id: string;
  user_id: string;
  username: string;
}

interface DepartmentRowPacket extends RowDataPacket {
  color: string;
  description: string | null;
  id: string;
  name: string;
}

interface StaffRowPacket extends RowDataPacket {
  department_id: string;
  department_name: string;
  id: string;
  job_title: string;
  user_id: string;
  username: string;
}

function mapTicketRow(r: TicketRowPacket): InternalTicket {
  return {
    assigned_to: r.assigned_to ?? null,
    assignee_avatar_url: r.assignee_avatar_url ?? null,
    assignee_job_title: r.assignee_job_title ?? null,
    assignee_username: r.assignee_username ?? null,
    category: r.category,
    closed_at: r.closed_at instanceof Date ? r.closed_at.toISOString() : (r.closed_at ? String(r.closed_at) : null),
    comments_count: Number(r.comments_count) || 0,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    created_by: r.created_by,
    creator_avatar_url: r.creator_avatar_url ?? null,
    creator_job_title: r.creator_job_title ?? null,
    creator_username: r.creator_username,
    description: r.description,
    id: r.id,
    priority: r.priority,
    resolution_notes: r.resolution_notes ?? null,
    resolved_at: r.resolved_at instanceof Date ? r.resolved_at.toISOString() : (r.resolved_at ? String(r.resolved_at) : null),
    source_department_color: r.source_department_color ?? null,
    source_department_id: r.source_department_id ?? null,
    source_department_name: r.source_department_name ?? null,
    status: r.status,
    target_department_color: r.target_department_color || '#6366f1',
    target_department_id: r.target_department_id,
    target_department_name: r.target_department_name || 'General',
    ticket_number: r.ticket_number,
    title: r.title,
    updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

export async function listInternalTickets(filters: {
  assigned_to?: string;
  department?: string;
  priority?: string;
  search?: string;
  status?: string;
}): Promise<InternalTicket[]> {
  try {
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (filters.department && filters.department !== 'all') {
      conditions.push('(t.target_department_id = ? OR t.source_department_id = ?)');
      params.push(filters.department, filters.department);
    }

    if (filters.status && filters.status !== 'all') {
      conditions.push('t.status = ?');
      params.push(filters.status);
    }

    if (filters.priority && filters.priority !== 'all') {
      conditions.push('t.priority = ?');
      params.push(filters.priority);
    }

    if (filters.assigned_to && filters.assigned_to !== 'all') {
      conditions.push('t.assigned_to = ?');
      params.push(filters.assigned_to);
    }

    if (filters.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      conditions.push('(t.ticket_number LIKE ? OR t.title LIKE ? OR t.description LIKE ? OR u_creator.username LIKE ?)');
      params.push(term, term, term, term);
    }

    const sql = `
      SELECT
        t.id,
        t.ticket_number,
        t.title,
        t.description,
        t.category,
        t.priority,
        t.status,
        t.source_department_id,
        t.target_department_id,
        t.created_by,
        t.assigned_to,
        t.resolution_notes,
        t.resolved_at,
        t.closed_at,
        t.created_at,
        t.updated_at,
        target_dept.name AS target_department_name,
        target_dept.color AS target_department_color,
        source_dept.name AS source_department_name,
        source_dept.color AS source_department_color,
        u_creator.username AS creator_username,
        u_creator.avatar_url AS creator_avatar_url,
        emp_creator.job_title AS creator_job_title,
        u_assignee.username AS assignee_username,
        u_assignee.avatar_url AS assignee_avatar_url,
        emp_assignee.job_title AS assignee_job_title,
        (SELECT COUNT(*) FROM internal_ticket_comments itc WHERE itc.ticket_id = t.id) AS comments_count
      FROM internal_tickets t
      JOIN hr_departments target_dept ON t.target_department_id = target_dept.id
      LEFT JOIN hr_departments source_dept ON t.source_department_id = source_dept.id
      JOIN users u_creator ON t.created_by = u_creator.id
      LEFT JOIN hr_employees emp_creator ON emp_creator.user_id = u_creator.id
      LEFT JOIN users u_assignee ON t.assigned_to = u_assignee.id
      LEFT JOIN hr_employees emp_assignee ON emp_assignee.user_id = u_assignee.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        CASE t.status
          WHEN 'open' THEN 1
          WHEN 'in_progress' THEN 2
          WHEN 'resolved' THEN 3
          WHEN 'closed' THEN 4
          ELSE 5
        END,
        CASE t.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END,
        t.created_at DESC
    `;

    const [rows] = await adminDbPool.query<TicketRowPacket[]>(sql, params);
    return rows.map(mapTicketRow);
  } catch (err) {
    logger.db.error('Error al listar tickets internos en base de datos', err);
    throw err;
  }
}

export async function getInternalTicketById(ticketIdOrNumber: string): Promise<InternalTicket | null> {
  try {
    const sql = `
      SELECT
        t.id,
        t.ticket_number,
        t.title,
        t.description,
        t.category,
        t.priority,
        t.status,
        t.source_department_id,
        t.target_department_id,
        t.created_by,
        t.assigned_to,
        t.resolution_notes,
        t.resolved_at,
        t.closed_at,
        t.created_at,
        t.updated_at,
        target_dept.name AS target_department_name,
        target_dept.color AS target_department_color,
        source_dept.name AS source_department_name,
        source_dept.color AS source_department_color,
        u_creator.username AS creator_username,
        u_creator.avatar_url AS creator_avatar_url,
        emp_creator.job_title AS creator_job_title,
        u_assignee.username AS assignee_username,
        u_assignee.avatar_url AS assignee_avatar_url,
        emp_assignee.job_title AS assignee_job_title,
        (SELECT COUNT(*) FROM internal_ticket_comments itc WHERE itc.ticket_id = t.id) AS comments_count
      FROM internal_tickets t
      JOIN hr_departments target_dept ON t.target_department_id = target_dept.id
      LEFT JOIN hr_departments source_dept ON t.source_department_id = source_dept.id
      JOIN users u_creator ON t.created_by = u_creator.id
      LEFT JOIN hr_employees emp_creator ON emp_creator.user_id = u_creator.id
      LEFT JOIN users u_assignee ON t.assigned_to = u_assignee.id
      LEFT JOIN hr_employees emp_assignee ON emp_assignee.user_id = u_assignee.id
      WHERE t.id = ? OR t.ticket_number = ?
      LIMIT 1
    `;

    const [rows] = await adminDbPool.query<TicketRowPacket[]>(sql, [ticketIdOrNumber, ticketIdOrNumber]);
    if (rows.length === 0) return null;
    return mapTicketRow(rows[0]);
  } catch (err) {
    logger.db.error('Error al consultar ticket interno por ID', err);
    throw err;
  }
}

export async function getTicketComments(ticketId: string): Promise<InternalTicketComment[]> {
  try {
    const sql = `
      SELECT
        itc.id,
        itc.ticket_id,
        itc.user_id,
        itc.message,
        itc.is_internal_note,
        itc.created_at,
        u.username,
        u.avatar_url,
        emp.job_title,
        dept.name AS department_name
      FROM internal_ticket_comments itc
      JOIN users u ON itc.user_id = u.id
      LEFT JOIN hr_employees emp ON emp.user_id = u.id
      LEFT JOIN hr_departments dept ON emp.department_id = dept.id
      WHERE itc.ticket_id = ?
      ORDER BY itc.created_at ASC
    `;

    const [rows] = await adminDbPool.query<CommentRowPacket[]>(sql, [ticketId]);
    return rows.map((r) => ({
      avatar_url: r.avatar_url ?? null,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      department_name: r.department_name ?? null,
      id: r.id,
      is_internal_note: Boolean(r.is_internal_note),
      job_title: r.job_title ?? null,
      message: r.message,
      ticket_id: r.ticket_id,
      user_id: r.user_id,
      username: r.username,
    }));
  } catch (err) {
    logger.db.error('Error al consultar comentarios de ticket interno', err);
    throw err;
  }
}

export async function createInternalTicket(
  input: CreateTicketInput,
  creatorId: string
): Promise<InternalTicket> {
  try {
    const id = crypto.randomUUID();

    const [numRows] = await adminDbPool.query<RowDataPacket[]>(
      'SELECT MAX(CAST(SUBSTRING(ticket_number, 5) AS UNSIGNED)) as max_num FROM internal_tickets'
    );
    const maxNum = Number(numRows[0]?.max_num) || 1000;
    const ticketNumber = `TCK-${maxNum + 1}`;

    let sourceDeptId = input.source_department_id || null;
    if (!sourceDeptId) {
      const [empRows] = await adminDbPool.query<RowDataPacket[]>(
        'SELECT department_id FROM hr_employees WHERE user_id = ? LIMIT 1',
        [creatorId]
      );
      if (empRows.length > 0 && empRows[0].department_id) {
        sourceDeptId = empRows[0].department_id;
      }
    }

    const category = input.category || 'other';
    const priority = input.priority || 'medium';

    await adminDbPool.query<ResultSetHeader>(
      `INSERT INTO internal_tickets (
        id, ticket_number, title, description, category, priority, status,
        source_department_id, target_department_id, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
      [
        id,
        ticketNumber,
        input.title.trim(),
        input.description.trim(),
        category,
        priority,
        sourceDeptId,
        input.target_department_id,
        creatorId,
      ]
    );

    const created = await getInternalTicketById(id);
    if (!created) {
      throw new Error('Error al recuperar ticket interno recién creado.');
    }
    return created;
  } catch (err) {
    logger.db.error('Error al insertar nuevo ticket interno en base de datos', err);
    throw err;
  }
}

export async function updateInternalTicket(
  ticketId: string,
  input: UpdateTicketInput,
  _updaterId: string
): Promise<InternalTicket | null> {
  try {
    const existing = await getInternalTicketById(ticketId);
    if (!existing) return null;

    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.status !== undefined) {
      fields.push('status = ?');
      values.push(input.status);

      if (input.status === 'resolved' && existing.status !== 'resolved') {
        fields.push('resolved_at = CURRENT_TIMESTAMP');
      } else if (input.status !== 'resolved' && existing.status === 'resolved') {
        fields.push('resolved_at = NULL');
      }

      if (input.status === 'closed' && existing.status !== 'closed') {
        fields.push('closed_at = CURRENT_TIMESTAMP');
      } else if (input.status !== 'closed' && existing.status === 'closed') {
        fields.push('closed_at = NULL');
      }
    }

    if (input.priority !== undefined) {
      fields.push('priority = ?');
      values.push(input.priority);
    }

    if (input.category !== undefined) {
      fields.push('category = ?');
      values.push(input.category);
    }

    if (input.target_department_id !== undefined) {
      fields.push('target_department_id = ?');
      values.push(input.target_department_id);
    }

    if (input.assigned_to !== undefined) {
      fields.push('assigned_to = ?');
      values.push(input.assigned_to || null);
    }

    if (input.resolution_notes !== undefined) {
      fields.push('resolution_notes = ?');
      values.push(input.resolution_notes || null);
    }

    if (fields.length > 0) {
      values.push(existing.id);
      await adminDbPool.query<ResultSetHeader>(
        `UPDATE internal_tickets SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
    }

    return await getInternalTicketById(existing.id);
  } catch (err) {
    logger.db.error('Error al actualizar ticket interno en base de datos', err);
    throw err;
  }
}

export async function addTicketComment(
  ticketId: string,
  userId: string,
  message: string,
  isInternalNote: boolean
): Promise<InternalTicketComment> {
  try {
    const id = crypto.randomUUID();

    await adminDbPool.query<ResultSetHeader>(
      `INSERT INTO internal_ticket_comments (id, ticket_id, user_id, message, is_internal_note)
       VALUES (?, ?, ?, ?, ?)`,
      [id, ticketId, userId, message.trim(), isInternalNote ? 1 : 0]
    );

    const [rows] = await adminDbPool.query<CommentRowPacket[]>(
      `SELECT
        itc.id,
        itc.ticket_id,
        itc.user_id,
        itc.message,
        itc.is_internal_note,
        itc.created_at,
        u.username,
        u.avatar_url,
        emp.job_title,
        dept.name AS department_name
      FROM internal_ticket_comments itc
      JOIN users u ON itc.user_id = u.id
      LEFT JOIN hr_employees emp ON emp.user_id = u.id
      LEFT JOIN hr_departments dept ON emp.department_id = dept.id
      WHERE itc.id = ?
      LIMIT 1`,
      [id]
    );

    const r = rows[0];
    return {
      avatar_url: r.avatar_url ?? null,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      department_name: r.department_name ?? null,
      id: r.id,
      is_internal_note: Boolean(r.is_internal_note),
      job_title: r.job_title ?? null,
      message: r.message,
      ticket_id: r.ticket_id,
      user_id: r.user_id,
      username: r.username,
    };
  } catch (err) {
    logger.db.error('Error al agregar comentario a ticket interno', err);
    throw err;
  }
}

export async function getTicketSummaryStats(): Promise<TicketSummaryStats> {
  try {
    const [rows] = await adminDbPool.query<RowDataPacket[]>(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS count_open,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS count_in_progress,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS count_resolved,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS count_closed,
        SUM(CASE WHEN priority IN ('urgent', 'high') AND status IN ('open', 'in_progress') THEN 1 ELSE 0 END) AS count_urgent
      FROM internal_tickets
    `);

    const r = rows[0] || {};
    return {
      closed: Number(r.count_closed) || 0,
      in_progress: Number(r.count_in_progress) || 0,
      open: Number(r.count_open) || 0,
      resolved: Number(r.count_resolved) || 0,
      total: Number(r.total) || 0,
      urgent_or_high: Number(r.count_urgent) || 0,
    };
  } catch (err) {
    logger.db.error('Error al obtener estadísticas de tickets internos', err);
    return {
      closed: 0,
      in_progress: 0,
      open: 0,
      resolved: 0,
      total: 0,
      urgent_or_high: 0,
    };
  }
}

export async function getDepartmentsAndStaff(): Promise<{
  departments: DepartmentOption[];
  staff: StaffOption[];
}> {
  try {
    const [deptRows] = await adminDbPool.query<DepartmentRowPacket[]>(
      'SELECT id, name, description, color FROM hr_departments ORDER BY name ASC'
    );

    const [staffRows] = await adminDbPool.query<StaffRowPacket[]>(`
      SELECT
        emp.id,
        emp.user_id,
        emp.job_title,
        emp.department_id,
        dept.name AS department_name,
        u.username
      FROM hr_employees emp
      JOIN users u ON emp.user_id = u.id
      JOIN hr_departments dept ON emp.department_id = dept.id
      WHERE emp.status = 'active'
      ORDER BY u.username ASC
    `);

    return {
      departments: deptRows.map((d) => ({
        color: d.color,
        description: d.description,
        id: d.id,
        name: d.name,
      })),
      staff: staffRows.map((s) => ({
        department_id: s.department_id,
        department_name: s.department_name,
        id: s.id,
        job_title: s.job_title,
        user_id: s.user_id,
        username: s.username,
      })),
    };
  } catch (err) {
    logger.db.error('Error al consultar departamentos y personal para tickets', err);
    return { departments: [], staff: [] };
  }
}
