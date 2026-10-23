import mysql, { RowDataPacket } from 'mysql2/promise';
import { adminConfig } from '../config/env.config.js';
import { logger } from './logger.service.js';

export interface AdminBackupRecord {
  checksum_sha256: string | null;
  components: ('mysql' | 'cassandra' | 'minio')[];
  created_at: string;
  filename: string;
  id: string;
  metadata: Record<string, unknown> | null;
  name: string;
  notes: string | null;
  restored_at: string | null;
  s3_bucket: string;
  s3_key: string;
  size_bytes: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface AdminInquiryRecord {
  company: string;
  created_at: string;
  email: string;
  first_name: string;
  id: string;
  last_name: string;
  message: string;
  status: 'pending' | 'contacted' | 'closed';
  updated_at: string;
}

export interface AdminOrganizationRecord {
  active_members_count: number;
  created_at: string;
  domains: string | null;
  enforce_sso: boolean;
  id: string;
  name: string;
  org_type: string;
  owner_email: string | null;
  owner_id: string;
  owner_username: string | null;
  seat_limit: number;
  slug: string;
  sso_enabled: boolean;
  sso_provider: string | null;
  subscription_status: string;
}

export interface AdminPurchaseRecord {
  amount_total: number;
  billing_period: string;
  created_at: string;
  currency: string;
  email: string | null;
  id: number;
  plan_id: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_session_id: string;
  stripe_subscription_id: string | null;
  user_id: string;
  username: string | null;
}

export interface AdminUserRecord {
  avatar_url: string | null;
  created_at: string;
  email: string;
  id: string;
  role: string;
  subscription_tier: string;
  username: string;
}

export interface AdminVerificationRecord {
  admin_notes: string | null;
  created_at: string;
  document_url: string;
  email: string | null;
  full_name: string;
  id: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  school_name: string;
  status: 'pending' | 'approved' | 'rejected';
  user_id: string;
  username: string | null;
}

interface BackupRowPacket extends RowDataPacket {
  checksum_sha256: string | null;
  components_json: string;
  created_at: Date | string;
  filename: string;
  id: string;
  metadata_json: unknown;
  name: string;
  notes: string | null;
  restored_at: Date | string | null;
  s3_bucket: string;
  s3_key: string;
  size_bytes: number | string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

interface InquiryRowPacket extends RowDataPacket {
  company: string;
  created_at: Date | string;
  email: string;
  first_name: string;
  id: string;
  last_name: string;
  message: string;
  status: 'pending' | 'contacted' | 'closed';
  updated_at: Date | string;
}

interface OrganizationRowPacket extends RowDataPacket {
  active_members_count: number | string;
  created_at: Date | string;
  domains: string | null;
  enforce_sso: number | boolean;
  id: string;
  name: string;
  org_type: string;
  owner_email: string | null;
  owner_id: string;
  owner_username: string | null;
  seat_limit: number;
  slug: string;
  sso_enabled: number | boolean | null;
  sso_provider: string | null;
  subscription_status: string;
}

interface PurchaseRowPacket extends RowDataPacket {
  amount_total: number | string;
  billing_period: string;
  created_at: Date | string;
  currency: string;
  email: string | null;
  id: number;
  plan_id: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_session_id: string;
  stripe_subscription_id: string | null;
  user_id: string;
  username: string | null;
}

interface UserRowPacket extends RowDataPacket {
  avatar_url: string | null;
  created_at: Date | string;
  email: string;
  id: string;
  role: string;
  subscription_tier: string;
  username: string;
}

interface VerificationRowPacket extends RowDataPacket {
  admin_notes: string | null;
  created_at: Date | string;
  document_url: string;
  email: string | null;
  full_name: string;
  id: string;
  reviewed_at: Date | string | null;
  reviewed_by: string | null;
  school_name: string;
  status: 'pending' | 'approved' | 'rejected';
  user_id: string;
  username: string | null;
}

export const adminDbPool = mysql.createPool({
  connectionLimit: 10,
  database: adminConfig.db.name,
  enableKeepAlive: true,
  host: adminConfig.db.host,
  keepAliveInitialDelay: 10000,
  password: adminConfig.db.password,
  port: adminConfig.db.port,
  user: adminConfig.db.user,
  waitForConnections: true,
});

export async function getAllUsers(): Promise<AdminUserRecord[]> {
  try {
    const [rows] = await adminDbPool.query<UserRowPacket[]>(
      'SELECT id, username, email, avatar_url, role, subscription_tier, created_at FROM users ORDER BY created_at DESC'
    );

    return rows.map((r) => ({
      avatar_url: r.avatar_url ?? null,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      email: r.email,
      id: r.id,
      role: r.role || 'USER',
      subscription_tier: r.subscription_tier || 'free',
      username: r.username || 'Usuario',
    }));
  } catch (err) {
    logger.app.error('Error al consultar lista de usuarios en base de datos', err);
    throw err;
  }
}

export async function getAllPurchases(websiteId?: string | null): Promise<AdminPurchaseRecord[]> {
  try {
    let sql = `SELECT p.id, p.user_id, p.stripe_session_id, p.stripe_payment_intent_id, p.stripe_subscription_id,
              p.stripe_customer_id, p.plan_id, p.billing_period, p.amount_total, p.currency, p.status, p.created_at,
              u.username, u.email
       FROM purchases p
       LEFT JOIN users u ON p.user_id = u.id`;
    const params: unknown[] = [];
    if (websiteId && websiteId !== '*' && websiteId !== 'all') {
      sql += ' WHERE p.website_id = ?';
      params.push(websiteId);
    }
    sql += ' ORDER BY p.created_at DESC';

    const [rows] = await adminDbPool.query<PurchaseRowPacket[]>(sql, params);

    return rows.map((r) => ({
      amount_total: Number(r.amount_total) || 0,
      billing_period: r.billing_period || 'monthly',
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      currency: r.currency || 'USD',
      email: r.email ?? null,
      id: Number(r.id),
      plan_id: r.plan_id || 'pro',
      status: r.status || 'pending',
      stripe_customer_id: r.stripe_customer_id ?? null,
      stripe_payment_intent_id: r.stripe_payment_intent_id ?? null,
      stripe_session_id: r.stripe_session_id,
      stripe_subscription_id: r.stripe_subscription_id ?? null,
      user_id: r.user_id,
      username: r.username ?? null,
    }));
  } catch (err) {
    logger.app.error('Error al consultar historial de compras en base de datos', err);
    throw err;
  }
}

export async function getAllVerifications(): Promise<AdminVerificationRecord[]> {
  try {
    const [rows] = await adminDbPool.query<VerificationRowPacket[]>(
      `SELECT sv.id, sv.user_id, sv.full_name, sv.school_name, sv.document_url, sv.status,
              sv.admin_notes, sv.reviewed_by, sv.reviewed_at, sv.created_at,
              u.username, u.email
       FROM student_verifications sv
       LEFT JOIN users u ON sv.user_id = u.id
       ORDER BY sv.created_at DESC`
    );

    return rows.map((r) => ({
      admin_notes: r.admin_notes ?? null,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      document_url: r.document_url,
      email: r.email ?? null,
      full_name: r.full_name,
      id: r.id,
      reviewed_at: r.reviewed_at instanceof Date ? r.reviewed_at.toISOString() : (r.reviewed_at ? String(r.reviewed_at) : null),
      reviewed_by: r.reviewed_by ?? null,
      school_name: r.school_name,
      status: r.status,
      user_id: r.user_id,
      username: r.username ?? null,
    }));
  } catch (err) {
    logger.app.error('Error al consultar verificaciones de estudiantes en base de datos', err);
    throw err;
  }
}

export async function updateVerificationStatus(
  verificationId: string,
  status: 'approved' | 'rejected',
  notes?: string
): Promise<boolean> {
  const conn = await adminDbPool.getConnection();
  try {
    await conn.beginTransaction();

    const [verRows] = await conn.query<VerificationRowPacket[]>(
      'SELECT id, user_id FROM student_verifications WHERE id = ? FOR UPDATE',
      [verificationId]
    );

    if (verRows.length === 0) {
      await conn.rollback();
      return false;
    }

    const userId = verRows[0].user_id;

    await conn.query(
      `UPDATE student_verifications
       SET status = ?, admin_notes = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [status, notes || null, verificationId]
    );

    const isStudent = status === 'approved' ? 1 : 0;
    await conn.query(
      'UPDATE users SET is_student = ? WHERE id = ?',
      [isStudent, userId]
    );

    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    logger.app.error('Error al actualizar estado de verificación de estudiante', err);
    throw err;
  } finally {
    conn.release();
  }
}

export async function getAllOrganizations(): Promise<AdminOrganizationRecord[]> {
  try {
    const [rows] = await adminDbPool.query<OrganizationRowPacket[]>(
      `SELECT o.id, o.name, o.slug, o.owner_id, o.seat_limit, o.org_type, o.subscription_status, o.created_at,
              u.username AS owner_username, u.email AS owner_email,
              (SELECT COUNT(*) FROM organization_members om WHERE om.organization_id = o.id AND om.status = 'active') AS active_members_count,
              (SELECT GROUP_CONCAT(od.domain SEPARATOR ', ') FROM organization_domains od WHERE od.organization_id = o.id) AS domains,
              sso.provider AS sso_provider, sso.is_enabled AS sso_enabled, sso.enforce_sso
       FROM organizations o
       LEFT JOIN users u ON o.owner_id = u.id
       LEFT JOIN organization_sso_configs sso ON sso.organization_id = o.id
       ORDER BY o.created_at DESC`
    );

    return rows.map((r) => ({
      active_members_count: Number(r.active_members_count) || 0,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      domains: r.domains ?? null,
      enforce_sso: Boolean(r.enforce_sso),
      id: r.id,
      name: r.name,
      org_type: r.org_type || 'business',
      owner_email: r.owner_email ?? null,
      owner_id: r.owner_id,
      owner_username: r.owner_username ?? null,
      seat_limit: Number(r.seat_limit) || 5,
      slug: r.slug,
      sso_enabled: Boolean(r.sso_enabled),
      sso_provider: r.sso_provider ?? null,
      subscription_status: r.subscription_status || 'active',
    }));
  } catch (err) {
    logger.app.error('Error al consultar organizaciones en base de datos', err);
    throw err;
  }
}

export async function updateOrganizationSettings(
  organizationId: string,
  updates: { seat_limit?: number; subscription_status?: string }
): Promise<boolean> {
  try {
    const fields: string[] = [];
    const values: (string | number)[] = [];

    if (typeof updates.seat_limit === 'number' && updates.seat_limit > 0) {
      fields.push('seat_limit = ?');
      values.push(updates.seat_limit);
    }

    if (typeof updates.subscription_status === 'string' && updates.subscription_status.trim()) {
      fields.push('subscription_status = ?');
      values.push(updates.subscription_status.trim());
    }

    if (fields.length === 0) {
      return false;
    }

    values.push(organizationId);
    const [result] = await adminDbPool.query<mysql.ResultSetHeader>(
      `UPDATE organizations SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    return result.affectedRows > 0;
  } catch (err) {
    logger.app.error('Error al actualizar configuración de organización en base de datos', err);
    throw err;
  }
}

export async function getAllInquiries(websiteId?: string | null): Promise<AdminInquiryRecord[]> {
  try {
    let sql = `SELECT id, first_name, last_name, company, email, message, status, created_at, updated_at
       FROM enterprise_inquiries`;
    const params: unknown[] = [];
    if (websiteId && websiteId !== '*' && websiteId !== 'all') {
      sql += ' WHERE website_id = ?';
      params.push(websiteId);
    }
    sql += ' ORDER BY created_at DESC';

    const [rows] = await adminDbPool.query<InquiryRowPacket[]>(sql, params);

    return rows.map((r) => ({
      company: r.company,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      email: r.email,
      first_name: r.first_name,
      id: r.id,
      last_name: r.last_name,
      message: r.message,
      status: r.status,
      updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    }));
  } catch (err) {
    logger.app.error('Error al consultar solicitudes comerciales en base de datos', err);
    throw err;
  }
}

export async function updateInquiryStatus(
  id: string,
  status: 'pending' | 'contacted' | 'closed'
): Promise<boolean> {
  try {
    const [result] = await adminDbPool.query<mysql.ResultSetHeader>(
      'UPDATE enterprise_inquiries SET status = ? WHERE id = ?',
      [status, id]
    );

    return result.affectedRows > 0;
  } catch (err) {
    logger.app.error('Error al actualizar estado de solicitud comercial en base de datos', err);
    throw err;
  }
}

export async function getAllBackups(): Promise<AdminBackupRecord[]> {
  try {
    const [rows] = await adminDbPool.query<BackupRowPacket[]>(
      'SELECT id, name, filename, s3_key, s3_bucket, size_bytes, components_json, status, checksum_sha256, notes, metadata_json, created_at, restored_at FROM backup_records ORDER BY created_at DESC'
    );

    return rows.map((r) => {
      let components: ('mysql' | 'cassandra' | 'minio')[] = [];
      try {
        components = JSON.parse(r.components_json);
      } catch {
        components = [];
      }

      let metadata: Record<string, unknown> | null = null;
      if (typeof r.metadata_json === 'string') {
        try {
          metadata = JSON.parse(r.metadata_json);
        } catch {
          metadata = null;
        }
      } else if (r.metadata_json && typeof r.metadata_json === 'object') {
        metadata = r.metadata_json as Record<string, unknown>;
      }

      return {
        checksum_sha256: r.checksum_sha256,
        components,
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        filename: r.filename,
        id: r.id,
        metadata,
        name: r.name,
        notes: r.notes,
        restored_at: r.restored_at instanceof Date ? r.restored_at.toISOString() : (r.restored_at ? String(r.restored_at) : null),
        s3_bucket: r.s3_bucket,
        s3_key: r.s3_key,
        size_bytes: Number(r.size_bytes) || 0,
        status: r.status,
      };
    });
  } catch (err) {
    logger.app.error('Error al consultar lista de respaldos en base de datos', err);
    throw err;
  }
}

export async function getBackupById(id: string): Promise<AdminBackupRecord | null> {
  try {
    const [rows] = await adminDbPool.query<BackupRowPacket[]>(
      'SELECT id, name, filename, s3_key, s3_bucket, size_bytes, components_json, status, checksum_sha256, notes, metadata_json, created_at, restored_at FROM backup_records WHERE id = ? LIMIT 1',
      [id]
    );

    if (rows.length === 0) return null;
    const r = rows[0];

    let components: ('mysql' | 'cassandra' | 'minio')[] = [];
    try {
      components = JSON.parse(r.components_json);
    } catch {
      components = [];
    }

    let metadata: Record<string, unknown> | null = null;
    if (typeof r.metadata_json === 'string') {
      try {
        metadata = JSON.parse(r.metadata_json);
      } catch {
        metadata = null;
      }
    } else if (r.metadata_json && typeof r.metadata_json === 'object') {
      metadata = r.metadata_json as Record<string, unknown>;
    }

    return {
      checksum_sha256: r.checksum_sha256,
      components,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      filename: r.filename,
      id: r.id,
      metadata,
      name: r.name,
      notes: r.notes,
      restored_at: r.restored_at instanceof Date ? r.restored_at.toISOString() : (r.restored_at ? String(r.restored_at) : null),
      s3_bucket: r.s3_bucket,
      s3_key: r.s3_key,
      size_bytes: Number(r.size_bytes) || 0,
      status: r.status,
    };
  } catch (err) {
    logger.app.error('Error al consultar respaldo por ID en base de datos', err);
    throw err;
  }
}

export async function createBackupRecord(data: {
  checksum_sha256: string | null;
  components: ('mysql' | 'cassandra' | 'minio')[];
  filename: string;
  id: string;
  metadata?: Record<string, unknown> | null;
  name: string;
  notes?: string | null;
  s3_bucket: string;
  s3_key: string;
  size_bytes: number;
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
}): Promise<void> {
  try {
    await adminDbPool.query(
      `INSERT INTO backup_records (id, name, filename, s3_key, s3_bucket, size_bytes, components_json, status, checksum_sha256, notes, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.id,
        data.name,
        data.filename,
        data.s3_key,
        data.s3_bucket,
        data.size_bytes,
        JSON.stringify(data.components),
        data.status || 'completed',
        data.checksum_sha256 || null,
        data.notes || null,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ]
    );
  } catch (err) {
    logger.app.error('Error al insertar registro de respaldo en base de datos', err);
    throw err;
  }
}

export async function markBackupRestored(id: string): Promise<boolean> {
  try {
    const [result] = await adminDbPool.query<mysql.ResultSetHeader>(
      'UPDATE backup_records SET restored_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    return result.affectedRows > 0;
  } catch (err) {
    logger.app.error('Error al marcar respaldo restaurado en base de datos', err);
    throw err;
  }
}

export async function deleteBackupRecord(id: string): Promise<boolean> {
  try {
    const [result] = await adminDbPool.query<mysql.ResultSetHeader>(
      'DELETE FROM backup_records WHERE id = ?',
      [id]
    );

    return result.affectedRows > 0;
  } catch (err) {
    logger.app.error('Error al eliminar registro de respaldo en base de datos', err);
    throw err;
  }
}
