import { NextFunction, Request, Response } from 'express';
import { getAdminSessionUser, hasPermission } from '../services/auth.service.js';
import { logger } from '../services/logger.service.js';

export async function requireAdminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await getAdminSessionUser(req);
    if (!user) {
      res.status(401).json({
        error: 'Sesión administrativa no válida o expirada. Por favor inicia sesión.',
        success: false,
      });
      return;
    }

    (req as any).adminUser = user;
    next();
  } catch (err) {
    logger.app.error('Error durante autenticación de administrador', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export function requireAdminPermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).adminUser;
    if (!user) {
      res.status(401).json({
        error: 'Sesión requerida para realizar esta acción.',
        success: false,
      });
      return;
    }

    if (!hasPermission(user.permissions, permission)) {
      logger.security.warn('Acceso a recurso administrativo denegado por falta de permiso requerido', {
        path: req.path,
        permission,
        role: user.role,
        userId: user.id,
      });
      res.status(403).json({
        error: 'No tienes los permisos necesarios para realizar esta acción.',
        success: false,
      });
      return;
    }

    next();
  };
}
