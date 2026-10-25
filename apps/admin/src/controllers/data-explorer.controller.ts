import { DataExplorerService } from '../services/data-explorer.service.js';
import { logger } from '../services/logger.service.js';
import { DatabaseEngine } from '../types/data-explorer.types.js';
import { Request, Response } from 'express';

export async function getDataExplorerSchemaController(_req: Request, res: Response): Promise<void> {
  try {
    const schemas = await DataExplorerService.getSchemaDiscovery();
    res.json({
      data: schemas,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al consultar esquema en Data Explorer', {
      error: (err as Error).message,
    });
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al obtener los esquemas de bases de datos.',
      success: false,
    });
  }
}

export async function executeDataExplorerQueryController(req: Request, res: Response): Promise<void> {
  try {
    const { database, query } = req.body;

    if (!database || (database !== 'mysql' && database !== 'cassandra')) {
      res.status(400).json({
        error: 'Debe especificar una base de datos válida ("mysql" o "cassandra").',
        success: false,
      });
      return;
    }

    if (!query || typeof query !== 'string' || !query.trim()) {
      res.status(400).json({
        error: 'Debe proporcionar una consulta SQL/CQL para ejecutar.',
        success: false,
      });
      return;
    }

    const actor = (req as any).adminUser || {
      email: null,
      id: 'system',
      role: 'SUPER_ADMIN',
      username: 'admin',
    };
    const ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';

    const result = await DataExplorerService.executeReadOnlyQuery(
      database as DatabaseEngine,
      query,
      actor,
      ipAddress
    );

    res.json({
      data: result,
      success: true,
    });
  } catch (err) {
    const message = (err as Error).message || 'Error al procesar la consulta.';
    logger.security.warn('Rechazo o fallo en consulta analítica', {
      actorId: (req as any).adminUser?.id,
      error: message,
    });
    res.status(400).json({
      error: message,
      success: false,
    });
  }
}

export function getDataExplorerTemplatesController(_req: Request, res: Response): void {
  try {
    const templates = DataExplorerService.getQueryTemplates();
    res.json({
      data: templates,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al listar plantillas de consulta', {
      error: (err as Error).message,
    });
    res.status(500).json({
      error: 'Error al obtener el listado de plantillas predefinidas.',
      success: false,
    });
  }
}
