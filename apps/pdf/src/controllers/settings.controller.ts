import { getCurrentUser, removeAccountFromSession, updateActiveAccountInSession, verifyPassword } from '../services/auth.service.js';
import { logger } from '../services/logger.service.js';
import { deleteAvatar, getPasswordStatus, getUserPreferences, requestEmailChangeCode, unlinkGoogle, updateAvatar, updateEmail, updateUsername, updateUserPasswordFromSettings, updateUserPreferences, verifyCurrentPassword, verifyEmailChange } from '../services/settings.service.js';
import { clearPending2FASetup, generateBackupCodes, generateTotpSecret, getOtpAuthUrl, getPending2FASetup, savePending2FASetup, verifyTotpCode } from '../services/two-factor.service.js';
import { deleteUserPermanently, disableUser2FA, enableUser2FA, findUserById, getUser2FASecret, sanitizeUser, verifyAndConsumeBackupCode } from '../services/user.service.js';
import { Request, Response } from 'express';

export async function handleUpdateAvatar(req: Request, res: Response): Promise<void> {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Sesión no válida o expirada.', ok: false, success: false });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'Debes seleccionar un archivo de imagen válido.', ok: false, success: false });
      return;
    }

    const result = await updateAvatar(currentUser.id, req.file);
    if (!result.success || !result.avatar_url) {
      res.status(400).json({ error: result.error || 'No se pudo actualizar la foto de perfil.', ok: false, success: false });
      return;
    }

    const updatedUser = await findUserById(currentUser.id);
    if (updatedUser) {
      updateActiveAccountInSession(res, req, sanitizeUser(updatedUser));
    }

    res.status(200).json({
      avatar_url: result.avatar_url,
      message: 'Foto de perfil actualizada exitosamente.',
      ok: true,
      success: true,
      user: updatedUser ? sanitizeUser(updatedUser) : null,
    });
  } catch (error) {
    logger.app.error('Error al actualizar avatar', error);
    res.status(500).json({ error: 'Error al subir la imagen. Inténtalo de nuevo.', ok: false, success: false });
  }
}

export async function handleDeleteAvatar(req: Request, res: Response): Promise<void> {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Sesión no válida o expirada.', ok: false, success: false });
      return;
    }

    const result = await deleteAvatar(currentUser.id);
    if (!result.success) {
      res.status(400).json({ error: result.error || 'No se pudo eliminar la foto de perfil.', ok: false, success: false });
      return;
    }

    const updatedUser = await findUserById(currentUser.id);
    if (updatedUser) {
      updateActiveAccountInSession(res, req, sanitizeUser(updatedUser));
    }

    res.status(200).json({
      avatar_url: null,
      message: 'Foto de perfil eliminada.',
      ok: true,
      success: true,
      user: updatedUser ? sanitizeUser(updatedUser) : null,
    });
  } catch (error) {
    logger.app.error('Error al eliminar avatar', error);
    res.status(500).json({ error: 'Error al eliminar la imagen.', ok: false, success: false });
  }
}

export async function handleUpdateUsername(req: Request, res: Response): Promise<void> {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Sesión no válida o expirada.', ok: false, success: false });
      return;
    }

    const { username } = req.body || {};
    if (!username || typeof username !== 'string') {
      res.status(400).json({ error: 'El nombre de usuario es obligatorio.', ok: false, success: false });
      return;
    }

    const result = await updateUsername(currentUser.id, username);
    if (!result.success) {
      res.status(result.status || 400).json({ error: result.error || 'Error al actualizar el nombre de usuario.', ok: false, success: false });
      return;
    }

    const updatedUser = await findUserById(currentUser.id);
    if (updatedUser) {
      updateActiveAccountInSession(res, req, sanitizeUser(updatedUser));
    }

    res.status(200).json({
      message: 'Nombre de usuario actualizado exitosamente.',
      ok: true,
      success: true,
      user: updatedUser ? sanitizeUser(updatedUser) : null,
      username: result.username,
    });
  } catch (error) {
    logger.app.error('Error al actualizar nombre de usuario', error);
    res.status(500).json({ error: 'Error al actualizar el nombre de usuario.', ok: false, success: false });
  }
}

export async function handleRequestEmailChangeCode(req: Request, res: Response): Promise<void> {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Sesión no válida o expirada.', ok: false, success: false });
      return;
    }

    const isResend = Boolean(req.body?.resend);
    const result = await requestEmailChangeCode(currentUser.id, isResend);
    if (!result.success) {
      if (result.retryAfter) {
        res.setHeader('Retry-After', String(result.retryAfter));
      }
      res.status(result.status || 400).json({
        cooldownRemaining: result.retryAfter,
        error: result.error || 'No se pudo enviar el código de verificación.',
        ok: false,
        retryAfter: result.retryAfter,
        success: false,
      });
      return;
    }

    res.status(200).json({
      alreadyAuthorized: Boolean(result.alreadyAuthorized),
      codePending: Boolean(result.codePending),
      message: result.alreadyAuthorized
        ? 'Ya cuentas con autorización activa para cambiar tu correo.'
        : result.codePending
        ? 'Se ha reutilizado el código de verificación vigente enviado previamente.'
        : 'Código de verificación enviado exitosamente a tu correo actual.',
      ok: true,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al solicitar código de cambio de email', error);
    res.status(500).json({ error: 'Error al solicitar el código de verificación.', ok: false, success: false });
  }
}

export async function handleVerifyEmailChangeCode(req: Request, res: Response): Promise<void> {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Sesión no válida o expirada.', ok: false, success: false });
      return;
    }

    const { code } = req.body || {};
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'El código de verificación es obligatorio.', ok: false, success: false });
      return;
    }

    const result = await verifyEmailChange(currentUser.id, code);
    if (!result.success || !result.token) {
      res.status(result.status || 400).json({ error: result.error || 'Código incorrecto o expirado.', ok: false, success: false });
      return;
    }

    res.status(200).json({
      message: 'Código verificado con éxito.',
      ok: true,
      success: true,
      token: result.token,
    });
  } catch (error) {
    logger.app.error('Error al verificar código de email', error);
    res.status(500).json({ error: 'Error al verificar el código de verificación.', ok: false, success: false });
  }
}

export async function handleUpdateEmail(req: Request, res: Response): Promise<void> {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Sesión no válida o expirada.', ok: false, success: false });
      return;
    }

    const { email } = req.body || {};
    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'El correo electrónico es obligatorio.', ok: false, success: false });
      return;
    }

    const result = await updateEmail(currentUser.id, email);
    if (!result.success) {
      res.status(result.status || 400).json({ error: result.error || 'Error al actualizar correo.', ok: false, success: false });
      return;
    }

    const updatedUser = await findUserById(currentUser.id);
    if (updatedUser) {
      updateActiveAccountInSession(res, req, sanitizeUser(updatedUser));
    }

    res.status(200).json({
      email: result.email,
      message: 'Correo electrónico actualizado exitosamente.',
      ok: true,
      success: true,
      user: updatedUser ? sanitizeUser(updatedUser) : null,
    });
  } catch (error) {
    logger.app.error('Error al actualizar email', error);
    res.status(500).json({ error: 'Error al actualizar el correo electrónico.', ok: false, success: false });
  }
}

export async function handleGetPreferences(req: Request, res: Response): Promise<void> {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Sesión no válida o expirada.', ok: false, success: false });
      return;
    }

    const preferences = await getUserPreferences(currentUser.id);
    res.status(200).json({ ok: true, preferences, success: true });
  } catch (error) {
    logger.app.error('Error al obtener preferencias', error);
    res.status(500).json({ error: 'Error al cargar preferencias.', ok: false, success: false });
  }
}

export async function handleUpdatePreferences(req: Request, res: Response): Promise<void> {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Sesión no válida o expirada.', ok: false, success: false });
      return;
    }

    const preferences = await updateUserPreferences(currentUser.id, req.body || {});
    res.status(200).json({
      message: 'Preferencias actualizadas exitosamente.',
      ok: true,
      preferences,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al actualizar preferencias', error);
    res.status(500).json({ error: 'Error al guardar preferencias.', ok: false, success: false });
  }
}

export async function handleGetPasswordStatus(req: Request, res: Response): Promise<void> {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Sesión no válida o expirada.', ok: false, success: false });
      return;
    }

    const status = await getPasswordStatus(currentUser.id);
    res.status(200).json({ ...status, ok: true, success: true });
  } catch (error) {
    logger.app.error('Error al consultar estado de contraseña', error);
    res.status(500).json({ error: 'Error al consultar estado de seguridad.', ok: false, success: false });
  }
}

export async function handleUnlinkGoogle(req: Request, res: Response): Promise<void> {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Sesión no válida o expirada.', ok: false, success: false });
      return;
    }

    const result = await unlinkGoogle(currentUser.id);
    if (!result.success) {
      res.status(400).json({ error: result.error || 'No se pudo desvincular Google.', ok: false, success: false });
      return;
    }

    const updatedUser = await findUserById(currentUser.id);
    if (updatedUser) {
      updateActiveAccountInSession(res, req, sanitizeUser(updatedUser));
    }

    res.status(200).json({
      message: 'Cuenta de Google desvinculada exitosamente.',
      ok: true,
      success: true,
      user: updatedUser ? sanitizeUser(updatedUser) : null,
    });
  } catch (error) {
    logger.app.error('Error al desvincular Google', error);
    res.status(500).json({ error: 'Error al desvincular la cuenta de Google.', ok: false, success: false });
  }
}

export async function handleVerifyCurrentPassword(req: Request, res: Response): Promise<void> {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Sesión no válida o expirada.', ok: false, success: false });
      return;
    }

    const { currentPassword } = req.body || {};
    const result = await verifyCurrentPassword(currentUser.id, currentPassword);
    if (!result.success) {
      res.status(result.status || 400).json({ error: result.error || 'Contraseña incorrecta.', ok: false, success: false });
      return;
    }

    res.status(200).json({
      message: 'Identidad confirmada exitosamente.',
      ok: true,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al verificar contraseña actual', error);
    res.status(500).json({ error: 'Error al verificar la contraseña.', ok: false, success: false });
  }
}

export async function handleUpdatePassword(req: Request, res: Response): Promise<void> {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Sesión no válida o expirada.', ok: false, success: false });
      return;
    }

    const { newPassword } = req.body || {};
    const result = await updateUserPasswordFromSettings(currentUser.id, newPassword);
    if (!result.success) {
      res.status(result.status || 400).json({ error: result.error || 'Error al actualizar la contraseña.', ok: false, success: false });
      return;
    }

    res.status(200).json({
      message: 'Contraseña actualizada exitosamente.',
      ok: true,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al actualizar contraseña', error);
    res.status(500).json({ error: 'Error al actualizar la contraseña.', ok: false, success: false });
  }
}

export async function handleGenerate2FA(req: Request, res: Response): Promise<void> {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Sesión no válida o expirada.', ok: false, success: false });
      return;
    }

    const forceNew = req.query.force === 'true';
    let pending = forceNew ? null : await getPending2FASetup(currentUser.id);

    if (!pending) {
      const secret = generateTotpSecret(20);
      const backupCodes = generateBackupCodes(10);
      pending = { backupCodes, secret };
      await savePending2FASetup(currentUser.id, pending, 900);
    }

    const qrUri = getOtpAuthUrl(pending.secret, currentUser.username, 'ProjectAurora');
    logger.security.info('Configuración de 2FA iniciada', { userId: currentUser.id });

    res.status(200).json({
      backupCodes: pending.backupCodes,
      ok: true,
      qrUri,
      secret: pending.secret,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al generar configuración de 2FA', error);
    res.status(500).json({ error: 'Error al iniciar la configuración de dos pasos.', ok: false, success: false });
  }
}

export async function handleEnable2FA(req: Request, res: Response): Promise<void> {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Sesión no válida o expirada.', ok: false, success: false });
      return;
    }

    const { code } = req.body || {};
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Ingresa el código de 6 dígitos de tu aplicación.', ok: false, success: false });
      return;
    }

    const pending = await getPending2FASetup(currentUser.id);
    if (!pending) {
      res.status(400).json({ error: 'La sesión de configuración de 2FA ha expirado. Genera un nuevo código QR.', ok: false, success: false });
      return;
    }

    const isValid = verifyTotpCode(code.trim(), pending.secret, 4);
    if (!isValid) {
      logger.security.warn('Código TOTP incorrecto al intentar activar 2FA', { userId: currentUser.id });
      res.status(400).json({ error: 'El código ingresado es incorrecto o ha expirado.', ok: false, success: false });
      return;
    }

    await enableUser2FA(currentUser.id, pending.secret, pending.backupCodes);
    await clearPending2FASetup(currentUser.id);

    const updatedUser = await findUserById(currentUser.id);
    if (updatedUser) {
      updateActiveAccountInSession(res, req, sanitizeUser(updatedUser));
    }

    logger.security.info('2FA activado exitosamente', { userId: currentUser.id });
    res.status(200).json({
      backupCodes: pending.backupCodes,
      message: 'Autenticación en dos pasos activada exitosamente.',
      ok: true,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al activar 2FA', error);
    res.status(500).json({ error: 'Error al activar la protección de dos pasos.', ok: false, success: false });
  }
}

export async function handleDisable2FA(req: Request, res: Response): Promise<void> {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Sesión no válida o expirada.', ok: false, success: false });
      return;
    }

    const { code, password } = req.body || {};
    let isAuthorized = false;

    const user = await findUserById(currentUser.id);
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado.', ok: false, success: false });
      return;
    }

    if (password && typeof password === 'string' && user.password_hash) {
      isAuthorized = await verifyPassword(password, user.password_hash);
    }

    if (!isAuthorized && code && typeof code === 'string') {
      const cleanCode = code.trim();
      const twoFactorData = await getUser2FASecret(currentUser.id);
      if (/^\d{6}$/.test(cleanCode) && twoFactorData?.two_factor_secret) {
        if (verifyTotpCode(cleanCode, twoFactorData.two_factor_secret, 2)) {
          isAuthorized = true;
        }
      }
      if (!isAuthorized) {
        const backupConsumed = await verifyAndConsumeBackupCode(currentUser.id, cleanCode);
        if (backupConsumed) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      res.status(400).json({
        error: 'Contraseña o código de 6 dígitos incorrecto.',
        ok: false,
        success: false,
      });
      return;
    }

    await disableUser2FA(currentUser.id);
    const updatedUser = await findUserById(currentUser.id);
    if (updatedUser) {
      updateActiveAccountInSession(res, req, sanitizeUser(updatedUser));
    }

    logger.security.info('2FA desactivado exitosamente', { userId: currentUser.id });
    res.status(200).json({
      message: 'Autenticación en dos pasos desactivada exitosamente.',
      ok: true,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al desactivar 2FA', error);
    res.status(500).json({ error: 'Error al desactivar la protección de dos pasos.', ok: false, success: false });
  }
}

export async function handleGet2FAStatus(req: Request, res: Response): Promise<void> {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Sesión no válida o expirada.', ok: false, success: false });
      return;
    }

    const user = await findUserById(currentUser.id);
    res.status(200).json({
      enabled: Boolean(user?.two_factor_enabled),
      ok: true,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al consultar estado de 2FA', error);
    res.status(500).json({ error: 'Error al consultar el estado de seguridad.', ok: false, success: false });
  }
}

export async function handleDeleteAccount(req: Request, res: Response): Promise<void> {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Sesión no válida o expirada.', ok: false, success: false });
      return;
    }

    const userId = currentUser.id;
    const { password } = req.body || {};

    const user = await findUserById(userId);
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado.', ok: false, success: false });
      return;
    }

    if (user.password_hash) {
      if (!password || typeof password !== 'string' || !password.trim()) {
        res.status(400).json({
          error: 'Debes ingresar tu contraseña actual para confirmar la eliminación de la cuenta.',
          ok: false,
          success: false,
        });
        return;
      }

      const isMatch = await verifyPassword(password.trim(), user.password_hash);
      if (!isMatch) {
        logger.security.warn('Intento de eliminación de cuenta con contraseña incorrecta', { userId });
        res.status(400).json({ error: 'La contraseña actual ingresada es incorrecta.', ok: false, success: false });
        return;
      }
    }

    const deleted = await deleteUserPermanently(userId);
    if (!deleted) {
      res.status(400).json({ error: 'No se pudo eliminar la cuenta.', ok: false, success: false });
      return;
    }

    const sessionResult = await removeAccountFromSession(res, req, userId);

    logger.security.info('Cuenta eliminada permanentemente por el usuario', {
      remainingAccounts: sessionResult.remainingCount,
      userId,
    });

    res.status(200).json({
      accounts: sessionResult.accounts.map(sanitizeUser),
      activeUser: sessionResult.activeUser ? sanitizeUser(sessionResult.activeUser) : null,
      message: 'Tu cuenta y todos tus datos han sido eliminados permanentemente.',
      ok: true,
      remainingAccounts: sessionResult.remainingCount,
      success: true,
      switched: sessionResult.remainingCount > 0,
    });
  } catch (err) {
    logger.app.error('Error al procesar eliminación de cuenta', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      ok: false,
      success: false,
    });
  }
}

