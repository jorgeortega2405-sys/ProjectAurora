import { redis } from '../config/redis.config.js';
import { logger } from './logger.service.js';

export const CACHE_KEYS = {
  eduPartnerDomains: () => 'cache:edu:partner_domains',
  rolePerms: (role: string) => `cache:role:perms:${role}`,
  userBilling: (userId: string) => `cache:user:billing:${userId}`,
  userById: (userId: string) => `cache:user:id:${userId}`,
  userEmail: (email: string) => `cache:user:email:${email.toLowerCase().trim()}`,
  userOrg: (userId: string) => `cache:user:org:${userId}`,
  userPerms: (userId: string) => `cache:user:perms:${userId}`,
  userPrefs: (userId: string) => `cache:user:prefs:${userId}`,
  userUsername: (username: string) => `cache:user:username:${username.toLowerCase().trim()}`,
};

export const CACHE_TTL = {
  eduPartnerDomains: 86400,
  rolePerms: 3600,
  userBilling: 300,
  userById: 300,
  userEmail: 300,
  userOrg: 300,
  userPerms: 300,
  userPrefs: 600,
  userUsername: 300,
};

export async function get<T>(key: string): Promise<T | null | undefined> {
  try {
    const raw = await redis.get(key);
    if (raw === null || raw === undefined) {
      return undefined;
    }
    if (raw === 'null' || raw === '__AURORA_NULL__') {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.db.warn('Error al leer de caché Redis (fail-open)', {
      error: err instanceof Error ? err.message : String(err),
      key,
    });
    return undefined;
  }
}

export async function set(key: string, value: unknown, ttlSeconds = 300): Promise<boolean> {
  try {
    const serialized = value === null || value === undefined ? 'null' : JSON.stringify(value);
    await redis.setex(key, ttlSeconds, serialized);
    return true;
  } catch (err) {
    logger.db.warn('Error al escribir en caché Redis (fail-open)', {
      error: err instanceof Error ? err.message : String(err),
      key,
    });
    return false;
  }
}

export async function del(...keys: string[]): Promise<boolean> {
  const validKeys = keys.filter(Boolean);
  if (validKeys.length === 0) {
    return false;
  }
  try {
    await redis.del(...validKeys);
    return true;
  } catch (err) {
    logger.db.warn('Error al invalidar caché Redis (fail-open)', {
      error: err instanceof Error ? err.message : String(err),
      keys: validKeys,
    });
    return false;
  }
}

export async function remember<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T | null>,
  nullTtlSeconds = 60
): Promise<T | null> {
  const cached = await get<T>(key);
  if (cached !== undefined) {
    return cached;
  }

  const fresh = await fetcher();
  await set(key, fresh, fresh === null ? nullTtlSeconds : ttlSeconds);
  return fresh;
}

export async function invalidateUser(
  userId: string,
  email?: string,
  username?: string
): Promise<void> {
  const keys = [
    CACHE_KEYS.userById(userId),
    `user:cache:${userId}`,
    CACHE_KEYS.userPerms(userId),
    CACHE_KEYS.userBilling(userId),
  ];
  if (email) {
    keys.push(CACHE_KEYS.userEmail(email));
  }
  if (username) {
    keys.push(CACHE_KEYS.userUsername(username));
  }
  await del(...keys);
}

export async function invalidateUserCache(
  userId: string,
  identifiers?: { email?: string; username?: string }
): Promise<void> {
  await invalidateUser(userId, identifiers?.email, identifiers?.username);
}

export async function invalidateUserOrg(userId: string): Promise<void> {
  await del(
    CACHE_KEYS.userOrg(userId),
    `user:org:${userId}`,
    CACHE_KEYS.userPerms(userId)
  );
}

export async function invalidateUserOrgCache(userId: string): Promise<void> {
  await invalidateUserOrg(userId);
}

export async function invalidateUserPrefs(userId: string): Promise<void> {
  await del(CACHE_KEYS.userPrefs(userId));
}

export async function invalidateRolePermsCache(role: string): Promise<void> {
  await del(CACHE_KEYS.rolePerms(role));
}

export const cacheService = {
  CACHE_KEYS,
  CACHE_TTL,
  del,
  get,
  invalidateRolePermsCache,
  invalidateUser,
  invalidateUserCache,
  invalidateUserOrg,
  invalidateUserOrgCache,
  invalidateUserPrefs,
  remember,
  set,
};
