import crypto from 'crypto';
import { Request, Response } from 'express';
import { config } from '../config/env.config.js';
import { addAccountToSession, clearSessionCookie, getLinkedAccounts, getMultiAccountSession, getSessionUser, hashPassword, removeAccountFromSession, setMultiAccountCookie, switchAccountInSession, verifyPassword } from '../services/auth.service.js';
import { getGoogleAuthUrl, processGoogleAuthCallback, STATE_COOKIE_NAME } from '../services/google.service.js';
import { logger } from '../services/logger.service.js';
import { sendPasswordResetEmail, sendVerificationCodeEmail, sendWelcomeEmail } from '../services/mail.service.js';
import { getUserEffectivePermissions } from '../services/pbac.service.js';
import { lookupSsoByEmail } from '../services/sso.service.js';
import { consumePending2FALogin, getPending2FALogin, savePending2FALogin, verifyTotpCode } from '../services/two-factor.service.js';
import { createUser, findUserByEmail, findUserById, findUserDuplicates, getUser2FASecret, sanitizeUser, updateUserPassword, verifyAndConsumeBackupCode } from '../services/user.service.js';
import { consumePasswordResetToken, generateSixDigitCode, getPendingRegistration, savePasswordResetToken, savePendingRegistration, verifyAndConsumeCode, verifyPasswordResetToken } from '../services/verification.service.js';
import { validateEmail, validatePassword, validateUsername, validateVerificationCode } from '../utils/validators.util.js';


export async function validateStage1(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      res.status(400).json({ error: emailValidation.error, success: false });
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      res.status(400).json({ error: passwordValidation.error, success: false });
      return;
    }

    const existing = await findUserByEmail(String(email).trim().toLowerCase());
    if (existing) {
      res.status(409).json({ error: 'El correo electrónico ya está registrado.', success: false });
      return;
    }

    res.status(200).json({ message: 'Datos válidos para continuar a la etapa 2.', success: true });
  } catch (error) {
    logger.app.error('Error al validar etapa 1 de registro', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function sendRegistrationCode(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, username } = req.body;

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      res.status(400).json({ error: emailValidation.error, success: false });
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      res.status(400).json({ error: passwordValidation.error, success: false });
      return;
    }

    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      res.status(400).json({ error: usernameValidation.error, success: false });
      return;
    }

    const trimmedEmail = String(email).trim().toLowerCase();
    const trimmedUsername = String(username).trim();

    const { emailExists, usernameExists } = await findUserDuplicates(trimmedEmail, trimmedUsername);
    if (usernameExists) {
      logger.security.warn('Intento de registro con nombre de usuario existente', { username: trimmedUsername });
      res.status(409).json({ error: 'El nombre de usuario ya está en uso.', success: false });
      return;
    }

    if (emailExists) {
      logger.security.warn('Intento de registro con correo existente', { email: trimmedEmail });
      res.status(409).json({ error: 'El correo electrónico ya está registrado.', success: false });
      return;
    }

    const code = generateSixDigitCode();
    const passwordHash = await hashPassword(String(password));

    await savePendingRegistration(
      trimmedEmail,
      {
        code,
        passwordHash,
        username: trimmedUsername,
      },
      15 * 60
    );

    try {
      await sendVerificationCodeEmail(trimmedEmail, trimmedUsername, code);
      logger.security.info('Código de verificación enviado exitosamente', { email: trimmedEmail, username: trimmedUsername });
    } catch (mailError) {
      logger.app.error('Error al enviar correo SMTP de verificación', mailError);
      res.status(500).json({
        error: 'No se pudo enviar el correo de verificación. Por favor verifica tu dirección e intenta de nuevo.',
        success: false,
      });
      return;
    }

    res.status(200).json({
      message: `Código de verificación enviado exitosamente a ${trimmedEmail}.`,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al procesar envío de código de registro', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function verifyRegistrationCode(req: Request, res: Response): Promise<void> {
  try {
    const { code, email } = req.body;

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      res.status(400).json({ error: emailValidation.error, success: false });
      return;
    }

    const codeValidation = validateVerificationCode(code);
    if (!codeValidation.valid) {
      res.status(400).json({ error: codeValidation.error, success: false });
      return;
    }

    const trimmedEmail = String(email).trim().toLowerCase();
    const cleanCode = String(code).trim();

    const verificationResult = await verifyAndConsumeCode(trimmedEmail, cleanCode);
    if (!verificationResult.success || !verificationResult.data) {
      logger.security.warn('Fallo en verificación de código de registro', { email: trimmedEmail, error: verificationResult.error });
      res.status(400).json({ error: verificationResult.error || 'Código incorrecto o expirado.', success: false });
      return;
    }

    const pending = verificationResult.data;
    const newUser = await createUser({
      email: pending.email,
      passwordHash: pending.passwordHash,
      username: pending.username,
    });

    const permissions = await getUserEffectivePermissions(newUser);
    const userPayload = sanitizeUser(newUser);
    userPayload.permissions = permissions;
    const session = await addAccountToSession(res, req, userPayload);

    logger.security.info('Cuenta creada y verificada exitosamente', { email: newUser.email, userId: newUser.id });

    void sendWelcomeEmail(newUser.email, newUser.username).catch((err) => {
      logger.app.error('Error al enviar email de bienvenida', err);
    });

    res.status(201).json({
      accounts: session.accounts.map(sanitizeUser),
      message: 'Cuenta creada y verificada exitosamente.',
      success: true,
      user: userPayload,
    });
  } catch (error) {
    logger.app.error('Error al verificar código de registro', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function resendRegistrationCode(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body;

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      res.status(400).json({ error: emailValidation.error, success: false });
      return;
    }

    const trimmedEmail = String(email).trim().toLowerCase();
    const pending = await getPendingRegistration(trimmedEmail);
    if (!pending) {
      logger.security.warn('Intento de reenvío con registro expirado', { email: trimmedEmail });
      res.status(400).json({ error: 'La sesión de registro ha expirado. Debes iniciar desde el principio.', success: false });
      return;
    }

    const newCode = generateSixDigitCode();
    await savePendingRegistration(trimmedEmail, {
      code: newCode,
      passwordHash: pending.passwordHash,
      username: pending.username,
    });

    try {
      await sendVerificationCodeEmail(trimmedEmail, pending.username, newCode);
      logger.security.info('Nuevo código de verificación enviado', { email: trimmedEmail });
    } catch (mailError) {
      logger.app.error('Error al reenviar correo de verificación', mailError);
      res.status(500).json({
        error: 'No se pudo enviar el correo de verificación. Inténtalo de nuevo.',
        success: false,
      });
      return;
    }

    res.status(200).json({ message: 'Nuevo código enviado exitosamente.', success: true });
  } catch (error) {
    logger.app.error('Error al reenviar código de registro', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const email = req.body.email || req.body.identifier;
    const { password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Ingresa correo electrónico y contraseña.', success: false });
      return;
    }

    const trimmedEmail = String(email).trim().toLowerCase();
    const user = await findUserByEmail(trimmedEmail);

    if (!user || !user.password_hash) {
      logger.security.warn('Intento de login fallido: usuario no encontrado o sin contraseña configurada', { email: trimmedEmail });
      res.status(401).json({ error: 'Credenciales inválidas.', success: false });
      return;
    }

    const ssoLookup = await lookupSsoByEmail(trimmedEmail);
    if (ssoLookup.hasSso && ssoLookup.enforceSso) {
      logger.security.warn('Intento de login con contraseña para cuenta con SSO forzado', { email: trimmedEmail });
      res.status(403).json({
        error: 'Tu organización exige inicio de sesión único (SSO). Por favor ingresa a través del portal de SSO corporativo.',
        requiresSso: true,
        success: false,
      });
      return;
    }

    const validPassword = await verifyPassword(String(password), user.password_hash);
    if (!validPassword) {
      logger.security.warn('Intento de login fallido: contraseña incorrecta', { email: trimmedEmail, userId: user.id });
      res.status(401).json({ error: 'Credenciales inválidas.', success: false });
      return;
    }

    if (user.two_factor_enabled) {
      const tempToken = crypto.randomBytes(32).toString('hex');
      await savePending2FALogin(tempToken, { email: user.email, userId: user.id }, 300);
      logger.security.info('Inicio de sesión requiere segundo factor de autenticación', {
        email: user.email,
        userId: user.id,
      });

      res.status(200).json({
        email: user.email,
        requires2FA: true,
        success: true,
        tempToken,
      });
      return;
    }

    const permissions = await getUserEffectivePermissions(user);
    const userPayload = sanitizeUser(user);
    userPayload.permissions = permissions;
    const session = await addAccountToSession(res, req, userPayload);

    logger.security.info('Inicio de sesión exitoso', { email: user.email, userId: user.id });

    res.status(200).json({
      accounts: session.accounts.map(sanitizeUser),
      message: 'Inicio de sesión exitoso.',
      success: true,
      user: userPayload,
    });
  } catch (error) {
    logger.app.error('Error al procesar inicio de sesión', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  try {
    const result = await removeAccountFromSession(res, req);
    logger.security.info('Cierre de sesión de cuenta activa', { remainingAccounts: result.remainingCount });
    res.status(200).json({
      accounts: result.accounts.map(sanitizeUser),
      message: 'Sesión cerrada exitosamente.',
      success: true,
      switched: result.remainingCount > 0,
      user: result.activeUser ? sanitizeUser(result.activeUser) : null,
    });
  } catch (err) {
    logger.app.error('Error al procesar cierre de sesión', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export function logoutAll(_req: Request, res: Response): void {
  clearSessionCookie(res);
  logger.security.info('Todas las sesiones cerradas exitosamente');
  res.status(200).json({ message: 'Todas las sesiones fueron cerradas exitosamente.', success: true });
}

export async function switchAccount(req: Request, res: Response): Promise<void> {
  try {
    const { user_id } = req.body;
    const targetId = String(user_id || '').trim();

    if (!targetId) {
      res.status(400).json({ error: 'ID de cuenta inválido.', success: false });
      return;
    }

    const result = switchAccountInSession(res, req, targetId);
    if (!result.success || !result.activeUser) {
      res.status(400).json({ error: 'La cuenta especificada no pertenece a las cuentas vinculadas.', success: false });
      return;
    }

    const freshActive = await findUserById(result.activeUser.id);
    const permissions = freshActive ? await getUserEffectivePermissions(freshActive) : [];
    const userPayload = freshActive ? sanitizeUser(freshActive) : sanitizeUser(result.activeUser);
    userPayload.permissions = permissions;

    logger.security.info('Cambio de cuenta activa exitoso', { targetUserId: targetId });
    res.status(200).json({
      accounts: result.accounts.map(sanitizeUser),
      message: 'Cuenta cambiada exitosamente.',
      success: true,
      user: userPayload,
    });
  } catch (err) {
    logger.app.error('Error al cambiar de cuenta activa', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      res.status(200).json({
        accounts: [],
        success: true,
        user: null,
      });
      return;
    }

    const session = getMultiAccountSession(req);
    if (session) {
      let changed = false;
      session.accounts = session.accounts.map((acc) => {
        if (acc.id === user.id && (acc.username !== user.username || acc.subscription_tier !== user.subscription_tier || acc.avatar_url !== user.avatar_url)) {
          changed = true;
          return {
            ...acc,
            avatar_url: user.avatar_url,
            cancel_at_period_end: user.cancel_at_period_end,
            subscription_status: user.subscription_status,
            subscription_tier: user.subscription_tier,
            subscription_tier_color: user.subscription_tier_color,
            username: user.username,
          };
        }
        return acc;
      });
      if (changed) {
        setMultiAccountCookie(res, session);
      }
    }

    const accounts = getLinkedAccounts(req);
    const updatedAccounts = await Promise.all(
      accounts.map(async (acc) => {
        if (acc.id === user.id) return user;
        const fresh = await findUserById(acc.id);
        return fresh ? sanitizeUser(fresh) : sanitizeUser(acc);
      })
    );

    res.status(200).json({
      accounts: updatedAccounts,
      success: true,
      user,
    });
  } catch (error) {
    logger.app.error('Error al obtener usuario actual', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export function redirectToGoogle(req: Request, res: Response): void {
  try {
    const url = getGoogleAuthUrl(req, res);
    res.redirect(url);
  } catch (err) {
    logger.app.error('Error al redirigir a autenticación con Google', err);
    res.redirect('/login?error=' + encodeURIComponent('Error inesperado al conectar con Google.'));
  }
}

export async function googleCallback(req: Request, res: Response): Promise<void> {
  try {
    const { code, error, state } = req.query;
    const storedState = req.cookies[STATE_COOKIE_NAME];
    res.clearCookie(STATE_COOKIE_NAME);

    if (error) {
      logger.security.warn('Google OAuth cancelado o con error', { error });
      res.redirect('/login?error=' + encodeURIComponent(String(error)));
      return;
    }

    if (!code || !state) {
      logger.security.warn('Google OAuth faltan parámetros requeridos');
      res.redirect('/login?error=missing_oauth_parameters');
      return;
    }

    if (!storedState || storedState !== state) {
      logger.security.warn('Parámetro state de Google OAuth inválido o ausente');
      res.redirect('/login?error=invalid_oauth_state');
      return;
    }

    const userPayload = await processGoogleAuthCallback(String(code));

    if (userPayload.two_factor_enabled) {
      const tempToken = crypto.randomBytes(32).toString('hex');
      await savePending2FALogin(tempToken, { email: userPayload.email, userId: userPayload.id }, 300);
      logger.security.info('Inicio de sesión con Google requiere segundo factor de autenticación', {
        email: userPayload.email,
        userId: userPayload.id,
      });

      res.cookie('2fa_temp_token', tempToken, {
        httpOnly: true,
        maxAge: 300 * 1000,
        path: '/',
        sameSite: 'lax',
        secure: config.nodeEnv === 'production',
      });
      res.cookie('2fa_temp_email', userPayload.email, {
        httpOnly: false,
        maxAge: 300 * 1000,
        path: '/',
        sameSite: 'lax',
        secure: config.nodeEnv === 'production',
      });

      res.redirect('/login/verification-aditional');
      return;
    }

    await addAccountToSession(res, req, userPayload);

    logger.security.info('Inicio de sesión exitoso con Google OAuth', { email: userPayload.email, userId: userPayload.id });
    res.redirect('/');
  } catch (err) {
    logger.app.error('Error no controlado en Google OAuth callback', err);
    res.redirect('/login?error=server_error');
  }
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body;

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      res.status(400).json({ error: emailValidation.error, success: false });
      return;
    }

    const trimmedEmail = String(email).trim().toLowerCase();
    const user = await findUserByEmail(trimmedEmail);

    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      await savePasswordResetToken(user.email, user.id, resetToken, 900);

      const baseUrl = (config.baseUrl || 'http://localhost:3000').replace(/\/+$/, '');
      const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

      await sendPasswordResetEmail(user.email, user.username, resetUrl, 15);

      logger.security.info('Enlace de recuperación de contraseña generado y enviado', {
        email: user.email,
        userId: user.id,
      });
    } else {
      logger.security.info('Solicitud de recuperación para correo no registrado (protección anti-enumeración)', {
        email: trimmedEmail,
      });
    }

    res.status(200).json({
      message: 'Si el correo electrónico está registrado, recibirás un enlace de recuperación.',
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al procesar solicitud de recuperación de contraseña', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function validateResetToken(req: Request, res: Response): Promise<void> {
  try {
    const token = String(req.query.token || '').trim();
    const result = await verifyPasswordResetToken(token);

    if (!result.valid) {
      res.status(400).json({ error: result.error || 'Token inválido.', valid: false });
      return;
    }

    res.status(200).json({ email: result.email, valid: true });
  } catch (error) {
    logger.app.error('Error al verificar token de restablecimiento', error);
    res.status(500).json({ error: 'Error al verificar token de recuperación.', valid: false });
  }
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  try {
    const { password, token } = req.body;

    if (!token || typeof token !== 'string' || !token.trim()) {
      res.status(400).json({ error: 'Token de recuperación no válido o ausente.', success: false });
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      res.status(400).json({ error: passwordValidation.error, success: false });
      return;
    }

    const tokenResult = await consumePasswordResetToken(token);
    if (!tokenResult.success || !tokenResult.userId) {
      logger.security.warn('Intento fallido de restablecimiento: token inválido o expirado');
      res.status(400).json({
        error: tokenResult.error || 'El enlace de recuperación ha expirado o ya ha sido utilizado.',
        success: false,
      });
      return;
    }

    const targetUser = await findUserById(tokenResult.userId);
    if (!targetUser) {
      res.status(400).json({ error: 'El usuario asociado al token no existe.', success: false });
      return;
    }

    const newHash = await hashPassword(String(password));
    await updateUserPassword(tokenResult.userId, newHash);

    logger.security.info('Contraseña restablecida exitosamente', {
      email: tokenResult.email,
      userId: tokenResult.userId,
    });

    res.status(200).json({
      message: 'Tu contraseña ha sido restablecida exitosamente. Ya puedes iniciar sesión.',
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al restablecer la contraseña', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al actualizar tu contraseña. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function verify2FALogin(req: Request, res: Response): Promise<void> {
  try {
    const code = typeof req.body.code === 'string' ? req.body.code : '';
    const tempToken = typeof req.body.tempToken === 'string' && req.body.tempToken.trim()
      ? req.body.tempToken.trim()
      : (typeof req.cookies['2fa_temp_token'] === 'string' ? req.cookies['2fa_temp_token'].trim() : '');

    if (!tempToken || !code) {
      res.status(400).json({ error: 'Faltan parámetros requeridos.', success: false });
      return;
    }

    const pending = await getPending2FALogin(tempToken);
    if (!pending) {
      logger.security.warn('Intento de verificación 2FA con token temporal inválido o expirado');
      res.status(401).json({ error: 'La sesión de verificación ha expirado. Inicia sesión nuevamente.', success: false });
      return;
    }

    const userRow = await findUserById(pending.userId);
    if (!userRow || !userRow.two_factor_enabled) {
      res.status(400).json({ error: 'El usuario no tiene 2FA habilitado o no existe.', success: false });
      return;
    }

    const twoFactorData = await getUser2FASecret(pending.userId);
    const cleanCode = code.trim();
    let verified = false;

    if (/^\d{6}$/.test(cleanCode) && twoFactorData?.two_factor_secret) {
      verified = verifyTotpCode(cleanCode, twoFactorData.two_factor_secret, 2);
    }

    if (!verified) {
      const consumed = await verifyAndConsumeBackupCode(userRow.id, cleanCode);
      if (consumed) {
        verified = true;
        logger.security.info('Código de respaldo utilizado en login 2FA', { userId: userRow.id });
      }
    }

    if (!verified) {
      logger.security.warn('Código 2FA incorrecto al iniciar sesión', { userId: userRow.id });
      res.status(400).json({ error: 'El código ingresado es incorrecto o ha expirado.', success: false });
      return;
    }

    await consumePending2FALogin(tempToken);

    const permissions = await getUserEffectivePermissions(userRow);
    const userPayload = sanitizeUser(userRow);
    userPayload.permissions = permissions;
    const session = await addAccountToSession(res, req, userPayload);

    res.clearCookie('2fa_temp_token', { path: '/' });
    res.clearCookie('2fa_temp_email', { path: '/' });

    logger.security.info('Inicio de sesión exitoso tras verificación 2FA', { email: userRow.email, userId: userRow.id });

    res.status(200).json({
      accounts: session.accounts.map(sanitizeUser),
      message: 'Inicio de sesión exitoso.',
      success: true,
      user: userPayload,
    });
  } catch (error) {
    logger.app.error('Error al verificar segundo factor de autenticación', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}


