import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { adminDbPool } from '../dist/services/db.service.js';
import { pool as pdfPool } from '../../pdf/dist/config/database.config.js';
import { getEmailTicketById, listEmailTickets, replyToEmailTicket, updateEmailTicket } from '../dist/services/email-support.service.js';
import { addPublicTicketReply, createContactTicket, getPublicTicketByToken, handleInboundWebhookPayload } from '../../pdf/dist/services/contact.service.js';

const ROOT_DIR = process.cwd();
const ADMIN_DIR = fs.existsSync(path.resolve(ROOT_DIR, 'apps/admin')) ? path.resolve(ROOT_DIR, 'apps/admin') : ROOT_DIR;
const PDF_DIR = fs.existsSync(path.resolve(ROOT_DIR, 'apps/pdf')) ? path.resolve(ROOT_DIR, 'apps/pdf') : ROOT_DIR;

const ADMIN_SERVICE_PATH = path.resolve(ADMIN_DIR, 'src/services/email-support.service.ts');
const ADMIN_CONTROLLER_PATH = path.resolve(ADMIN_DIR, 'src/controllers/email-support.controller.ts');
const ADMIN_VIEW_PATH = path.resolve(ADMIN_DIR, 'client/views/support.view.ts');
const ADMIN_HTML_PATH = path.resolve(ADMIN_DIR, 'public/views/support/support.html');

const PDF_SERVICE_PATH = path.resolve(PDF_DIR, 'src/services/contact.service.ts');
const PDF_CONTROLLER_PATH = path.resolve(PDF_DIR, 'src/controllers/support.controller.ts');
const PDF_VIEW_PATH = path.resolve(PDF_DIR, 'client/views/contact.view.ts');
const PDF_HTML_PATH = path.resolve(PDF_DIR, 'public/views/contact/contact.html');

describe('Suite: Email Support & Contact Ticket Threading (Option A & B Readiness)', () => {
  it('Requirement AGENTS.md: Zero console.log/warn/error across email support files', () => {
    const files = [
      ADMIN_SERVICE_PATH,
      ADMIN_CONTROLLER_PATH,
      ADMIN_VIEW_PATH,
      PDF_SERVICE_PATH,
      PDF_CONTROLLER_PATH,
      PDF_VIEW_PATH,
    ];

    for (const f of files) {
      assert.ok(fs.existsSync(f), `File must exist: ${f}`);
      const content = fs.readFileSync(f, 'utf8');
      assert.ok(!content.includes('console.log'), `No console.log in ${f}`);
      assert.ok(!content.includes('console.warn'), `No console.warn in ${f}`);
      assert.ok(!content.includes('console.error'), `No console.error in ${f}`);
    }
  });

  it('Requirement AGENTS.md: Single-line horizontal imports in email support files', () => {
    const files = [
      ADMIN_SERVICE_PATH,
      ADMIN_CONTROLLER_PATH,
      PDF_SERVICE_PATH,
      PDF_CONTROLLER_PATH,
    ];

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

  it('Requirement AGENTS.md: Zero id="..." attributes in support and contact HTML/views', () => {
    const adminHtml = fs.readFileSync(ADMIN_HTML_PATH, 'utf8');
    const pdfHtml = fs.readFileSync(PDF_HTML_PATH, 'utf8');

    assert.ok(!adminHtml.includes(' id="') && !adminHtml.includes(" id='"), 'support.html must not contain id="..." attributes');
    assert.ok(!pdfHtml.includes(' id="') && !pdfHtml.includes(" id='"), 'contact.html must not contain id="..." attributes');

    assert.ok(adminHtml.includes('data-ref="btn-channel-email"'), 'support.html must have btn-channel-email data-ref');
    assert.ok(adminHtml.includes('data-ref="support-split-layout-email"'), 'support.html must have support-split-layout-email data-ref');
    assert.ok(adminHtml.includes('data-ref="btn-submit-email-reply"'), 'support.html must have btn-submit-email-reply data-ref');
  });

  it('Public Contact Flow: creates ticket, generates initial Message-ID and tracking token', async () => {
    const uniqueEmail = `test.user.${Date.now()}@example.com`;
    const created = await createContactTicket({
      category: 'technical',
      email: uniqueEmail,
      message: 'Tengo un problema al fusionar varios archivos PDF de gran tamaño.',
      name: 'Usuario Prueba',
      subject: 'Problema al unir PDFs',
      websiteId: 'aurora-pdf',
    });

    assert.ok(created.ticketId, 'Must return a ticketId');
    assert.ok(created.ticketNumber.startsWith('TK-'), 'Must generate a valid TK- number');
    assert.ok(created.trackingToken, 'Must generate a tracking token');
    assert.ok(created.portalUrl.includes(created.trackingToken), 'Portal URL must contain tracking token');

    const publicTicket = await getPublicTicketByToken(created.trackingToken);
    assert.ok(publicTicket, 'Public ticket should be retrieved by token');
    assert.strictEqual(publicTicket.ticketNumber, created.ticketNumber);
    assert.strictEqual(publicTicket.status, 'open');
    assert.strictEqual(publicTicket.messages.length, 1);
    assert.strictEqual(publicTicket.messages[0].senderType, 'customer');
  });

  it('Admin Email Support: lists tickets and supports status/search filters', async () => {
    const list = await listEmailTickets({ status: 'all' });
    assert.ok(list.stats.total >= 1, 'Total tickets should be >= 1');
    assert.ok(Array.isArray(list.tickets));

    const openList = await listEmailTickets({ status: 'open' });
    for (const t of openList.tickets) {
      assert.strictEqual(t.status, 'open');
    }
  });

  it('Admin Threading Flow: agent replies with SMTP threading headers (In-Reply-To & References)', async () => {
    const created = await createContactTicket({
      category: 'billing',
      email: `billing.client.${Date.now()}@testcorp.com`,
      message: 'Necesito factura fiscal para mi suscripción anual.',
      name: 'Cliente Corporativo',
      subject: 'Solicitud de Factura con RFC',
      websiteId: 'aurora-pdf',
    });

    const ticketBefore = await getEmailTicketById(created.ticketId);
    assert.ok(ticketBefore);
    const initialMsgId = ticketBefore.initial_message_id;
    assert.ok(initialMsgId, 'Must have initial_message_id');

    const agentReply = await replyToEmailTicket(created.ticketId, {
      agentEmail: 'soporte@projectaurora.com',
      agentId: 'agent-001',
      agentName: 'Agente Aurora',
      isInternalNote: false,
      message: 'Estimado cliente, con gusto le generamos su factura fiscal. Por favor proporcione su Constancia de Situación Fiscal.',
      newStatus: 'waiting_user',
    });

    assert.strictEqual(agentReply.is_internal_note, false);
    assert.strictEqual(agentReply.in_reply_to, initialMsgId, 'Agent reply In-Reply-To must match ticket initial Message-ID for thread chaining');
    assert.ok(agentReply.smtp_message_id, 'Agent reply must generate a new SMTP Message-ID');

    const ticketAfter = await getEmailTicketById(created.ticketId);
    assert.ok(ticketAfter);
    assert.strictEqual(ticketAfter.status, 'waiting_user');
    assert.strictEqual(ticketAfter.last_message_id, agentReply.smtp_message_id, 'Ticket last_message_id must be updated with the reply Message-ID');
    assert.strictEqual(ticketAfter.messages.length, 2);

    const internalNote = await replyToEmailTicket(created.ticketId, {
      agentId: 'agent-001',
      agentName: 'Agente Aurora',
      isInternalNote: true,
      message: 'Nota interna: Se verificó la cuenta y cuenta con plan Pro activo.',
    });

    assert.strictEqual(internalNote.is_internal_note, true);
    assert.strictEqual(internalNote.smtp_message_id, null, 'Internal notes do not generate SMTP Message-ID');

    const publicView = await getPublicTicketByToken(created.trackingToken);
    assert.ok(publicView);
    assert.strictEqual(publicView.messages.length, 2, 'Public portal must NOT expose internal notes to the customer');
  });

  it('Option A Portal Reply: customer replies from web portal using token', async () => {
    const created = await createContactTicket({
      category: 'general',
      email: `portal.reply.${Date.now()}@domain.org`,
      message: '¿Tienen soporte para procesar archivos vía API?',
      name: 'Desarrollador Web',
      subject: 'Consulta sobre API REST',
      websiteId: 'aurora-pdf',
    });

    await replyToEmailTicket(created.ticketId, {
      agentId: 'agent-002',
      agentName: 'Soporte Técnico',
      isInternalNote: false,
      message: 'Sí, disponemos de endpoints REST para integración en planes Business.',
      newStatus: 'waiting_user',
    });

    const ok = await addPublicTicketReply(
      created.trackingToken,
      '¡Excelente! ¿Dónde puedo consultar la documentación de los endpoints?',
      'Desarrollador Web'
    );
    assert.strictEqual(ok, true);

    const ticketUpdated = await getEmailTicketById(created.ticketId);
    assert.ok(ticketUpdated);
    assert.strictEqual(ticketUpdated.status, 'open', 'Ticket status should re-open when customer replies from portal');
    assert.strictEqual(ticketUpdated.messages.length, 3);
  });

  it('Option B Inbound Webhook Readiness: parses email subject and appends to conversation', async () => {
    const created = await createContactTicket({
      category: 'suggestion',
      email: `inbound.test.${Date.now()}@domain.com`,
      message: 'Sería genial poder ordenar las páginas en modo vista previa antes de unir.',
      name: 'Usuario Feedback',
      subject: 'Sugerencia para Unir PDF',
      websiteId: 'aurora-pdf',
    });

    const processed = await handleInboundWebhookPayload({
      from: created.ticketId,
      messageId: `<inbound-reply-msg-999@domain.com>`,
      subject: `Re: [Ticket #${created.ticketNumber}] Sugerencia para Unir PDF`,
      text: 'Adjunto un boceto de cómo me gustaría que se visualice la interfaz.',
    });

    assert.strictEqual(processed, true, 'Webhook must successfully parse and process incoming email');

    const ticketAfterWebhook = await getEmailTicketById(created.ticketId);
    assert.ok(ticketAfterWebhook);
    assert.strictEqual(ticketAfterWebhook.messages.length, 2);
    const lastMsg = ticketAfterWebhook.messages[ticketAfterWebhook.messages.length - 1];
    assert.strictEqual(lastMsg.message, 'Adjunto un boceto de cómo me gustaría que se visualice la interfaz.');
  });

  it('Admin Ticket Status Management: marks ticket resolved and closed', async () => {
    const created = await createContactTicket({
      category: 'security',
      email: `security.check.${Date.now()}@domain.com`,
      message: 'Solicito confirmación de eliminación de mis archivos temporales.',
      name: 'Auditor Privacidad',
      subject: 'Eliminación de archivos temporales',
      websiteId: 'aurora-pdf',
    });

    const resolved = await updateEmailTicket(created.ticketId, { status: 'resolved' });
    assert.strictEqual(resolved, true);

    let ticket = await getEmailTicketById(created.ticketId);
    assert.strictEqual(ticket?.status, 'resolved');
    assert.ok(ticket?.resolved_at);

    const closed = await updateEmailTicket(created.ticketId, { status: 'closed' });
    assert.strictEqual(closed, true);

    ticket = await getEmailTicketById(created.ticketId);
    assert.strictEqual(ticket?.status, 'closed');
    assert.ok(ticket?.closed_at);
  });

  after(async () => {
    try {
      await adminDbPool.end();
      await pdfPool.end();
    } catch {
      // quiet
    }
  });
});
