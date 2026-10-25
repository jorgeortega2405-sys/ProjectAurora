import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { adminDbPool } from '../dist/services/db.service.js';
import { adminRedis } from '../dist/services/redis.service.js';
import { hashPassword } from '../dist/services/crypto.service.js';
import { SecurityAuditService } from '../dist/services/security-audit.service.js';
import { SessionSecurityService } from '../dist/services/session-security.service.js';

const ROOT_DIR = process.cwd();
const ADMIN_DIR = fs.existsSync(path.resolve(ROOT_DIR, 'apps/admin')) ? path.resolve(ROOT_DIR, 'apps/admin') : ROOT_DIR;

const FILES_TO_AUDIT = [
  path.resolve(ADMIN_DIR, 'src/services/security-audit.service.ts'),
  path.resolve(ADMIN_DIR, 'src/services/session-security.service.ts'),
  path.resolve(ADMIN_DIR, 'src/controllers/security.controller.ts'),
  path.resolve(ADMIN_DIR, 'client/views/audit.view.ts'),
];

describe('Suite: Centro de Auditoría Administrativa y Seguridad (Cassandra + Redis + PBAC)', () => {
  it('Requirement AGENTS.md: Zero console.log/warn/error across security audit files', () => {
    for (const f of FILES_TO_AUDIT) {
      if (!fs.existsSync(f)) continue;
      const content = fs.readFileSync(f, 'utf8');
      assert.ok(!content.includes('console.log'), `No console.log allowed in ${f}`);
      assert.ok(!content.includes('console.warn'), `No console.warn allowed in ${f}`);
      assert.ok(!content.includes('console.error'), `No console.error allowed in ${f}`);
    }
  });

  it('Requirement AGENTS.md: Single-line horizontal imports across security audit files', () => {
    for (const f of FILES_TO_AUDIT) {
      if (!fs.existsSync(f)) continue;
      const content = fs.readFileSync(f, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('import ') && !line.includes(' from ') && !line.endsWith(';')) {
          assert.fail(`Multi-line import detected in ${f} at line ${i + 1}`);
        }
      }
    }
  });

  it('Requirement AGENTS.md: Zero id="..." attributes in audit.html', () => {
    const auditHtml = path.resolve(ADMIN_DIR, 'public/views/audit/audit.html');
    assert.ok(fs.existsSync(auditHtml), 'audit.html must exist');
    const html = fs.readFileSync(auditHtml, 'utf8');
    assert.ok(!html.includes(' id="') && !html.includes(" id='"), 'audit.html must not contain id=');
  });

  it('Requirement AGENTS.md: Button attributes must place type first in audit.html', () => {
    const auditHtml = path.resolve(ADMIN_DIR, 'public/views/audit/audit.html');
    const html = fs.readFileSync(auditHtml, 'utf8');
    const buttonTags = html.match(/<button\b[^>]*>/g) || [];
    assert.ok(buttonTags.length > 0, 'Must have buttons in audit.html');
    for (const btn of buttonTags) {
      assert.ok(btn.startsWith('<button type="'), `Button must start with type=" attribute: ${btn}`);
    }
  });

  it('Cassandra Inmutable Audit: Records and retrieves admin actions with HMAC-SHA256 checksum', async () => {
    const testAdminId = `test_admin_${crypto.randomUUID().slice(0, 8)}`;
    const testTargetId = `usr_${crypto.randomUUID().slice(0, 8)}`;

    await SecurityAuditService.recordAdminAction({
      action: 'user.suspend',
      actorEmail: 'auditor@test.com',
      actorId: testAdminId,
      actorRole: 'SUPER_ADMIN',
      actorUsername: 'AuditorSec',
      details: { reason: 'Violación reiterada de términos', suspendedUntil: '2026-12-31' },
      ipAddress: '192.168.1.100',
      status: 'success',
      targetId: testTargetId,
      targetName: `Usuario ${testTargetId}`,
      targetType: 'user',
      userAgent: 'Mozilla/5.0 TestBrowser',
    });

    // Short delay to ensure Cassandra write consistency
    await new Promise((r) => setTimeout(r, 200));

    const auditTrail = await SecurityAuditService.getAdminAuditTrail({
      limit: 20,
      targetType: 'user',
    });

    assert.ok(Array.isArray(auditTrail), 'Audit trail must be an array');
    const entry = auditTrail.find((e) => e.targetId === testTargetId && e.action === 'user.suspend');
    assert.ok(entry, 'Recorded admin audit action must be present in Cassandra audit trail');
    assert.strictEqual(entry.actorUsername, 'AuditorSec');
    assert.strictEqual(entry.actorRole, 'SUPER_ADMIN');
    assert.strictEqual(entry.ipAddress, '192.168.1.100');
    assert.strictEqual(entry.status, 'success');
    assert.ok(entry.checksum && entry.checksum.length === 64, 'Entry must have a 64-char SHA-256 HMAC checksum');
    assert.strictEqual(entry.details?.reason, 'Violación reiterada de términos');
  });

  it('Access Logs & Brute Force: Records failed logins, escalates risk, and detects threats', async () => {
    const testIp = `10.0.0.${Math.floor(Math.random() * 250) + 1}`;
    const testIdentifier = `attacker_${crypto.randomUUID().slice(0, 8)}@suspicious.org`;

    // Attempt 1: Normal failure
    const r1 = await SessionSecurityService.recordFailedLoginAttempt(testIp, testIdentifier, 'Contraseña errónea', 'TestBot/1.0');
    assert.strictEqual(r1.isSuspicious, false);
    assert.strictEqual(r1.riskScore, 25);

    // Attempt 2: Another failure
    await SessionSecurityService.recordFailedLoginAttempt(testIp, testIdentifier, 'Contraseña errónea', 'TestBot/1.0');

    // Attempt 3: Threshold for suspicion
    const r3 = await SessionSecurityService.recordFailedLoginAttempt(testIp, testIdentifier, 'Contraseña errónea', 'TestBot/1.0');
    assert.strictEqual(r3.isSuspicious, true);
    assert.strictEqual(r3.riskScore, 65);

    // Attempts 4 and 5: Block threshold reached
    await SessionSecurityService.recordFailedLoginAttempt(testIp, testIdentifier, 'Contraseña errónea', 'TestBot/1.0');
    const r5 = await SessionSecurityService.recordFailedLoginAttempt(testIp, testIdentifier, 'Contraseña errónea', 'TestBot/1.0');
    assert.strictEqual(r5.isSuspicious, true);
    assert.strictEqual(r5.riskScore, 95);

    // Verify brute force check
    const check = await SessionSecurityService.checkBruteForceRisk(testIp, testIdentifier);
    assert.strictEqual(check.isBlocked, true);
    assert.ok(check.attempts >= 5);

    // Query Cassandra access logs
    await new Promise((r) => setTimeout(r, 200));
    const accessLogs = await SecurityAuditService.getSecurityAccessLogs({ ip: testIp, limit: 10 });
    assert.ok(accessLogs.length >= 1, 'Access logs must be recorded in Cassandra');
    const blockedLog = accessLogs.find((l) => l.eventType === 'brute_force_blocked');
    assert.ok(blockedLog, 'Must record brute_force_blocked in Cassandra');
    assert.strictEqual(blockedLog.isSuspicious, true);
    assert.strictEqual(blockedLog.riskScore, 95);
  });

  it('Redis Active Sessions & Real-time Revocation: Manages session lifecycle and logs revocation in Cassandra', async () => {
    const testSessionId = `sess_${crypto.randomUUID()}`;
    const testUserId = `usr_${crypto.randomUUID()}`;

    // 1. Register active session in Redis
    await SessionSecurityService.registerSession({
      email: 'admin_test@aurora.com',
      ip: '172.16.0.5',
      role: 'ADMIN',
      sessionId: testSessionId,
      userAgent: 'Mozilla/5.0 AdminConsole',
      userId: testUserId,
      username: 'SecAdminTester',
    });

    // 2. Verify active in Redis
    const isRevokedBefore = await SessionSecurityService.isSessionRevoked(testSessionId);
    assert.strictEqual(isRevokedBefore, false, 'Session must not be revoked initially');

    const activeSessions = await SessionSecurityService.getActiveSessions();
    const foundActive = activeSessions.find((s) => s.sessionId === testSessionId);
    assert.ok(foundActive, 'Session must be returned in getActiveSessions');
    assert.strictEqual(foundActive.username, 'SecAdminTester');

    // 3. Revoke session in real-time
    const revokeResult = await SessionSecurityService.revokeSession(testSessionId, {
      id: 'super_admin_actor',
      ip: '10.0.0.1',
      role: 'SUPER_ADMIN',
      username: 'ChiefSecurityOfficer',
    });
    assert.strictEqual(revokeResult, true, 'revokeSession must return true');

    // 4. Verify revocation state
    const isRevokedAfter = await SessionSecurityService.isSessionRevoked(testSessionId);
    assert.strictEqual(isRevokedAfter, true, 'isSessionRevoked must return true after revocation');

    const activeAfter = await SessionSecurityService.getActiveSessions();
    const foundAfter = activeAfter.find((s) => s.sessionId === testSessionId);
    assert.strictEqual(foundAfter, undefined, 'Revoked session must no longer appear in active sessions');

    // 5. Verify immutable Cassandra audit log was created for the revocation
    await new Promise((r) => setTimeout(r, 200));
    const auditRevocations = await SecurityAuditService.getAdminAuditTrail({
      limit: 10,
      targetType: 'session',
    });
    const revocationEntry = auditRevocations.find((e) => e.targetId === testSessionId && e.action === 'session.revoke');
    assert.ok(revocationEntry, 'Revocation action must be recorded immutably in Cassandra');
    assert.strictEqual(revocationEntry.actorUsername, 'ChiefSecurityOfficer');
    assert.strictEqual(revocationEntry.actorRole, 'SUPER_ADMIN');
  });

  it('HTTP Endpoints: Verify /security/stats, /security/audit-logs, /security/sessions respond correctly', async () => {
    const timestamp = Date.now();
    const testAdminId = crypto.randomUUID();
    const testEmail = `sec_auditor_${timestamp}@aurora.com`;
    const testPassword = 'Password123!SecAuditTest';
    const pwdHash = await hashPassword(testPassword);

    await adminDbPool.query(
      'INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [testAdminId, `secauditor_${timestamp}`, testEmail, pwdHash, 'SUPER_ADMIN']
    );

    const loginRes = await fetch('http://localhost:3005/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        turnstileToken: '1x00000000000000000000AA',
      }),
    });

    assert.strictEqual(loginRes.status, 200);
    const cookie = loginRes.headers.get('set-cookie');
    assert.ok(cookie, 'Login must set session cookie');

    // Test stats endpoint
    const statsRes = await fetch('http://localhost:3005/api/admin/security/stats', {
      headers: { Cookie: cookie },
    });
    assert.strictEqual(statsRes.status, 200);
    const statsData = await statsRes.json();
    assert.strictEqual(statsData.success, true);
    assert.ok(typeof statsData.stats.actionsToday === 'number');
    assert.ok(typeof statsData.stats.activeSessionsCount === 'number');

    // Test audit logs endpoint
    const logsRes = await fetch('http://localhost:3005/api/admin/security/audit-logs?limit=5', {
      headers: { Cookie: cookie },
    });
    assert.strictEqual(logsRes.status, 200);
    const logsData = await logsRes.json();
    assert.strictEqual(logsData.success, true);
    assert.ok(Array.isArray(logsData.logs));

    // Test sessions endpoint
    const sessionsRes = await fetch('http://localhost:3005/api/admin/security/sessions', {
      headers: { Cookie: cookie },
    });
    assert.strictEqual(sessionsRes.status, 200);
    const sessionsData = await sessionsRes.json();
    assert.strictEqual(sessionsData.success, true);
    assert.ok(Array.isArray(sessionsData.sessions));

    await adminDbPool.query('DELETE FROM users WHERE id = ?', [testAdminId]);
  });

  after(async () => {
    try {
      await SecurityAuditService.closeClient();
      await adminDbPool.end();
      adminRedis.disconnect();
    } catch {
      // ignore
    }
  });
});
