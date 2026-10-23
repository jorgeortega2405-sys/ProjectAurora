import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import { RowDataPacket } from 'mysql2/promise';
import path from 'path';
import { adminConfig } from '../config/env.config.js';
import { DocumentType, EmployeeStatus, EmploymentType, HireEmployeeInput, HireEmployeeResult, HrDepartment, HrDocument, HrEmployee, HrOrganigramNode, HrSummaryStats, HrVacationRequest, SalaryFrequency, VacationStatus } from '../types/hr.types.js';
import { adminDbPool } from './db.service.js';
import { logger } from './logger.service.js';

interface DepartmentRow extends RowDataPacket {
  color: string;
  created_at: Date | string;
  description: string | null;
  id: string;
  name: string;
}

interface EmployeeRow extends RowDataPacket {
  avatar_url: string | null;
  created_at: Date | string;
  department_color: string;
  department_id: string;
  department_name: string;
  direct_reports_count: number | string;
  email: string;
  employment_type: EmploymentType;
  hire_date: Date | string;
  id: string;
  job_title: string;
  manager_id: string | null;
  manager_name: string | null;
  manager_title: string | null;
  notes: string | null;
  role: string;
  salary_amount: number | string;
  salary_currency: string;
  salary_frequency: SalaryFrequency;
  status: EmployeeStatus;
  subscription_tier: string | null;
  updated_at: Date | string;
  user_id: string;
  username: string;
  vacation_days_allocated: number;
  vacation_days_used: number;
}

interface DocumentRow extends RowDataPacket {
  created_at: Date | string;
  document_type: DocumentType;
  employee_id: string;
  employee_name: string;
  file_name: string;
  file_size_bytes: number | string;
  file_url: string;
  id: string;
  mime_type: string;
  title: string;
  uploaded_by: string | null;
  uploaded_by_username: string | null;
}

interface VacationRow extends RowDataPacket {
  created_at: Date | string;
  days_count: number;
  employee_id: string;
  employee_name: string;
  end_date: Date | string;
  id: string;
  reason: string | null;
  review_notes: string | null;
  reviewed_at: Date | string | null;
  reviewed_by: string | null;
  start_date: Date | string;
  status: VacationStatus;
}

const HR_DOCS_DIR = fs.existsSync(path.resolve(process.cwd(), 'apps/admin'))
  ? path.resolve(process.cwd(), 'apps/admin/public/uploads/hr_documents')
  : path.resolve(process.cwd(), 'public/uploads/hr_documents');

function ensureHrDocsDir(): void {
  if (!fs.existsSync(HR_DOCS_DIR)) {
    fs.mkdirSync(HR_DOCS_DIR, { recursive: true });
  }
}

export function generateSecurePassword(length = 16): string {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*-_+=';
  const allChars = uppercase + lowercase + digits + symbols;

  let password = '';
  password += uppercase[crypto.randomInt(0, uppercase.length)];
  password += lowercase[crypto.randomInt(0, lowercase.length)];
  password += digits[crypto.randomInt(0, digits.length)];
  password += symbols[crypto.randomInt(0, symbols.length)];

  for (let i = password.length; i < length; i++) {
    password += allChars[crypto.randomInt(0, allChars.length)];
  }

  return password.split('').sort(() => crypto.randomInt(-1, 2)).join('');
}

function formatDate(val: Date | string | null): string {
  if (!val) return '';
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  const str = String(val);
  return str.includes('T') ? str.split('T')[0] : str;
}

function formatIso(val: Date | string | null): string {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

function mapEmployeeRow(r: EmployeeRow): HrEmployee {
  const allocated = Number(r.vacation_days_allocated) || 0;
  const used = Number(r.vacation_days_used) || 0;
  return {
    avatar_url: r.avatar_url ?? null,
    created_at: formatIso(r.created_at),
    department_color: r.department_color || '#6366f1',
    department_id: r.department_id,
    department_name: r.department_name || 'Sin departamento',
    direct_reports_count: Number(r.direct_reports_count) || 0,
    email: r.email,
    employment_type: r.employment_type || 'full_time',
    hire_date: formatDate(r.hire_date),
    id: r.id,
    job_title: r.job_title,
    manager_id: r.manager_id ?? null,
    manager_name: r.manager_name ?? null,
    manager_title: r.manager_title ?? null,
    notes: r.notes ?? null,
    role: r.role || 'USER',
    salary_amount: parseFloat(String(r.salary_amount)) || 0,
    salary_currency: r.salary_currency || 'USD',
    salary_frequency: r.salary_frequency || 'monthly',
    status: r.status || 'active',
    subscription_tier: r.subscription_tier || 'free',
    updated_at: formatIso(r.updated_at),
    user_id: r.user_id,
    username: r.username,
    vacation_balance: Math.max(0, allocated - used),
    vacation_days_allocated: allocated,
    vacation_days_used: used,
  };
}

export async function getAllDepartments(): Promise<HrDepartment[]> {
  try {
    const [rows] = await adminDbPool.query<DepartmentRow[]>(
      'SELECT id, name, description, color, created_at FROM hr_departments ORDER BY name ASC'
    );
    return rows.map((r) => ({
      color: r.color,
      created_at: formatIso(r.created_at),
      description: r.description,
      id: r.id,
      name: r.name,
    }));
  } catch (err) {
    logger.app.error('Error al consultar departamentos de RRHH en base de datos', err);
    throw err;
  }
}

export async function getAllEmployees(filter?: { department_id?: string; search?: string; status?: string }): Promise<HrEmployee[]> {
  try {
    let query = `
      SELECT e.id, e.user_id, e.department_id, e.manager_id, e.job_title, e.employment_type,
             e.status, e.hire_date, e.salary_amount, e.salary_currency, e.salary_frequency,
             e.vacation_days_allocated, e.vacation_days_used, e.notes, e.created_at, e.updated_at,
             u.username, u.email, u.avatar_url, u.role, u.subscription_tier,
             d.name AS department_name, d.color AS department_color,
             mu.username AS manager_name, me.job_title AS manager_title,
             (SELECT COUNT(*) FROM hr_employees sub WHERE sub.manager_id = e.id AND sub.status != 'terminated') AS direct_reports_count
      FROM hr_employees e
      JOIN users u ON e.user_id = u.id
      JOIN hr_departments d ON e.department_id = d.id
      LEFT JOIN hr_employees me ON e.manager_id = me.id
      LEFT JOIN users mu ON me.user_id = mu.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (filter?.department_id) {
      query += ' AND e.department_id = ?';
      params.push(filter.department_id);
    }
    if (filter?.status) {
      query += ' AND e.status = ?';
      params.push(filter.status);
    }
    if (filter?.search) {
      query += ' AND (u.username LIKE ? OR u.email LIKE ? OR e.job_title LIKE ?)';
      const s = `%${filter.search}%`;
      params.push(s, s, s);
    }

    query += ' ORDER BY e.hire_date DESC, e.created_at DESC';

    const [rows] = await adminDbPool.query<EmployeeRow[]>(query, params);
    return rows.map(mapEmployeeRow);
  } catch (err) {
    logger.app.error('Error al consultar empleados de RRHH en base de datos', err);
    throw err;
  }
}

export async function getEmployeeById(id: string): Promise<HrEmployee | null> {
  try {
    const query = `
      SELECT e.id, e.user_id, e.department_id, e.manager_id, e.job_title, e.employment_type,
             e.status, e.hire_date, e.salary_amount, e.salary_currency, e.salary_frequency,
             e.vacation_days_allocated, e.vacation_days_used, e.notes, e.created_at, e.updated_at,
             u.username, u.email, u.avatar_url, u.role, u.subscription_tier,
             d.name AS department_name, d.color AS department_color,
             mu.username AS manager_name, me.job_title AS manager_title,
             (SELECT COUNT(*) FROM hr_employees sub WHERE sub.manager_id = e.id AND sub.status != 'terminated') AS direct_reports_count
      FROM hr_employees e
      JOIN users u ON e.user_id = u.id
      JOIN hr_departments d ON e.department_id = d.id
      LEFT JOIN hr_employees me ON e.manager_id = me.id
      LEFT JOIN users mu ON me.user_id = mu.id
      WHERE e.id = ?
      LIMIT 1
    `;
    const [rows] = await adminDbPool.query<EmployeeRow[]>(query, [id]);
    if (rows.length === 0) return null;
    return mapEmployeeRow(rows[0]);
  } catch (err) {
    logger.app.error('Error al consultar empleado por ID en base de datos', err);
    throw err;
  }
}

export async function hireEmployee(input: HireEmployeeInput): Promise<HireEmployeeResult> {
  const connection = await adminDbPool.getConnection();
  try {
    await connection.beginTransaction();

    const normalizedName = input.full_name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/g, '') || 'empleado';
    let targetUsername = normalizedName;
    const [existingUsers] = await connection.query<RowDataPacket[]>('SELECT id FROM users WHERE username = ?', [targetUsername]);
    if (existingUsers.length > 0) {
      targetUsername = `${normalizedName}.${crypto.randomInt(100, 999)}`;
    }

    const targetEmail = input.email && input.email.trim()
      ? input.email.trim().toLowerCase()
      : `${targetUsername}@projectaurora.com`;

    const [existingEmails] = await connection.query<RowDataPacket[]>('SELECT id FROM users WHERE email = ?', [targetEmail]);
    if (existingEmails.length > 0) {
      throw new Error('El correo electrónico asignado ya se encuentra registrado.');
    }

    const temporaryPassword = generateSecurePassword(16);
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const newUserId = crypto.randomUUID();
    const targetRole = input.role || 'USER';

    await connection.query(
      `INSERT INTO users (id, username, email, password_hash, role, subscription_tier, subscription_status)
       VALUES (?, ?, ?, ?, ?, 'free', 'active')`,
      [newUserId, targetUsername, targetEmail, passwordHash, targetRole]
    );

    await connection.query(
      `INSERT INTO user_preferences (user_id, theme, language)
       VALUES (?, 'system', 'es-MX')`,
      [newUserId]
    );

    const newEmployeeId = crypto.randomUUID();
    const employmentType = input.employment_type || 'full_time';
    const vacationDaysAllocated = typeof input.vacation_days_allocated === 'number' && input.vacation_days_allocated >= 0
      ? input.vacation_days_allocated
      : 15;
    const salaryFrequency = input.salary_frequency || 'monthly';
    const salaryCurrency = (input.salary_currency || 'USD').toUpperCase();
    const salaryAmount = typeof input.salary_amount === 'number' ? input.salary_amount : parseFloat(String(input.salary_amount)) || 0;
    const hireDate = input.hire_date || new Date().toISOString().split('T')[0];
    const managerId = input.manager_id && input.manager_id.trim() ? input.manager_id.trim() : null;

    await connection.query(
      `INSERT INTO hr_employees (
        id, user_id, department_id, manager_id, job_title, employment_type,
        status, hire_date, salary_amount, salary_currency, salary_frequency,
        vacation_days_allocated, vacation_days_used, notes
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, 0, ?)`,
      [
        newEmployeeId,
        newUserId,
        input.department_id,
        managerId,
        input.job_title.trim(),
        employmentType,
        hireDate,
        salaryAmount,
        salaryCurrency,
        salaryFrequency,
        vacationDaysAllocated,
        input.notes ? input.notes.trim() : null,
      ]
    );

    await connection.commit();

    const createdEmployee = await getEmployeeById(newEmployeeId);
    if (!createdEmployee) {
      throw new Error('Error al recuperar el registro de empleado recién creado.');
    }

    logger.security.info('Nuevo trabajador contratado y credenciales provisionales generadas', {
      departmentId: input.department_id,
      email: targetEmail,
      employeeId: newEmployeeId,
      role: targetRole,
      userId: newUserId,
      username: targetUsername,
    });

    return {
      credentials: {
        email: targetEmail,
        role: targetRole,
        temporary_password: temporaryPassword,
        username: targetUsername,
      },
      employee: createdEmployee,
    };
  } catch (err) {
    await connection.rollback();
    logger.app.error('Error durante la transacción de contratación de empleado', err);
    throw err;
  } finally {
    connection.release();
  }
}

export async function updateEmployee(
  id: string,
  updates: {
    department_id?: string;
    employment_type?: EmploymentType;
    job_title?: string;
    manager_id?: string | null;
    notes?: string | null;
    role?: string;
    salary_amount?: number;
    salary_currency?: string;
    salary_frequency?: SalaryFrequency;
    status?: EmployeeStatus;
    vacation_days_allocated?: number;
    vacation_days_used?: number;
  }
): Promise<HrEmployee | null> {
  const current = await getEmployeeById(id);
  if (!current) return null;

  const connection = await adminDbPool.getConnection();
  try {
    await connection.beginTransaction();

    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.department_id !== undefined) {
      fields.push('department_id = ?');
      values.push(updates.department_id);
    }
    if (updates.manager_id !== undefined) {
      fields.push('manager_id = ?');
      values.push(updates.manager_id && updates.manager_id !== id ? updates.manager_id : null);
    }
    if (updates.job_title !== undefined) {
      fields.push('job_title = ?');
      values.push(updates.job_title.trim());
    }
    if (updates.employment_type !== undefined) {
      fields.push('employment_type = ?');
      values.push(updates.employment_type);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.salary_amount !== undefined) {
      fields.push('salary_amount = ?');
      values.push(updates.salary_amount);
    }
    if (updates.salary_currency !== undefined) {
      fields.push('salary_currency = ?');
      values.push(updates.salary_currency.toUpperCase());
    }
    if (updates.salary_frequency !== undefined) {
      fields.push('salary_frequency = ?');
      values.push(updates.salary_frequency);
    }
    if (updates.vacation_days_allocated !== undefined) {
      fields.push('vacation_days_allocated = ?');
      values.push(updates.vacation_days_allocated);
    }
    if (updates.vacation_days_used !== undefined) {
      fields.push('vacation_days_used = ?');
      values.push(updates.vacation_days_used);
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      values.push(updates.notes ? updates.notes.trim() : null);
    }

    if (fields.length > 0) {
      values.push(id);
      await connection.query(`UPDATE hr_employees SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    if (updates.role && updates.role !== current.role) {
      await connection.query('UPDATE users SET role = ? WHERE id = ?', [updates.role, current.user_id]);
    }

    await connection.commit();
    return await getEmployeeById(id);
  } catch (err) {
    await connection.rollback();
    logger.app.error('Error al actualizar datos de empleado en base de datos', err);
    throw err;
  } finally {
    connection.release();
  }
}

export async function terminateEmployee(id: string, notes?: string): Promise<boolean> {
  try {
    const [result] = await adminDbPool.query<RowDataPacket[] & { affectedRows: number }>(
      "UPDATE hr_employees SET status = 'terminated', notes = CONCAT(IFNULL(notes, ''), '\n[Baja]: ', ?) WHERE id = ?",
      [notes || 'Contrato finalizado', id]
    );
    return result.affectedRows > 0;
  } catch (err) {
    logger.app.error('Error al marcar baja de empleado en base de datos', err);
    throw err;
  }
}

export async function getOrganigramTree(): Promise<HrOrganigramNode[]> {
  try {
    const allEmployees = await getAllEmployees({ status: 'active' });
    const nodeMap = new Map<string, HrOrganigramNode>();

    for (const emp of allEmployees) {
      nodeMap.set(emp.id, {
        avatar_url: emp.avatar_url,
        department_color: emp.department_color,
        department_id: emp.department_id,
        department_name: emp.department_name,
        direct_reports_count: emp.direct_reports_count,
        email: emp.email,
        hire_date: emp.hire_date,
        id: emp.id,
        job_title: emp.job_title,
        name: emp.username,
        role: emp.role,
        salary_amount: emp.salary_amount,
        salary_currency: emp.salary_currency,
        status: emp.status,
        subordinates: [],
        subscription_tier: emp.subscription_tier,
        user_id: emp.user_id,
        vacation_balance: emp.vacation_balance,
      });
    }

    const roots: HrOrganigramNode[] = [];

    for (const emp of allEmployees) {
      const node = nodeMap.get(emp.id)!;
      if (emp.manager_id && nodeMap.has(emp.manager_id)) {
        const parent = nodeMap.get(emp.manager_id)!;
        parent.subordinates.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  } catch (err) {
    logger.app.error('Error al construir el organigrama de la empresa', err);
    throw err;
  }
}

export async function getDocumentsByEmployeeId(employeeId?: string): Promise<HrDocument[]> {
  try {
    let query = `
      SELECT d.id, d.employee_id, d.document_type, d.title, d.file_url, d.file_name,
             d.file_size_bytes, d.mime_type, d.uploaded_by, d.created_at,
             u.username AS employee_name,
             up.username AS uploaded_by_username
      FROM hr_documents d
      JOIN hr_employees e ON d.employee_id = e.id
      JOIN users u ON e.user_id = u.id
      LEFT JOIN users up ON d.uploaded_by = up.id
    `;
    const params: unknown[] = [];

    if (employeeId) {
      query += ' WHERE d.employee_id = ?';
      params.push(employeeId);
    }

    query += ' ORDER BY d.created_at DESC';

    const [rows] = await adminDbPool.query<DocumentRow[]>(query, params);
    return rows.map((r) => ({
      created_at: formatIso(r.created_at),
      document_type: r.document_type,
      employee_id: r.employee_id,
      employee_name: r.employee_name,
      file_name: r.file_name,
      file_size_bytes: Number(r.file_size_bytes) || 0,
      file_url: r.file_url,
      id: r.id,
      mime_type: r.mime_type,
      title: r.title,
      uploaded_by: r.uploaded_by ?? null,
      uploaded_by_username: r.uploaded_by_username ?? null,
    }));
  } catch (err) {
    logger.app.error('Error al consultar documentos de RRHH en base de datos', err);
    throw err;
  }
}

export async function uploadHrDocument(
  employeeId: string,
  documentType: DocumentType,
  title: string,
  file: Express.Multer.File,
  uploadedByUserId?: string
): Promise<HrDocument> {
  ensureHrDocsDir();

  const employee = await getEmployeeById(employeeId);
  if (!employee) {
    throw new Error('Empleado no encontrado.');
  }

  const ext = path.extname(file.originalname) || '.pdf';
  const cleanBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
  const storedFileName = `hr_${employeeId}_${Date.now()}_${cleanBase}${ext}`;
  const filePath = path.join(HR_DOCS_DIR, storedFileName);

  fs.writeFileSync(filePath, file.buffer);

  const documentId = crypto.randomUUID();
  const fileUrl = `/uploads/hr_documents/${storedFileName}`;

  try {
    await adminDbPool.query(
      `INSERT INTO hr_documents (id, employee_id, document_type, title, file_url, file_name, file_size_bytes, mime_type, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        documentId,
        employeeId,
        documentType,
        title.trim(),
        fileUrl,
        file.originalname,
        file.size,
        file.mimetype,
        uploadedByUserId || null,
      ]
    );

    return {
      created_at: new Date().toISOString(),
      document_type: documentType,
      employee_id: employeeId,
      employee_name: employee.username,
      file_name: file.originalname,
      file_size_bytes: file.size,
      file_url: fileUrl,
      id: documentId,
      mime_type: file.mimetype,
      title: title.trim(),
      uploaded_by: uploadedByUserId || null,
      uploaded_by_username: null,
    };
  } catch (err) {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {}
    logger.app.error('Error al registrar documento de RRHH en base de datos', err);
    throw err;
  }
}

export async function deleteHrDocument(documentId: string): Promise<boolean> {
  try {
    const [rows] = await adminDbPool.query<DocumentRow[]>('SELECT file_url FROM hr_documents WHERE id = ?', [documentId]);
    if (rows.length === 0) return false;

    const fileUrl = rows[0].file_url;
    const fileName = path.basename(fileUrl);
    const localPath = path.join(HR_DOCS_DIR, fileName);

    await adminDbPool.query('DELETE FROM hr_documents WHERE id = ?', [documentId]);

    try {
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    } catch {}

    return true;
  } catch (err) {
    logger.app.error('Error al eliminar documento de RRHH', err);
    throw err;
  }
}

export async function getVacationRequests(employeeId?: string, status?: string): Promise<HrVacationRequest[]> {
  try {
    let query = `
      SELECT v.id, v.employee_id, v.start_date, v.end_date, v.days_count, v.reason,
             v.status, v.reviewed_by, v.reviewed_at, v.review_notes, v.created_at,
             u.username AS employee_name
      FROM hr_vacation_requests v
      JOIN hr_employees e ON v.employee_id = e.id
      JOIN users u ON e.user_id = u.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (employeeId) {
      query += ' AND v.employee_id = ?';
      params.push(employeeId);
    }
    if (status) {
      query += ' AND v.status = ?';
      params.push(status);
    }

    query += ' ORDER BY v.created_at DESC';

    const [rows] = await adminDbPool.query<VacationRow[]>(query, params);
    return rows.map((r) => ({
      created_at: formatIso(r.created_at),
      days_count: Number(r.days_count) || 0,
      employee_id: r.employee_id,
      employee_name: r.employee_name,
      end_date: formatDate(r.end_date),
      id: r.id,
      reason: r.reason ?? null,
      review_notes: r.review_notes ?? null,
      reviewed_at: r.reviewed_at ? formatIso(r.reviewed_at) : null,
      reviewed_by: r.reviewed_by ?? null,
      start_date: formatDate(r.start_date),
      status: r.status,
    }));
  } catch (err) {
    logger.app.error('Error al consultar solicitudes de vacaciones en base de datos', err);
    throw err;
  }
}

export async function requestVacation(
  employeeId: string,
  startDate: string,
  endDate: string,
  daysCount: number,
  reason?: string
): Promise<HrVacationRequest> {
  const employee = await getEmployeeById(employeeId);
  if (!employee) {
    throw new Error('Empleado no encontrado.');
  }

  const requestId = crypto.randomUUID();
  try {
    await adminDbPool.query(
      `INSERT INTO hr_vacation_requests (id, employee_id, start_date, end_date, days_count, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [requestId, employeeId, startDate, endDate, daysCount, reason ? reason.trim() : null]
    );

    return {
      created_at: new Date().toISOString(),
      days_count: daysCount,
      employee_id: employeeId,
      employee_name: employee.username,
      end_date: endDate,
      id: requestId,
      reason: reason ? reason.trim() : null,
      review_notes: null,
      reviewed_at: null,
      reviewed_by: null,
      start_date: startDate,
      status: 'pending',
    };
  } catch (err) {
    logger.app.error('Error al registrar solicitud de vacaciones en base de datos', err);
    throw err;
  }
}

export async function reviewVacationRequest(
  requestId: string,
  status: 'approved' | 'rejected',
  reviewerUserId?: string,
  reviewNotes?: string
): Promise<HrVacationRequest | null> {
  const connection = await adminDbPool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query<VacationRow[]>(
      'SELECT id, employee_id, days_count, status FROM hr_vacation_requests WHERE id = ? FOR UPDATE',
      [requestId]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return null;
    }

    const currentReq = rows[0];
    const prevStatus = currentReq.status;

    await connection.query(
      `UPDATE hr_vacation_requests
       SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_notes = ?
       WHERE id = ?`,
      [status, reviewerUserId || null, reviewNotes ? reviewNotes.trim() : null, requestId]
    );

    if (status === 'approved' && prevStatus !== 'approved') {
      await connection.query(
        'UPDATE hr_employees SET vacation_days_used = vacation_days_used + ? WHERE id = ?',
        [currentReq.days_count, currentReq.employee_id]
      );
    } else if (status === 'rejected' && prevStatus === 'approved') {
      await connection.query(
        'UPDATE hr_employees SET vacation_days_used = GREATEST(0, vacation_days_used - ?) WHERE id = ?',
        [currentReq.days_count, currentReq.employee_id]
      );
    }

    await connection.commit();

    const [updatedRows] = await adminDbPool.query<VacationRow[]>(
      `SELECT v.id, v.employee_id, v.start_date, v.end_date, v.days_count, v.reason,
              v.status, v.reviewed_by, v.reviewed_at, v.review_notes, v.created_at,
              u.username AS employee_name
       FROM hr_vacation_requests v
       JOIN hr_employees e ON v.employee_id = e.id
       JOIN users u ON e.user_id = u.id
       WHERE v.id = ?`,
      [requestId]
    );

    if (updatedRows.length === 0) return null;
    const r = updatedRows[0];
    return {
      created_at: formatIso(r.created_at),
      days_count: Number(r.days_count) || 0,
      employee_id: r.employee_id,
      employee_name: r.employee_name,
      end_date: formatDate(r.end_date),
      id: r.id,
      reason: r.reason,
      review_notes: r.review_notes,
      reviewed_at: r.reviewed_at ? formatIso(r.reviewed_at) : null,
      reviewed_by: r.reviewed_by,
      start_date: formatDate(r.start_date),
      status: r.status,
    };
  } catch (err) {
    await connection.rollback();
    logger.app.error('Error al resolver solicitud de vacaciones', err);
    throw err;
  } finally {
    connection.release();
  }
}

export async function getHrSummaryStats(): Promise<HrSummaryStats> {
  try {
    const [empRows] = await adminDbPool.query<RowDataPacket[]>(`
      SELECT
        COUNT(*) AS total_employees,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_employees,
        SUM(CASE WHEN status = 'on_leave' THEN 1 ELSE 0 END) AS on_leave_employees,
        SUM(CASE
          WHEN status != 'terminated' AND salary_frequency = 'monthly' THEN salary_amount
          WHEN status != 'terminated' AND salary_frequency = 'biweekly' THEN salary_amount * 2
          WHEN status != 'terminated' AND salary_frequency = 'weekly' THEN salary_amount * 4.33
          WHEN status != 'terminated' AND salary_frequency = 'annual' THEN salary_amount / 12
          ELSE 0
        END) AS monthly_payroll
      FROM hr_employees
    `);

    const [vacRows] = await adminDbPool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS pending_vacations FROM hr_vacation_requests WHERE status = 'pending'"
    );

    const [docRows] = await adminDbPool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS total_documents FROM hr_documents'
    );

    const empStats = empRows[0] || {};
    const vacStats = vacRows[0] || {};
    const docStats = docRows[0] || {};

    return {
      active_employees: Number(empStats.active_employees) || 0,
      monthly_payroll_usd: parseFloat(String(empStats.monthly_payroll)) || 0,
      on_leave_employees: Number(empStats.on_leave_employees) || 0,
      pending_vacations_count: Number(vacStats.pending_vacations) || 0,
      total_documents_count: Number(docStats.total_documents) || 0,
      total_employees: Number(empStats.total_employees) || 0,
    };
  } catch (err) {
    logger.app.error('Error al calcular resumen estadístico de RRHH', err);
    throw err;
  }
}
