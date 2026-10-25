import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { adminDbPool } from '../dist/services/db.service.js';
import { adminRedis } from '../dist/services/redis.service.js';
import { AgentPresenceService } from '../dist/services/agent-presence.service.js';
import { AdminLiveSupportService } from '../dist/services/live-support.service.js';
import { SupportAuditService } from '../dist/services/support-audit.service.js';
import { hashPassword } from '../dist/services/crypto.service.js';

const ROOT_DIR = process.cwd();
const ADMIN_DIR = fs.existsSync(path.resolve(ROOT_DIR, 'apps/admin')) ? path.resolve(ROOT_DIR, 'apps/admin') : ROOT_DIR;
const PDF_DIR = fs.existsSync(path.resolve(ROOT_DIR, 'apps/pdf')) ? path.resolve(ROOT_DIR, 'apps/pdf') : path.resolve(ROOT_DIR, '../pdf');

const FILES_TO_AUDIT = [
  path.resolve(ADMIN_DIR, 'src/services/support-audit.service.ts'),
  path.resolve(ADMIN_DIR, 'src/services/agent-presence.service.ts'),
  path.resolve(ADMIN_DIR, 'src/services/live-support.service.ts'),
  path.resolve(ADMIN_DIR, 'src/controllers/support.controller.ts'),
  path.resolve(ADMIN_DIR, 'client/views/support.view.ts'),
  path.resolve(PDF_DIR, 'src/services/support-audit.service.ts'),
  path.resolve(PDF_DIR, 'src/services/live-support.service.ts'),
  path.resolve(PDF_DIR, 'src/controllers/live-support.controller.ts'),
  path.resolve(PDF_DIR, 'client/components/support-sidebar.component.ts'),
];

describe('Suite: Live Support Agent Presence & Cassandra Immutable Audit', () => {
  it('Requirement AGENTS.md: Zero console.log/warn/error across presence & audit files', () => {
    for (const f of FILES_TO_AUDIT) {
      if (!fs.existsSync(f)) continue;
      const content = fs.readFileSync(f, 'utf8');
      assert.ok(!content.includes('console.log'), `No console.log allowed in ${f}`);
      assert.ok(!content.includes('console.warn'), `No console.warn allowed in ${f}`);
      assert.ok(!content.includes('console.error'), `No console.error allowed in ${f}`);
    }
  });

  it('Requirement AGENTS.md: Single-line horizontal imports across presence & audit files', () => {
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

  it('Requirement AGENTS.md: Zero id="..." attributes in support.html and support-sidebar.component.ts', () => {
    const adminHtml = path.resolve(ADMIN_DIR, 'public/views/support/support.html');
    const pdfComponent = path.resolve(PDF_DIR, 'client/components/support-sidebar.component.ts');

    if (fs.existsSync(adminHtml)) {
      const html = fs.readFileSync(adminHtml, 'utf8');
      assert.ok(!html.includes(' id="') && !html.includes(" id='"), 'support.html must not contain id=');
      assert.ok(html.includes('data-ref="modal-audit-backdrop"'), 'support.html must include modal-audit-backdrop');
      assert.ok(html.includes('data-ref="modal-ratings-backdrop"'), 'support.html must include modal-ratings-backdrop');
      assert.ok(html.includes('data-ref="btn-trigger-support-presence"'), 'support.html must include presence selector');
    }

    if (fs.existsSync(pdfComponent)) {
      const component = fs.readFileSync(pdfComponent, 'utf8');
      assert.ok(!component.includes(' id="') && !component.includes(" id='"), 'support-sidebar must not contain id=');
      assert.ok(component.includes('data-ref="support-online-badge"'), 'support-sidebar must include support-online-badge');
    }
  });

  it('AgentPresenceService: updates presence status, synchronizes MySQL and publishes to Redis', async () => {
    const testAgentId = crypto.randomUUID();
    const testAgentName = 'Agente Test Presencia';

    await adminDbPool.query(
      'INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [testAgentId, `agent_pres_${Date.now()}`, `agent.pres.${Date.now()}@aurora.app`, 'hash_placeholder', 'SUPPORT_L1']
    );

    const presenceAvail = await AgentPresenceService.updatePresence(
      testAgentId,
      'available',
      testAgentName,
      'L1',
      'Inicio de turno'
    );
    assert.strictEqual(presenceAvail.status, 'available');
    assert.strictEqual(presenceAvail.tier, 'L1');

    const fetchedAvail = await AgentPresenceService.getPresence(testAgentId);
    assert.ok(fetchedAvail);
    assert.strictEqual(fetchedAvail?.status, 'available');

    const availCheck = await AgentPresenceService.checkAvailability('L1');
    assert.strictEqual(availCheck.available, true);
    assert.ok(availCheck.availableCount >= 1);

    const presenceBusy = await AgentPresenceService.updatePresence(
      testAgentId,
      'busy',
      testAgentName,
      'L1',
      'Atendiendo llamada compleja'
    );
    assert.strictEqual(presenceBusy.status, 'busy');

    const presenceOffline = await AgentPresenceService.updatePresence(
      testAgentId,
      'offline',
      testAgentName,
      'L1',
      'Fin de jornada'
    );
    assert.strictEqual(presenceOffline.status, 'offline');

    await adminDbPool.query('DELETE FROM support_agent_presence WHERE agent_id = ?', [testAgentId]);
    await adminDbPool.query('DELETE FROM users WHERE id = ?', [testAgentId]);
  });

  it('SupportAuditService: records immutable chat lifecycle events and escalations in Cassandra', async () => {
    const testChatId = `audit-test-${Date.now()}`;
    const testSessionId = `audit-sess-${Date.now()}`;

    await SupportAuditService.recordChatEvent({
      actorId: 'usr-001',
      actorName: 'Cliente Cassandra',
      actorType: 'user',
      chatId: testChatId,
      currentStatus: 'pending',
      currentTier: 'L1',
      eventType: 'created',
      payload: { reason: 'Problema con firma digital en PDF' },
      sessionId: testSessionId,
      subject: 'Problema con firma digital en PDF',
      userEmail: 'cliente@cassandra.test',
      userId: 'usr-001',
      userName: 'Cliente Cassandra',
    });

    await SupportAuditService.recordChatEvent({
      actorId: 'agent-l1',
      actorName: 'Agente L1 Soporte',
      actorType: 'agent',
      chatId: testChatId,
      currentStatus: 'active',
      currentTier: 'L1',
      eventType: 'claimed',
      payload: { agentName: 'Agente L1 Soporte' },
    });

    await SupportAuditService.recordTransfer({
      chatId: testChatId,
      fromTier: 'L1',
      notes: 'Requiere validación de certificados X.509 por equipo especializado',
      reason: 'Validación de certificados X.509',
      toTier: 'L2',
      transferredById: 'agent-l1',
      transferredByName: 'Agente L1 Soporte',
    });

    await SupportAuditService.recordTransfer({
      chatId: testChatId,
      fromTier: 'L2',
      notes: 'Escalado a arquitectura por fallo en algoritmo de hash SHA-256',
      reason: 'Fallo criptográfico interno',
      toTier: 'L3',
      transferredById: 'agent-l2',
      transferredByName: 'Agente L2 Soporte',
    });

    const msgId = crypto.randomUUID();
    await SupportAuditService.recordMessage({
      chatId: testChatId,
      message: 'He transferido tu caso al equipo de arquitectura L3.',
      messageId: msgId,
      senderId: 'agent-l2',
      senderName: 'Agente L2 Soporte',
      senderType: 'agent',
      tier: 'L2',
    });

    await SupportAuditService.recordChatEvent({
      actorId: 'agent-l3',
      actorName: 'Ingeniero L3',
      actorType: 'agent',
      chatId: testChatId,
      currentStatus: 'closed',
      currentTier: 'L3',
      eventType: 'closed',
      payload: { resolved: true },
    });

    await SupportAuditService.recordRating({
      agentId: 'agent-l3',
      agentName: 'Ingeniero L3',
      chatId: testChatId,
      feedbackComment: 'Resolvieron la validación del certificado de forma impecable.',
      rating: 5,
      tier: 'L3',
      userEmail: 'cliente@cassandra.test',
      userId: 'usr-001',
      userName: 'Cliente Cassandra',
    });

    const auditTrail = await SupportAuditService.getChatAuditTrail(testChatId);
    assert.ok(Array.isArray(auditTrail));
    assert.ok(auditTrail.length >= 3, 'Must contain created, claimed, transferred and closed events');
    assert.ok(auditTrail.some((e) => e.eventType === 'created'));
    assert.ok(auditTrail.some((e) => e.eventType === 'claimed'));

    const transfers = await SupportAuditService.getChatTransfers(testChatId);
    assert.ok(Array.isArray(transfers));
    assert.ok(transfers.length >= 2, 'Must record both L1->L2 and L2->L3 transfers in Cassandra');
    const transferL2 = transfers.find((t) => t.toTier === 'L2');
    const transferL3 = transfers.find((t) => t.toTier === 'L3');
    assert.ok(transferL2, 'Must record L2 transfer');
    assert.ok(transferL3, 'Must record L3 transfer');
    assert.strictEqual(transferL2?.fromTier, 'L1');
    assert.strictEqual(transferL3?.fromTier, 'L2');

    const messages = await SupportAuditService.getImmutableMessages(testChatId);
    assert.ok(Array.isArray(messages));
    assert.ok(messages.some((m) => m.messageId === msgId));

    const ratings = await SupportAuditService.getAgentRatings('agent-l3');
    assert.ok(Array.isArray(ratings));
    const targetRating = ratings.find((r) => r.chatId === testChatId);
    assert.ok(targetRating, 'Must persist agent rating in Cassandra');
    assert.strictEqual(targetRating?.rating, 5);
    assert.strictEqual(targetRating?.feedbackComment, 'Resolvieron la validación del certificado de forma impecable.');
  });

  it('HTTP API: Admin presence, audit trail and ratings endpoints respond successfully', async () => {
    const timestamp = Date.now();
    const testAdminId = crypto.randomUUID();
    const testEmail = `admin_audit_${timestamp}@projectaurora.com`;
    const testPassword = 'Password123!AuditTest';
    const pwdHash = await hashPassword(testPassword);

    await adminDbPool.query(
      'INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [testAdminId, `admin_audit_${timestamp}`, testEmail, pwdHash, 'SUPPORT_L1']
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
    assert.ok(cookie);

    const presenceRes = await fetch('http://localhost:3005/api/admin/support/presence', {
      headers: { Cookie: cookie },
    });
    assert.strictEqual(presenceRes.status, 200);
    const presenceData = await presenceRes.json();
    assert.strictEqual(presenceData.success, true);
    assert.ok(Array.isArray(presenceData.presences));

    const updatePresenceRes = await fetch('http://localhost:3005/api/admin/support/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        status: 'available',
        tier: 'L1',
      }),
    });
    assert.strictEqual(updatePresenceRes.status, 200);
    const updateData = await updatePresenceRes.json();
    assert.strictEqual(updateData.success, true);
    assert.strictEqual(updateData.presence.status, 'available');

    const testChatId = crypto.randomUUID();
    await adminDbPool.query(
      `INSERT INTO live_support_chats (id, session_id, user_name, user_email, subject, status, tier, rating, feedback_comment, rated_at)
       VALUES (?, ?, ?, ?, ?, 'closed', 'L1', 5, 'Excelente soporte', NOW())`,
      [testChatId, `sess_${timestamp}`, 'Usuario Cassandra', 'cassandra@prueba.com', 'Duda con folios']
    );

    const auditRes = await fetch(`http://localhost:3005/api/admin/support/chats/${testChatId}/audit`, {
      headers: { Cookie: cookie },
    });
    assert.strictEqual(auditRes.status, 200);
    const auditData = await auditRes.json();
    assert.strictEqual(auditData.success, true);
    assert.strictEqual(auditData.chat.id, testChatId);
    assert.ok(Array.isArray(auditData.auditTrail));

    const ratingsRes = await fetch('http://localhost:3005/api/admin/support/ratings', {
      headers: { Cookie: cookie },
    });
    assert.strictEqual(ratingsRes.status, 200);
    const ratingsData = await ratingsRes.json();
    assert.strictEqual(ratingsData.success, true);
    assert.ok(ratingsData.summary);
    assert.ok(ratingsData.summary.averageRating >= 1);

    const availPdfRes = await fetch('http://localhost:3000/api/support/live/availability');
    assert.strictEqual(availPdfRes.status, 200);
    const availPdfData = await availPdfRes.json();
    assert.strictEqual(availPdfData.success, true);
    assert.strictEqual(typeof availPdfData.available, 'boolean');

    await adminDbPool.query('DELETE FROM live_support_chats WHERE id = ?', [testChatId]);
    await adminDbPool.query('DELETE FROM support_agent_presence WHERE agent_id = ?', [testAdminId]);
    await adminDbPool.query('DELETE FROM users WHERE id = ?', [testAdminId]);
  });

  after(async () => {
    try {
      await SupportAuditService.closeClient();
      await adminDbPool.end();
      adminRedis.disconnect();
    } catch {
      // ignore
    }
  });
});
