import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { SupportAiService } from '../dist/services/support-ai.service.js';

const ROOT_DIR = process.cwd();
const SUPPORT_SERVICE_PATH = path.resolve(ROOT_DIR, 'apps/pdf/src/services/support-ai.service.ts');
const SUPPORT_CONTROLLER_PATH = path.resolve(ROOT_DIR, 'apps/pdf/src/controllers/support.controller.ts');
const SUPPORT_ROUTES_PATH = path.resolve(ROOT_DIR, 'apps/pdf/src/routes/support.routes.ts');
const SUPPORT_COMPONENT_PATH = path.resolve(ROOT_DIR, 'apps/pdf/client/components/support-sidebar.component.ts');

describe('Suite: Support AI Assistant & Web Knowledge', () => {
  it('Requirement AGENTS.md: Zero console.log/warn/error across Support AI codebase', () => {
    const filesToCheck = [SUPPORT_SERVICE_PATH, SUPPORT_CONTROLLER_PATH, SUPPORT_ROUTES_PATH, SUPPORT_COMPONENT_PATH];
    for (const filePath of filesToCheck) {
      assert.ok(fs.existsSync(filePath), `File must exist: ${filePath}`);
      const content = fs.readFileSync(filePath, 'utf8');
      assert.ok(
        !content.includes('console.log') &&
        !content.includes('console.warn') &&
        !content.includes('console.error'),
        `File ${filePath} must not contain console.* statements`
      );
    }
  });

  it('Requirement AGENTS.md: Single-line horizontal imports', () => {
    const filesToCheck = [SUPPORT_SERVICE_PATH, SUPPORT_CONTROLLER_PATH, SUPPORT_ROUTES_PATH, SUPPORT_COMPONENT_PATH];
    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('import ') && !line.includes(' from ') && !line.endsWith(';')) {
          assert.fail(`Multi-line import detected at line ${i + 1} in ${filePath}`);
        }
      }
    }
  });

  it('Requirement AGENTS.md: Zero id="..." attributes in support-sidebar.component.ts', () => {
    const content = fs.readFileSync(SUPPORT_COMPONENT_PATH, 'utf8');
    assert.ok(!content.includes('id='), 'support-sidebar.component.ts must not contain id="..." attributes');
    assert.ok(content.includes("'tech-support-sidebar'"), 'Must contain tech-support-sidebar ref');
    assert.ok(content.includes('data-ref="input-tech-support"'), 'Must contain data-ref="input-tech-support"');
    assert.ok(content.includes('data-ref="btn-send-tech-support"'), 'Must contain data-ref="btn-send-tech-support"');
  });

  it('SupportAiService: responds to question about compression with markdown and web info', async () => {
    const res = await SupportAiService.askSupport('¿Cómo puedo comprimir un archivo PDF?');
    assert.strictEqual(res.success, true);
    assert.ok(typeof res.reply === 'string' && res.reply.length > 0);
    assert.ok(res.reply.toLowerCase().includes('comprim') || res.reply.includes('/compress-pdf'));
  });

  it('SupportAiService: responds to question about security with markdown', async () => {
    const res = await SupportAiService.askSupport('¿Qué hacen con mis archivos? ¿Cuánto tiempo se guardan?');
    assert.strictEqual(res.success, true);
    assert.ok(res.reply.includes('2 horas') || res.reply.toLowerCase().includes('seguridad') || res.reply.toLowerCase().includes('cifrad'));
  });

  it('SupportAiService: rejects empty message', async () => {
    const res = await SupportAiService.askSupport('   ');
    assert.strictEqual(res.success, false);
  });
});
