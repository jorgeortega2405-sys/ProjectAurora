import type { NextFunction, Request, Response } from 'express';
import { getCurrentUser, getSessionUser } from '../services/auth.service.js';
import { logger } from '../services/logger.service.js';
import { getUserOrganization } from '../services/organization.service.js';
import { getRolePermissions, getUserEffectivePermissions, hasPermission } from '../services/pbac.service.js';

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = (await getSessionUser(req)) || getCurrentUser(req);
  if (!user) {
    res.status(401).json({
      error: 'Sesión no válida o expirada. Por favor inicia sesión nuevamente.',
      ok: false,
      success: false,
    });
    return;
  }

  let permissions = user.permissions || (await getUserEffectivePermissions(user));

  try {
    const userOrg = await getUserOrganization(user.id);
    if (userOrg && userOrg.memberRole) {
      const orgPerms = await getRolePermissions(userOrg.memberRole);
      permissions = Array.from(new Set([...permissions, ...orgPerms]));
    }
  } catch {}

  (req as any).user = { ...user, permissions };
  next();
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const user = (await getSessionUser(req)) || getCurrentUser(req);
    if (user) {
      const permissions = user.permissions || (await getUserEffectivePermissions(user));
      (req as any).user = { ...user, permissions };
    }
  } catch {}
  next();
}

export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let user = (req as any).user;
    if (!user) {
      user = (await getSessionUser(req)) || getCurrentUser(req);
      if (!user) {
        res.status(401).json({
          error: 'Sesión requerida para realizar esta acción.',
          ok: false,
          success: false,
        });
        return;
      }

      let permissions = user.permissions || (await getUserEffectivePermissions(user));
      try {
        const userOrg = await getUserOrganization(user.id);
        if (userOrg && userOrg.memberRole) {
          const orgPerms = await getRolePermissions(userOrg.memberRole);
          permissions = Array.from(new Set([...permissions, ...orgPerms]));
        }
      } catch {}

      user = { ...user, permissions };
      (req as any).user = user;
    }

    const permissions: string[] = user.permissions || [];
    if (!hasPermission(permissions, permission)) {
      logger.security.warn('Acceso denegado por falta de permiso requerido', {
        path: req.path,
        permission,
        userId: user.id,
      });
      res.status(403).json({
        error: 'No tienes los permisos necesarios para realizar esta acción.',
        ok: false,
        success: false,
      });
      return;
    }

    next();
  };
}
