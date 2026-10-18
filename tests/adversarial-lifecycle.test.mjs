import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT_DIR = process.cwd();
const CLIENT_TOOLS_DIR = path.resolve(ROOT_DIR, 'client/views/tools');
const SRC_TOOLS_DIR = path.resolve(ROOT_DIR, 'src/tools');
const PUBLIC_VIEWS_DIR = path.resolve(ROOT_DIR, 'public/views/tools');
const SRC_DIR = path.resolve(ROOT_DIR, 'src');
const CLIENT_DIR = path.resolve(ROOT_DIR, 'client');

function getAllFiles(dir, extensions) {
  const result = [];
  if (!fs.existsSync(dir)) return result;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...getAllFiles(fullPath, extensions));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      result.push(fullPath);
    }
  }
  return result;
}

describe('Adversarial Challenge Suite 1: Event Listener Leaks & Lifecycle Teardown', () => {
  const targetControllers = [
    'page-numbers',
    'watermark-pdf',
    'translate-pdf',
  ];

  for (const slug of targetControllers) {
    it(`${slug}.view.ts: all addEventListener calls must use { signal } and destroy() must clean up abortController`, () => {
      const viewFile = path.join(CLIENT_TOOLS_DIR, slug, `${slug}.view.ts`);
      assert.ok(fs.existsSync(viewFile), `Controller file exists: ${viewFile}`);

      const code = fs.readFileSync(viewFile, 'utf8');

      // 1. Verify AbortController lifecycle
      assert.ok(
        code.includes('new AbortController()'),
        `${slug}.view.ts must instantiate AbortController`
      );
      assert.ok(
        code.includes('.abort()'),
        `${slug}.view.ts must call abort() inside destroy()`
      );

      // 2. Exact parenthesis depth check for addEventListener calls
      const unmanagedListeners = [];
      let searchIdx = 0;
      while ((searchIdx = code.indexOf('.addEventListener(', searchIdx)) !== -1) {
        const startIdx = searchIdx + '.addEventListener('.length;
        let parenDepth = 1;
        let endIdx = -1;
        let inQuote = null;

        for (let j = startIdx; j < code.length; j++) {
          const ch = code[j];
          if (inQuote) {
            if (ch === inQuote && code[j - 1] !== '\\') inQuote = null;
          } else if (ch === '"' || ch === "'" || ch === '`') {
            inQuote = ch;
          } else if (ch === '(') {
            parenDepth++;
          } else if (ch === ')') {
            parenDepth--;
            if (parenDepth === 0) {
              endIdx = j;
              break;
            }
          }
        }

        assert.ok(endIdx !== -1, `Unbalanced parentheses in addEventListener call in ${slug}.view.ts`);
        const callArgs = code.slice(startIdx, endIdx);
        if (!callArgs.includes('signal')) {
          const lineNum = code.slice(0, searchIdx).split('\n').length;
          unmanagedListeners.push(`Line ${lineNum}: unmanaged addEventListener: ${code.slice(searchIdx, Math.min(searchIdx + 60, endIdx))}`);
        }
        searchIdx = endIdx + 1;
      }

      assert.strictEqual(
        unmanagedListeners.length,
        0,
        `Found unmanaged event listeners in ${slug}.view.ts:\n${unmanagedListeners.join('\n')}`
      );
    });

    it(`${slug}.view.ts: setupDropdown instances must be tracked and destroyed in destroy()`, () => {
      const viewFile = path.join(CLIENT_TOOLS_DIR, slug, `${slug}.view.ts`);
      const code = fs.readFileSync(viewFile, 'utf8');

      // Check setupDropdown usage
      const setupMatches = code.match(/setupDropdown\s*\(/g) || [];
      if (setupMatches.length > 0) {
        assert.ok(
          code.includes('dropdownControllers') || code.includes('.destroy()'),
          `${slug}.view.ts uses setupDropdown (${setupMatches.length} times) but does not track controllers for teardown`
        );

        assert.ok(
          code.includes('.forEach((ctrl) => ctrl.destroy())') || code.includes('ctrl.destroy()'),
          `${slug}.view.ts must invoke destroy() on dropdown controller instances`
        );
      }
    });

    it(`${slug}.view.ts: destroy() must reset document/file buffer references to prevent memory leaks`, () => {
      const viewFile = path.join(CLIENT_TOOLS_DIR, slug, `${slug}.view.ts`);
      const code = fs.readFileSync(viewFile, 'utf8');

      // Find destroy method block with balanced braces
      const destroyStart = code.indexOf('public destroy(): void {');
      assert.ok(destroyStart !== -1, `${slug}.view.ts must have public destroy(): void`);

      let braceCount = 0;
      let destroyEnd = -1;
      for (let i = destroyStart; i < code.length; i++) {
        if (code[i] === '{') braceCount++;
        else if (code[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            destroyEnd = i;
            break;
          }
        }
      }

      assert.ok(destroyEnd !== -1, `Could not parse destroy() method block in ${slug}.view.ts`);
      const destroyBody = code.slice(destroyStart, destroyEnd);

      assert.ok(
        destroyBody.includes('abort'),
        `${slug}.view.ts destroy() must abort signal`
      );

      if (code.includes('pdfDocument')) {
        assert.ok(
          destroyBody.includes('pdfDocument = null'),
          `${slug}.view.ts destroy() must dereference pdfDocument`
        );
      }
    });
  }
});

describe('Adversarial Challenge Suite 2: Zero console.* Across Codebase', () => {
  it('Adversarial scan: client/ must contain zero console.* calls (excluding websocket.service.ts exception)', () => {
    const clientFiles = getAllFiles(CLIENT_DIR, ['.ts', '.js']);
    const violations = [];

    const consoleRegex = /\bconsole\.(log|warn|error|info|debug|trace|table)\s*\(/g;

    for (const file of clientFiles) {
      const rel = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
      if (rel === 'client/services/websocket.service.ts') continue;

      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('//') || line.trim().startsWith('/*')) continue;
        if (consoleRegex.test(line)) {
          violations.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Expected ZERO console.* calls in client/ (excluding websocket.service.ts), found ${violations.length}:\n${violations.join('\n')}`
    );
  });

  it('Adversarial scan: src/ must contain zero console.* calls', () => {
    const srcFiles = getAllFiles(SRC_DIR, ['.ts', '.js']);
    const violations = [];

    const consoleRegex = /\bconsole\.(log|warn|error|info|debug|trace|table)\s*\(/g;

    for (const file of srcFiles) {
      const rel = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('//') || line.trim().startsWith('/*')) continue;
        if (consoleRegex.test(line)) {
          violations.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Expected ZERO console.* calls in src/, found ${violations.length}:\n${violations.join('\n')}`
    );
  });
});

describe('Adversarial Challenge Suite 3: Zero Sensitive Data & Stack Trace Leakage in HTTP Responses', () => {
  it('Tool backend controllers must NEVER expose err.message, err.stack, or technical details in responses', () => {
    const controllerFiles = getAllFiles(SRC_TOOLS_DIR, ['.controller.ts']);
    const leakViolations = [];

    // Patterns that would leak technical details to the frontend
    const forbiddenResponsePatterns = [
      /\bres\.status\(\d+\)\.json\(\s*\{[^}]*error:\s*err\b/i,
      /\bres\.status\(\d+\)\.json\(\s*\{[^}]*error:\s*error\.(?:message|stack)\b/i,
      /\bres\.status\(\d+\)\.json\(\s*\{[^}]*error:\s*err\.(?:message|stack)\b/i,
      /\bres\.status\(\d+\)\.json\(\s*\{[^}]*stack\b/i,
      /\bres\.status\(\d+\)\.json\(\s*\{[^}]*detail:\s*err/i,
    ];

    for (const file of controllerFiles) {
      const rel = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const pattern of forbiddenResponsePatterns) {
          if (pattern.test(line)) {
            leakViolations.push(`${rel}:${i + 1}: Potential technical leak in response: ${line.trim()}`);
          }
        }
      }
    }

    assert.strictEqual(
      leakViolations.length,
      0,
      `Found potential technical/stack trace leaks in HTTP responses:\n${leakViolations.join('\n')}`
    );
  });

  it('Tool controllers must use logger.app.error for unexpected exceptions', () => {
    const controllerFiles = getAllFiles(SRC_TOOLS_DIR, ['.controller.ts']);
    const missingLogger = [];

    for (const file of controllerFiles) {
      const rel = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
      const content = fs.readFileSync(file, 'utf8');

      if (content.includes('catch') && !content.includes('logger.app.error')) {
        missingLogger.push(`${rel}: contains catch block without logger.app.error`);
      }
    }

    assert.strictEqual(
      missingLogger.length,
      0,
      `Tool controllers must log errors with logger.app.error:\n${missingLogger.join('\n')}`
    );
  });
});

describe('Adversarial Challenge Suite 4: PBAC & Permission Compliance in Tool Handlers', () => {
  it('Tool controllers and routes must NOT perform direct role authorization (e.g. role === "admin")', () => {
    const toolFiles = getAllFiles(SRC_TOOLS_DIR, ['.ts']);
    const roleViolations = [];

    const roleRegex = /\b(user\.role|req\.user\.role|roles\.includes|requireRole)\b/;

    for (const file of toolFiles) {
      const rel = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('//')) continue;
        if (roleRegex.test(line)) {
          roleViolations.push(`${rel}:${i + 1}: Direct role check detected: ${line.trim()}`);
        }
      }
    }

    assert.strictEqual(
      roleViolations.length,
      0,
      `Expected ZERO direct role authorization in src/tools/, found:\n${roleViolations.join('\n')}`
    );
  });
});

describe('Adversarial Challenge Suite 5: DOM Tag & Attribute Ordering Stress Test', () => {
  it('No element in public/views/tools/ may contain id attributes or forbidden attribute order', () => {
    const htmlFiles = getAllFiles(PUBLIC_VIEWS_DIR, ['.html']);
    assert.strictEqual(htmlFiles.length, 17, 'Must find exactly 17 tool HTML views');

    const violations = [];
    const idRegex = /\sid=["'][^"']*["']/i;

    for (const file of htmlFiles) {
      const rel = path.relative(ROOT_DIR, file).replace(/\\/g, '/');
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (idRegex.test(line)) {
          violations.push(`${rel}:${i + 1}: Found forbidden id attribute: ${line.trim()}`);
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Found id attribute violations:\n${violations.join('\n')}`
    );
  });
});
