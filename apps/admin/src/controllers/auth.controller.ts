import { addAdminAccountToSession, authenticateAdminCredentials, clearAllAdminAccountsFromSession, getAdminLinkedAccounts, removeAdminAccountFromSession, switchAdminAccountInSession } from '../services/auth.service.js';
import { logger } from '../services/logger.service.js';
import { Request, Response } from 'express';

export async function loginAdmin(req: Request, res: Response): Promise<void> {
  try {
    const identifier = req.body.email || req.body.identifier;
    const { password } = req.body;

    if (!identifier || !password) {
      res.status(400).json({
        error: 'Ingresa correo electrónico y contraseña.',
        success: false,
      });
      return;
    }

    const result = await authenticateAdminCredentials(identifier, password);
    if (!result.success || !result.user) {
      const statusCode = result.error?.includes('Acceso denegado') ? 403 : 401;
      res.status(statusCode).json({
        error: result.error || 'Credenciales inválidas.',
        success: false,
      });
      return;
    }

    await addAdminAccountToSession(res, req, result.user);
    const accounts = await getAdminLinkedAccounts(req);

    res.status(200).json({
      accounts,
      message: 'Inicio de sesión administrativo exitoso.',
      success: true,
      user: result.user,
    });
  } catch (err) {
    logger.app.error('Error al procesar login administrativo', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const user = (req as any).adminUser;
  if (!user) {
    res.status(401).json({
      error: 'Sesión administrativa no válida.',
      success: false,
      user: null,
    });
    return;
  }

  const accounts = await getAdminLinkedAccounts(req);

  res.status(200).json({
    accounts,
    success: true,
    user,
  });
}

export async function switchAdminAccountController(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.body;
    if (!userId || typeof userId !== 'string') {
      res.status(400).json({
        error: 'Identificador de cuenta requerido.',
        success: false,
      });
      return;
    }

    const result = await switchAdminAccountInSession(res, req, userId);
    if (!result.success || !result.activeUser) {
      res.status(400).json({
        error: 'No se pudo cambiar a la cuenta seleccionada o carece de permisos administrativos.',
        success: false,
      });
      return;
    }

    res.status(200).json({
      accounts: result.accounts,
      message: 'Cuenta administrativa cambiada exitosamente.',
      success: true,
      user: result.activeUser,
    });
  } catch (err) {
    logger.app.error('Error al cambiar de cuenta administrativa', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function logoutAdmin(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.body?.userId;
    const result = await removeAdminAccountFromSession(res, req, userId);

    logger.security.info('Cierre de sesión de cuenta administrativa');

    res.status(200).json({
      accounts: result.accounts,
      message: 'Sesión administrativa cerrada exitosamente.',
      remainingAccounts: result.remainingCount,
      success: true,
      user: result.activeUser,
    });
  } catch (err) {
    logger.app.error('Error al cerrar sesión de administración', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function logoutAllAdminController(_req: Request, res: Response): Promise<void> {
  try {
    clearAllAdminAccountsFromSession(res);
    logger.security.info('Cierre de todas las sesiones administrativas');
    res.status(200).json({
      message: 'Todas las sesiones administrativas fueron cerradas exitosamente.',
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al cerrar todas las sesiones administrativas', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}
