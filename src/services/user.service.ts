import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { pool } from '../config/database.config.js';
import { getTierBorderColor } from '../config/plans.config.js';
import { isS3Configured, S3_BUCKET_NAME, s3Client } from '../config/s3.config.js';
import { SessionAccount, UserPayload, UserRecord } from '../types/auth.types.js';
import { decryptAtRest, encryptAtRest } from './crypto.service.js';
import { deleteUserPreferences } from './settings.service.js';
import { clearPending2FASetup, hashBackupCode } from './two-factor.service.js';
import crypto from 'crypto';
import fs from 'fs';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import path from 'path';

interface UserRow extends RowDataPacket {
  avatar_url: string | null;
  cancel_at_period_end: number | boolean;
  ai_credits_balance: number;
  created_at: Date | string;
  email: string;
  email_changed_at: Date | string | null;
  google_id: string | null;
  id: string;
  is_student?: number | boolean;
  password_hash: string | null;
  role: 'USER' | 'ADMIN';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_origin?: string;
  subscription_period_end: Date | string | null;
  subscription_status: string;
  subscription_tier: string;
  two_factor_enabled: number | boolean;
  two_factor_recovery_codes: string | null;
  two_factor_secret: string | null;
  updated_at: Date | string;
  username: string;
  username_changed_at: Date | string | null;
}

function mapRowToUser(row: UserRow): UserRecord {
  const tier = row.subscription_tier || 'free';
  return {
    ai_credits_balance: Number(row.ai_credits_balance || 0),
    avatar_url: row.avatar_url ?? null,
    cancel_at_period_end: Boolean(row.cancel_at_period_end),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    email: row.email,
    email_changed_at: row.email_changed_at ? (row.email_changed_at instanceof Date ? row.email_changed_at.toISOString() : String(row.email_changed_at)) : null,
    google_id: row.google_id ?? null,
    id: row.id,
    is_student: Boolean(row.is_student),
    password_hash: row.password_hash ?? null,
    role: row.role || 'USER',
    stripe_customer_id: row.stripe_customer_id ?? null,
    stripe_subscription_id: row.stripe_subscription_id ?? null,
    subscription_origin: row.subscription_origin || 'payment',
    subscription_period_end: row.subscription_period_end ? (row.subscription_period_end instanceof Date ? row.subscription_period_end.toISOString() : String(row.subscription_period_end)) : null,
    subscription_status: row.subscription_status || 'active',
    subscription_tier: tier,
    subscription_tier_color: getTierBorderColor(tier),
    two_factor_enabled: Boolean(row.two_factor_enabled),
    two_factor_recovery_codes: row.two_factor_recovery_codes ? (typeof row.two_factor_recovery_codes === 'string' ? JSON.parse(row.two_factor_recovery_codes) : row.two_factor_recovery_codes) : null,
    two_factor_secret: row.two_factor_secret ?? null,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    username: row.username,
    username_changed_at: row.username_changed_at ? (row.username_changed_at instanceof Date ? row.username_changed_at.toISOString() : String(row.username_changed_at)) : null,
  };
}

export function sanitizeUser(user: UserRecord | UserPayload | SessionAccount): UserPayload {
  const tier = (user as any).subscription_tier || 'free';
  return {
    ai_credits_balance: (user as any).ai_credits_balance !== undefined ? Number((user as any).ai_credits_balance) : 0,
    avatar_url: user.avatar_url ?? null,
    cancel_at_period_end: (user as any).cancel_at_period_end,
    created_at: user.created_at || new Date().toISOString(),
    email: user.email,
    id: user.id,
    is_student: Boolean((user as any).is_student),
    permissions: (user as any).permissions || [],
    stripe_customer_id: (user as any).stripe_customer_id ?? null,
    stripe_subscription_id: (user as any).stripe_subscription_id ?? null,
    subscription_origin: (user as any).subscription_origin || 'payment',
    subscription_period_end: (user as any).subscription_period_end ?? null,
    subscription_status: (user as any).subscription_status || 'active',
    subscription_tier: tier,
    subscription_tier_color: (user as any).subscription_tier_color || getTierBorderColor(tier),
    username: user.username,
  };
}


export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const [rows] = await pool.query<UserRow[]>(
    'SELECT * FROM users WHERE email = ? LIMIT 1',
    [email.toLowerCase().trim()]
  );
  if (rows.length === 0) return null;
  return mapRowToUser(rows[0]);
}

export async function findUserByGoogleId(googleId: string): Promise<UserRecord | null> {
  const [rows] = await pool.query<UserRow[]>(
    'SELECT * FROM users WHERE google_id = ? LIMIT 1',
    [googleId]
  );
  if (rows.length === 0) return null;
  return mapRowToUser(rows[0]);
}

export async function findUserByUsername(username: string): Promise<UserRecord | null> {
  const [rows] = await pool.query<UserRow[]>(
    'SELECT * FROM users WHERE username = ? LIMIT 1',
    [username.toLowerCase().trim()]
  );
  if (rows.length === 0) return null;
  return mapRowToUser(rows[0]);
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const [rows] = await pool.query<UserRow[]>(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  if (rows.length === 0) return null;
  return mapRowToUser(rows[0]);
}

export async function findUserDuplicates(email: string, username: string): Promise<{ emailExists: boolean; usernameExists: boolean }> {
  const [rows] = await pool.query<UserRow[]>(
    'SELECT email, username FROM users WHERE email = ? OR username = ?',
    [email.toLowerCase().trim(), username.toLowerCase().trim()]
  );
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedUsername = username.toLowerCase().trim();
  const emailExists = rows.some((u) => u.email.toLowerCase() === normalizedEmail);
  const usernameExists = rows.some((u) => u.username.toLowerCase() === normalizedUsername);
  return { emailExists, usernameExists };
}

export async function updateUserGoogleId(id: string, googleId: string): Promise<UserRecord | null> {
  await pool.query(
    'UPDATE users SET google_id = ? WHERE id = ?',
    [googleId, id]
  );
  return findUserById(id);
}

export async function createUser(params: {
  avatarUrl?: string | null;
  email: string;
  googleId?: string | null;
  passwordHash?: string | null;
  username: string;
}): Promise<UserRecord> {
  const id = crypto.randomUUID();
  const email = params.email.toLowerCase().trim();
  const username = params.username.trim();
  const passwordHash = params.passwordHash ?? null;
  const googleId = params.googleId ?? null;
  const avatarUrl = params.avatarUrl ?? null;

  await pool.query(
    'INSERT INTO users (id, username, email, password_hash, google_id, avatar_url, role, two_factor_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, username, email, passwordHash, googleId, avatarUrl, 'USER', 0]
  );

  const user = await findUserById(id);
  if (!user) {
    throw new Error('No se pudo recuperar el usuario recién creado.');
  }
  return user;
}

export async function updateUserAvatar(id: string, avatarUrl: string | null): Promise<UserRecord | null> {
  await pool.query(
    'UPDATE users SET avatar_url = ? WHERE id = ?',
    [avatarUrl, id]
  );
  return findUserById(id);
}

export async function updateUserUsername(id: string, username: string): Promise<UserRecord | null> {
  await pool.query(
    'UPDATE users SET username = ?, username_changed_at = CURRENT_TIMESTAMP WHERE id = ?',
    [username.trim(), id]
  );
  return findUserById(id);
}

export async function updateUserEmail(id: string, email: string): Promise<UserRecord | null> {
  await pool.query(
    'UPDATE users SET email = ?, email_changed_at = CURRENT_TIMESTAMP WHERE id = ?',
    [email.toLowerCase().trim(), id]
  );
  return findUserById(id);
}

export async function unlinkUserGoogle(id: string): Promise<UserRecord | null> {
  await pool.query(
    'UPDATE users SET google_id = NULL WHERE id = ?',
    [id]
  );
  return findUserById(id);
}

export async function updateUserPassword(id: string, passwordHash: string): Promise<UserRecord | null> {
  await pool.query(
    'UPDATE users SET password_hash = ? WHERE id = ?',
    [passwordHash, id]
  );
  return findUserById(id);
}

export async function deleteUserById(id: string): Promise<boolean> {
  const [result] = await pool.query<ResultSetHeader>(
    'DELETE FROM users WHERE id = ?',
    [id]
  );
  return result.affectedRows > 0;
}

export async function getUser2FASecret(
  userId: string
): Promise<{ two_factor_recovery_codes: string[] | null; two_factor_secret: string | null } | null> {
  const user = await findUserById(userId);
  if (!user) return null;

  return {
    two_factor_recovery_codes: user.two_factor_recovery_codes
      ? user.two_factor_recovery_codes.map((c) => decryptAtRest(c))
      : null,
    two_factor_secret: user.two_factor_secret ? decryptAtRest(user.two_factor_secret) : null,
  };
}

export async function enableUser2FA(
  userId: string,
  secret: string,
  backupCodes: string[]
): Promise<boolean> {
  const encryptedSecret = encryptAtRest(secret);
  const encryptedHashedCodes = backupCodes.map((code) => encryptAtRest(hashBackupCode(code)));
  const serializedCodes = JSON.stringify(encryptedHashedCodes);

  const [result] = await pool.query<ResultSetHeader>(
    'UPDATE users SET two_factor_enabled = 1, two_factor_secret = ?, two_factor_recovery_codes = ? WHERE id = ?',
    [encryptedSecret, serializedCodes, userId]
  );
  return result.affectedRows > 0;
}

export async function disableUser2FA(userId: string): Promise<boolean> {
  const [result] = await pool.query<ResultSetHeader>(
    'UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL, two_factor_recovery_codes = NULL WHERE id = ?',
    [userId]
  );
  return result.affectedRows > 0;
}

export async function verifyAndConsumeBackupCode(userId: string, code: string): Promise<boolean> {
  const user = await findUserById(userId);
  if (!user || !user.two_factor_recovery_codes || !Array.isArray(user.two_factor_recovery_codes)) {
    return false;
  }

  const targetHash = hashBackupCode(code);
  const codeIndex = user.two_factor_recovery_codes.findIndex((enc) => {
    const dec = decryptAtRest(enc);
    return dec === targetHash;
  });

  if (codeIndex === -1) {
    return false;
  }

  const updatedCodes = [...user.two_factor_recovery_codes];
  updatedCodes.splice(codeIndex, 1);
  const serialized = JSON.stringify(updatedCodes);

  await pool.query(
    'UPDATE users SET two_factor_recovery_codes = ? WHERE id = ?',
    [serialized, userId]
  );
  return true;
}

export async function deleteUserPermanently(userId: string): Promise<boolean> {
  const user = await findUserById(userId);
  if (!user) return false;

  if (user.avatar_url && user.avatar_url.startsWith('/uploads/avatars/')) {
    const fileName = path.basename(user.avatar_url);
    const filePath = path.resolve(process.cwd(), 'public/uploads/avatars', fileName);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {}

    if (isS3Configured()) {
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: `avatars/${fileName}`,
          })
        );
      } catch {}
    }
  }

  await clearPending2FASetup(userId);
  await deleteUserPreferences(userId);

  return deleteUserById(userId);
}
