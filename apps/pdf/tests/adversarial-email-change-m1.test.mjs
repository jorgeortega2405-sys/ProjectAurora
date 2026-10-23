import assert from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { pool } from '../dist/config/database.config.js';
import { checkRedisConnection, redis } from '../dist/config/redis.config.js';
import { handleRequestEmailChangeCode } from '../dist/controllers/settings.controller.js';
import { requestEmailChangeCode } from '../dist/services/settings.service.js';
import { deleteEmailChangeCode, getEmailChangeCode, saveEmailChangeCode, updateEmailChangeCodeLastSent, verifyEmailChangeCode } from '../dist/services/verification.service.js';

describe('Adversarial Milestone 1: Verification Code Cooldown, Reuse and Lockout', () => {
  const testUserId = '50e0819a-7151-433c-8797-613f6cbf0b6a';
  const testEmail = 'admin@example.com';
  const lockoutUserId = 'adversarial-lockout-user-1111';
  const lockoutEmail = 'lockout@example.com';

  before(async () => {
    await checkRedisConnection();
    await deleteEmailChangeCode(testUserId);
    await deleteEmailChangeCode(lockoutUserId);
  });

  after(async () => {
    await deleteEmailChangeCode(testUserId);
    await deleteEmailChangeCode(lockoutUserId);
    await pool.end();
    if (redis.status === 'ready') {
      redis.disconnect(false);
    }
  });

  it('Cooldown Enforcement: Initial request generates code, rapid sequential calls within 60s reject with 429 and retryAfter', async () => {
    await deleteEmailChangeCode(testUserId);

    const initial = await requestEmailChangeCode(testUserId, true);
    assert.strictEqual(initial.success, true);
    assert.strictEqual(initial.codePending, false);

    const storedInitial = await getEmailChangeCode(testUserId);
    assert.ok(storedInitial);
    assert.match(storedInitial.code, /^\d{6}$/);
    const initialCode = storedInitial.code;

    for (let i = 0; i < 5; i++) {
      const rejected = await requestEmailChangeCode(testUserId, true);
      assert.strictEqual(rejected.success, false);
      assert.strictEqual(rejected.status, 429);
      assert.ok(typeof rejected.retryAfter === 'number');
      assert.ok(rejected.retryAfter >= 1 && rejected.retryAfter <= 60);
      assert.strictEqual(rejected.cooldownRemaining, rejected.retryAfter);
      assert.match(rejected.error, /espera \d+ segundos/);
    }

    const currentStored = await getEmailChangeCode(testUserId);
    assert.ok(currentStored);
    assert.strictEqual(currentStored.code, initialCode);
  });

  it('Adversarial Burst Concurrency: 10 concurrent requests within cooldown window all reject with 429', async () => {
    const burstPromises = Array.from({ length: 10 }, () => requestEmailChangeCode(testUserId, true));
    const results = await Promise.all(burstPromises);

    for (const res of results) {
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.status, 429);
      assert.ok(typeof res.retryAfter === 'number');
      assert.ok(res.retryAfter >= 1 && res.retryAfter <= 60);
    }

    const stored = await getEmailChangeCode(testUserId);
    assert.ok(stored);
    assert.match(stored.code, /^\d{6}$/);
  });

  it('Modal Inspection: isResend = false succeeds and reports codePending without triggering 429', async () => {
    const statusCheck = await requestEmailChangeCode(testUserId, false);
    assert.strictEqual(statusCheck.success, true);
    assert.strictEqual(statusCheck.codePending, true);
    assert.strictEqual(statusCheck.alreadyAuthorized, false);
  });

  it('Code Reuse within TTL: After cooldown expires, resend returns identical 6-digit code', async () => {
    const beforeCodePayload = await getEmailChangeCode(testUserId);
    assert.ok(beforeCodePayload);
    const expectedCode = beforeCodePayload.code;

    await updateEmailChangeCodeLastSent(testUserId, Date.now() - 65 * 1000);

    const resend = await requestEmailChangeCode(testUserId, true);
    assert.strictEqual(resend.success, true);
    assert.strictEqual(resend.codePending, true);

    const afterCodePayload = await getEmailChangeCode(testUserId);
    assert.ok(afterCodePayload);
    assert.strictEqual(afterCodePayload.code, expectedCode);
    assert.ok(afterCodePayload.lastSentAt > beforeCodePayload.lastSentAt);

    const immediateRejected = await requestEmailChangeCode(testUserId, true);
    assert.strictEqual(immediateRejected.success, false);
    assert.strictEqual(immediateRejected.status, 429);
    assert.ok(immediateRejected.retryAfter >= 50 && immediateRejected.retryAfter <= 60);
  });

  it('Multiple Cooldown Cycles: Code remains consistent across multiple consecutive resends', async () => {
    const existing = await getEmailChangeCode(testUserId);
    assert.ok(existing);
    const expectedCode = existing.code;

    await updateEmailChangeCodeLastSent(testUserId, Date.now() - 70 * 1000);
    const resend1 = await requestEmailChangeCode(testUserId, true);
    assert.strictEqual(resend1.success, true);
    assert.strictEqual((await getEmailChangeCode(testUserId)).code, expectedCode);

    await updateEmailChangeCodeLastSent(testUserId, Date.now() - 61 * 1000);
    const resend2 = await requestEmailChangeCode(testUserId, true);
    assert.strictEqual(resend2.success, true);
    assert.strictEqual((await getEmailChangeCode(testUserId)).code, expectedCode);
  });

  it('Lockout Progression: Failed attempts 1 to 4 decrement remaining attempts and retain code', async () => {
    await deleteEmailChangeCode(lockoutUserId);
    await saveEmailChangeCode(lockoutUserId, lockoutEmail, '987654', 900);

    for (let attempt = 1; attempt <= 4; attempt++) {
      const resWrong = await verifyEmailChangeCode(lockoutUserId, `00000${attempt}`);
      assert.strictEqual(resWrong.success, false);
      const remainingExpected = 5 - attempt;
      const expectedLabel = remainingExpected === 1 ? '1 intento' : `${remainingExpected} intentos`;
      assert.match(resWrong.error, new RegExp(`Te quedan ${expectedLabel}`));

      const item = await getEmailChangeCode(lockoutUserId);
      assert.ok(item);
      assert.strictEqual(item.attempts, attempt);
      assert.strictEqual(item.code, '987654');
    }
  });

  it('Lockout Threshold: Exactly the 5th failed attempt immediately purges code from memory and Redis', async () => {
    const resFinal = await verifyEmailChangeCode(lockoutUserId, '000005');
    assert.strictEqual(resFinal.success, false);
    assert.match(resFinal.error, /Demasiados intentos fallidos/);

    const immediateCheck = await getEmailChangeCode(lockoutUserId);
    assert.strictEqual(immediateCheck, null);

    if (redis.status === 'ready') {
      const redisDirectCheck = await redis.get(`email_change:${lockoutUserId}`);
      assert.strictEqual(redisDirectCheck, null);
    }

    const attempt6 = await verifyEmailChangeCode(lockoutUserId, '987654');
    assert.strictEqual(attempt6.success, false);
    assert.match(attempt6.error, /ha expirado o no existe/);
  });

  it('Post-Lockout Recovery: After code deletion, user can immediately create a fresh code', async () => {
    await saveEmailChangeCode(lockoutUserId, lockoutEmail, '112233', 900);
    const fresh = await getEmailChangeCode(lockoutUserId);
    assert.ok(fresh);
    assert.strictEqual(fresh.code, '112233');
    assert.strictEqual(fresh.attempts, 0);

    const res = await verifyEmailChangeCode(lockoutUserId, '112233');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.token, 'authorized');

    const purged = await getEmailChangeCode(lockoutUserId);
    assert.strictEqual(purged, null);
  });

  it('HTTP Controller Contract: handleRequestEmailChangeCode emits 429 status and Retry-After header', async () => {
    await deleteEmailChangeCode(testUserId);

    const headers = {};
    let statusCode = 200;
    let jsonBody = null;

    const mockRes = {
      getHeader(name) {
        return headers[name.toLowerCase()] || headers[name];
      },
      json(body) {
        jsonBody = body;
        return this;
      },
      setHeader(name, val) {
        headers[name.toLowerCase()] = val;
        headers[name] = val;
      },
      status(code) {
        statusCode = code;
        return this;
      },
    };

    const mockReq = {
      _cachedMultiAccountSession: {
        accounts: [{ email: testEmail, id: testUserId, role: 'USER', username: 'admin' }],
        activeId: testUserId,
      },
      body: { resend: true },
      cookies: {},
    };

    await handleRequestEmailChangeCode(mockReq, mockRes);
    assert.strictEqual(statusCode, 200);
    assert.strictEqual(jsonBody.ok, true);

    await handleRequestEmailChangeCode(mockReq, mockRes);
    assert.strictEqual(statusCode, 429);
    assert.strictEqual(jsonBody.ok, false);
    assert.ok(typeof jsonBody.retryAfter === 'number');
    assert.strictEqual(jsonBody.cooldownRemaining, jsonBody.retryAfter);
    assert.strictEqual(mockRes.getHeader('Retry-After'), String(jsonBody.retryAfter));
  });
});
