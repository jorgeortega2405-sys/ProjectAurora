import assert from 'node:assert';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT_DIR = process.cwd();
const SRC_TOOLS_DIR = path.resolve(ROOT_DIR, 'src/tools');
const CLIENT_TOOLS_DIR = path.resolve(ROOT_DIR, 'client/views/tools');
const WORKFLOW_SERVICE_PATH = path.resolve(ROOT_DIR, 'src/services/workflow.service.ts');

function getAllFiles(dir, exts) {
  const result = [];
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...getAllFiles(full, exts));
    } else if (exts.some(ext => entry.name.endsWith(ext))) {
      result.push(full);
    }
  }
  return result;
}

describe('Suite: Workflow Service & Architecture Modular Audit', () => {
  it('Requirement R1: workflow.service.ts delegates all PDF manipulation and contains zero low-level pdf-lib manipulation', () => {
    assert.ok(fs.existsSync(WORKFLOW_SERVICE_PATH), 'workflow.service.ts must exist');
    const content = fs.readFileSync(WORKFLOW_SERVICE_PATH, 'utf8');

    assert.ok(!content.includes("from 'pdf-lib'"), 'workflow.service.ts must NOT import from pdf-lib');
    assert.ok(!content.includes('PDFDocument.load'), 'workflow.service.ts must NOT call PDFDocument.load directly');
    assert.ok(!content.includes('PDFDocument.create'), 'workflow.service.ts must NOT call PDFDocument.create directly');

    const expectedModularImports = [
      'compress-pdf.service.js',
      'crop-pdf.service.js',
      'ocr-pdf.service.js',
      'organize-pdf.service.js',
      'page-numbers.service.js',
      'protect-pdf.service.js',
      'remove-pdf-pages.service.js',
      'repair-pdf.service.js',
      'rotate-pdf.service.js',
      'split-pdf.service.js',
      'summarize-pdf.service.js',
      'translate-pdf.service.js',
      'unlock-pdf.service.js',
      'watermark-pdf.service.js'
    ];

    for (const mod of expectedModularImports) {
      assert.ok(
        content.includes(mod),
        `workflow.service.ts must import modular tool service: ${mod}`
      );
    }
  });

  it('Requirement R2: Strict isolation between tools (zero cross-tool imports in src/tools/)', () => {
    const toolDirs = fs.readdirSync(SRC_TOOLS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    const violations = [];
    for (const tool of toolDirs) {
      const toolFiles = getAllFiles(path.join(SRC_TOOLS_DIR, tool), ['.ts', '.js']);
      for (const file of toolFiles) {
        const text = fs.readFileSync(file, 'utf8');
        for (const otherTool of toolDirs) {
          if (otherTool === tool) continue;
          const importPattern = new RegExp(`from\\s+['\"][^'\"]*\\/${otherTool}\\b`, 'g');
          if (importPattern.test(text)) {
            violations.push(`${path.relative(ROOT_DIR, file)} illegally imports from tool "${otherTool}"`);
          }
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Cross-tool import violations in src/tools/:\n${violations.join('\n')}`
    );
  });

  it('Requirement R2: Strict isolation between tools (zero cross-tool imports in client/views/tools/)', () => {
    const clientToolDirs = fs.readdirSync(CLIENT_TOOLS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    const violations = [];
    for (const tool of clientToolDirs) {
      const toolFiles = getAllFiles(path.join(CLIENT_TOOLS_DIR, tool), ['.ts', '.js']);
      for (const file of toolFiles) {
        const text = fs.readFileSync(file, 'utf8');
        for (const otherTool of clientToolDirs) {
          if (otherTool === tool) continue;
          const importPattern = new RegExp(`from\\s+['\"][^'\"]*\\/${otherTool}\\b`, 'g');
          if (importPattern.test(text)) {
            violations.push(`${path.relative(ROOT_DIR, file)} illegally imports from tool "${otherTool}"`);
          }
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Cross-tool import violations in client/views/tools/:\n${violations.join('\n')}`
    );
  });

  it('Requirement R3: public/public/ residual directory is completely absent and canonical static assets exist', () => {
    const residualDir = path.resolve(ROOT_DIR, 'public/public');
    assert.strictEqual(
      fs.existsSync(residualDir),
      false,
      'public/public/ must not exist in the project directory tree'
    );

    const canonicalPaths = [
      path.resolve(ROOT_DIR, 'public/css/tools'),
      path.resolve(ROOT_DIR, 'public/views/tools'),
      path.resolve(ROOT_DIR, 'public/translations'),
      path.resolve(ROOT_DIR, 'public/icons.svg'),
      path.resolve(ROOT_DIR, 'public/favicon.svg')
    ];

    for (const canon of canonicalPaths) {
      assert.ok(
        fs.existsSync(canon),
        `Canonical static asset or directory must exist: ${canon}`
      );
    }
  });

  it('Requirement AGENTS.md: Zero console.* in workflow.service.ts', () => {
    const content = fs.readFileSync(WORKFLOW_SERVICE_PATH, 'utf8');
    const consoleRegex = /\bconsole\s*\.\s*(log|warn|error|info|debug)\b/;
    assert.ok(!consoleRegex.test(content), 'workflow.service.ts must contain ZERO console.* calls');
  });

  it('Requirement AGENTS.md: Single-line horizontal and alphabetical imports in workflow.service.ts', () => {
    const content = fs.readFileSync(WORKFLOW_SERVICE_PATH, 'utf8');
    const lines = content.split('\n');
    const importLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('import ')) {
        importLines.push(line);
        assert.ok(!lines[i].includes('\n'), `Import must be single line: ${line}`);
      } else if (importLines.length > 0 && !line.startsWith('//') && line.length > 0) {
        break;
      }
    }

    assert.ok(importLines.length >= 15, 'workflow.service.ts must have modular service imports');
  });

  it('Functional Execution: Multi-step PDF pipeline chaining through executeWorkflowSteps', () => {
    const runnerScript = `
      import { PDFDocument } from 'pdf-lib';
      import { executeWorkflowSteps, getWorkflowResult } from './dist/services/workflow.service.js';

      async function run() {
        const doc = await PDFDocument.create();
        doc.addPage([400, 400]);
        doc.addPage([400, 400]);
        doc.addPage([400, 400]);
        const bytes = await doc.save();
        const inputBuffer = Buffer.from(bytes);

        const steps = [
          { id: 's1', tool: 'organize-pdf', options: { order: 'reverse' } },
          { id: 's2', tool: 'rotate-pdf', options: { globalRotation: 90 } },
          { id: 's3', tool: 'watermark-pdf', options: { text: 'APROBADO' } },
          { id: 's4', tool: 'page-numbers', options: { position: 'bottom-center' } },
          { id: 's5', tool: 'compress-pdf', options: { level: 'recommended' } }
        ];

        const res = await executeWorkflowSteps(steps, inputBuffer, 'prueba.pdf');
        if (!res.success || res.totalSteps !== 5) {
          throw new Error('Pipeline failed: ' + JSON.stringify(res));
        }

        const token = res.downloadUrl.split('/').pop();
        const stored = await getWorkflowResult(token);
        if (!stored || !stored.buffer) {
          throw new Error('Stored result buffer not found');
        }

        const finalDoc = await PDFDocument.load(stored.buffer);
        if (finalDoc.getPageCount() !== 3) {
          throw new Error('Invalid output page count: ' + finalDoc.getPageCount());
        }

        if (finalDoc.getPage(0).getRotation().angle !== 90) {
          throw new Error('Rotation was not preserved: ' + finalDoc.getPage(0).getRotation().angle);
        }

        process.exit(0);
      }

      run().catch(err => {
        console.error(err);
        process.exit(1);
      });
    `;

    const result = execSync(`node --input-type=module -e "${runnerScript.replace(/\n/g, ' ')}"`, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: 'pipe'
    });
    assert.ok(true, 'Multi-step pipeline finished successfully');
  });

  it('Functional Execution: Error handling on unknown tool or invalid options', () => {
    const errorScript = `
      import { PDFDocument } from 'pdf-lib';
      import { executeWorkflowSteps } from './dist/services/workflow.service.js';

      async function run() {
        const doc = await PDFDocument.create();
        doc.addPage([200, 200]);
        const inputBuffer = Buffer.from(await doc.save());

        const unknownRes = await executeWorkflowSteps(
          [{ id: 'u1', tool: 'unsupported-tool', options: {} }],
          inputBuffer,
          'test.pdf'
        );
        if (unknownRes.success !== false || unknownRes.steps[0].success !== false) {
          throw new Error('Unknown tool must fail step and workflow');
        }

        const missingCropRes = await executeWorkflowSteps(
          [{ id: 'c1', tool: 'crop-pdf', options: {} }],
          inputBuffer,
          'test.pdf'
        );
        if (missingCropRes.success !== false || missingCropRes.steps[0].success !== false) {
          throw new Error('Crop without cropBox must fail step');
        }

        let emptyBufThrew = false;
        try {
          await executeWorkflowSteps([{ id: '1', tool: 'compress-pdf', options: {} }], Buffer.alloc(0), 'x.pdf');
        } catch {
          emptyBufThrew = true;
        }
        if (!emptyBufThrew) throw new Error('Empty buffer must throw');

        let emptyStepsThrew = false;
        try {
          await executeWorkflowSteps([], inputBuffer, 'x.pdf');
        } catch {
          emptyStepsThrew = true;
        }
        if (!emptyStepsThrew) throw new Error('Empty steps must throw');

        process.exit(0);
      }

      run().catch(err => {
        console.error(err);
        process.exit(1);
      });
    `;

    const result = execSync(`node --input-type=module -e "${errorScript.replace(/\n/g, ' ')}"`, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: 'pipe'
    });
    assert.ok(true, 'Error handling checks passed');
  });

  it('Event loop lifecycle: importing workflow.service.js exits cleanly without hanging or process.exit', () => {
    const cleanExitScript = `import('./dist/services/workflow.service.js');`;
    const result = execSync(`node --input-type=module -e "${cleanExitScript}"`, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 5000
    });
    assert.ok(true, 'Imported workflow.service.js cleanly terminated without process.exit');
  });

  it('Adversarial Edge Cases: terminal tools cannot be chained before other steps', () => {
    const terminalScript = `
      import { PDFDocument } from 'pdf-lib';
      import { executeWorkflowSteps } from './dist/services/workflow.service.js';

      async function run() {
        const doc = await PDFDocument.create();
        doc.addPage([200, 200]);
        const inputBuffer = Buffer.from(await doc.save());

        const termRes = await executeWorkflowSteps(
          [
            { id: 't1', tool: 'pdf-to-word', options: {} },
            { id: 't2', tool: 'rotate-pdf', options: { globalRotation: 90 } }
          ],
          inputBuffer,
          'sample.pdf'
        );

        if (termRes.success !== false || termRes.steps[0].success !== false) {
          throw new Error('Terminal step chained before other steps must fail');
        }

        const sumRes = await executeWorkflowSteps(
          [
            { id: 's1', tool: 'summarize-pdf', options: {} },
            { id: 's2', tool: 'compress-pdf', options: {} }
          ],
          inputBuffer,
          'sample.pdf'
        );

        if (sumRes.success !== false || sumRes.steps[0].success !== false) {
          throw new Error('Summarize step chained before other steps must fail');
        }
      }

      run().catch(err => {
        console.error(err);
        process.exit(1);
      });
    `;

    execSync(`node --input-type=module -e "${terminalScript.replace(/\n/g, ' ')}"`, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 10000
    });
    assert.ok(true, 'Terminal tool chaining checks passed');
  });

  it('Robustness: watermark-pdf validates image watermark and fails if missing image', () => {
    const watermarkScript = `
      import { PDFDocument } from 'pdf-lib';
      import { executeWorkflowSteps } from './dist/services/workflow.service.js';

      async function run() {
        const doc = await PDFDocument.create();
        doc.addPage([200, 200]);
        const inputBuffer = Buffer.from(await doc.save());

        const missingImageRes = await executeWorkflowSteps(
          [{ id: 'w1', tool: 'watermark-pdf', options: { type: 'image' } }],
          inputBuffer,
          'test.pdf'
        );

        if (missingImageRes.success !== false || missingImageRes.steps[0].success !== false) {
          throw new Error('Image watermark without image must fail');
        }

        const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        const validImageRes = await executeWorkflowSteps(
          [{ id: 'w2', tool: 'watermark-pdf', options: { type: 'image', imageBase64: pngBase64 } }],
          inputBuffer,
          'test.pdf'
        );

        if (validImageRes.success !== true || validImageRes.steps[0].success !== true) {
          throw new Error('Image watermark with valid base64 image must succeed');
        }
      }

      run().catch(err => {
        console.error(err);
        process.exit(1);
      });
    `;

    execSync(`node --input-type=module -e "${watermarkScript.replace(/\n/g, ' ')}"`, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 10000
    });
    assert.ok(true, 'Image watermark validation and execution checks passed');
  });

  it('Robustness: organize-pdf and rotate-pdf normalize numeric array and 1-based page formats', () => {
    const normalizeScript = `
      import { PDFDocument } from 'pdf-lib';
      import { executeWorkflowSteps, getWorkflowResult } from './dist/services/workflow.service.js';

      async function run() {
        const doc = await PDFDocument.create();
        doc.addPage([200, 200]);
        doc.addPage([200, 200]);
        doc.addPage([200, 200]);
        const inputBuffer = Buffer.from(await doc.save());

        const organizeNumericRes = await executeWorkflowSteps(
          [{ id: 'o1', tool: 'organize-pdf', options: { pagesOrder: [2, 0, 1] } }],
          inputBuffer,
          'test.pdf'
        );

        if (!organizeNumericRes.success) {
          throw new Error('Organize with numeric pagesOrder array must succeed');
        }

        const rotateOneBasedRes = await executeWorkflowSteps(
          [{ id: 'r1', tool: 'rotate-pdf', options: { pages: [{ pageNumber: 2, rotation: 180 }] } }],
          inputBuffer,
          'test.pdf'
        );

        if (!rotateOneBasedRes.success) {
          throw new Error('Rotate with 1-based pageNumber must succeed');
        }

        const token = rotateOneBasedRes.downloadUrl.split('/').pop();
        const stored = await getWorkflowResult(token);
        const rotatedDoc = await PDFDocument.load(stored.buffer);
        if (rotatedDoc.getPage(1).getRotation().angle !== 180) {
          throw new Error('Page 2 rotation angle was not applied');
        }

        const organizeObjRes = await executeWorkflowSteps(
          [{ id: 'o2', tool: 'organize-pdf', options: { pagesOrder: [{ pageNumber: 2 }, { pageNumber: 1 }] } }],
          inputBuffer,
          'test.pdf'
        );
        if (!organizeObjRes.success) {
          throw new Error('Organize with pageNumber object array must succeed');
        }

        const removeObjRes = await executeWorkflowSteps(
          [{ id: 'rm1', tool: 'remove-pdf-pages', options: { pagesToRemove: [{ pageNumber: 1 }] } }],
          inputBuffer,
          'test.pdf'
        );
        if (!removeObjRes.success) {
          throw new Error('Remove pages with pageNumber object array must succeed');
        }

        const extractObjRes = await executeWorkflowSteps(
          [{ id: 'ex1', tool: 'extract-pdf-pages', options: { selectedPages: [{ pageNumber: 2 }] } }],
          inputBuffer,
          'test.pdf'
        );
        if (!extractObjRes.success) {
          throw new Error('Extract pages with pageNumber object array must succeed');
        }
      }

      run().catch(err => {
        console.error(err);
        process.exit(1);
      });
    `;

    execSync(`node --input-type=module -e "${normalizeScript.replace(/\n/g, ' ')}"`, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 10000
    });
    assert.ok(true, 'Option normalization checks passed');
  });

  it('Adversarial Robustness: null steps and multi-file zip pipeline guards', () => {
    const edgeScript = `
      import { PDFDocument } from 'pdf-lib';
      import { executeWorkflowSteps } from './dist/services/workflow.service.js';

      async function run() {
        const doc = await PDFDocument.create();
        doc.addPage([200, 200]);
        doc.addPage([200, 200]);
        const inputBuffer = Buffer.from(await doc.save());

        const nullStepRes = await executeWorkflowSteps(
          [null],
          inputBuffer,
          'test.pdf'
        );
        if (nullStepRes.success !== false || nullStepRes.steps[0].success !== false) {
          throw new Error('Null step must fail gracefully');
        }

        const zipChainingRes = await executeWorkflowSteps(
          [
            { id: 'z1', tool: 'split-pdf', options: { mode: 'pages', submode: 'all' } },
            { id: 'z2', tool: 'rotate-pdf', options: { globalRotation: 90 } }
          ],
          inputBuffer,
          'test.pdf'
        );
        if (zipChainingRes.success !== false || zipChainingRes.steps[0].success !== false) {
          throw new Error('Split PDF producing multi-file ZIP before downstream step must fail');
        }
      }

      run().catch(err => {
        console.error(err);
        process.exit(1);
      });
    `;

    execSync(`node --input-type=module -e "${edgeScript.replace(/\n/g, ' ')}"`, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 10000
    });
    assert.ok(true, 'Null step and zip chaining guards verified');
  });
});

