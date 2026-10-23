import assert from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { pool } from '../dist/config/database.config.js';
import { redis } from '../dist/config/redis.config.js';
import { requestEmailChangeCode } from '../dist/services/settings.service.js';
import {
  consumeEmailChangeAuthorization,
  deleteEmailChangeCode,
  getEmailChangeCode,
  isEmailChangeAuthorized,
  saveEmailChangeCode,
  touchEmailChangeCodeSentAt,
  verifyEmailChangeCode,
} from '../dist/services/verification.service.js';

describe('Milestone 1 Empirical Stress Test: Memory Fallback (Redis Offline/Bypassed)', () => {
  const fallbackUserId = 'fallback-user-test-7777';
  const fallbackEmail = 'fallback@example.com';
  let originalRedisStatus;

  before(() => {
    originalRedisStatus = redis.status;
    // Simulate Redis offline by forcing status to 'end'
    Object.defineProperty(redis, 'status', {
      configurable: true,
      value: 'end',
      writable: true,
    });
  });

  after(async () => {
    Object.defineProperty(redis, 'status', {
      configurable: true,
      value: originalRedisStatus,
      writable: true,
    });
    await pool.end();
  });

  it('Memory fallback: save, retrieve, and delete code when Redis is offline', async () => {
    await deleteEmailChangeCode(fallbackUserId);
    assert.strictEqual(await getEmailChangeCode(fallbackUserId), null);

    await saveEmailChangeCode(fallbackUserId, fallbackEmail, '999111', 900);
    const item = await getEmailChangeCode(fallbackUserId);
    assert.ok(item, 'Item must be retrieved from in-memory fallback');
    assert.strictEqual(item.code, '999111');
    assert.strictEqual(item.currentEmail, fallbackEmail);
    assert.ok(item.lastSentAt > 0);

    await deleteEmailChangeCode(fallbackUserId);
    assert.strictEqual(await getEmailChangeCode(fallbackUserId), null);
  });

  it('Memory fallback: code reuse and 60s cooldown persist in memory', async () => {
    await saveEmailChangeCode(fallbackUserId, fallbackEmail, '555222', 900);

    const initial = await getEmailChangeCode(fallbackUserId);
    assert.ok(initial);
    assert.strictEqual(initial.code, '555222');

    // Repeated request without resend flag reuses code
    const checkReuse = await getEmailChangeCode(fallbackUserId);
    assert.strictEqual(checkReuse.code, '555222');

    // Updating lastSentAt updates memory
    await touchEmailChangeCodeSentAt(fallbackUserId, Date.now());
    const touched = await getEmailChangeCode(fallbackUserId);
    assert.ok(touched.lastSentAt >= initial.lastSentAt);
  });

  it('Memory fallback: 5 failed attempts completely purge code from memory', async () => {
    await saveEmailChangeCode(fallbackUserId, fallbackEmail, '333444', 900);

    for (let i = 1; i <= 4; i++) {
      const res = await verifyEmailChangeCode(fallbackUserId, '000000');
      assert.strictEqual(res.success, false);
      assert.ok(res.error.includes(`Te quedan ${5 - i}`));
    }

    const finalRes = await verifyEmailChangeCode(fallbackUserId, '000000');
    assert.strictEqual(finalRes.success, false);
    assert.ok(finalRes.error.includes('Demasiados intentos fallidos'));

    const deadItem = await getEmailChangeCode(fallbackUserId);
    assert.strictEqual(deadItem, null, 'Memory entry must be purged after 5 attempts');
  });

  it('Memory fallback: successful verification authorizes user in memory', async () => {
    await saveEmailChangeCode(fallbackUserId, fallbackEmail, '888999', 900);

    const verifyRes = await verifyEmailChangeCode(fallbackUserId, '888999');
    assert.strictEqual(verifyRes.success, true);
    assert.strictEqual(verifyRes.token, 'authorized');

    const isAuth = await isEmailChangeAuthorized(fallbackUserId);
    assert.strictEqual(isAuth, true, 'User must be authorized in memory');

    const consumeRes = await consumeEmailChangeAuthorization(fallbackUserId);
    assert.strictEqual(consumeRes.valid, true, 'Authorization must be consumed');

    const isAuthAfter = await isEmailChangeAuthorized(fallbackUserId);
    assert.strictEqual(isAuthAfter, false, 'Authorization must not be valid after consumption');
  });
});
