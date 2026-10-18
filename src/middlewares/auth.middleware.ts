import { getCurrentUser } from '../services/auth.service.js';
import { logger } from '../services/logger.service.js';
import { getRolePermissions, hasPermission } from '../services/pbac.service.js';
import type { NextFunction, Request, Response } from 'express';

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = getCurrentUser(req);
  if (!user) {
    res.status(401).json({
      error: 'Sesión no válida o expirada. Por favor inicia sesión nuevamente.',
      ok: false,
      success: false,
    });
    return;
  }

  const permissions = await getRolePermissions(user.role || 'USER');
  (req as any).user = { ...user, permissions };
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const user = getCurrentUser(req);
  if (user) {
    (req as any).user = user;
  }
  next();
}

export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as any).user || getCurrentUser(req);
    if (!user) {
      res.status(401).json({
        error: 'Sesión requerida para realizar esta acción.',
        ok: false,
        success: false,
      });
      return;
    }

    const permissions: string[] = (req as any).user?.permissions || await getRolePermissions(user.role || 'USER');
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
