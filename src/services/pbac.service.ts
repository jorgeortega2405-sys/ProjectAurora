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
    if (role === 'ADMIN' || role === 'SUPER_ADMIN') return ['*'];
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

export function getSubscriptionPermissions(tier?: string): string[] {
  const norm = (tier || 'free').toLowerCase();
  if (norm === 'enterprise' || norm === 'empresas') {
    return [
      'subscription:feature:enterprise',
      'subscription:feature:pro',
      'subscription:feature:sso',
      'subscription:feature:teams',
      'tools:ai:advanced',
      'tools:high_size_limit',
      'tools:merge:batch_500',
      'tools:split:by_size',
    ];
  }
  if (norm === 'pro' || norm === 'plus') {
    return [
      'subscription:feature:pro',
      'tools:ai:advanced',
      'tools:high_size_limit',
      'tools:merge:batch_500',
      'tools:split:by_size',
    ];
  }
  return [];
}

export async function getUserEffectivePermissions(user: {
  id: string;
  role?: string;
  subscription_status?: string;
  subscription_tier?: string;
}): Promise<string[]> {
  let permissions = await getRolePermissions(user.role || 'USER');

  const isActiveSub = user.subscription_status === 'active' || user.subscription_status === 'trialing';
  if (isActiveSub && user.subscription_tier) {
    const subPerms = getSubscriptionPermissions(user.subscription_tier);
    permissions = Array.from(new Set([...permissions, ...subPerms]));
  }

  return permissions;
}

export function hasPermission(permissions: string[] | undefined, requiredPermission: string): boolean {
  if (!permissions || !Array.isArray(permissions)) return false;
  if (permissions.includes('*') || permissions.includes(requiredPermission)) return true;
  return false;
}
