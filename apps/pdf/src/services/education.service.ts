import crypto from 'crypto';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.config.js';
import { redis } from '../config/redis.config.js';
import { logger } from './logger.service.js';
import { sendEducationVerificationEmail } from './mail.service.js';
import { findUserById, invalidateUserCache } from './user.service.js';

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

interface PartnerDomainRow extends RowDataPacket {
  domain: string;
  id: string;
  is_active: number | boolean;
  school_name: string;
}

interface UserDbRow extends RowDataPacket {
  email: string;
  id: string;
  username: string;
}

interface EduOtpPayload {
  attempts: number;
  code: string;
  createdAt: number;
  email: string;
  lastSentAt?: number;
  schoolName: string;
}

const memoryEduOtp = new Map<string, EduOtpPayload>();
const OTP_TTL_SECONDS = 900;
const MAX_OTP_ATTEMPTS = 5;

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
    await invalidateUserCache(verification.user_id);
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

export async function checkEducationalDomain(email: string): Promise<{
  domain: string;
  isPartner: boolean;
  schoolName: string;
}> {
  const cleanEmail = email.trim().toLowerCase();
  const atIdx = cleanEmail.indexOf('@');
  if (atIdx === -1) {
    return { domain: '', isPartner: false, schoolName: '' };
  }

  const domain = cleanEmail.substring(atIdx + 1);

  let partnerRows: PartnerDomainRow[] | null = null;
  try {
    if (redis.status === 'ready') {
      const raw = await redis.get('cache:edu:partner_domains');
      if (raw) partnerRows = JSON.parse(raw);
    }
  } catch {}

  if (!partnerRows) {
    const [rows] = await pool.query<PartnerDomainRow[]>(
      'SELECT domain, school_name FROM educational_partner_domains WHERE is_active = 1'
    );
    partnerRows = rows;
    try {
      if (redis.status === 'ready') {
        await redis.setex('cache:edu:partner_domains', 3600, JSON.stringify(partnerRows));
      }
    } catch {}
  }

  for (const row of partnerRows) {
    const pDomain = row.domain.toLowerCase();
    if (domain === pDomain || domain.endsWith(`.${pDomain}`)) {
      return {
        domain,
        isPartner: true,
        schoolName: row.school_name,
      };
    }
  }

  if (domain.endsWith('.edu') || domain.includes('.edu.') || domain.endsWith('.ac.uk')) {
    return {
      domain,
      isPartner: true,
      schoolName: 'Institución Educativa Acreditada (.edu)',
    };
  }

  return { domain, isPartner: false, schoolName: '' };
}

export async function requestInstitutionalEmailOtp(userId: string, institutionalEmail: string): Promise<{
  domain: string;
  schoolName: string;
  success: boolean;
}> {
  const cleanEmail = institutionalEmail.trim().toLowerCase();
  const check = await checkEducationalDomain(cleanEmail);

  if (!check.isPartner) {
    throw new Error('El correo ingresado no pertenece a un dominio educativo o institución en convenio.');
  }

  const user = await findUserById(userId);
  if (!user) {
    throw new Error('Usuario no encontrado.');
  }

  const now = Date.now();
  const redisKey = `edu_otp:${userId}`;
  let existing: EduOtpPayload | null = null;

  try {
    if (redis.status === 'ready') {
      const raw = await redis.get(redisKey);
      if (raw) existing = JSON.parse(raw);
    }
  } catch (err) {
    logger.db.warn('Fallo al consultar OTP educativo en Redis', err);
  }

  if (!existing) {
    existing = memoryEduOtp.get(userId) || null;
  }

  if (existing && (now - existing.createdAt < OTP_TTL_SECONDS * 1000) && existing.email === cleanEmail) {
    const lastSent = existing.lastSentAt || existing.createdAt;
    const elapsedSeconds = Math.floor((now - lastSent) / 1000);

    if (elapsedSeconds < 60) {
      const retryAfter = 60 - elapsedSeconds;
      throw new Error(`Por favor espera ${retryAfter} segundos antes de solicitar otro código de verificación.`);
    }

    existing.lastSentAt = now;
    const remainingSeconds = Math.max(1, Math.floor((OTP_TTL_SECONDS * 1000 - (now - existing.createdAt)) / 1000));
    const remainingMinutes = Math.max(1, Math.ceil(remainingSeconds / 60));

    try {
      if (redis.status === 'ready') {
        await redis.setex(redisKey, remainingSeconds, JSON.stringify(existing));
      }
    } catch {}
    memoryEduOtp.set(userId, existing);

    await sendEducationVerificationEmail(cleanEmail, user.username, check.schoolName, existing.code, remainingMinutes);
    logger.security.info('Código OTP de activación educativa reutilizado', {
      email: cleanEmail,
      schoolName: check.schoolName,
      userId,
    });

    return {
      domain: check.domain,
      schoolName: check.schoolName,
      success: true,
    };
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const payload: EduOtpPayload = {
    attempts: 0,
    code,
    createdAt: now,
    email: cleanEmail,
    lastSentAt: now,
    schoolName: check.schoolName,
  };

  let storedInRedis = false;
  try {
    if (redis.status === 'ready') {
      await redis.setex(redisKey, OTP_TTL_SECONDS, JSON.stringify(payload));
      storedInRedis = true;
    }
  } catch (err) {
    logger.db.warn('Fallo al guardar OTP educativo en Redis, usando memoria interna', err);
  }

  if (!storedInRedis) {
    memoryEduOtp.set(userId, payload);
  }

  await sendEducationVerificationEmail(cleanEmail, user.username, check.schoolName, code, 15);

  logger.security.info('Código OTP de activación educativa enviado', {
    email: cleanEmail,
    schoolName: check.schoolName,
    userId,
  });

  return {
    domain: check.domain,
    schoolName: check.schoolName,
    success: true,
  };
}

export async function verifyInstitutionalEmailOtp(userId: string, code: string): Promise<{
  schoolName: string;
  success: boolean;
}> {
  const redisKey = `edu_otp:${userId}`;
  let payload: EduOtpPayload | null = null;

  try {
    if (redis.status === 'ready') {
      const raw = await redis.get(redisKey);
      if (raw) payload = JSON.parse(raw);
    }
  } catch (err) {
    logger.db.warn('Fallo al leer OTP educativo de Redis', err);
  }

  if (!payload) {
    payload = memoryEduOtp.get(userId) || null;
  }

  if (!payload) {
    throw new Error('El código ha expirado o no se ha solicitado ninguna verificación.');
  }

  if (Date.now() - payload.createdAt > OTP_TTL_SECONDS * 1000) {
    memoryEduOtp.delete(userId);
    try {
      if (redis.status === 'ready') await redis.del(redisKey);
    } catch {}
    throw new Error('El código ha expirado. Por favor solicita uno nuevo.');
  }

  if (payload.attempts >= MAX_OTP_ATTEMPTS) {
    memoryEduOtp.delete(userId);
    try {
      if (redis.status === 'ready') await redis.del(redisKey);
    } catch {}
    throw new Error('Has superado el número máximo de intentos. Solicita un nuevo código.');
  }

  if (payload.code !== code.trim()) {
    payload.attempts += 1;
    if (payload.attempts >= MAX_OTP_ATTEMPTS) {
      memoryEduOtp.delete(userId);
      try {
        if (redis.status === 'ready') await redis.del(redisKey);
      } catch {}
      throw new Error('Has superado el número máximo de intentos. Solicita un nuevo código.');
    }
    try {
      if (redis.status === 'ready') {
        const remainingTtl = Math.max(1, Math.floor((OTP_TTL_SECONDS * 1000 - (Date.now() - payload.createdAt)) / 1000));
        await redis.setex(redisKey, remainingTtl, JSON.stringify(payload));
      }
    } catch {}
    memoryEduOtp.set(userId, payload);
    throw new Error('El código de verificación es incorrecto.');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      'UPDATE users SET subscription_tier = ?, subscription_origin = ?, is_student = TRUE, subscription_status = ?, subscription_period_end = DATE_ADD(NOW(), INTERVAL 1 YEAR) WHERE id = ?',
      ['pro', 'education', 'active', userId]
    );

    const verificationId = crypto.randomUUID();
    const docPlaceholder = `institutional_email:${payload.email}`;
    await connection.query(
      'INSERT INTO student_verifications (id, user_id, full_name, school_name, document_url, status, admin_notes, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
      [verificationId, userId, payload.email, payload.schoolName, docPlaceholder, 'approved', 'Auto-aprobado mediante verificación de correo institucional en convenio']
    );

    await connection.commit();

    try {
      if (redis.status === 'ready') await redis.del(redisKey);
    } catch {}
    memoryEduOtp.delete(userId);
    await invalidateUserCache(userId);

    logger.security.info('Pro Educativo activado automáticamente por verificación de correo institucional', {
      email: payload.email,
      schoolName: payload.schoolName,
      userId,
    });

    return {
      schoolName: payload.schoolName,
      success: true,
    };
  } catch (err) {
    await connection.rollback();
    logger.db.error('Error al activar Pro Educativo vía OTP', err);
    throw err;
  } finally {
    connection.release();
  }
}

export async function activateInstantEducationalPro(
  userId: string,
  email: string,
  schoolName: string
): Promise<{ schoolName: string; success: boolean }> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      'UPDATE users SET subscription_tier = ?, subscription_origin = ?, is_student = TRUE, subscription_status = ?, subscription_period_end = DATE_ADD(NOW(), INTERVAL 1 YEAR) WHERE id = ?',
      ['pro', 'education', 'active', userId]
    );

    const verificationId = crypto.randomUUID();
    const docPlaceholder = `instant_domain:${email}`;
    await connection.query(
      'INSERT INTO student_verifications (id, user_id, full_name, school_name, document_url, status, admin_notes, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
      [verificationId, userId, email, schoolName, docPlaceholder, 'approved', 'Auto-activado por reconocimiento directo de correo educativo (.edu)']
    );

    await connection.commit();
    await invalidateUserCache(userId);

    logger.security.info('Pro Educativo auto-activado por reconocimiento directo de correo institucional', {
      email,
      schoolName,
      userId,
    });

    return {
      schoolName,
      success: true,
    };
  } catch (err) {
    await connection.rollback();
    logger.db.error('Error al auto-activar Pro Educativo', err);
    throw err;
  } finally {
    connection.release();
  }
}
