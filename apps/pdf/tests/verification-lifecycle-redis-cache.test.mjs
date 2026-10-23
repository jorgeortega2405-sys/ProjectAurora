import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { pool } from '../dist/config/database.config.js';
import { checkRedisConnection, redis } from '../dist/config/redis.config.js';
import { invalidateUserOrgCache } from '../dist/services/organization.service.js';
import { requestEmailChangeCode } from '../dist/services/settings.service.js';
import { findUserById, invalidateUserCache } from '../dist/services/user.service.js';
import {
  deleteEmailChangeCode,
  getEmailChangeCode,
  saveEmailChangeCode,
  touchEmailChangeCodeSentAt,
  verifyEmailChangeCode,
} from '../dist/services/verification.service.js';

describe('Project Aurora Security, Redis Cache & Verification Optimization Suite', () => {
  const testUserId = '50e0819a-7151-433c-8797-613f6cbf0b6a';
  const testEmail = 'admin@example.com';
  const PDF_DIR = fs.existsSync(path.resolve(process.cwd(), 'apps/pdf')) ? path.resolve(process.cwd(), 'apps/pdf') : process.cwd();

  before(async () => {
    await checkRedisConnection();
    await deleteEmailChangeCode(testUserId);
  });

  after(async () => {
    await deleteEmailChangeCode(testUserId);
    await pool.end();
    if (redis.status === 'ready') {
      redis.disconnect(false);
    }
  });

  it('R1: Verification code lifecycle - Saves active code with lastSentAt and retrieves cleanly', async () => {
    await deleteEmailChangeCode(testUserId);
    const beforeGet = await getEmailChangeCode(testUserId);
    assert.strictEqual(beforeGet, null, 'Must be null before saving');

    await saveEmailChangeCode(testUserId, testEmail, '123456', 900);
    const payload = await getEmailChangeCode(testUserId);
    assert.ok(payload, 'Must return payload for active code');
    assert.strictEqual(payload.code, '123456');
    assert.strictEqual(payload.attempts, 0);
    assert.strictEqual(payload.currentEmail, testEmail);
    assert.ok(payload.createdAt > 0);
    assert.ok(payload.lastSentAt > 0);
    assert.ok(payload.expiresAt > Date.now());
  });

  it('R1: Verification code lifecycle - Multiple requests reuse the same active code within TTL', async () => {
    const existing = await getEmailChangeCode(testUserId);
    assert.ok(existing, 'Existing code must be present');
    const originalCode = existing.code;

    const resRepeat = await requestEmailChangeCode(testUserId, false);
    assert.strictEqual(resRepeat.success, true);
    assert.strictEqual(resRepeat.codePending, true);

    const checkStillSame = await getEmailChangeCode(testUserId);
    assert.strictEqual(checkStillSame.code, originalCode, 'Code must not change on repeated edit clicks');
  });

  it('R1: Verification code lifecycle - Concurrent simultaneous requests for the same userId do not race', async () => {
    const concurrentUserId = '50e0819a-7151-433c-8797-613f6cbf0b6a';
    await deleteEmailChangeCode(concurrentUserId);
    await saveEmailChangeCode(concurrentUserId, testEmail, '654321', 900);

    const results = await Promise.all([
      requestEmailChangeCode(concurrentUserId, false),
      requestEmailChangeCode(concurrentUserId, false),
      requestEmailChangeCode(concurrentUserId, false),
      requestEmailChangeCode(concurrentUserId, false),
      requestEmailChangeCode(concurrentUserId, false),
    ]);

    for (const res of results) {
      assert.strictEqual(res.success, true);
    }

    const active = await getEmailChangeCode(concurrentUserId);
    assert.ok(active);
    assert.ok(/^\d{6}$/.test(active.code));
  });

  it('R1: Verification code lifecycle - Explicit resend within 60s cooldown is rejected with 429', async () => {
    const resendAttempt = await requestEmailChangeCode(testUserId, true);
    assert.strictEqual(resendAttempt.success, false);
    assert.strictEqual(resendAttempt.status, 429);
    assert.ok(resendAttempt.cooldownRemaining > 0 && resendAttempt.cooldownRemaining <= 60);
    assert.ok(resendAttempt.error.includes('segundos'));
  });

  it('R1: Verification code lifecycle - touchEmailChangeCodeSentAt updates timestamp and preserves code', async () => {
    const original = await getEmailChangeCode(testUserId);
    assert.ok(original);
    const originalCode = original.code;

    await new Promise((r) => setTimeout(r, 10));
    const touched = await touchEmailChangeCodeSentAt(testUserId);
    assert.strictEqual(touched, true);

    const updated = await getEmailChangeCode(testUserId);
    assert.strictEqual(updated.code, originalCode);
    assert.ok(updated.lastSentAt >= original.lastSentAt);
  });

  it('R1: Verification code lifecycle - Reaching 5 failed attempts invalidates code immediately', async () => {
    const failUserId = 'fail-test-user-9999';
    await saveEmailChangeCode(failUserId, 'fail@example.com', '654321', 900);

    for (let i = 1; i <= 4; i++) {
      const resWrong = await verifyEmailChangeCode(failUserId, '000000');
      assert.strictEqual(resWrong.success, false);
      assert.ok(resWrong.error.includes(`Te quedan ${5 - i}`));
    }

    const resFinal = await verifyEmailChangeCode(failUserId, '000000');
    assert.strictEqual(resFinal.success, false);
    assert.ok(resFinal.error.includes('Demasiados intentos fallidos'));

    const deadPayload = await getEmailChangeCode(failUserId);
    assert.strictEqual(deadPayload, null, 'Code must be completely purged after max attempts');
  });

  it('R1: Verification code lifecycle - Correct code verification consumes token and purges code', async () => {
    const validUserId = 'valid-test-user-8888';
    await saveEmailChangeCode(validUserId, 'valid@example.com', '777888', 900);

    const res = await verifyEmailChangeCode(validUserId, '777888');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.token, 'authorized');

    const purged = await getEmailChangeCode(validUserId);
    assert.strictEqual(purged, null, 'Code must be deleted upon successful consumption');
  });

  it('R2: Redis Cache-Aside - invalidateUserCache and invalidateUserOrgCache clear Redis entries', async () => {
    if (redis.status === 'ready') {
      const dummyUserId = 'redis-cache-dummy-1';
      await redis.setex(`user:cache:${dummyUserId}`, 300, JSON.stringify({ id: dummyUserId, username: 'dummy' }));
      await redis.setex(`user:org:${dummyUserId}`, 300, JSON.stringify({ memberRole: 'ORG_MEMBER' }));

      const cachedUserBefore = await redis.get(`user:cache:${dummyUserId}`);
      assert.ok(cachedUserBefore);

      await invalidateUserCache(dummyUserId);
      const cachedUserAfter = await redis.get(`user:cache:${dummyUserId}`);
      assert.strictEqual(cachedUserAfter, null, 'User cache must be invalidated');

      await invalidateUserOrgCache(dummyUserId);
      const cachedOrgAfter = await redis.get(`user:org:${dummyUserId}`);
      assert.strictEqual(cachedOrgAfter, null, 'Org cache must be invalidated');
    }
  });

  it('R3: Master Rules - Zero id attributes in settings HTML templates', () => {
    const accountHtml = fs.readFileSync(path.resolve(PDF_DIR, 'public/views/settings/your-account.html'), 'utf8');
    assert.ok(!accountHtml.includes('id="'), 'Must not contain any id attributes');
    assert.ok(accountHtml.includes('data-ref="btn-edit-email"'));
    assert.ok(accountHtml.includes('data-ref="display-email"'));
  });

  it('R3: Master Rules - Zero prohibited console.* statements across src and client (except websocket)', () => {
    const checkDir = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          checkDir(full);
        } else if ((e.name.endsWith('.ts') || e.name.endsWith('.js')) && !full.includes('websocket.service.ts')) {
          const content = fs.readFileSync(full, 'utf8');
          const matches = content.match(/console\.(log|warn|error|info|debug)\s*\(/g);
          assert.strictEqual(
            matches,
            null,
            `Prohibited console statement in: ${full}`
          );
        }
      }
    };
    checkDir(path.resolve(PDF_DIR, 'src'));
    checkDir(path.resolve(PDF_DIR, 'client'));
  });

  it('R3: Master Rules - Strict PBAC in client api.service.ts without direct subscription_tier string comparison', () => {
    const apiServiceTs = fs.readFileSync(path.resolve(PDF_DIR, 'client/services/api.service.ts'), 'utf8');
    assert.ok(!apiServiceTs.includes("tier === 'enterprise'"), 'Must not authorize by subscription_tier string directly');
    assert.ok(!apiServiceTs.includes("tier === 'pro'"), 'Must not authorize by subscription_tier string directly');
    assert.ok(apiServiceTs.includes('perms.includes(permission)'), 'Must check permission arrays via PBAC');
  });
});
