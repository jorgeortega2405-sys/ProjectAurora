import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { pool } from '../dist/config/database.config.js';
import { redis } from '../dist/config/redis.config.js';
import { LiveSupportService } from '../dist/services/live-support.service.js';
import { SupportAiService } from '../dist/services/support-ai.service.js';
import { SupportAuditService } from '../dist/services/support-audit.service.js';

const ROOT_DIR = process.cwd();
const PDF_DIR = fs.existsSync(path.resolve(ROOT_DIR, 'apps/pdf')) ? path.resolve(ROOT_DIR, 'apps/pdf') : ROOT_DIR;
const LIVE_SERVICE_PATH = path.resolve(PDF_DIR, 'src/services/live-support.service.ts');
const LIVE_CONTROLLER_PATH = path.resolve(PDF_DIR, 'src/controllers/live-support.controller.ts');
const LIVE_ROUTES_PATH = path.resolve(PDF_DIR, 'src/routes/live-support.routes.ts');
const SUPPORT_COMPONENT_PATH = path.resolve(PDF_DIR, 'client/components/support-sidebar.component.ts');

describe('Suite: Live Support Chat & AI Agent Handoff (apps/pdf)', () => {
  it('Requirement AGENTS.md: Zero console.log/warn/error across Live Support files', () => {
    const files = [LIVE_SERVICE_PATH, LIVE_CONTROLLER_PATH, LIVE_ROUTES_PATH, SUPPORT_COMPONENT_PATH];
    for (const f of files) {
      assert.ok(fs.existsSync(f), `File must exist: ${f}`);
      const content = fs.readFileSync(f, 'utf8');
      assert.ok(!content.includes('console.log'), `No console.log in ${f}`);
      assert.ok(!content.includes('console.warn'), `No console.warn in ${f}`);
      assert.ok(!content.includes('console.error'), `No console.error in ${f}`);
    }
  });

  it('Requirement AGENTS.md: Single-line horizontal imports across Live Support files', () => {
    const files = [LIVE_SERVICE_PATH, LIVE_CONTROLLER_PATH, LIVE_ROUTES_PATH, SUPPORT_COMPONENT_PATH];
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

  it('Requirement AGENTS.md: Zero id="..." attributes in support-sidebar.component.ts', () => {
    const content = fs.readFileSync(SUPPORT_COMPONENT_PATH, 'utf8');
    assert.ok(!content.includes('id='), 'Must not contain id=');
    assert.ok(content.includes('data-ref="chat-live-badge"'), 'Must render live badge ref');
  });

  it('AI Handoff: Prompts for reason when user asks to speak with an agent', async () => {
    const res = await SupportAiService.askSupport('Quiero hablar con un agente de soporte');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.awaitingReason, true);
    assert.ok(res.reply.toLowerCase().includes('motivo o razón') || res.reply.toLowerCase().includes('motivo o razon'));
  });

  it('AI Handoff: Detects natural contact question "si puedes ponerme en contacto o no? en vivo"', async () => {
    const res = await SupportAiService.askSupport('si puedes ponerme en contacto o no? en vivo');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.awaitingReason, true);
    assert.ok(res.reply.toLowerCase().includes('motivo o razon') || res.reply.toLowerCase().includes('motivo o razón'));
  });

  it('AI Handoff: Triggers handoff when user provides reason after being prompted', async () => {
    const history = [
      { role: 'user', text: 'Quiero hablar con un agente' },
      { role: 'assistant', text: 'Con gusto te comunico con un agente de soporte en vivo. Por favor indícame brevemente el motivo o razón de tu consulta para transferirte al equipo adecuado.' },
    ];
    const res = await SupportAiService.askSupport('Tengo problemas para convertir mi archivo PDF con tablas complejas', history);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.requiresHandoff, true);
    assert.strictEqual(res.reason, 'Tengo problemas para convertir mi archivo PDF con tablas complejas');
  });

  it('AI Handoff: Triggers immediate handoff if reason is included in same message', async () => {
    const res = await SupportAiService.askSupport('Deseo hablar con un agente humano porque el cobro en mi tarjeta se duplicó');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.requiresHandoff, true);
    assert.ok(res.reason?.includes('el cobro en mi tarjeta se duplicó'));
  });

  it('LiveSupportService: creates chat, stores initial system message, and saves user messages', async () => {
    const testSessionId = `test_sess_${Date.now()}`;
    const testEmail = `usuario.prueba.${Date.now()}@aurora.app`;
    const chat = await LiveSupportService.createChat({
      sessionId: testSessionId,
      subject: 'Problema al procesar foliado en archivo protegido',
      userEmail: testEmail,
      userName: 'Carlos Prueba',
    });

    assert.strictEqual(chat.id.length, 36);
    assert.strictEqual(chat.status, 'pending');
    assert.strictEqual(chat.tier, 'L1');
    assert.strictEqual(chat.user_name, 'Carlos Prueba');

    const fetched = await LiveSupportService.getChatById(chat.id);
    assert.ok(fetched);
    assert.strictEqual(fetched?.id, chat.id);

    const userMsg = await LiveSupportService.addUserMessage({
      chatId: chat.id,
      message: '¿Podrían ayudarme a revisar este documento?',
      senderName: 'Carlos Prueba',
    });
    assert.strictEqual(userMsg.id.length, 36);
    assert.strictEqual(userMsg.sender_type, 'user');

    const messages = await LiveSupportService.getMessages(chat.id);
    assert.ok(messages.length >= 2, 'Must contain initial system welcome and user message');
    assert.ok(messages.some((m) => m.sender_type === 'system'), 'Must contain system message');
    assert.ok(messages.some((m) => m.sender_type === 'user'), 'Must contain user message');

    await pool.query('DELETE FROM live_support_messages WHERE chat_id = ?', [chat.id]);
    await pool.query('DELETE FROM live_support_chats WHERE id = ?', [chat.id]);
  });

  it('LiveSupportService: rejects adding user message if chat is closed', async () => {
    const testSessionId = `test_closed_sess_${Date.now()}`;
    const chat = await LiveSupportService.createChat({
      sessionId: testSessionId,
      subject: 'Caso cerrado para prueba de rechazo',
      userEmail: 'usuario.cerrado@aurora.app',
      userName: 'Carlos Cerrado',
    });

    await pool.query("UPDATE live_support_chats SET status = 'closed', closed_at = NOW() WHERE id = ?", [chat.id]);

    await assert.rejects(
      async () => {
        await LiveSupportService.addUserMessage({
          chatId: chat.id,
          message: 'Intento de mensaje en chat cerrado',
          senderName: 'Carlos Cerrado',
        });
      },
      /cerrada/i
    );

    await pool.query('DELETE FROM live_support_messages WHERE chat_id = ?', [chat.id]);
    await pool.query('DELETE FROM live_support_chats WHERE id = ?', [chat.id]);
  });

  it('LiveSupportService: prevents duplicate cases by reusing existing active chat for same user/session', async () => {
    const testSessionId = `test_unique_sess_${Date.now()}`;
    const firstChat = await LiveSupportService.createChat({
      sessionId: testSessionId,
      subject: 'Caso inicial de prueba única',
      userEmail: 'cliente.unico@aurora.app',
      userName: 'Cliente Único',
    });

    const secondChat = await LiveSupportService.createChat({
      sessionId: testSessionId,
      subject: 'Intento de abrir segundo caso duplicado',
      userEmail: 'cliente.unico@aurora.app',
      userName: 'Cliente Único',
    });

    assert.strictEqual(firstChat.id, secondChat.id, 'Debe reusar el mismo chat activo en lugar de abrir otro caso');

    const [rows] = await pool.query(
      'SELECT COUNT(*) AS total FROM live_support_chats WHERE session_id = ?',
      [testSessionId]
    );
    assert.strictEqual(rows[0].total, 1, 'Solo debe existir exactamente 1 caso registrado en base de datos');

    const activeChat = await LiveSupportService.getActiveChat({ sessionId: testSessionId });
    assert.ok(activeChat);
    assert.strictEqual(activeChat.id, firstChat.id);

    await LiveSupportService.closeChat(firstChat.id, 'user');
    const closed = await LiveSupportService.getChatById(firstChat.id);
    assert.strictEqual(closed?.status, 'closed');
    assert.ok(closed?.closed_at);

    await LiveSupportService.rateChat({
      chatId: firstChat.id,
      feedbackComment: 'Excelente atención rápida y concisa',
      rating: 5,
    });

    const rated = await LiveSupportService.getChatById(firstChat.id);
    assert.strictEqual(rated?.rating, 5);
    assert.strictEqual(rated?.feedback_comment, 'Excelente atención rápida y concisa');
    assert.ok(rated?.rated_at);

    await pool.query('DELETE FROM live_support_messages WHERE chat_id = ?', [firstChat.id]);
    await pool.query('DELETE FROM live_support_chats WHERE id = ?', [firstChat.id]);
  });

  it('Requirement AGENTS.md: support-sidebar.component.ts implements persistence, finalize button and rating modal', () => {
    const componentContent = fs.readFileSync(SUPPORT_COMPONENT_PATH, 'utf8');
    assert.ok(componentContent.includes('STORAGE_KEY_CHAT_ID'), 'Must define STORAGE_KEY_CHAT_ID');
    assert.ok(componentContent.includes('STORAGE_KEY_SESSION_ID'), 'Must define STORAGE_KEY_SESSION_ID');
    assert.ok(componentContent.includes('STORAGE_KEY_SIDEBAR_OPEN'), 'Must define STORAGE_KEY_SIDEBAR_OPEN');
    assert.ok(componentContent.includes('btn-end-live-chat'), 'Must include btn-end-live-chat');
    assert.ok(componentContent.includes('openSupportRatingModal'), 'Must include openSupportRatingModal');
    assert.ok(componentContent.includes('checkAndResumeActiveChat'), 'Must include checkAndResumeActiveChat');
    assert.ok(!componentContent.includes('id="') && !componentContent.includes("id='"), 'Zero id attributes');
  });

  it('Requirement AGENTS.md: Deduplication and transport unification in support-sidebar.component.ts', () => {
    const componentContent = fs.readFileSync(SUPPORT_COMPONENT_PATH, 'utf8');
    assert.ok(componentContent.includes('renderedMessageIds'), 'support-sidebar must track renderedMessageIds');
    assert.ok(!componentContent.includes("type: 'chat_message'"), 'support-sidebar must not send chat_message via WebSocket');
    assert.ok(componentContent.includes('isClosed'), 'support-sidebar must handle isClosed response');
    assert.ok(componentContent.includes('textarea.disabled = true'), 'support-sidebar must disable textarea when chat is closed');
  });

  after(async () => {
    try {
      await SupportAuditService.closeClient();
      await pool.end();
      redis.disconnect();
    } catch {
      // ignore
    }
  });
});
