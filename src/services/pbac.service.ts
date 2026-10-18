import { pool } from '../config/database.config.js';
import { logger } from './logger.service.js';
import type { RowDataPacket } from 'mysql2';

interface RolePermissionRow extends RowDataPacket {
  permission_id: string;
}

const rolePermissionsCache = new Map<string, { fetchedAt: number; permissions: string[] }>();
const CACHE_TTL_MS = 60 * 1000;

export async function getRolePermissions(role: string): Promise<string[]> {
  const cached = rolePermissionsCache.get(role);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.permissions;
  }

  try {
    const [rows] = await pool.query<RolePermissionRow[]>(
      'SELECT permission_id FROM role_permissions WHERE role_id = ?',
      [role]
    );
    const permissions = rows.map((r) => r.permission_id);
    rolePermissionsCache.set(role, { fetchedAt: Date.now(), permissions });
    return permissions;
  } catch (err) {
    logger.db.error('Error al consultar permisos de rol en base de datos', err);
    if (role === 'ADMIN') return ['*'];
    if (role === 'USER') {
      return [
        'account:view_profile',
        'account:edit_identifiers',
        'account:edit_security',
        'account:delete',
        'workflows:manage',
      ];
    }
    return ['account:view_profile'];
  }
}

export function hasPermission(permissions: string[] | undefined, requiredPermission: string): boolean {
  if (!permissions || !Array.isArray(permissions)) return false;
  if (permissions.includes('*') || permissions.includes(requiredPermission)) return true;
  return false;
}
