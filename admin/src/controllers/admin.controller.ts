import { Request, Response } from 'express';
import { adminConfig } from '../config/env.config.js';
import { getAllUsers } from '../services/db.service.js';
import { logger } from '../services/logger.service.js';

export function getAdminHealth(_req: Request, res: Response): void {
  res.json({
    name: adminConfig.appName,
    port: adminConfig.port,
    status: 'ok',
    uptime: process.uptime(),
  });
}

export async function getAdminUsers(_req: Request, res: Response): Promise<void> {
  try {
    const users = await getAllUsers();
    res.json({
      success: true,
      total: users.length,
      users,
    });
  } catch (err) {
    logger.app.error('Error al obtener lista de usuarios en controlador de admin', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al consultar los usuarios.',
      success: false,
    });
  }
}
