import mysql, { RowDataPacket } from 'mysql2/promise';
import { adminConfig } from '../config/env.config.js';
import { logger } from './logger.service.js';

export interface AdminUserRecord {
  avatar_url: string | null;
  created_at: string;
  email: string;
  id: string;
  role: string;
  subscription_tier: string;
  username: string;
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
      username: (r as any).username || 'Usuario',
    }));
  } catch (err) {
    logger.app.error('Error al consultar lista de usuarios en base de datos', err);
    throw err;
  }
}
