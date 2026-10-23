import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { pool } from '../dist/config/database.config.js';
import { checkRedisConnection, redis } from '../dist/config/redis.config.js';
import { CACHE_KEYS, CACHE_TTL, cacheService } from '../dist/services/cache.service.js';
import { getUserOrganization, invalidateUserOrg, invalidateUserOrgCache, updateMemberRole } from '../dist/services/organization.service.js';
import {
  disableUser2FA,
  enableUser2FA,
  findUserByEmail,
  findUserById,
  findUserByUsername,
  invalidateUser,
  invalidateUserCache,
  updateUserAvatar,
  updateUserEmail,
  updateUserPassword,
  updateUserUsername,
} from '../dist/services/user.service.js';

describe('Redis Cache-Aside, Atomic Invalidation & Fail-Open Architecture', () => {
  const testUserId = crypto.randomUUID();
  const testEmail = `cache_test_${Date.now()}@aurora-cache.test`;
  const testUsername = `cache_usr_${Date.now().toString(36)}`;
  const testOrgId = crypto.randomUUID();
  const testOrgMemberId = crypto.randomUUID();

  before(async () => {
    await checkRedisConnection();

    await pool.query(
      'INSERT INTO users (id, username, email, password_hash, role, two_factor_enabled) VALUES (?, ?, ?, ?, ?, ?)',
      [testUserId, testUsername, testEmail, 'initial_hash_123', 'USER', 0]
    );

    await pool.query(
      'INSERT INTO organizations (id, name, slug, owner_id, seat_limit, org_type, subscription_status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [testOrgId, 'Test Cache Org', `cache-org-${Date.now()}`, testUserId, 10, 'business', 'active']
    );

    await pool.query(
      'INSERT INTO organization_members (id, organization_id, user_id, role, status) VALUES (?, ?, ?, ?, ?)',
      [testOrgMemberId, testOrgId, testUserId, 'ORG_OWNER', 'active']
    );

    await invalidateUser(testUserId, testEmail, testUsername);
    await invalidateUserOrg(testUserId);
  });

  after(async () => {
    await invalidateUser(testUserId, testEmail, testUsername);
    await invalidateUserOrg(testUserId);

    try {
      await pool.query('DELETE FROM organization_members WHERE organization_id = ?', [testOrgId]);
      await pool.query('DELETE FROM organizations WHERE id = ?', [testOrgId]);
      await pool.query('DELETE FROM users WHERE id = ?', [testUserId]);
    } catch {}

    await pool.end();
    if (redis.status === 'ready') {
      redis.disconnect(false);
    }
  });

  it('1. Cache miss fetches from DB and populates cache with correct TTL', async () => {
    await invalidateUser(testUserId, testEmail, testUsername);
    const idKey = CACHE_KEYS.userById(testUserId);
    const emailKey = CACHE_KEYS.userEmail(testEmail);
    const usernameKey = CACHE_KEYS.userUsername(testUsername);

    assert.strictEqual(await redis.get(idKey), null);
    assert.strictEqual(await redis.get(emailKey), null);
    assert.strictEqual(await redis.get(usernameKey), null);

    const user = await findUserById(testUserId);
    assert.ok(user, 'User must be fetched from DB');
    assert.strictEqual(user.id, testUserId);

    const cachedUserRaw = await redis.get(idKey);
    assert.ok(cachedUserRaw, 'Redis must be populated after DB fetch');
    const cachedUser = JSON.parse(cachedUserRaw);
    assert.strictEqual(cachedUser.id, testUserId);

    const ttlId = await redis.ttl(idKey);
    assert.ok(ttlId > 0 && ttlId <= CACHE_TTL.userById, `TTL must be <= ${CACHE_TTL.userById}s (got ${ttlId})`);

    const cachedEmailId = await redis.get(emailKey);
    assert.strictEqual(JSON.parse(cachedEmailId), testUserId);
    const ttlEmail = await redis.ttl(emailKey);
    assert.ok(ttlEmail > 0 && ttlEmail <= CACHE_TTL.userEmail, `TTL must be <= ${CACHE_TTL.userEmail}s (got ${ttlEmail})`);

    const cachedUsernameId = await redis.get(usernameKey);
    assert.strictEqual(JSON.parse(cachedUsernameId), testUserId);
    const ttlUsername = await redis.ttl(usernameKey);
    assert.ok(ttlUsername > 0 && ttlUsername <= CACHE_TTL.userUsername, `TTL must be <= ${CACHE_TTL.userUsername}s (got ${ttlUsername})`);
  });

  it('2. Cache hit returns cached data without calling DB fetcher', async () => {
    let dbCallCount = 0;
    const fetcher = async () => {
      dbCallCount += 1;
      return { data: 'test_payload', counter: dbCallCount };
    };

    const testKey = `cache:test:hit:${Date.now()}`;
    const firstResult = await cacheService.remember(testKey, 120, fetcher);
    assert.deepStrictEqual(firstResult, { data: 'test_payload', counter: 1 });
    assert.strictEqual(dbCallCount, 1);

    const secondResult = await cacheService.remember(testKey, 120, fetcher);
    assert.deepStrictEqual(secondResult, { data: 'test_payload', counter: 1 });
    assert.strictEqual(dbCallCount, 1, 'DB fetcher must not be called on cache hit');

    const rawCache = await redis.get(testKey);
    assert.deepStrictEqual(JSON.parse(rawCache), { data: 'test_payload', counter: 1 });
    await cacheService.del(testKey);

    await findUserById(testUserId);

    const originalQuery = pool.query;
    let poolQueryCalls = 0;
    pool.query = async function (...args) {
      poolQueryCalls += 1;
      return originalQuery.apply(this, args);
    };

    try {
      const preCalls = poolQueryCalls;
      const hitUser = await findUserById(testUserId);
      assert.ok(hitUser);
      assert.strictEqual(hitUser.id, testUserId);
      assert.strictEqual(poolQueryCalls, preCalls, 'pool.query must NOT be executed on cache hit for findUserById');
    } finally {
      pool.query = originalQuery;
    }
  });

  it('3. Mutations trigger atomic cache invalidation (avatar, username, email, password, 2fa)', async () => {
    const user = await findUserById(testUserId);
    assert.ok(user);
    const originalAvatar = user.avatar_url;
    const tempAvatar = `/uploads/avatars/unit-test-${Date.now()}.png`;

    await updateUserAvatar(testUserId, tempAvatar);
    const userAfterAvatar = await findUserById(testUserId);
    assert.strictEqual(userAfterAvatar.avatar_url, tempAvatar);
    await updateUserAvatar(testUserId, originalAvatar);

    const originalUsername = testUsername;
    const tempUsername = `temp_usr_${Date.now().toString(36)}`;
    await updateUserUsername(testUserId, tempUsername);

    const oldUsernameKey = CACHE_KEYS.userUsername(originalUsername);
    const oldUsernameVal = await redis.get(oldUsernameKey);
    assert.strictEqual(oldUsernameVal, null, 'Old username cache must be invalidated');

    const freshUserByName = await findUserByUsername(tempUsername);
    assert.ok(freshUserByName);
    assert.strictEqual(freshUserByName.id, testUserId);

    await updateUserUsername(testUserId, originalUsername);
    const restoredUser = await findUserById(testUserId);
    assert.strictEqual(restoredUser.username, originalUsername);

    const originalEmail = testEmail;
    const tempEmail = `temp_email_${Date.now()}@aurora-cache.test`;
    await updateUserEmail(testUserId, tempEmail);

    const oldEmailKey = CACHE_KEYS.userEmail(originalEmail);
    const oldEmailVal = await redis.get(oldEmailKey);
    assert.strictEqual(oldEmailVal, null, 'Old email cache must be invalidated');

    const freshUserByEmail = await findUserByEmail(tempEmail);
    assert.ok(freshUserByEmail);
    assert.strictEqual(freshUserByEmail.id, testUserId);

    await updateUserEmail(testUserId, originalEmail);
    const restoredEmailUser = await findUserById(testUserId);
    assert.strictEqual(restoredEmailUser.email, originalEmail);

    const pwdHash = user.password_hash;
    await updateUserPassword(testUserId, 'new_fake_hash_value');
    const userAfterPwd = await findUserById(testUserId);
    assert.strictEqual(userAfterPwd.password_hash, 'new_fake_hash_value');
    await updateUserPassword(testUserId, pwdHash);

    await enableUser2FA(testUserId, 'TESTSECRET2FA', ['backup1', 'backup2']);
    const user2FA = await findUserById(testUserId);
    assert.strictEqual(user2FA.two_factor_enabled, true);
    await disableUser2FA(testUserId);
    const userNo2FA = await findUserById(testUserId);
    assert.strictEqual(userNo2FA.two_factor_enabled, false);
  });

  it('4. Organization Cache-Aside: getUserOrganization caches and invalidates on membership changes', async () => {
    await invalidateUserOrg(testUserId);
    const orgKey = CACHE_KEYS.userOrg(testUserId);

    assert.strictEqual(await redis.get(orgKey), null);
    const org = await getUserOrganization(testUserId);
    assert.ok(org, 'Org must be fetched from DB');
    assert.strictEqual(org.organization.id, testOrgId);

    const orgCached = await redis.get(orgKey);
    assert.ok(orgCached !== null, 'Org lookup must populate cache');

    const ttlOrg = await redis.ttl(orgKey);
    assert.ok(ttlOrg > 0 && ttlOrg <= CACHE_TTL.userOrg, `Org TTL must be <= ${CACHE_TTL.userOrg}s`);

    const updatedMember = await updateMemberRole(testOrgId, testOrgMemberId, 'ORG_ADMIN');
    assert.ok(updatedMember);
    assert.strictEqual(updatedMember.role, 'ORG_ADMIN');

    const orgAfterRoleUpdate = await redis.get(orgKey);
    assert.strictEqual(orgAfterRoleUpdate, null, 'Updating member role must invalidate user org cache');

    await getUserOrganization(testUserId);
    assert.ok((await redis.get(orgKey)) !== null);

    await invalidateUserOrg(testUserId);
    assert.strictEqual(await redis.get(orgKey), null, 'invalidateUserOrg must delete org cache');

    await getUserOrganization(testUserId);
    assert.ok((await redis.get(orgKey)) !== null);
    await invalidateUserOrgCache(testUserId);
    assert.strictEqual(await redis.get(orgKey), null, 'invalidateUserOrgCache must delete org cache');
  });

  it('5. Fail-open resilience: simulated Redis errors/timeouts do not crash requests and log via logger.db.warn', async () => {
    const originalGet = redis.get;
    const originalSetex = redis.setex;
    const originalDel = redis.del;

    let getFailures = 0;
    let setFailures = 0;
    let delFailures = 0;

    redis.get = async function () {
      getFailures += 1;
      throw new Error('ECONNREFUSED simulated Redis failure');
    };
    redis.setex = async function () {
      setFailures += 1;
      throw new Error('ETIMEDOUT simulated Redis timeout');
    };
    redis.del = async function () {
      delFailures += 1;
      throw new Error('CLUSTERDOWN simulated Redis error');
    };

    try {
      const getResult = await cacheService.get('cache:simulated:key');
      assert.strictEqual(getResult, undefined, 'cacheService.get must fail open and return undefined');
      assert.strictEqual(getFailures, 1);

      const setResult = await cacheService.set('cache:simulated:key', { test: true }, 60);
      assert.strictEqual(setResult, false, 'cacheService.set must fail open and return false');
      assert.strictEqual(setFailures, 1);

      const delResult = await cacheService.del('cache:simulated:key');
      assert.strictEqual(delResult, false, 'cacheService.del must fail open and return false');
      assert.strictEqual(delFailures, 1);

      let fetcherExecuted = false;
      const rememberResult = await cacheService.remember('cache:simulated:key', 60, async () => {
        fetcherExecuted = true;
        return { resilient: true };
      });
      assert.deepStrictEqual(rememberResult, { resilient: true }, 'remember must return fetcher result during outage');
      assert.strictEqual(fetcherExecuted, true);

      const user = await findUserById(testUserId);
      assert.ok(user, 'findUserById must succeed gracefully even when Redis is down');
      assert.strictEqual(user.id, testUserId);
    } finally {
      redis.get = originalGet;
      redis.setex = originalSetex;
      redis.del = originalDel;
    }

    const today = new Date().toISOString().split('T')[0];
    const logPath = path.resolve(process.cwd(), `logs/db-${today}.log`);
    assert.ok(fs.existsSync(logPath), `Log file ${logPath} must exist`);
    const logContent = fs.readFileSync(logPath, 'utf8');
    assert.ok(
      logContent.includes('Error al leer de caché Redis (fail-open)'),
      'Fail-open error must be logged via logger.db.warn'
    );
    assert.ok(
      logContent.includes('ECONNREFUSED'),
      'Log must contain error context'
    );
  });

  it('6. Middleware and DB schema integrity verification', () => {
    const middlewareSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/middlewares/auth.middleware.ts'),
      'utf8'
    );
    assert.ok(
      !middlewareSource.includes('getUserOrganization'),
      'auth.middleware.ts must NOT call getUserOrganization directly'
    );

    const sqlContent = fs.readFileSync(
      path.resolve(process.cwd(), 'database/db_identity.sql'),
      'utf8'
    );

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
      sqlContent.includes('idx_student_verifications_status_created (status, created_at)'),
      'student_verifications must have composite status_created index'
    );
    assert.ok(
      sqlContent.includes('idx_user_workflows_user_created (user_id, created_at)'),
      'user_workflows must have composite user_created index'
    );
    assert.ok(
      sqlContent.includes('idx_purchases_user_created (user_id, created_at)'),
      'purchases must have composite user_created index'
    );

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
