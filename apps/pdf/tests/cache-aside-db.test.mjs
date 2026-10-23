import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { pool } from '../dist/config/database.config.js';
import { checkRedisConnection, redis } from '../dist/config/redis.config.js';
import { cacheService } from '../dist/services/cache.service.js';
import { getUserOrganization, invalidateUserOrgCache } from '../dist/services/organization.service.js';
import {
  findUserByEmail,
  findUserById,
  findUserByUsername,
  invalidateUserCache,
  updateUserAvatar,
  updateUserEmail,
  updateUserUsername,
} from '../dist/services/user.service.js';

describe('Milestone 2 - Cache Architecture & Database Optimization Suite', () => {
  const testUserId = '50e0819a-7151-433c-8797-613f6cbf0b6a';
  const testEmail = 'admin@example.com';
  const testUsername = 'aurora_admin';

  before(async () => {
    await checkRedisConnection();
    await invalidateUserCache(testUserId, { email: testEmail, username: testUsername });
    await invalidateUserOrgCache(testUserId);
  });

  after(async () => {
    await invalidateUserCache(testUserId, { email: testEmail, username: testUsername });
    await invalidateUserOrgCache(testUserId);
    await pool.end();
    if (redis.status === 'ready') {
      redis.disconnect(false);
    }
  });

  it('CacheService: basic get, set, del and remember methods work accurately', async () => {
    const key = `cache:test:item:${Date.now()}`;
    assert.strictEqual(await cacheService.get(key), undefined);

    await cacheService.set(key, { message: 'aurora_cache_ok' }, 60);
    const retrieved = await cacheService.get(key);
    assert.deepStrictEqual(retrieved, { message: 'aurora_cache_ok' });

    await cacheService.del(key);
    assert.strictEqual(await cacheService.get(key), undefined);

    let fetchCount = 0;
    const computeValue = async () => {
      fetchCount += 1;
      return { count: fetchCount };
    };

    const remKey = `cache:test:remember:${Date.now()}`;
    const firstCall = await cacheService.remember(remKey, 60, computeValue);
    assert.deepStrictEqual(firstCall, { count: 1 });
    assert.strictEqual(fetchCount, 1);

    const secondCall = await cacheService.remember(remKey, 60, computeValue);
    assert.deepStrictEqual(secondCall, { count: 1 });
    assert.strictEqual(fetchCount, 1);

    await cacheService.del(remKey);
  });

  it('Cache-Aside: findUserById caches user in Redis and serves subsequent hits from cache', async () => {
    await invalidateUserCache(testUserId);
    const cacheKey = cacheService.CACHE_KEYS.userById(testUserId);

    const cachedBefore = await redis.get(cacheKey);
    assert.strictEqual(cachedBefore, null);

    const user1 = await findUserById(testUserId);
    assert.ok(user1);
    assert.strictEqual(user1.id, testUserId);

    const cachedAfter = await redis.get(cacheKey);
    assert.ok(cachedAfter);
    const parsedCache = JSON.parse(cachedAfter);
    assert.strictEqual(parsedCache.id, testUserId);

    const user2 = await findUserById(testUserId);
    assert.ok(user2);
    assert.strictEqual(user2.id, testUserId);
    assert.strictEqual(user2.email, user1.email);
  });

  it('Cache-Aside: findUserByEmail caches user email index and resolves from cache', async () => {
    await invalidateUserCache(testUserId, { email: testEmail });
    const emailKey = cacheService.CACHE_KEYS.userEmail(testEmail);

    const emailBefore = await redis.get(emailKey);
    assert.strictEqual(emailBefore, null);

    const userByEmail = await findUserByEmail(testEmail);
    assert.ok(userByEmail);
    assert.strictEqual(userByEmail.id, testUserId);

    const emailAfter = await redis.get(emailKey);
    assert.ok(emailAfter);
    assert.strictEqual(JSON.parse(emailAfter), testUserId);

    const userByEmailCached = await findUserByEmail(testEmail);
    assert.ok(userByEmailCached);
    assert.strictEqual(userByEmailCached.id, testUserId);
  });

  it('Cache-Aside: findUserByUsername caches username index and resolves from cache', async () => {
    await invalidateUserCache(testUserId, { username: testUsername });
    const usernameKey = cacheService.CACHE_KEYS.userUsername(testUsername);

    const usernameBefore = await redis.get(usernameKey);
    assert.strictEqual(usernameBefore, null);

    const userByName = await findUserByUsername(testUsername);
    assert.ok(userByName);
    assert.strictEqual(userByName.id, testUserId);

    const usernameAfter = await redis.get(usernameKey);
    assert.ok(usernameAfter);
    assert.strictEqual(JSON.parse(usernameAfter), testUserId);
  });

  it('Atomic Invalidation: user update mutations purge cached user entries', async () => {
    const user = await findUserById(testUserId);
    assert.ok(user);
    const originalAvatar = user.avatar_url;
    const newAvatar = `/uploads/avatars/test-avatar-${Date.now()}.png`;

    await updateUserAvatar(testUserId, newAvatar);
    const updated = await findUserById(testUserId);
    assert.ok(updated);
    assert.strictEqual(updated.avatar_url, newAvatar);

    await updateUserAvatar(testUserId, originalAvatar);
    const restored = await findUserById(testUserId);
    assert.ok(restored);
    assert.strictEqual(restored.avatar_url, originalAvatar);
  });

  it('Atomic Invalidation: updateUserUsername purges both old and new username cache keys', async () => {
    const original = testUsername;
    const tempUsername = `admin_tmp_${Date.now()}`;

    await updateUserUsername(testUserId, tempUsername);
    const cacheKeyOld = cacheService.CACHE_KEYS.userUsername(original);
    const oldCached = await redis.get(cacheKeyOld);
    assert.strictEqual(oldCached, null, 'Old username cache must be deleted');

    const freshUser = await findUserById(testUserId);
    assert.strictEqual(freshUser.username, tempUsername);

    await updateUserUsername(testUserId, original);
    const restoredUser = await findUserById(testUserId);
    assert.strictEqual(restoredUser.username, original);
  });

  it('Cache-Aside: getUserOrganization caches in user:org and invalidates on update', async () => {
    await invalidateUserOrgCache(testUserId);
    const orgKey = cacheService.CACHE_KEYS.userOrg(testUserId);

    const orgBefore = await redis.get(orgKey);
    assert.strictEqual(orgBefore, null);

    const orgData = await getUserOrganization(testUserId);
    const orgAfter = await redis.get(orgKey);
    assert.ok(orgAfter !== null, 'Org lookup must populate cache (or null sentinel)');

    await invalidateUserOrgCache(testUserId);
    const orgInvalidated = await redis.get(orgKey);
    assert.strictEqual(orgInvalidated, null, 'invalidateUserOrgCache must purge org cache');
  });

  it('Auth Middleware: duplicate getUserOrganization call is removed', () => {
    const middlewareSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/middlewares/auth.middleware.ts'),
      'utf8'
    );
    assert.ok(
      !middlewareSource.includes('getUserOrganization'),
      'auth.middleware.ts must NOT call getUserOrganization directly'
    );
    assert.ok(
      middlewareSource.includes('getSessionUser'),
      'auth.middleware.ts must rely on getSessionUser'
    );
  });

  it('Database Schema: composite indexes and deduplicated indexes in db_identity.sql', () => {
    const dbSqlPath = fs.existsSync(path.resolve(process.cwd(), 'database/db_identity.sql'))
      ? path.resolve(process.cwd(), 'database/db_identity.sql')
      : path.resolve(process.cwd(), '../../database/db_identity.sql');
    const sqlContent = fs.readFileSync(dbSqlPath, 'utf8');

    assert.ok(
      sqlContent.includes('idx_org_members_user_status (user_id, status, organization_id, role)'),
      'organization_members must have composite covering index'
    );
    assert.ok(
      sqlContent.includes('idx_org_members_org_status (organization_id, status)'),
      'organization_members must have org_status composite index'
    );
    assert.ok(
      sqlContent.includes('idx_org_domains_org_created (organization_id, created_at)'),
      'organization_domains must have composite ordering index'
    );
    assert.ok(
      !sqlContent.includes('INDEX idx_org_domains_domain'),
      'Redundant idx_org_domains_domain must be removed'
    );
    assert.ok(
      sqlContent.includes('idx_edu_domains_active_lookup (is_active, domain, school_name)'),
      'educational_partner_domains must have covering active lookup index'
    );
    assert.ok(
      !sqlContent.includes('INDEX idx_edu_domains_domain'),
      'Redundant idx_edu_domains_domain must be removed'
    );
    assert.ok(
      sqlContent.includes('idx_student_verifications_user_created (user_id, created_at)'),
      'student_verifications must have composite user_created index'
    );
    assert.ok(
      sqlContent.includes('idx_user_workflows_user_created (user_id, created_at)'),
      'user_workflows must have composite user_created index'
    );
    assert.ok(
      sqlContent.includes('idx_purchases_user_created (user_id, created_at)'),
      'purchases must have composite user_created index'
    );
  });

  it('Master Rule 11: Zero inline DDL in TypeScript files under src/', () => {
    const checkDir = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          checkDir(full);
        } else if (e.name.endsWith('.ts')) {
          const content = fs.readFileSync(full, 'utf8');
          const ddlMatches = content.match(/\b(CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+INDEX|DROP\s+INDEX)\b/i);
          assert.strictEqual(ddlMatches, null, `Prohibited inline DDL found in: ${full}`);
        }
      }
    };
    checkDir(path.resolve(process.cwd(), 'src'));
  });
});
