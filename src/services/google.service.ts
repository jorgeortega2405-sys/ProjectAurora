import crypto from 'crypto';
import { Request, Response } from 'express';
import { config } from '../config/env.config.js';
import { GoogleTokenResponse, GoogleUserInfo, UserPayload } from '../types/auth.types.js';
import { logger } from './logger.service.js';
import { createUser, findUserByEmail, findUserByGoogleId, findUserByUsername, sanitizeUser, updateUserGoogleId, updateUserUsername } from './user.service.js';

export const STATE_COOKIE_NAME = 'oauth_state';

export function getGoogleAuthUrl(_req: Request, res: Response): string {
  const state = crypto.randomBytes(24).toString('hex');

  res.cookie(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    maxAge: 10 * 60 * 1000,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
  });

  const params = new URLSearchParams({
    access_type: 'offline',
    client_id: config.google.clientId,
    prompt: 'select_account',
    redirect_uri: config.google.callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function generateUniqueUsername(baseName: string): Promise<string> {
  let cleanName = baseName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '');

  if (cleanName.length < 3) {
    cleanName = cleanName
      ? `${cleanName}_${Math.floor(100 + Math.random() * 900)}`
      : `user_${Math.floor(1000 + Math.random() * 9000)}`;
  }
  cleanName = cleanName.slice(0, 30);

  let candidate = cleanName;
  let counter = 1;

  while (true) {
    const existing = await findUserByUsername(candidate);
    if (!existing) {
      return candidate;
    }

    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    const cleanPrefix = cleanName.slice(0, 24).replace(/[._-]+$/g, '');
    candidate = `${cleanPrefix}_${suffix}`;
    counter++;
    if (counter > 10) {
      return `user_${Date.now()}`.slice(0, 30);
    }
  }
}

export async function processGoogleAuthCallback(code: string): Promise<UserPayload> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    body: new URLSearchParams({
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      code: String(code),
      grant_type: 'authorization_code',
      redirect_uri: config.google.callbackUrl,
    }),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  });

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    throw new Error(`Error al intercambiar código con Google: ${errBody}`);
  }

  const tokenData = (await tokenRes.json()) as GoogleTokenResponse;

  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });

  if (!userInfoRes.ok) {
    const errBody = await userInfoRes.text();
    throw new Error(`Error al obtener perfil del usuario desde Google: ${errBody}`);
  }

  const googleUser = (await userInfoRes.json()) as GoogleUserInfo;
  if (!googleUser.verified_email && (googleUser as any).email_verified !== true) {
    logger.security.warn('Rechazado intento de login con Google por correo no verificado', { email: googleUser.email });
    throw new Error('El correo electrónico de Google no se encuentra verificado.');
  }

  const googleId = googleUser.id;
  const email = googleUser.email.toLowerCase();
  const baseName = googleUser.name || googleUser.given_name || email.split('@')[0];

  const existingGoogleUser = await findUserByGoogleId(googleId);
  if (existingGoogleUser) {
    if (existingGoogleUser.username.startsWith('aurora_')) {
      const newUsername = await generateUniqueUsername(baseName);
      const updated = await updateUserUsername(existingGoogleUser.id, newUsername);
      if (updated) {
        return sanitizeUser(updated);
      }
    }
    return sanitizeUser(existingGoogleUser);
  }

  const existingEmailUser = await findUserByEmail(email);
  if (existingEmailUser) {
    await updateUserGoogleId(existingEmailUser.id, googleId);
    let userToReturn = existingEmailUser;
    if (existingEmailUser.username.startsWith('aurora_')) {
      const newUsername = await generateUniqueUsername(baseName);
      const updated = await updateUserUsername(existingEmailUser.id, newUsername);
      if (updated) {
        userToReturn = updated;
      }
    }
    return sanitizeUser({ ...userToReturn, google_id: googleId });
  }

  const uniqueUsername = await generateUniqueUsername(baseName);

  const newUser = await createUser({
    avatarUrl: googleUser.picture || null,
    email,
    googleId,
    passwordHash: null,
    username: uniqueUsername,
  });

  return sanitizeUser(newUser);
}
