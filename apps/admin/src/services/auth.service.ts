import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2/promise';
import { adminConfig } from '../config/env.config.js';
import { adminDbPool } from './db.service.js';
import { logger } from './logger.service.js';

export interface AdminUser {
  avatar_url: string | null;
  created_at: string;
  email: string;
  id: string;
  permissions: string[];
  role: string;
  username: string;
}

interface UserRow extends RowDataPacket {
  avatar_url: string | null;
  created_at: Date | string;
  email: string;
  id: string;
  password_hash: string | null;
  role: string;
  two_factor_enabled: number | boolean;
  two_factor_secret: string | null;
  username: string;
}

interface PermissionRow extends RowDataPacket {
  permission_id: string;
}

export const ADMIN_COOKIE_NAME = 'aurora_admin_session';
export const FALLBACK_COOKIE_NAME = 'aurora_session';
export const MAX_CONCURRENT_ADMIN_ACCOUNTS = 3;
export const ADMIN_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface AdminSessionAccount {
  avatar_url: string | null;
  created_at: string;
  email: string;
  id: string;
  last_accessed: number;
  role: string;
  username: string;
}

export interface AdminMultiAccountSession {
  accounts: AdminSessionAccount[];
  activeId: string;
  exp: number;
  iat: number;
}

export function hasPermission(permissions: string[] | undefined, requiredPermission: string): boolean {
  if (!permissions || !Array.isArray(permissions)) return false;
  if (permissions.includes('*') || permissions.includes(requiredPermission)) return true;
  return false;
}

export async function getAdminRolePermissions(role: string): Promise<string[]> {
  try {
    const [rows] = await adminDbPool.query<PermissionRow[]>(
      'SELECT permission_id FROM role_permissions WHERE role_id = ?',
      [role]
    );
    const perms = rows.map((r) => r.permission_id);
    if ((role === 'SUPER_ADMIN' || role === 'ADMIN') && !perms.includes('*')) {
      perms.push('*');
    }
    return perms;
  } catch (err) {
    logger.db.error('Error al consultar permisos de rol en base de datos', err);
    if (role === 'SUPER_ADMIN' || role === 'ADMIN') return ['*'];
    return [];
  }
}

export function createAdminMultiAccountToken(session: AdminMultiAccountSession): string {
  const now = Date.now();
  const sessionWithMeta: AdminMultiAccountSession = {
    accounts: session.accounts,
    activeId: session.activeId,
    exp: session.exp || now + ADMIN_SESSION_TTL_SECONDS * 1000,
    iat: session.iat || now,
  };

  const payloadStr = JSON.stringify(sessionWithMeta);
  const payloadBase64 = Buffer.from(payloadStr, 'utf-8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', adminConfig.sessionSecret)
    .update(payloadBase64)
    .digest('base64url');

  return `${payloadBase64}.${signature}`;
}

export function createAdminToken(user: AdminUser): string {
  const now = Date.now();
  return createAdminMultiAccountToken({
    accounts: [
      {
        avatar_url: user.avatar_url,
        created_at: user.created_at,
        email: user.email,
        id: user.id,
        last_accessed: now,
        role: user.role,
        username: user.username,
      },
    ],
    activeId: user.id,
    exp: now + ADMIN_SESSION_TTL_SECONDS * 1000,
    iat: now,
  });
}

export function verifyAdminMultiAccountToken(token: string): AdminMultiAccountSession | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payloadBase64, signature] = parts;
    const expectedSignature = crypto
      .createHmac('sha256', adminConfig.sessionSecret)
      .update(payloadBase64)
      .digest('base64url');

    if (
      signature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
    ) {
      return null;
    }

    const payloadStr = Buffer.from(payloadBase64, 'base64url').toString('utf-8');
    const parsed = JSON.parse(payloadStr);

    if (parsed && typeof parsed === 'object') {
      if (parsed.exp && typeof parsed.exp === 'number' && Date.now() > parsed.exp) {
        return null;
      }

      if (Array.isArray(parsed.accounts) && typeof parsed.activeId === 'string') {
        return parsed as AdminMultiAccountSession;
      }

      if (parsed.user && typeof parsed.user.id === 'string') {
        return {
          accounts: [
            {
              avatar_url: parsed.user.avatar_url ?? null,
              created_at: parsed.user.created_at || new Date().toISOString(),
              email: parsed.user.email || '',
              id: parsed.user.id,
              last_accessed: Date.now(),
              role: parsed.user.role || 'ADMIN',
              username: parsed.user.username || 'Admin',
            },
          ],
          activeId: parsed.user.id,
          exp: parsed.exp,
          iat: parsed.iat,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function verifyAdminToken(token: string): { userId: string } | null {
  const session = verifyAdminMultiAccountToken(token);
  if (!session) return null;
  return { userId: session.activeId };
}

export function setAdminSessionCookie(
  res: Response,
  sessionOrUser: AdminMultiAccountSession | AdminUser
): void {
  if (res.headersSent) return;

  let session: AdminMultiAccountSession;
  if ('accounts' in sessionOrUser && Array.isArray(sessionOrUser.accounts)) {
    session = sessionOrUser;
  } else {
    const user = sessionOrUser as AdminUser;
    const now = Date.now();
    session = {
      accounts: [
        {
          avatar_url: user.avatar_url,
          created_at: user.created_at,
          email: user.email,
          id: user.id,
          last_accessed: now,
          role: user.role,
          username: user.username,
        },
      ],
      activeId: user.id,
      exp: now + ADMIN_SESSION_TTL_SECONDS * 1000,
      iat: now,
    };
  }

  const token = createAdminMultiAccountToken(session);
  res.cookie(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: ADMIN_SESSION_TTL_SECONDS * 1000,
    path: '/',
    sameSite: 'lax',
    secure: adminConfig.nodeEnv === 'production',
  });
}

export function clearAdminSessionCookie(res: Response): void {
  if (res.headersSent) return;
  res.cookie(ADMIN_COOKIE_NAME, '', {
    expires: new Date(0),
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: adminConfig.nodeEnv === 'production',
  });
}

export async function findUserWithPermissionsById(id: string): Promise<AdminUser | null> {
  const [rows] = await adminDbPool.query<UserRow[]>(
    'SELECT id, username, email, avatar_url, role, created_at FROM users WHERE id = ?',
    [id]
  );

  if (rows.length === 0) return null;
  const r = rows[0];
  const permissions = await getAdminRolePermissions(r.role || 'USER');

  return {
    avatar_url: r.avatar_url ?? null,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    email: r.email,
    id: r.id,
    permissions,
    role: r.role || 'USER',
    username: r.username || 'Usuario',
  };
}

export function getAdminMultiAccountSession(req: Request): AdminMultiAccountSession | null {
  if ((req as any)._cachedAdminMultiAccountSession) {
    return (req as any)._cachedAdminMultiAccountSession;
  }

  const token =
    req.cookies?.[ADMIN_COOKIE_NAME] ||
    req.cookies?.[FALLBACK_COOKIE_NAME] ||
    (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '').trim() : null);

  if (!token) return null;

  const session = verifyAdminMultiAccountToken(token);
  if (session) {
    (req as any)._cachedAdminMultiAccountSession = session;
  }
  return session;
}

export async function getAdminLinkedAccounts(req: Request): Promise<AdminUser[]> {
  const session = getAdminMultiAccountSession(req);
  if (!session || !Array.isArray(session.accounts)) {
    const current = await getAdminSessionUser(req);
    return current ? [current] : [];
  }

  const accounts: AdminUser[] = [];
  for (const acc of session.accounts) {
    const user = await findUserWithPermissionsById(acc.id);
    if (user && hasPermission(user.permissions, 'admin:access')) {
      accounts.push(user);
    }
  }

  return accounts;
}

export async function addAdminAccountToSession(
  res: Response,
  req: Request,
  user: AdminUser
): Promise<AdminMultiAccountSession> {
  const existingSession = getAdminMultiAccountSession(req);
  let accounts: AdminSessionAccount[] = existingSession ? [...existingSession.accounts] : [];

  const existingIndex = accounts.findIndex((a) => a.id === user.id);
  const now = Date.now();

  const sessionAcc: AdminSessionAccount = {
    avatar_url: user.avatar_url ?? null,
    created_at: user.created_at,
    email: user.email,
    id: user.id,
    last_accessed: now,
    role: user.role,
    username: user.username,
  };

  if (existingIndex >= 0) {
    accounts[existingIndex] = sessionAcc;
  } else {
    if (accounts.length >= MAX_CONCURRENT_ADMIN_ACCOUNTS) {
      accounts.sort((a, b) => (a.last_accessed || 0) - (b.last_accessed || 0));
      accounts.shift();
    }
    accounts.push(sessionAcc);
  }

  const newSession: AdminMultiAccountSession = {
    accounts,
    activeId: user.id,
    exp: now + ADMIN_SESSION_TTL_SECONDS * 1000,
    iat: now,
  };

  (req as any)._cachedAdminMultiAccountSession = newSession;
  setAdminSessionCookie(res, newSession);
  return newSession;
}

export async function switchAdminAccountInSession(
  res: Response,
  req: Request,
  targetUserId: string
): Promise<{ accounts: AdminUser[]; activeUser: AdminUser | null; success: boolean }> {
  const session = getAdminMultiAccountSession(req);
  if (!session) {
    return { accounts: [], activeUser: null, success: false };
  }

  const target = session.accounts.find((a) => a.id === targetUserId);
  if (!target) {
    return { accounts: [], activeUser: null, success: false };
  }

  const targetUser = await findUserWithPermissionsById(targetUserId);
  if (!targetUser || !hasPermission(targetUser.permissions, 'admin:access')) {
    return { accounts: [], activeUser: null, success: false };
  }

  target.last_accessed = Date.now();
  session.activeId = targetUserId;
  (req as any)._cachedAdminMultiAccountSession = session;
  setAdminSessionCookie(res, session);

  const linked = await getAdminLinkedAccounts(req);
  return { accounts: linked, activeUser: targetUser, success: true };
}

export async function removeAdminAccountFromSession(
  res: Response,
  req: Request,
  userId?: string
): Promise<{ accounts: AdminUser[]; activeUser: AdminUser | null; remainingCount: number }> {
  const session = getAdminMultiAccountSession(req);
  if (!session) {
    clearAdminSessionCookie(res);
    return { accounts: [], activeUser: null, remainingCount: 0 };
  }

  const idToRemove = userId ?? session.activeId;
  const remainingCandidates = session.accounts.filter((a) => a.id !== idToRemove);
  const validRemaining: AdminSessionAccount[] = [];

  for (const acc of remainingCandidates) {
    const fresh = await findUserWithPermissionsById(acc.id);
    if (fresh && hasPermission(fresh.permissions, 'admin:access')) {
      validRemaining.push(acc);
    }
  }

  session.accounts = validRemaining;

  if (session.accounts.length === 0) {
    clearAdminSessionCookie(res);
    return { accounts: [], activeUser: null, remainingCount: 0 };
  }

  if (session.activeId === idToRemove || !session.accounts.some((a) => a.id === session.activeId)) {
    session.accounts.sort((a, b) => (b.last_accessed || 0) - (a.last_accessed || 0));
    session.activeId = session.accounts[0].id;
  }

  (req as any)._cachedAdminMultiAccountSession = session;
  setAdminSessionCookie(res, session);

  const activeUser = await findUserWithPermissionsById(session.activeId);
  const linked = await getAdminLinkedAccounts(req);
  return { accounts: linked, activeUser, remainingCount: session.accounts.length };
}

export function clearAllAdminAccountsFromSession(res: Response): void {
  clearAdminSessionCookie(res);
}

export async function getAdminSessionUser(req: Request): Promise<AdminUser | null> {
  const session = getAdminMultiAccountSession(req);
  if (!session) return null;

  const activeId = session.activeId || (session.accounts[0] && session.accounts[0].id);
  if (!activeId) return null;

  const user = await findUserWithPermissionsById(activeId);
  if (!user) return null;

  if (!hasPermission(user.permissions, 'admin:access')) {
    logger.security.warn('Usuario autenticado sin permiso admin:access intentó acceder al panel', {
      role: user.role,
      userId: user.id,
    });
    return null;
  }

  return user;
}

export async function authenticateAdminCredentials(
  identifier: string,
  passwordPlain: string
): Promise<{ success: boolean; error?: string; user?: AdminUser }> {
  const cleanIdentifier = String(identifier || '').trim().toLowerCase();
  if (!cleanIdentifier || !passwordPlain) {
    return { error: 'Ingresa correo electrónico y contraseña.', success: false };
  }

  const [rows] = await adminDbPool.query<UserRow[]>(
    'SELECT id, username, email, password_hash, avatar_url, role, two_factor_enabled, created_at FROM users WHERE email = ? OR username = ?',
    [cleanIdentifier, cleanIdentifier]
  );

  if (rows.length === 0) {
    logger.security.warn('Intento de login admin fallido: usuario no encontrado', { identifier: cleanIdentifier });
    return { error: 'Credenciales inválidas.', success: false };
  }

  const userRow = rows[0];
  if (!userRow.password_hash) {
    logger.security.warn('Intento de login admin fallido: usuario sin contraseña configurada', { identifier: cleanIdentifier });
    return { error: 'Credenciales inválidas.', success: false };
  }

  const validPassword = await bcrypt.compare(String(passwordPlain), userRow.password_hash);
  if (!validPassword) {
    logger.security.warn('Intento de login admin fallido: contraseña incorrecta', {
      identifier: cleanIdentifier,
      userId: userRow.id,
    });
    return { error: 'Credenciales inválidas.', success: false };
  }

  const permissions = await getAdminRolePermissions(userRow.role || 'USER');

  if (!hasPermission(permissions, 'admin:access')) {
    logger.security.warn('Intento de login admin rechazado por falta de permiso admin:access', {
      identifier: cleanIdentifier,
      role: userRow.role,
      userId: userRow.id,
    });
    return {
      error: 'Acceso denegado: tu cuenta no tiene permisos administrativos para acceder al panel.',
      success: false,
    };
  }

  const adminUser: AdminUser = {
    avatar_url: userRow.avatar_url ?? null,
    created_at: userRow.created_at instanceof Date ? userRow.created_at.toISOString() : String(userRow.created_at),
    email: userRow.email,
    id: userRow.id,
    permissions,
    role: userRow.role || 'USER',
    username: userRow.username || 'Usuario',
  };

  logger.security.info('Inicio de sesión administrativo exitoso', {
    email: adminUser.email,
    role: adminUser.role,
    userId: adminUser.id,
  });

  return {
    success: true,
    user: adminUser,
  };
}

export interface AccessibleWebsite {
  accent_color: string;
  domain: string;
  id: string;
  logo_url: string | null;
  name: string;
  role: string;
  slug: string;
  status: string;
}

export async function getAdminAccessibleWebsites(user: AdminUser): Promise<AccessibleWebsite[]> {
  try {
    const isGlobal = user.permissions.includes('*');
    if (isGlobal) {
      const [allWebsites] = await adminDbPool.query<RowDataPacket[]>(
        'SELECT id, name, slug, domain, logo_url, accent_color, status FROM websites WHERE status != "maintenance" ORDER BY name ASC'
      );
      return allWebsites.map((w) => ({
        accent_color: w.accent_color || '#6366f1',
        domain: w.domain,
        id: w.id,
        logo_url: w.logo_url ?? null,
        name: w.name,
        role: user.role,
        slug: w.slug,
        status: w.status,
      }));
    }

    const [rows] = await adminDbPool.query<RowDataPacket[]>(
      `SELECT w.id, w.name, w.slug, w.domain, w.logo_url, w.accent_color, w.status, swa.role_id
       FROM staff_website_access swa
       JOIN websites w ON (swa.website_id = w.id OR swa.website_id = '*')
       WHERE swa.user_id = ? AND swa.is_active = 1 AND w.status != 'maintenance'
       ORDER BY w.name ASC`,
      [user.id]
    );

    return rows.map((r) => ({
      accent_color: r.accent_color || '#6366f1',
      domain: r.domain,
      id: r.id,
      logo_url: r.logo_url ?? null,
      name: r.name,
      role: r.role_id || user.role,
      slug: r.slug,
      status: r.status,
    }));
  } catch (err) {
    logger.db.error('Error al consultar sitios web accesibles para el usuario', err);
    return [];
  }
}

export async function checkUserWebsiteAccess(user: AdminUser, websiteId: string): Promise<boolean> {
  if (user.permissions.includes('*')) return true;
  if (!websiteId) return false;

  try {
    const [rows] = await adminDbPool.query<RowDataPacket[]>(
      'SELECT id FROM staff_website_access WHERE user_id = ? AND (website_id = ? OR website_id = "*") AND is_active = 1',
      [user.id, websiteId]
    );
    return rows.length > 0;
  } catch (err) {
    logger.db.error('Error al verificar acceso de usuario a sitio web', err);
    return false;
  }
}
