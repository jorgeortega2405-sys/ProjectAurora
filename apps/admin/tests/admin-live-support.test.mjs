import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { adminDbPool } from '../dist/services/db.service.js';
import { adminRedis } from '../dist/services/redis.service.js';
import { AdminLiveSupportService } from '../dist/services/live-support.service.js';
import { hashPassword } from '../dist/services/crypto.service.js';

const ROOT_DIR = process.cwd();
const ADMIN_DIR = fs.existsSync(path.resolve(ROOT_DIR, 'apps/admin')) ? path.resolve(ROOT_DIR, 'apps/admin') : ROOT_DIR;
const ADMIN_SERVICE_PATH = path.resolve(ADMIN_DIR, 'src/services/live-support.service.ts');
const ADMIN_CONTROLLER_PATH = path.resolve(ADMIN_DIR, 'src/controllers/support.controller.ts');
const ADMIN_VIEW_PATH = path.resolve(ADMIN_DIR, 'client/views/support.view.ts');
const ADMIN_HTML_PATH = path.resolve(ADMIN_DIR, 'public/views/support/support.html');

describe('Suite: Admin Live Support Chat & Tier Escalation (apps/admin)', () => {
  it('Requirement AGENTS.md: Zero console.log/warn/error across Admin Live Support files', () => {
    const files = [ADMIN_SERVICE_PATH, ADMIN_CONTROLLER_PATH, ADMIN_VIEW_PATH];
    for (const f of files) {
      assert.ok(fs.existsSync(f), `File must exist: ${f}`);
      const content = fs.readFileSync(f, 'utf8');
      assert.ok(!content.includes('console.log'), `No console.log in ${f}`);
      assert.ok(!content.includes('console.warn'), `No console.warn in ${f}`);
      assert.ok(!content.includes('console.error'), `No console.error in ${f}`);
    }
  });

  it('Requirement AGENTS.md: Single-line horizontal imports across Admin Live Support files', () => {
    const files = [ADMIN_SERVICE_PATH, ADMIN_CONTROLLER_PATH, ADMIN_VIEW_PATH];
    for (const f of files) {
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

  it('Requirement AGENTS.md: Zero id="..." attributes in support.html and support.view.ts', () => {
    const htmlContent = fs.readFileSync(ADMIN_HTML_PATH, 'utf8');
    const viewContent = fs.readFileSync(ADMIN_VIEW_PATH, 'utf8');
    assert.ok(!htmlContent.includes(' id="') && !htmlContent.includes(" id='"), 'support.html must not contain id="..." attributes');
    assert.ok(!viewContent.includes(' id="') && !viewContent.includes(" id='"), 'support.view.ts must not contain id="..." attributes');
    assert.ok(!viewContent.includes('getElementById'), 'support.view.ts must not use getElementById');
    assert.ok(htmlContent.includes('data-ref="btn-claim-chat"'), 'Must contain btn-claim-chat data-ref');
    assert.ok(htmlContent.includes('data-ref="btn-open-transfer"'), 'Must contain btn-open-transfer data-ref');
  });

  it('AdminLiveSupportService: lists seeded chats and filters by status and tier', async () => {
    const allChats = await AdminLiveSupportService.listChats();
    assert.ok(Array.isArray(allChats));
    assert.ok(allChats.length >= 1, 'Should return at least the seed chats');

    const pendingChats = await AdminLiveSupportService.listChats({ status: 'pending' });
    assert.ok(pendingChats.every((c) => c.status === 'pending'));

    const l1Chats = await AdminLiveSupportService.listChats({ tier: 'L1' });
    assert.ok(l1Chats.every((c) => c.tier === 'L1'));
  });

  let sharedClaimedChatId = '';

  it('AdminLiveSupportService: accepts/claims a pending chat and assigns agent', async () => {
    let pendingList = await AdminLiveSupportService.listChats({ status: 'pending' });
    if (pendingList.length === 0) {
      const newPendingId = crypto.randomUUID();
      await adminDbPool.query(
        `INSERT INTO live_support_chats (id, session_id, user_name, user_email, subject, status, tier, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', 'L1', NOW())`,
        [newPendingId, `sess-${Date.now()}`, 'Usuario de Prueba', 'testuser@example.com', 'Consulta de prueba']
      );
      pendingList = await AdminLiveSupportService.listChats({ status: 'pending' });
    }
    assert.ok(pendingList.length > 0, 'Must have at least one pending chat');
    const targetChat = pendingList[0];
    sharedClaimedChatId = targetChat.id;

    const claimed = await AdminLiveSupportService.claimChat(
      targetChat.id,
      'b7123456-1111-4000-8000-000000000001',
      'Agente Sofía'
    );

    assert.strictEqual(claimed.status, 'active');
    assert.strictEqual(claimed.assigned_agent_id, 'b7123456-1111-4000-8000-000000000001');
    assert.strictEqual(claimed.assigned_agent_name, 'Agente Sofía');

    const messages = await AdminLiveSupportService.getMessages(targetChat.id);
    const systemMsg = messages.find((m) => m.sender_type === 'system' && m.message.includes('Agente Sofía'));
    assert.ok(systemMsg, 'Must append system message confirming agent claimed the case');
  });

  it('AdminLiveSupportService: sends agent message in live conversation', async () => {
    const chat = (await AdminLiveSupportService.getChatById(sharedClaimedChatId)) || (await AdminLiveSupportService.listChats({ status: 'active' }))[0];
    assert.ok(chat);

    const agentMsg = await AdminLiveSupportService.addAgentMessage(
      chat.id,
      chat.assigned_agent_id || 'b7123456-1111-4000-8000-000000000001',
      chat.assigned_agent_name || 'Agente Sofía',
      'Hola, he revisado tu consulta y procederé a asistirte.'
    );

    assert.strictEqual(agentMsg.id.length, 36);
    assert.strictEqual(agentMsg.sender_type, 'agent');
    assert.strictEqual(agentMsg.message, 'Hola, he revisado tu consulta y procederé a asistirte.');
  });

  it('AdminLiveSupportService: transfers and escalates case through support tiers (L1 -> L2 -> L3)', async () => {
    const chat = (await AdminLiveSupportService.getChatById(sharedClaimedChatId)) || (await AdminLiveSupportService.listChats({ status: 'active' }))[0];
    assert.ok(chat);

    const escalatedL2 = await AdminLiveSupportService.transferChat(
      chat.id,
      'L2',
      'Agente Sofía',
      'Requiere revisión técnica de OCR y vectorización'
    );
    assert.strictEqual(escalatedL2.tier, 'L2');

    const escalatedL3 = await AdminLiveSupportService.transferChat(
      chat.id,
      'L3',
      'Soporte L2',
      'Escalado a arquitectura por fallo en pipeline'
    );
    assert.strictEqual(escalatedL3.tier, 'L3');

    const messages = await AdminLiveSupportService.getMessages(chat.id);
    const auditL2 = messages.find((m) => m.message.includes('Nivel L2'));
    const auditL3 = messages.find((m) => m.message.includes('Nivel L3'));
    assert.ok(auditL2, 'Must record audit log for L2 escalation');
    assert.ok(auditL3, 'Must record audit log for L3 escalation');
  });

  it('AdminLiveSupportService: closes chat and marks as resolved', async () => {
    const chat = (await AdminLiveSupportService.getChatById(sharedClaimedChatId)) || (await AdminLiveSupportService.listChats({ status: 'active' }))[0];
    assert.ok(chat);

    const closed = await AdminLiveSupportService.closeChat(chat.id, 'Agente Sofía');
    assert.strictEqual(closed.status, 'closed');
    assert.ok(closed.closed_at !== null);

    const messages = await AdminLiveSupportService.getMessages(chat.id);
    const closeMsg = messages.find((m) => m.message.includes('cerrado'));
    assert.ok(closeMsg, 'Must append system message confirming case closure');
  });

  it('HTTP API: Claim pending live support chat succeeds via POST /api/admin/support/chats/:id/claim', async () => {
    const timestamp = Date.now();
    const testAdminId = crypto.randomUUID();
    const testEmail = `support_agent_${timestamp}@projectaurora.com`;
    const testPassword = 'Password123!AdminTest';
    const pwdHash = await hashPassword(testPassword);

    await adminDbPool.query(
      'INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [testAdminId, `support_agent_${timestamp}`, testEmail, pwdHash, 'SUPPORT_L1']
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

    const loginData = await loginRes.json().catch(() => ({}));
    assert.strictEqual(loginRes.status, 200, `Admin login must succeed: ${JSON.stringify(loginData)}`);
    const cookie = loginRes.headers.get('set-cookie');
    assert.ok(cookie, 'Must receive session cookie');

    const testChatId = crypto.randomUUID();
    await adminDbPool.query(
      `INSERT INTO live_support_chats (id, session_id, user_name, user_email, subject, status, tier)
       VALUES (?, ?, ?, ?, ?, 'pending', 'L1')`,
      [testChatId, `sess_${timestamp}`, 'Usuario Prueba', 'usuario@prueba.com', 'Duda con mi suscripción']
    );

    const prematureMsgRes = await fetch(`http://localhost:3005/api/admin/support/chats/${testChatId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ message: 'Mensaje prematuro' }),
    });
    assert.strictEqual(prematureMsgRes.status, 400, 'Sending message to pending chat must return 400');

    const claimRes = await fetch(`http://localhost:3005/api/admin/support/chats/${testChatId}/claim`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });

    assert.strictEqual(claimRes.status, 200, 'Claim request must return 200 OK');
    const claimData = await claimRes.json();
    assert.strictEqual(claimData.success, true);
    assert.strictEqual(claimData.chat.status, 'active');
    assert.strictEqual(claimData.chat.assigned_agent_id, testAdminId);

    const msgRes = await fetch(`http://localhost:3005/api/admin/support/chats/${testChatId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ message: 'Hola, te habla el agente asignado.' }),
    });
    assert.strictEqual(msgRes.status, 201, 'Sending agent message must return 201');

    const transferRes = await fetch(`http://localhost:3005/api/admin/support/chats/${testChatId}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ tier: 'L2', notes: 'Escalado por prueba' }),
    });
    assert.strictEqual(transferRes.status, 200, 'Transfer request must return 200');

    const closeRes = await fetch(`http://localhost:3005/api/admin/support/chats/${testChatId}/close`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    assert.strictEqual(closeRes.status, 200, 'Close request must return 200');

    const postCloseMsgRes = await fetch(`http://localhost:3005/api/admin/support/chats/${testChatId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ message: 'Mensaje posterior al cierre' }),
    });
    assert.strictEqual(postCloseMsgRes.status, 400, 'Sending message to closed chat must return 400');

    await adminDbPool.query('DELETE FROM live_support_messages WHERE chat_id = ?', [testChatId]);
    await adminDbPool.query('DELETE FROM live_support_chats WHERE id = ?', [testChatId]);
    await adminDbPool.query('DELETE FROM users WHERE id = ?', [testAdminId]);
  });

  it('AdminLiveSupportService: rejects sending message if chat is pending or closed', async () => {
    const pendingList = await AdminLiveSupportService.listChats({ status: 'pending' });
    if (pendingList.length > 0) {
      await assert.rejects(
        async () => {
          await AdminLiveSupportService.addAgentMessage(
            pendingList[0].id,
            'b7123456-1111-4000-8000-000000000001',
            'Agente Sofía',
            'Intento en caso pendiente'
          );
        },
        /activo/i
      );
    }

    const closedList = await AdminLiveSupportService.listChats({ status: 'closed' });
    if (closedList.length > 0) {
      await assert.rejects(
        async () => {
          await AdminLiveSupportService.addAgentMessage(
            closedList[0].id,
            'b7123456-1111-4000-8000-000000000001',
            'Agente Sofía',
            'Intento en caso cerrado'
          );
        },
        /activo/i
      );
    }
  });

  it('AdminLiveSupportService: rejects sending message if chat is unassigned or assigned to a different agent', async () => {
    const activeChats = await AdminLiveSupportService.listChats({ status: 'active' });
    if (activeChats.length > 0) {
      await assert.rejects(
        async () => {
          await AdminLiveSupportService.addAgentMessage(
            activeChats[0].id,
            'different-agent-id-9999',
            'Otro Agente',
            'Mensaje desde agente no asignado'
          );
        },
        /asignado/i
      );
    }
  });

  it('Requirement AGENTS.md: Deduplication and transport unification in support.view.ts', () => {
    const viewContent = fs.readFileSync(ADMIN_VIEW_PATH, 'utf8');
    assert.ok(viewContent.includes('renderedMessageIds'), 'support.view.ts must use renderedMessageIds');
    assert.ok(viewContent.includes('notifiedChatCreatedIds'), 'support.view.ts must track notifiedChatCreatedIds');
    assert.ok(!viewContent.includes("type: 'chat_message'"), 'support.view.ts must not send chat_message via WebSocket');
    assert.ok(viewContent.includes('input.disabled = !isActive'), 'support.view.ts must disable input if not active');
  });

  after(async () => {
    try {
      await adminDbPool.end();
      adminRedis.disconnect();
    } catch {
      // ignore
    }
  });
});
