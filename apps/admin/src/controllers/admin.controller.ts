import { Request, Response } from 'express';
import { adminConfig } from '../config/env.config.js';
import { getAdminAccessibleWebsites } from '../services/auth.service.js';
import { createBackup, deleteBackup, getBackupDownloadStream, getSystemStatus, restoreBackup } from '../services/backup.service.js';
import { getAllBackups, getAllInquiries, getAllOrganizations, getAllPurchases, getAllUsers, getAllVerifications, getBackupById, updateInquiryStatus, updateOrganizationSettings, updateVerificationStatus } from '../services/db.service.js';
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

export async function getAdminPurchases(req: Request, res: Response): Promise<void> {
  try {
    const websiteId = (req as any).selectedWebsiteId || (req.headers['x-website-id'] as string) || (req.query.websiteId as string) || null;
    const purchases = await getAllPurchases(websiteId);
    const totalRevenue = purchases
      .filter((p) => p.status === 'completed' || p.status === 'paid')
      .reduce((sum, p) => sum + p.amount_total, 0);

    res.json({
      purchases,
      success: true,
      summary: {
        completed_count: purchases.filter((p) => p.status === 'completed' || p.status === 'paid').length,
        pending_count: purchases.filter((p) => p.status === 'pending').length,
        total_count: purchases.length,
        total_revenue: totalRevenue,
      },
    });
  } catch (err) {
    logger.app.error('Error al obtener lista de compras en controlador de admin', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al consultar el historial de compras.',
      success: false,
    });
  }
}

export async function getAdminVerifications(_req: Request, res: Response): Promise<void> {
  try {
    const verifications = await getAllVerifications();
    res.json({
      success: true,
      summary: {
        approved_count: verifications.filter((v) => v.status === 'approved').length,
        pending_count: verifications.filter((v) => v.status === 'pending').length,
        rejected_count: verifications.filter((v) => v.status === 'rejected').length,
        total_count: verifications.length,
      },
      verifications,
    });
  } catch (err) {
    logger.app.error('Error al obtener verificaciones de estudiantes en controlador de admin', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al consultar las verificaciones.',
      success: false,
    });
  }
}

export async function reviewAdminVerification(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { notes, status } = req.body as { notes?: string; status?: string };

    if (!id || (status !== 'approved' && status !== 'rejected')) {
      res.status(400).json({
        error: 'Datos de revisión inválidos. El estado debe ser aprobado o rechazado.',
        success: false,
      });
      return;
    }

    const updated = await updateVerificationStatus(id, status, notes);
    if (!updated) {
      res.status(404).json({
        error: 'Solicitud de verificación no encontrada.',
        success: false,
      });
      return;
    }

    res.json({
      message: `Solicitud de verificación ${status === 'approved' ? 'aprobada' : 'rechazada'} exitosamente.`,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al revisar verificación de estudiante en controlador de admin', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la revisión.',
      success: false,
    });
  }
}

export async function getAdminOrganizations(_req: Request, res: Response): Promise<void> {
  try {
    const organizations = await getAllOrganizations();
    res.json({
      organizations,
      success: true,
      total: organizations.length,
    });
  } catch (err) {
    logger.app.error('Error al obtener organizaciones en controlador de admin', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al consultar las organizaciones.',
      success: false,
    });
  }
}

export async function updateAdminOrganization(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { seat_limit, subscription_status } = req.body as {
      seat_limit?: number;
      subscription_status?: string;
    };

    if (!id) {
      res.status(400).json({
        error: 'Identificador de organización requerido.',
        success: false,
      });
      return;
    }

    const updated = await updateOrganizationSettings(id, {
      seat_limit: typeof seat_limit === 'number' ? seat_limit : undefined,
      subscription_status: typeof subscription_status === 'string' ? subscription_status : undefined,
    });

    if (!updated) {
      res.status(400).json({
        error: 'No se realizaron cambios en la organización.',
        success: false,
      });
      return;
    }

    res.json({
      message: 'Configuración de la organización actualizada exitosamente.',
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al actualizar organización en controlador de admin', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al actualizar la organización.',
      success: false,
    });
  }
}

export async function getAdminInquiries(req: Request, res: Response): Promise<void> {
  try {
    const websiteId = (req as any).selectedWebsiteId || (req.headers['x-website-id'] as string) || (req.query.websiteId as string) || null;
    const inquiries = await getAllInquiries(websiteId);
    res.json({
      inquiries,
      success: true,
      summary: {
        closed_count: inquiries.filter((i) => i.status === 'closed').length,
        contacted_count: inquiries.filter((i) => i.status === 'contacted').length,
        pending_count: inquiries.filter((i) => i.status === 'pending').length,
        total_count: inquiries.length,
      },
    });
  } catch (err) {
    logger.app.error('Error al obtener solicitudes comerciales en controlador de admin', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al consultar las solicitudes comerciales.',
      success: false,
    });
  }
}

export async function updateAdminInquiryStatus(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = req.body as { status?: string };

    if (!id || (status !== 'pending' && status !== 'contacted' && status !== 'closed')) {
      res.status(400).json({
        error: 'Estado de solicitud comercial inválido.',
        success: false,
      });
      return;
    }

    const updated = await updateInquiryStatus(id, status);
    if (!updated) {
      res.status(404).json({
        error: 'Solicitud comercial no encontrada.',
        success: false,
      });
      return;
    }

    res.json({
      message: 'Estado de la solicitud comercial actualizado exitosamente.',
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al actualizar estado de solicitud comercial en controlador de admin', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al actualizar la solicitud comercial.',
      success: false,
    });
  }
}

export async function getAdminBackups(_req: Request, res: Response): Promise<void> {
  try {
    const backups = await getAllBackups();
    res.json({
      backups,
      success: true,
      total: backups.length,
    });
  } catch (err) {
    logger.app.error('Error al obtener lista de copias de seguridad en controlador de admin', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al consultar las copias de seguridad.',
      success: false,
    });
  }
}

export async function getAdminBackupStatus(_req: Request, res: Response): Promise<void> {
  try {
    const status = await getSystemStatus();
    res.json({
      status,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al consultar estado de componentes para respaldo', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al consultar el estado del sistema.',
      success: false,
    });
  }
}

export async function createAdminBackup(req: Request, res: Response): Promise<void> {
  try {
    const { components, name, notes } = req.body as {
      components?: ('mysql' | 'cassandra' | 'minio')[];
      name?: string;
      notes?: string;
    };

    if (components && (!Array.isArray(components) || components.length === 0)) {
      res.status(400).json({
        error: 'Debe seleccionar al menos un componente para realizar la copia de seguridad.',
        success: false,
      });
      return;
    }

    const backup = await createBackup({
      components,
      name,
      notes,
    });

    res.status(201).json({
      backup,
      message: 'Copia de seguridad generada y almacenada en S3 exitosamente.',
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al generar copia de seguridad en controlador de admin', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la copia de seguridad. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function restoreAdminBackup(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { components } = req.body as {
      components?: ('mysql' | 'cassandra' | 'minio')[];
    };

    if (!id) {
      res.status(400).json({
        error: 'Identificador de copia de seguridad no proporcionado.',
        success: false,
      });
      return;
    }

    const result = await restoreBackup(id, { components });

    res.json({
      message: 'Copia de seguridad restaurada exitosamente en el sistema.',
      result,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al restaurar copia de seguridad en controlador de admin', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al restaurar la copia de seguridad. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function downloadAdminBackup(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const downloadData = await getBackupDownloadStream(id);

    if (!downloadData) {
      res.status(404).json({
        error: 'Copia de seguridad no encontrada.',
        success: false,
      });
      return;
    }

    res.setHeader('Content-Type', downloadData.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${downloadData.filename}"`);
    res.setHeader('Content-Length', String(downloadData.contentLength));

    (downloadData.stream as any).pipe(res);
  } catch (err) {
    logger.app.error('Error al descargar copia de seguridad en controlador de admin', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al descargar la copia de seguridad.',
      success: false,
    });
  }
}

export async function deleteAdminBackup(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({
        error: 'Identificador de copia de seguridad no proporcionado.',
        success: false,
      });
      return;
    }

    const deleted = await deleteBackup(id);
    if (!deleted) {
      res.status(404).json({
        error: 'Copia de seguridad no encontrada para eliminar.',
        success: false,
      });
      return;
    }

    res.json({
      message: 'Copia de seguridad eliminada exitosamente.',
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al eliminar copia de seguridad en controlador de admin', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al eliminar la copia de seguridad.',
      success: false,
    });
  }
}

export async function getAdminAccessibleWebsitesController(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).adminUser;
    if (!user) {
      res.status(401).json({ error: 'Sesión no válida.', success: false });
      return;
    }

    const websites = await getAdminAccessibleWebsites(user);
    res.json({
      isGlobalScope: user.permissions.includes('*'),
      success: true,
      websites,
    });
  } catch (err) {
    logger.app.error('Error al obtener lista de sitios web accesibles', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}
