import assert from 'node:assert';
import inspector from 'node:inspector';
import { after, before, describe, it } from 'node:test';
import { pool } from '../dist/config/database.config.js';
import { redis } from '../dist/config/redis.config.js';
import { withUserLock } from '../dist/services/settings.service.js';

describe('Adversarial Empirical Stress Test: userMutexes (userLocks) Map Cleanup and Memory Safety', () => {
  let session;

  function post(method, params = {}) {
    return new Promise((resolve, reject) => {
      session.post(method, params, (err, res) => (err ? reject(err) : resolve(res)));
    });
  }

  async function getUserLocksSize() {
    globalThis.__probeWithUserLock = withUserLock;
    const evalRes = await post('Runtime.evaluate', { expression: 'globalThis.__probeWithUserLock' });
    const props = await post('Runtime.getProperties', { objectId: evalRes.result.objectId });
    const scopesProp = props.internalProperties?.find((p) => p.name === '[[Scopes]]');
    if (!scopesProp) return -1;

    const scopesList = await post('Runtime.getProperties', { objectId: scopesProp.value.objectId });
    for (const s of scopesList.result) {
      if (s.value && s.value.objectId) {
        const scopeContent = await post('Runtime.getProperties', { objectId: s.value.objectId });
        const userLocksItem = scopeContent.result.find((item) => item.name === 'userLocks');
        if (userLocksItem) {
          const mapDetails = await post('Runtime.getProperties', { objectId: userLocksItem.value.objectId });
          const sizeEntry = mapDetails.result.find((e) => e.name === 'size');
          return sizeEntry.value.value;
        }
      }
    }
    return -1;
  }

  before(async () => {
    session = new inspector.Session();
    session.connect();
    await post('Debugger.enable');
    await post('Runtime.enable');
  });

  after(async () => {
    if (session) {
      session.disconnect();
    }
    await pool.end();
    if (redis.status === 'ready') {
      redis.disconnect(false);
    }
  });

  it('Baseline check: userLocks map is successfully inspected and starts empty (size === 0)', async () => {
    const size = await getUserLocksSize();
    assert.strictEqual(size, 0, 'userLocks initial size must be 0');
  });

  it('Single user lifecycle: Map holds lock during execution and deletes entry upon completion', async () => {
    const userId = 'single-user-probe-1';
    let duringExecutionSize = -1;

    const result = await withUserLock(userId, async () => {
      duringExecutionSize = await getUserLocksSize();
      return 'completed-single';
    });

    assert.strictEqual(result, 'completed-single');
    assert.strictEqual(duringExecutionSize, 1, 'Map must contain exactly 1 entry during lock acquisition');

    const afterSize = await getUserLocksSize();
    assert.strictEqual(afterSize, 0, 'Map entry must be deleted after task completion');
  });

  it('Serialization & Cleanup: 50 concurrent tasks for same user execute sequentially and purge map to 0', async () => {
    const userId = 'concurrent-user-probe-50';
    const executionOrder = [];
    const CONCURRENCY = 50;

    let peakSize = 0;
    const tasks = Array.from({ length: CONCURRENCY }, (_, i) =>
      withUserLock(userId, async () => {
        const currentSize = await getUserLocksSize();
        if (currentSize > peakSize) peakSize = currentSize;
        executionOrder.push(i);
        await new Promise((resolve) => setTimeout(resolve, 5));
        return i;
      })
    );

    const results = await Promise.all(tasks);
    assert.strictEqual(results.length, CONCURRENCY);
    assert.strictEqual(peakSize, 1, 'Map must never exceed 1 entry for a single user lock queue');

    // Strict sequential execution order verified
    for (let i = 0; i < CONCURRENCY; i++) {
      assert.strictEqual(executionOrder[i], i, `Task ${i} must execute in strict serial sequence`);
    }

    const finalSize = await getUserLocksSize();
    assert.strictEqual(finalSize, 0, 'userLocks map must cleanly reset to size 0 when queue settles');
  });

  it('High Scale Cleanup: 500 distinct concurrent users acquire locks and all 500 entries are purged', async () => {
    const USER_COUNT = 500;
    const userIds = Array.from({ length: USER_COUNT }, (_, i) => `distinct-user-${i}`);

    const tasks = userIds.map((id) =>
      withUserLock(id, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return id;
      })
    );

    const results = await Promise.all(tasks);
    assert.strictEqual(results.length, USER_COUNT);

    const postScaleSize = await getUserLocksSize();
    assert.strictEqual(postScaleSize, 0, 'userLocks map must purge all 500 entries with zero memory leaks');
  });

  it('Fault Tolerance: Thrown errors inside lock do not leak map entries and do not deadlock subsequent tasks', async () => {
    const userId = 'error-tolerance-user';

    // Task 1: Throws error
    await assert.rejects(
      async () => {
        await withUserLock(userId, async () => {
          throw new Error('Simulated failure inside user lock');
        });
      },
      /Simulated failure inside user lock/
    );

    const sizeAfterError = await getUserLocksSize();
    assert.strictEqual(sizeAfterError, 0, 'Map entry must be deleted even if task throws');

    // Task 2: Next task for same user should proceed immediately without deadlock
    const recoveryResult = await withUserLock(userId, async () => 'recovered-successfully');
    assert.strictEqual(recoveryResult, 'recovered-successfully');

    const sizeAfterRecovery = await getUserLocksSize();
    assert.strictEqual(sizeAfterRecovery, 0, 'Map entry must be clean after recovery');
  });

  it('Cascade Failure Tolerance: When queued tasks throw in series, surviving tasks execute and map purges', async () => {
    const userId = 'cascade-failure-user';

    const p1 = withUserLock(userId, async () => {
      await new Promise((r) => setTimeout(r, 10));
      throw new Error('Crash 1');
    });

    const p2 = withUserLock(userId, async () => {
      await new Promise((r) => setTimeout(r, 10));
      throw new Error('Crash 2');
    });

    const p3 = withUserLock(userId, async () => {
      await new Promise((r) => setTimeout(r, 10));
      return 'survivor-success';
    });

    const results = await Promise.allSettled([p1, p2, p3]);

    assert.strictEqual(results[0].status, 'rejected');
    assert.strictEqual(results[1].status, 'rejected');
    assert.strictEqual(results[2].status, 'fulfilled');
    assert.strictEqual(results[2].value, 'survivor-success');

    const finalCascadeSize = await getUserLocksSize();
    assert.strictEqual(finalCascadeSize, 0, 'userLocks map must be 0 after cascade rejections');
  });

  it('Extreme Throughput & Burst Interleaving: 5,000 operations across 250 users maintain size === 0 and clean memory', async () => {
    const TOTAL_OPS = 5000;
    const NUM_USERS = 250;
    const promises = [];

    for (let i = 0; i < TOTAL_OPS; i++) {
      const userId = `stress-user-${i % NUM_USERS}`;
      promises.push(
        withUserLock(userId, async () => {
          return i;
        })
      );
    }

    const results = await Promise.all(promises);
    assert.strictEqual(results.length, TOTAL_OPS);

    const postBurstSize = await getUserLocksSize();
    assert.strictEqual(postBurstSize, 0, 'userLocks map size must be exactly 0 after 5,000 burst operations');
  });
});

