import assert from 'node:assert';
import { after, before, describe, it } from 'node:test';
import { pool } from '../dist/config/database.config.js';
import { checkRedisConnection, redis } from '../dist/config/redis.config.js';
import { requestEmailChangeCode } from '../dist/services/settings.service.js';
import { deleteEmailChangeCode, getEmailChangeCode } from '../dist/services/verification.service.js';

describe('Milestone 1 Empirical Stress Test: Concurrency and Race Conditions', () => {
  const testUserId = '50e0819a-7151-433c-8797-613f6cbf0b6a';

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

  it('Concurrent execution: multiple simultaneous requests to requestEmailChangeCode for same user', async () => {
    await deleteEmailChangeCode(testUserId);

    const CONCURRENCY_COUNT = 5;
    const promises = Array.from({ length: CONCURRENCY_COUNT }, () =>
      requestEmailChangeCode(testUserId, true)
    );

    const results = await Promise.all(promises);

    const finalPayload = await getEmailChangeCode(testUserId);
    assert.ok(finalPayload, 'A verification code must exist after requests');

    const successfulGenerations = results.filter((r) => r.success && r.codePending === false);
    const rateLimitedOrReused = results.filter((r) => r.status === 429 || r.codePending === true);

    assert.strictEqual(
      successfulGenerations.length,
      1,
      `Expected exactly 1 request to generate/send the initial code, but got ${successfulGenerations.length}. Concurrency race condition detected!`
    );

    assert.strictEqual(
      rateLimitedOrReused.length,
      CONCURRENCY_COUNT - 1,
      `Expected remaining ${CONCURRENCY_COUNT - 1} requests to be safely handled (rate-limited 429 or reused codePending=true), but got ${rateLimitedOrReused.length}`
    );
  });

  it('Concurrent resends: simultaneous requests after cooldown expires must only trigger 1 resend', async () => {
    // Setup an existing code with lastSentAt expired (>60s ago)
    await deleteEmailChangeCode(testUserId);
    await requestEmailChangeCode(testUserId, true);

    // Mock lastSentAt to 61s ago
    const sixtyOneSecondsAgo = Date.now() - 61 * 1000;
    const { updateEmailChangeCodeLastSent } = await import('../dist/services/verification.service.js');
    await updateEmailChangeCodeLastSent(testUserId, sixtyOneSecondsAgo);

    const CONCURRENCY_COUNT = 5;
    const promises = Array.from({ length: CONCURRENCY_COUNT }, () =>
      requestEmailChangeCode(testUserId, true)
    );

    const results = await Promise.all(promises);

    const rateLimitedCount = results.filter((r) => r.status === 429).length;
    const resendSuccessCount = results.filter((r) => r.success && r.codePending === true).length;

    assert.strictEqual(
      resendSuccessCount,
      1,
      `Expected exactly 1 resend to trigger email, but got ${resendSuccessCount}. Simultaneous resend race condition detected!`
    );

    assert.strictEqual(
      rateLimitedCount,
      CONCURRENCY_COUNT - 1,
      `Expected remaining ${CONCURRENCY_COUNT - 1} requests to be rate-limited (429), but got ${rateLimitedCount}`
    );
  });
});
