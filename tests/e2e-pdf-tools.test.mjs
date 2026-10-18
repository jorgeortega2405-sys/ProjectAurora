import assert from 'node:assert';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const TOOL_SLUGS = [
  'compress-pdf',
  'crop-pdf',
  'merge-pdf',
  'ocr-pdf',
  'organize-pdf',
  'page-numbers',
  'pdf-converter',
  'protect-pdf',
  'remove-pdf-pages',
  'repair-pdf',
  'rotate-pdf',
  'split-pdf',
  'summarize-pdf',
  'to-pdf-converter',
  'translate-pdf',
  'unlock-pdf',
  'watermark-pdf'
];

const ROOT_DIR = process.cwd();
const VIEWS_DIR = path.resolve(ROOT_DIR, 'public/views/tools');
const CSS_DIR = path.resolve(ROOT_DIR, 'public/css/tools');
const CLIENT_VIEWS_DIR = path.resolve(ROOT_DIR, 'client/views/tools');
const SRC_TOOLS_DIR = path.resolve(ROOT_DIR, 'src/tools');

function parseAttributes(attrStr) {
  const attrs = [];
  const attrRegex = /([a-zA-Z0-9_\-:@.]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = attrRegex.exec(attrStr)) !== null) {
    attrs.push({
      name: match[1],
      value: match[2] ?? match[3] ?? match[4] ?? ''
    });
  }
  return attrs;
}

function parseHtmlTags(html, filename) {
  const tags = [];
  let i = 0;
  const len = html.length;
  let line = 1;

  while (i < len) {
    if (html[i] === '\n') {
      line++;
      i++;
      continue;
    }
    if (html[i] === '<') {
      if (html.slice(i, i + 4) === '<!--') {
        const endComment = html.indexOf('-->', i + 4);
        if (endComment === -1) break;
        const commentStr = html.slice(i, endComment + 3);
        line += commentStr.split('\n').length - 1;
        i = endComment + 3;
        continue;
      }
      if (html[i + 1] === '/') {
        const closeEnd = html.indexOf('>', i);
        if (closeEnd === -1) break;
        i = closeEnd + 1;
        continue;
      }
      const tagLine = line;
      let j = i + 1;
      let inQuote = null;
      while (j < len) {
        const char = html[j];
        if (inQuote) {
          if (char === inQuote) inQuote = null;
        } else if (char === '"' || char === "'") {
          inQuote = char;
        } else if (char === '>') {
          break;
        }
        j++;
      }
      if (j >= len) break;
      const rawTag = html.slice(i, j + 1);
      const tagContent = html.slice(i + 1, j).trim();
      const nameMatch = tagContent.match(/^([a-zA-Z0-9-]+)/);
      if (nameMatch) {
        const tagName = nameMatch[1].toLowerCase();
        const attrStr = tagContent.slice(nameMatch[0].length);
        const attrs = parseAttributes(attrStr);
        tags.push({ tagName, attrs, rawTag, line: tagLine, filename, startIndex: i, endIndex: j + 1 });
      }
      i = j + 1;
      continue;
    }
    i++;
  }
  return tags;
}

function getAllFiles(dir, extensions) {
  const result = [];
  if (!fs.existsSync(dir)) return result;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...getAllFiles(fullPath, extensions));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      result.push(fullPath);
    }
  }
  return result;
}

describe('Suite 1: Security & DOM Architecture (AGENTS.md & GEMINI.md)', () => {
  it('Requirement 1: Zero id="..." attributes in all HTML files under public/views/tools/', () => {
    const violations = [];
    for (const slug of TOOL_SLUGS) {
      const filePath = path.join(VIEWS_DIR, slug, `${slug}.html`);
      const html = fs.readFileSync(filePath, 'utf8');
      const tags = parseHtmlTags(html, `${slug}.html`);
      for (const tag of tags) {
        const idAttr = tag.attrs.find(a => a.name.toLowerCase() === 'id');
        if (idAttr) {
          violations.push(`${slug}.html (line ${tag.line}): found forbidden id="${idAttr.value}" in tag: ${tag.rawTag}`);
        }
      }
    }
    assert.strictEqual(
      violations.length,
      0,
      `Expected 0 id attributes across public/views/tools/, found ${violations.length}:\n${violations.join('\n')}`
    );
  });

  it('Requirement 2: All <button> tags must have "type" as their first attribute', () => {
    const violations = [];
    for (const slug of TOOL_SLUGS) {
      const filePath = path.join(VIEWS_DIR, slug, `${slug}.html`);
      const html = fs.readFileSync(filePath, 'utf8');
      const tags = parseHtmlTags(html, `${slug}.html`);
      for (const tag of tags) {
        if (tag.tagName === 'button') {
          if (tag.attrs.length === 0 || tag.attrs[0].name.toLowerCase() !== 'type') {
            const first = tag.attrs.length > 0 ? tag.attrs[0].name : '(none)';
            violations.push(`${slug}.html (line ${tag.line}): button first attribute is "${first}" instead of "type": ${tag.rawTag}`);
          }
        }
      }
    }
    assert.strictEqual(
      violations.length,
      0,
      `Expected all <button> tags to have "type" as first attribute, found ${violations.length} violations:\n${violations.join('\n')}`
    );
  });

  it('Requirement 3: All other HTML tags must have "class" as first attribute (when class exists), and style must not precede data-ref', () => {
    const ignoredTags = new Set(['!doctype', 'meta', 'link', 'svg', 'use', 'path', 'circle', 'rect', 'polygon', 'br', 'hr']);
    const violations = [];
    for (const slug of TOOL_SLUGS) {
      const filePath = path.join(VIEWS_DIR, slug, `${slug}.html`);
      const html = fs.readFileSync(filePath, 'utf8');
      const tags = parseHtmlTags(html, `${slug}.html`);
      for (const tag of tags) {
        if (tag.tagName === 'button' || ignoredTags.has(tag.tagName)) continue;
        const hasClass = tag.attrs.some(a => a.name.toLowerCase() === 'class');
        if (hasClass && tag.attrs[0].name.toLowerCase() !== 'class') {
          violations.push(
            `${slug}.html (line ${tag.line}): <${tag.tagName}> has class, but "${tag.attrs[0].name}" is first: ${tag.rawTag}`
          );
        }
        const styleIdx = tag.attrs.findIndex(a => a.name.toLowerCase() === 'style');
        const dataRefIdx = tag.attrs.findIndex(a => a.name.toLowerCase() === 'data-ref');
        if (styleIdx !== -1 && dataRefIdx !== -1 && styleIdx < dataRefIdx) {
          violations.push(
            `${slug}.html (line ${tag.line}): <${tag.tagName}> has "style" preceding "data-ref": ${tag.rawTag}`
          );
        }
      }
    }
    assert.strictEqual(
      violations.length,
      0,
      `Expected attribute order compliance across non-button tags, found ${violations.length} violations:\n${violations.join('\n')}`
    );
  });

  it('Requirement 4: Error banners (.banner--danger) must be placed below action buttons in sidebars', () => {
    const violations = [];
    for (const slug of TOOL_SLUGS) {
      const filePath = path.join(VIEWS_DIR, slug, `${slug}.html`);
      const html = fs.readFileSync(filePath, 'utf8');
      const tags = parseHtmlTags(html, `${slug}.html`);
      
      const dangerBanners = tags.filter(t => 
        t.attrs.some(a => a.name.toLowerCase() === 'class' && a.value.includes('banner--danger'))
      );
      if (dangerBanners.length === 0) {
        violations.push(`${slug}.html: missing .banner--danger element in sidebar`);
        continue;
      }

      const actionButtons = tags.filter(t => 
        t.tagName === 'button' &&
        t.attrs.some(a => a.name.toLowerCase() === 'class' && 
          (a.value.includes('tool-sidebar__action-btn') || a.value.includes('security-action-btn') || a.value.includes('btn-translate-action'))
        )
      );

      if (actionButtons.length > 0) {
        const actionBtn = actionButtons[0];
        const banner = dangerBanners[0];
        if (banner.startIndex < actionBtn.startIndex) {
          violations.push(`${slug}.html: .banner--danger (line ${banner.line}) is located above action button (line ${actionBtn.line})`);
        }
      }
    }
    assert.strictEqual(
      violations.length,
      0,
      `Expected error banners placed below action buttons, found ${violations.length} violations:\n${violations.join('\n')}`
    );
  });
});

describe('Suite 2: Component Standardization across all 17 PDF Tools', () => {
  it('Requirement 5.1: Zero native <select> tags across all 17 tool views', () => {
    const selectOccurrences = [];
    for (const slug of TOOL_SLUGS) {
      const filePath = path.join(VIEWS_DIR, slug, `${slug}.html`);
      const html = fs.readFileSync(filePath, 'utf8');
      const tags = parseHtmlTags(html, `${slug}.html`);
      const selects = tags.filter(t => t.tagName === 'select');
      for (const sel of selects) {
        const dataRef = sel.attrs.find(a => a.name === 'data-ref')?.value || '(no data-ref)';
        selectOccurrences.push(`${slug}.html (line ${sel.line}): native <select data-ref="${dataRef}">`);
      }
    }
    assert.strictEqual(
      selectOccurrences.length,
      0,
      `Expected 0 native <select> elements (all 10 migrated to canonical dropdowns), found ${selectOccurrences.length}:\n${selectOccurrences.join('\n')}`
    );
  });

  it('Requirement 5.2: Canonical dropdown triggers and panels present in migrated tools (page-numbers, watermark-pdf, translate-pdf)', () => {
    const dropdownChecks = [
      {
        slug: 'page-numbers',
        expectedDropdowns: [
          'dropdown-wrapper-margin',
          'dropdown-wrapper-format',
          'dropdown-wrapper-font-family',
          'dropdown-wrapper-font-size'
        ]
      },
      {
        slug: 'watermark-pdf',
        expectedDropdowns: [
          'dropdown-wrapper-wm-font',
          'dropdown-wrapper-wm-size',
          'dropdown-wrapper-transparency',
          'dropdown-wrapper-rotation'
        ]
      },
      {
        slug: 'translate-pdf',
        expectedDropdowns: [
          'wrapper-source-lang',
          'wrapper-target-lang'
        ]
      }
    ];

    const missingComponents = [];

    for (const check of dropdownChecks) {
      const filePath = path.join(VIEWS_DIR, check.slug, `${check.slug}.html`);
      const html = fs.readFileSync(filePath, 'utf8');

      for (const ddRef of check.expectedDropdowns) {
        if (!html.includes(ddRef)) {
          missingComponents.push(`${check.slug}.html: missing dropdown wrapper [data-ref="${ddRef}"]`);
        }
      }

      const tags = parseHtmlTags(html, `${check.slug}.html`);
      const triggers = tags.filter(t => 
        t.tagName === 'button' && t.attrs.some(a => a.name === 'class' && a.value.includes('dropdown-trigger'))
      );
      const panels = tags.filter(t => 
        t.tagName === 'div' && t.attrs.some(a => a.name === 'class' && a.value.includes('menu-panel--dropdown'))
      );

      if (triggers.length < check.expectedDropdowns.length) {
        missingComponents.push(`${check.slug}.html: expected at least ${check.expectedDropdowns.length} .dropdown-trigger buttons, found ${triggers.length}`);
      }
      if (panels.length < check.expectedDropdowns.length) {
        missingComponents.push(`${check.slug}.html: expected at least ${check.expectedDropdowns.length} .menu-panel--dropdown panels, found ${panels.length}`);
      }
    }

    assert.strictEqual(
      missingComponents.length,
      0,
      `Expected all 10 canonical dropdown wrappers, triggers, and panels, found missing:\n${missingComponents.join('\n')}`
    );
  });

  it('Requirement 5.3: Client controllers for migrated tools wire setupDropdown from utils/dom.util.js', () => {
    const controllerChecks = ['page-numbers', 'watermark-pdf', 'translate-pdf'];
    const unwiredControllers = [];

    for (const slug of controllerChecks) {
      const ctrlPath = path.join(CLIENT_VIEWS_DIR, slug, `${slug}.view.ts`);
      if (!fs.existsSync(ctrlPath)) {
        unwiredControllers.push(`${slug}.view.ts does not exist at ${ctrlPath}`);
        continue;
      }
      const code = fs.readFileSync(ctrlPath, 'utf8');
      if (!code.includes('setupDropdown')) {
        unwiredControllers.push(`${slug}.view.ts: does not import or call setupDropdown`);
      }
    }

    assert.strictEqual(
      unwiredControllers.length,
      0,
      `Expected controllers to wire setupDropdown, found violations:\n${unwiredControllers.join('\n')}`
    );
  });

  describe('Requirement 6: Canonical sidebar action buttons in all 17 tools', () => {
    for (const slug of TOOL_SLUGS) {
      it(`${slug}: has tool-sidebar__footer with canonical action button classes`, () => {
        const filePath = path.join(VIEWS_DIR, slug, `${slug}.html`);
        const html = fs.readFileSync(filePath, 'utf8');

        assert.ok(
          html.includes('tool-sidebar__footer'),
          `${slug}.html must have a <div class="tool-sidebar__footer"> container`
        );

        const footerMatch = html.match(/<div class="tool-sidebar__footer">([\s\S]*?)<\/aside>/);
        const footerSnippet = footerMatch ? footerMatch[1] : html;
        const footerTags = parseHtmlTags(footerSnippet, `${slug}.html`);

        const actionButtons = footerTags.filter(t => t.tagName === 'button');
        assert.ok(
          actionButtons.length > 0,
          `${slug}.html must contain at least one <button> inside tool-sidebar__footer`
        );

        const mainBtn = actionButtons[0];
        const classAttr = mainBtn.attrs.find(a => a.name === 'class')?.value || '';
        const classes = classAttr.split(/\s+/);

        const requiredClasses = [
          'component-button',
          'component-button--black',
          'component-button--h50',
          'component-button--w-full',
          'tool-sidebar__action-btn'
        ];

        for (const reqClass of requiredClasses) {
          assert.ok(
            classes.includes(reqClass),
            `${slug}.html sidebar action button missing required class "${reqClass}". Found classes: "${classAttr}"`
          );
        }

        const forbiddenClasses = ['security-action-btn', 'component-button--h44'];
        for (const forbClass of forbiddenClasses) {
          assert.ok(
            !classes.includes(forbClass),
            `${slug}.html sidebar action button still uses forbidden class "${forbClass}"`
          );
        }
      });
    }

    it('Requirement 6.18: Security tools use canonical floating labels and field actions', () => {
      const securityTools = ['protect-pdf', 'unlock-pdf'];
      const securityViolations = [];

      for (const slug of securityTools) {
        const filePath = path.join(VIEWS_DIR, slug, `${slug}.html`);
        const html = fs.readFileSync(filePath, 'utf8');

        if (html.includes('security-input-group')) {
          securityViolations.push(`${slug}.html: still uses deprecated .security-input-group instead of canonical .field`);
        }
        if (html.includes('security-eye-btn')) {
          securityViolations.push(`${slug}.html: still uses deprecated .security-eye-btn instead of canonical .field__action`);
        }
        if (!html.includes('field__action')) {
          securityViolations.push(`${slug}.html: missing canonical .field__action password visibility toggle`);
        }
      }

      assert.strictEqual(
        securityViolations.length,
        0,
        `Expected security tools to use canonical form components, found violations:\n${securityViolations.join('\n')}`
      );
    });
  });
});

describe('Suite 3: Design Tokens & CSS Homogenization', () => {
  const cssFiles = fs.readdirSync(CSS_DIR).filter(f => f.endsWith('.css')).sort();
  const hexRegex = /#[0-9a-fA-F]{3,8}\b/g;
  const rgbaRegex = /rgba?\s*\([^)]*\)/gi;

  describe('Requirement 7: Per-file CSS design token validation (zero hardcoded hex or rgba colors)', () => {
    for (const file of cssFiles) {
      it(`${file}: zero untokenized / hardcoded hex or rgba colors`, () => {
        const filePath = path.join(CSS_DIR, file);
        const rawContent = fs.readFileSync(filePath, 'utf8');
        const lines = rawContent.split('\n');
        const violations = [];

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const line = lines[lineNum];
          const trimmed = line.trim();
          if (trimmed.startsWith('/*') && trimmed.endsWith('*/')) continue;
          const hexMatches = line.match(hexRegex);
          if (hexMatches) {
            for (const color of hexMatches) {
              violations.push(`line ${lineNum + 1}: hex color "${color}" in "${trimmed}"`);
            }
          }
          const rgbaMatches = line.match(rgbaRegex) || line.match(/rgba?\s*\(/gi);
          if (rgbaMatches) {
            for (const color of rgbaMatches) {
              violations.push(`line ${lineNum + 1}: rgba/rgb color "${color}" in "${trimmed}"`);
            }
          }
        }

        assert.strictEqual(
          violations.length,
          0,
          `${file} has ${violations.length} hardcoded hex or rgba colors:\n${violations.join('\n')}`
        );
      });
    }
  });

  it('Requirement 7.20: Zero hardcoded arbitrary palette colors (#ef4444, #dc2626, #a855f7, #f97316, #6366f1, etc.) across public/css/tools/*.css', () => {
    const arbitraryColorsRegex = /#(ef4444|dc2626|a855f7|f97316|6366f1|8b5cf6|ec4899|e11d48|3b82f6)\b/i;
    const violations = [];

    for (const file of cssFiles) {
      const filePath = path.join(CSS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const match = line.match(arbitraryColorsRegex);
        if (match) {
          violations.push(`${file}:${i + 1}: arbitrary color "${match[0]}" found in: ${line}`);
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Expected 0 arbitrary non-canonical colors in public/css/tools/*.css, found ${violations.length}:\n${violations.join('\n')}`
    );
  });

  it('Requirement 7.21: Zero hardcoded hex colors in HTML inline styles in public/views/tools/', () => {
    const violations = [];
    for (const slug of TOOL_SLUGS) {
      const filePath = path.join(VIEWS_DIR, slug, `${slug}.html`);
      const html = fs.readFileSync(filePath, 'utf8');
      const tags = parseHtmlTags(html, `${slug}.html`);

      for (const tag of tags) {
        const styleAttr = tag.attrs.find(a => a.name.toLowerCase() === 'style');
        if (styleAttr) {
          const hexMatches = styleAttr.value.match(hexRegex);
          if (hexMatches) {
            for (const m of hexMatches) {
              violations.push(`${slug}.html (line ${tag.line}): inline style contains hardcoded hex "${m}": ${tag.rawTag}`);
            }
          }
          const rgbaMatches = styleAttr.value.match(rgbaRegex);
          if (rgbaMatches) {
            for (const m of rgbaMatches) {
              violations.push(`${slug}.html (line ${tag.line}): inline style contains hardcoded rgb/rgba "${m}": ${tag.rawTag}`);
            }
          }
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Expected 0 hardcoded colors in HTML inline styles, found ${violations.length}:\n${violations.join('\n')}`
    );
  });
});

describe('Suite 4: Code Quality & Logging Strictness (AGENTS.md Rule 2)', () => {
  it('Requirement 8.1: Zero console.log, console.warn, console.error in client/views/tools/', () => {
    const files = getAllFiles(CLIENT_VIEWS_DIR, ['.ts', '.js']);
    const consoleRegex = /\bconsole\s*\.\s*(log|warn|error|info|debug)\b/g;
    const violations = [];

    for (const file of files) {
      const relPath = path.relative(ROOT_DIR, file);
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (consoleRegex.test(line)) {
          violations.push(`${relPath}:${i + 1}: ${line}`);
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Expected 0 console.* statements in client/views/tools/, found ${violations.length}:\n${violations.join('\n')}`
    );
  });

  it('Requirement 8.2: Zero console.log, console.warn, console.error in src/tools/', () => {
    const files = getAllFiles(SRC_TOOLS_DIR, ['.ts', '.js']);
    const consoleRegex = /\bconsole\s*\.\s*(log|warn|error|info|debug)\b/g;
    const violations = [];

    for (const file of files) {
      const relPath = path.relative(ROOT_DIR, file);
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (consoleRegex.test(line)) {
          violations.push(`${relPath}:${i + 1}: ${line}`);
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Expected 0 console.* statements in src/tools/, found ${violations.length}:\n${violations.join('\n')}`
    );
  });
});

describe('Suite 5: Static Analysis & TypeScript Compilation', () => {
  it('Requirement 9: npm run typecheck must complete with exit code 0', () => {
    let output = '';
    let exitCode = 0;
    try {
      output = execSync('npm run typecheck', {
        cwd: ROOT_DIR,
        encoding: 'utf8',
        stdio: 'pipe'
      });
    } catch (err) {
      exitCode = err.status || 1;
      output = (err.stdout || '') + '\n' + (err.stderr || '');
    }

    assert.strictEqual(
      exitCode,
      0,
      `npm run typecheck failed with exit code ${exitCode}:\n${output}`
    );
  });
});
