import { config } from '../config/env.config.js';
import { MultiAccountSessionPayload, SessionAccount, UserPayload } from '../types/auth.types.js';
import { findUserById, sanitizeUser } from './user.service.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Request, Response } from 'express';

export const COOKIE_NAME = 'aurora_session';
export const MAX_CONCURRENT_ACCOUNTS = 3;
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createMultiAccountToken(session: MultiAccountSessionPayload): string {
  const now = Date.now();
  const sessionWithMeta: MultiAccountSessionPayload = {
    ...session,
    accounts: session.accounts,
    exp: session.exp || (now + SESSION_TTL_SECONDS * 1000),
    iat: session.iat || now,
  };

  const payloadStr = JSON.stringify(sessionWithMeta);
  const payloadBase64 = Buffer.from(payloadStr, 'utf-8').toString('base64url');
  const signature = crypto.createHmac('sha256', config.sessionSecret).update(payloadBase64).digest('base64url');
  return `${payloadBase64}.${signature}`;
}

export function verifyMultiAccountToken(token: string): MultiAccountSessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payloadBase64, signature] = parts;
    const expectedSignature = crypto.createHmac('sha256', config.sessionSecret).update(payloadBase64).digest('base64url');

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
        return parsed as MultiAccountSessionPayload;
      } else if (parsed.user && typeof parsed.user === 'object' && typeof parsed.user.id === 'string') {
        return {
          accounts: [
            {
              avatar_url: parsed.user.avatar_url ?? null,
              created_at: parsed.user.created_at,
              email: parsed.user.email,
              google_id: parsed.user.google_id ?? null,
              id: parsed.user.id,
              last_accessed: Date.now(),
              role: parsed.user.role || 'USER',
              username: parsed.user.username,
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

export function setMultiAccountCookie(res: Response, session: MultiAccountSessionPayload): void {
  if (res.headersSent) return;
  const token = createMultiAccountToken(session);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: '/',
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
  });
}

export function clearSessionCookie(res: Response): void {
  if (res.headersSent) return;
  const isProduction = config.nodeEnv === 'production';
  res.cookie(COOKIE_NAME, '', {
    expires: new Date(0),
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: isProduction,
  });
}

export function getMultiAccountSession(req: Request): MultiAccountSessionPayload | null {
  if ((req as any)._cachedMultiAccountSession) {
    return (req as any)._cachedMultiAccountSession;
  }
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  const session = verifyMultiAccountToken(token);
  if (session) {
    (req as any)._cachedMultiAccountSession = session;
  }
  return session;
}

export function getCurrentUser(req: Request): UserPayload | null {
  const session = getMultiAccountSession(req);
  if (!session) return null;
  const active = session.accounts.find((a) => a.id === session.activeId) || session.accounts[0];
  return active ? (active as UserPayload) : null;
}

export function getLinkedAccounts(req: Request): SessionAccount[] {
  const session = getMultiAccountSession(req);
  return session ? session.accounts : [];
}

export async function getSessionUser(req: Request): Promise<UserPayload | null> {
  const current = getCurrentUser(req);
  if (!current) return null;

  const freshUser = await findUserById(current.id);
  if (!freshUser) return null;

  return sanitizeUser(freshUser);
}

export async function addAccountToSession(
  res: Response,
  req: Request,
  user: UserPayload
): Promise<MultiAccountSessionPayload> {
  const existingSession = getMultiAccountSession(req);
  let accounts: SessionAccount[] = existingSession ? [...existingSession.accounts] : [];

  const existingIndex = accounts.findIndex((a) => a.id === user.id);
  const now = Date.now();

  const sessionAcc: SessionAccount = {
    avatar_url: user.avatar_url ?? null,
    cancel_at_period_end: user.cancel_at_period_end,
    created_at: user.created_at,
    email: user.email,
    google_id: user.google_id ?? null,
    id: user.id,
    last_accessed: now,
    role: user.role || 'USER',
    subscription_status: user.subscription_status || 'active',
    subscription_tier: user.subscription_tier || 'free',
    subscription_tier_color: user.subscription_tier_color,
    two_factor_enabled: user.two_factor_enabled,
    username: user.username,
  };


  if (existingIndex >= 0) {
    accounts[existingIndex] = sessionAcc;
  } else {
    if (accounts.length >= MAX_CONCURRENT_ACCOUNTS) {
      accounts.sort((a, b) => (a.last_accessed || 0) - (b.last_accessed || 0));
      accounts.shift();
    }
    accounts.push(sessionAcc);
  }

  const newSession: MultiAccountSessionPayload = {
    accounts,
    activeId: user.id,
    exp: now + SESSION_TTL_SECONDS * 1000,
    iat: now,
  };

  (req as any)._cachedMultiAccountSession = newSession;
  setMultiAccountCookie(res, newSession);
  return newSession;
}

export function switchAccountInSession(
  res: Response,
  req: Request,
  targetUserId: string
): { accounts: SessionAccount[]; activeUser: UserPayload | null; success: boolean } {
  const session = getMultiAccountSession(req);
  if (!session) {
    return { accounts: [], activeUser: null, success: false };
  }

  const target = session.accounts.find((a) => a.id === targetUserId);
  if (!target) {
    return { accounts: session.accounts, activeUser: null, success: false };
  }

  target.last_accessed = Date.now();
  session.activeId = targetUserId;
  (req as any)._cachedMultiAccountSession = session;
  setMultiAccountCookie(res, session);

  return { accounts: session.accounts, activeUser: target as UserPayload, success: true };
}

export async function removeAccountFromSession(
  res: Response,
  req: Request,
  userId?: string
): Promise<{ accounts: SessionAccount[]; activeUser: UserPayload | null; remainingCount: number }> {
  const session = getMultiAccountSession(req);
  if (!session) {
    clearSessionCookie(res);
    return { accounts: [], activeUser: null, remainingCount: 0 };
  }

  const idToRemove = userId ?? session.activeId;
  session.accounts = session.accounts.filter((a) => a.id !== idToRemove);

  if (session.accounts.length === 0) {
    clearSessionCookie(res);
    return { accounts: [], activeUser: null, remainingCount: 0 };
  }

  if (session.activeId === idToRemove) {
    session.accounts.sort((a, b) => (b.last_accessed || 0) - (a.last_accessed || 0));
    session.activeId = session.accounts[0].id;
  }

  (req as any)._cachedMultiAccountSession = session;
  setMultiAccountCookie(res, session);
  const activeUser = session.accounts.find((a) => a.id === session.activeId) || session.accounts[0];
  return { accounts: session.accounts, activeUser: activeUser as UserPayload, remainingCount: session.accounts.length };
}

export function updateActiveAccountInSession(
  res: Response,
  req: Request,
  user: UserPayload
): void {
  const session = getMultiAccountSession(req);
  if (!session) return;
  const index = session.accounts.findIndex((a) => a.id === user.id);
  if (index >= 0) {
    session.accounts[index] = {
      ...session.accounts[index],
      avatar_url: user.avatar_url ?? null,
      cancel_at_period_end: user.cancel_at_period_end,
      email: user.email,
      google_id: user.google_id ?? null,
      subscription_status: user.subscription_status || 'active',
      subscription_tier: user.subscription_tier || 'free',
      subscription_tier_color: user.subscription_tier_color,
      username: user.username,
    };
    (req as any)._cachedMultiAccountSession = session;
    setMultiAccountCookie(res, session);
  }
}


