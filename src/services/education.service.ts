import { pool } from '../config/database.config.js';
import { logger } from './logger.service.js';
import crypto from 'crypto';
import type { RowDataPacket } from 'mysql2';

export interface StudentVerificationRecord {
  admin_notes: string | null;
  created_at: string;
  document_url: string;
  full_name: string;
  id: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  school_name: string;
  status: 'approved' | 'pending' | 'rejected';
  updated_at: string;
  user_id: string;
}

interface StudentVerificationRow extends RowDataPacket {
  admin_notes: string | null;
  created_at: Date | string;
  document_url: string;
  full_name: string;
  id: string;
  reviewed_at: Date | string | null;
  reviewed_by: string | null;
  school_name: string;
  status: 'approved' | 'pending' | 'rejected';
  updated_at: Date | string;
  user_id: string;
}

function mapRowToVerification(row: StudentVerificationRow): StudentVerificationRecord {
  return {
    admin_notes: row.admin_notes ?? null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    document_url: row.document_url,
    full_name: row.full_name,
    id: row.id,
    reviewed_at: row.reviewed_at ? (row.reviewed_at instanceof Date ? row.reviewed_at.toISOString() : String(row.reviewed_at)) : null,
    reviewed_by: row.reviewed_by ?? null,
    school_name: row.school_name,
    status: row.status,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    user_id: row.user_id,
  };
}

export async function createStudentVerification(params: {
  documentUrl: string;
  fullName: string;
  schoolName: string;
  userId: string;
}): Promise<StudentVerificationRecord> {
  const id = crypto.randomUUID();
  await pool.query(
    'INSERT INTO student_verifications (id, user_id, full_name, school_name, document_url, status) VALUES (?, ?, ?, ?, ?, ?)',
    [id, params.userId, params.fullName.trim(), params.schoolName.trim(), params.documentUrl, 'pending']
  );

  logger.db.info('Solicitud de verificación estudiantil registrada', {
    id,
    schoolName: params.schoolName,
    userId: params.userId,
  });

  const [rows] = await pool.query<StudentVerificationRow[]>(
    'SELECT * FROM student_verifications WHERE id = ? LIMIT 1',
    [id]
  );

  return mapRowToVerification(rows[0]);
}

export async function getLatestStudentVerification(userId: string): Promise<StudentVerificationRecord | null> {
  const [rows] = await pool.query<StudentVerificationRow[]>(
    'SELECT * FROM student_verifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
    [userId]
  );

  if (rows.length === 0) return null;
  return mapRowToVerification(rows[0]);
}

export async function getPendingStudentVerifications(): Promise<StudentVerificationRecord[]> {
  const [rows] = await pool.query<StudentVerificationRow[]>(
    'SELECT * FROM student_verifications WHERE status = ? ORDER BY created_at ASC',
    ['pending']
  );

  return rows.map(mapRowToVerification);
}

export async function approveStudentVerification(params: {
  adminId: string;
  notes?: string;
  verificationId: string;
}): Promise<boolean> {
  const [rows] = await pool.query<StudentVerificationRow[]>(
    'SELECT * FROM student_verifications WHERE id = ? LIMIT 1',
    [params.verificationId]
  );

  if (rows.length === 0) return false;
  const verification = rows[0];

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      'UPDATE student_verifications SET status = ?, reviewed_by = ?, reviewed_at = NOW(), admin_notes = ? WHERE id = ?',
      ['approved', params.adminId, params.notes || null, params.verificationId]
    );

    await connection.query(
      'UPDATE users SET subscription_tier = ?, subscription_origin = ?, is_student = TRUE, subscription_status = ?, subscription_period_end = DATE_ADD(NOW(), INTERVAL 1 YEAR) WHERE id = ?',
      ['pro', 'education', 'active', verification.user_id]
    );

    await connection.commit();
    logger.db.info('Verificación estudiantil aprobada con éxito', {
      adminId: params.adminId,
      userId: verification.user_id,
      verificationId: params.verificationId,
    });
    return true;
  } catch (err) {
    await connection.rollback();
    logger.db.error('Error al aprobar verificación estudiantil', err);
    throw err;
  } finally {
    connection.release();
  }
}

export async function rejectStudentVerification(params: {
  adminId: string;
  notes?: string;
  verificationId: string;
}): Promise<boolean> {
  const [result] = await pool.query(
    'UPDATE student_verifications SET status = ?, reviewed_by = ?, reviewed_at = NOW(), admin_notes = ? WHERE id = ?',
    ['rejected', params.adminId, params.notes || null, params.verificationId]
  );

  logger.db.info('Verificación estudiantil rechazada', {
    adminId: params.adminId,
    verificationId: params.verificationId,
  });

  return (result as any).affectedRows > 0;
}
