import { logger } from '../services/logger.service.js';
import { Request, Response } from 'express';
import { SecurityAuditService } from '../services/security-audit.service.js';
import { SessionSecurityService } from '../services/session-security.service.js';

export async function getAdminAuditLogsController(req: Request, res: Response): Promise<void> {
  try {
    const { date, limit, targetType } = req.query as {
      date?: string;
      limit?: string;
      targetType?: string;
    };

    const logs = await SecurityAuditService.getAdminAuditTrail({
      date,
      limit: limit ? parseInt(limit, 10) : 100,
      targetType,
    });

    res.json({
      logs,
      success: true,
      total: logs.length,
    });
  } catch (err) {
    logger.app.error('Error al obtener registros de auditoría administrativa', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al consultar los registros de auditoría.',
      success: false,
    });
  }
}

export async function getSecurityAccessLogsController(req: Request, res: Response): Promise<void> {
  try {
    const { date, ip, limit } = req.query as {
      date?: string;
      ip?: string;
      limit?: string;
    };

    const logs = await SecurityAuditService.getSecurityAccessLogs({
      date,
      ip,
      limit: limit ? parseInt(limit, 10) : 100,
    });

    res.json({
      logs,
      success: true,
      total: logs.length,
    });
  } catch (err) {
    logger.app.error('Error al obtener registros de accesos de seguridad', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al consultar los registros de acceso.',
      success: false,
    });
  }
}

export async function getActiveSessionsController(_req: Request, res: Response): Promise<void> {
  try {
    const sessions = await SessionSecurityService.getActiveSessions();
    res.json({
      sessions,
      success: true,
      total: sessions.length,
    });
  } catch (err) {
    logger.app.error('Error al obtener sesiones activas', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al consultar las sesiones activas.',
      success: false,
    });
  }
}

export async function revokeSessionController(req: Request, res: Response): Promise<void> {
  try {
    const { id: sessionId } = req.params;
    const adminUser = (req as any).adminUser;
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';

    if (!sessionId) {
      res.status(400).json({
        error: 'Identificador de sesión requerido.',
        success: false,
      });
      return;
    }

    const success = await SessionSecurityService.revokeSession(sessionId, {
      id: adminUser?.id || 'system',
      ip,
      role: adminUser?.role || 'ADMIN',
      username: adminUser?.username || 'Admin',
    });

    if (!success) {
      res.status(400).json({
        error: 'No se pudo revocar la sesión seleccionada.',
        success: false,
      });
      return;
    }

    res.json({
      message: 'Sesión revocada exitosamente en tiempo real.',
      sessionId,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al revocar sesión administrativa', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al revocar la sesión.',
      success: false,
    });
  }
}

export async function revokeAllUserSessionsController(req: Request, res: Response): Promise<void> {
  try {
    const { id: targetUserId } = req.params;
    const adminUser = (req as any).adminUser;
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';

    if (!targetUserId) {
      res.status(400).json({
        error: 'Identificador de usuario requerido.',
        success: false,
      });
      return;
    }

    const revokedCount = await SessionSecurityService.revokeAllUserSessions(targetUserId, {
      id: adminUser?.id || 'system',
      ip,
      role: adminUser?.role || 'ADMIN',
      username: adminUser?.username || 'Admin',
    });

    res.json({
      message: `Se han revocado exitosamente ${revokedCount} sesiones activas para este usuario.`,
      revokedCount,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al revocar todas las sesiones de usuario', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al revocar las sesiones del usuario.',
      success: false,
    });
  }
}

export async function getSecurityStatsController(_req: Request, res: Response): Promise<void> {
  try {
    const [stats, activeSessions] = await Promise.all([
      SecurityAuditService.getSecurityStats(),
      SessionSecurityService.getActiveSessions(),
    ]);

    res.json({
      stats: {
        ...stats,
        activeSessionsCount: activeSessions.length,
      },
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al obtener estadísticas de seguridad y auditoría', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al consultar las estadísticas de seguridad.',
      success: false,
    });
  }
}
