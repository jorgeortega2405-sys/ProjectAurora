import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { SupportQualityService } from '../dist/services/support-quality.service.js';

const ROOT_DIR = process.cwd();
const ADMIN_DIR = fs.existsSync(path.resolve(ROOT_DIR, 'apps/admin')) ? path.resolve(ROOT_DIR, 'apps/admin') : ROOT_DIR;
const QUALITY_SERVICE_PATH = path.resolve(ADMIN_DIR, 'src/services/support-quality.service.ts');
const SUPPORT_CONTROLLER_PATH = path.resolve(ADMIN_DIR, 'src/controllers/support.controller.ts');
const SUPPORT_VIEW_PATH = path.resolve(ADMIN_DIR, 'client/views/support.view.ts');
const SUPPORT_HTML_PATH = path.resolve(ADMIN_DIR, 'public/views/support/support.html');

describe('Suite: Support Agent AI Quality Gate & Tone Refinement (Gemini)', () => {
  it('AGENTS.md & GEMINI.md: Prohibición total de console.* en archivos involucrados', () => {
    const files = [QUALITY_SERVICE_PATH, SUPPORT_CONTROLLER_PATH, SUPPORT_VIEW_PATH];
    for (const file of files) {
      assert.ok(fs.existsSync(file), `El archivo debe existir: ${file}`);
      const content = fs.readFileSync(file, 'utf8');
      assert.ok(!content.includes('console.log'), `No debe contener console.log: ${file}`);
      assert.ok(!content.includes('console.warn'), `No debe contener console.warn: ${file}`);
      assert.ok(!content.includes('console.error'), `No debe contener console.error: ${file}`);
    }
  });

  it('AGENTS.md: Imports horizontales en una sola línea y ordenados alfabéticamente', () => {
    const files = [QUALITY_SERVICE_PATH, SUPPORT_CONTROLLER_PATH, SUPPORT_VIEW_PATH];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('import ') && !line.includes(' from ') && !line.endsWith(';')) {
          assert.fail(`Import multilinea detectado en ${file} línea ${i + 1}`);
        }
      }
    }
  });

  it('AGENTS.md: CERO atributos id="..." en plantillas HTML y vistas cliente', () => {
    const htmlContent = fs.readFileSync(SUPPORT_HTML_PATH, 'utf8');
    const viewContent = fs.readFileSync(SUPPORT_VIEW_PATH, 'utf8');
    assert.ok(!htmlContent.includes(' id="') && !htmlContent.includes(" id='"), 'support.html no debe incluir id="..."');
    assert.ok(!viewContent.includes(' id="') && !viewContent.includes(" id='"), 'support.view.ts no debe incluir id="..."');
    assert.ok(!viewContent.includes('getElementById'), 'support.view.ts no debe invocar getElementById');
  });

  it('AGENTS.md: Banners de error ubicados debajo de los controles de acción', () => {
    const htmlContent = fs.readFileSync(SUPPORT_HTML_PATH, 'utf8');
    const toolbarIndex = htmlContent.indexOf('data-ref="support-input-toolbar"');
    const errorBannerIndex = htmlContent.indexOf('data-ref="support-offensive-error"');
    const infoBannerIndex = htmlContent.indexOf('data-ref="support-refinement-info"');

    assert.ok(toolbarIndex !== -1, 'Debe existir support-input-toolbar');
    assert.ok(errorBannerIndex !== -1, 'Debe existir support-offensive-error');
    assert.ok(infoBannerIndex !== -1, 'Debe existir support-refinement-info');
    assert.ok(errorBannerIndex > toolbarIndex, 'El banner de error debe ubicarse después/debajo del toolbar de entrada');
    assert.ok(infoBannerIndex > toolbarIndex, 'El banner de refinamiento debe ubicarse después/debajo del toolbar de entrada');
  });

  it('SupportQualityService: Detección heurística offline de palabras ofensivas', () => {
    const offensiveSamples = [
      'eres un idiota',
      'pedazo de estúpido',
      'no digas mierdas',
      'vete a la mierda',
      'eres un inútil',
      'cállate la boca',
      'no me jodas más',
      'you are an idiot',
      'shut up moron',
    ];

    for (const sample of offensiveSamples) {
      assert.strictEqual(
        SupportQualityService.checkOfflineOffensive(sample),
        true,
        `Debe detectar como ofensivo: "${sample}"`
      );
    }

    const cleanSamples = [
      'buenos días en qué puedo ayudarte',
      'por favor reinicia tu equipo',
      'adjunta una captura del problema',
      'muchas gracias por tu tiempo',
    ];

    for (const sample of cleanSamples) {
      assert.strictEqual(
        SupportQualityService.checkOfflineOffensive(sample),
        false,
        `No debe marcar como ofensivo: "${sample}"`
      );
    }
  });

  it('SupportQualityService: Refinamiento de tono formal con Gemini para mensajes legítimos', async () => {
    const draft = 'mira reinicia la compu y checa si jala de nuevo';
    const result = await SupportQualityService.refineAndModerateMessage(draft, {
      subject: 'Problema al convertir PDF',
      tier: 'L1',
      userName: 'Carlos',
    });

    assert.strictEqual(result.isOffensive, false);
    assert.strictEqual(result.reason, null);
    assert.ok(typeof result.refinedMessage === 'string');
    assert.ok(result.refinedMessage.length > 5);
    assert.ok(
      result.refinedMessage.toLowerCase().includes('reinici') ||
      result.refinedMessage.toLowerCase().includes('computadora') ||
      result.refinedMessage.toLowerCase().includes('equipo')
    );
  });

  it('SupportQualityService: Bloqueo estricto de mensajes ofensivos redactados por el agente', async () => {
    const offensiveDraft = 'mira reinicia la compu a ver si jala o si no te jodes';
    const result = await SupportQualityService.refineAndModerateMessage(offensiveDraft, {
      subject: 'Problema al convertir PDF',
      tier: 'L1',
      userName: 'Carlos',
    });

    assert.strictEqual(result.isOffensive, true);
    assert.ok(typeof result.reason === 'string');
    assert.ok(result.reason.length > 5);
    assert.strictEqual(result.refinedMessage, null);
  });
});
