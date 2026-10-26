import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import test, { describe } from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PDF_ROOT = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(PDF_ROOT, '..', '..');

// Import routing logic via tsx
import { APP_ROUTES, findRoute, parseRoutePath } from '../client/config/routes.config.ts';
import { SEO_ROUTES, resolveRouteFromSlug } from '../client/config/seo.config.ts';

describe('Adversarial Help Center Verification Suite', () => {

  describe('Suite 1: Route Resolution & Fallthrough Analysis', () => {
    const routePermutations = [
      // Terms
      { path: '/help/terms', expected: 'help-terms' },
      { path: '/help-terms', expected: 'help-terms' },
      { path: '/es/terminos', expected: 'help-terms' },
      { path: '/en/terms', expected: 'help-terms' },
      // Privacy
      { path: '/help/privacy', expected: 'help-privacy' },
      { path: '/help-privacy', expected: 'help-privacy' },
      { path: '/es/privacidad', expected: 'help-privacy' },
      { path: '/en/privacy', expected: 'help-privacy' },
      // Security
      { path: '/help/security', expected: 'help-security' },
      { path: '/help-security', expected: 'help-security' },
      { path: '/es/seguridad', expected: 'help-security' },
      { path: '/en/security', expected: 'help-security' },
      // Cookies
      { path: '/help/cookies', expected: 'help-cookies' },
      { path: '/help-cookies', expected: 'help-cookies' },
      { path: '/es/cookies', expected: 'help-cookies' },
      { path: '/en/cookies', expected: 'help-cookies' },
      // FAQ
      { path: '/help/faq', expected: 'help-faq' },
      { path: '/help-faq', expected: 'help-faq' },
      { path: '/es/preguntas-frecuentes', expected: 'help-faq' },
      { path: '/en/faq', expected: 'help-faq' },
      // Documentation
      { path: '/help/documentation', expected: 'help-documentation' },
      { path: '/help-documentation', expected: 'help-documentation' },
      { path: '/es/herramientas', expected: 'help-documentation' },
      { path: '/en/documentation', expected: 'help-documentation' },
    ];

    for (const { path: routePath, expected } of routePermutations) {
      test(`Permutation "${routePath}" must resolve to routeId "${expected}" and not fall through to default`, () => {
        const match = findRoute(routePath);
        assert.ok(match, `findRoute returned null for path: ${routePath}`);
        assert.strictEqual(
          match.routeId,
          expected,
          `Path ${routePath} resolved to ${match.routeId}, expected ${expected}`
        );

        // Verify that route definition is NOT the catch-all 'help' or 'not-found'
        assert.notStrictEqual(match.route.id, 'help', `Path ${routePath} fell through to fallback route 'help'`);
        assert.notStrictEqual(match.route.id, 'not-found', `Path ${routePath} fell through to 'not-found'`);
        assert.strictEqual(match.route.id, expected, `Route definition id mismatch`);
      });
    }

    test('Verify static switch statement in routes.config.ts covers help paths', () => {
      const routesConfigPath = path.resolve(PDF_ROOT, 'client/config/routes.config.ts');
      const content = fs.readFileSync(routesConfigPath, 'utf8');

      // Check that the switch statement handles all direct help cases
      const requiredCases = [
        "case '/help/documentation':",
        "case '/help-documentation':",
        "case '/help/faq':",
        "case '/help-faq':",
        "case '/help/privacy':",
        "case '/help-privacy':",
        "case '/help/terms':",
        "case '/help-terms':",
        "case '/help/cookies':",
        "case '/help-cookies':",
        "case '/help/security':",
        "case '/help-security':",
      ];

      for (const expectedCase of requiredCases) {
        assert.ok(
          content.includes(expectedCase),
          `routes.config.ts missing explicit switch case: ${expectedCase}`
        );
      }
    });

    test('Adversarial routing variations (trailing slashes, case sensitivity, query params)', () => {
      const adversarialCases = [
        { path: '/help/terms?ref=footer', expected: 'help-terms' },
        { path: '/es/terminos?utm_source=test', expected: 'help-terms' },
        { path: '/en/privacy#section-1', expected: 'help-privacy' },
        { path: '/help/security/', expected: 'help-security' },
        { path: '/help-faq/', expected: 'help-faq' },
      ];

      for (const { path: routePath, expected } of adversarialCases) {
        const match = findRoute(routePath.split('#')[0]);
        assert.ok(match, `findRoute returned null for adversarial path: ${routePath}`);
        assert.strictEqual(
          match.routeId,
          expected,
          `Adversarial path ${routePath} resolved to ${match.routeId}, expected ${expected}`
        );
      }
    });
  });

  describe('Suite 2: DOM Stress Test across all 6 Help Templates', () => {
    const helpViewsDir = path.resolve(PDF_ROOT, 'public/views/help');
    const templateNames = [
      'cookies.html',
      'documentation.html',
      'faq.html',
      'privacy.html',
      'security.html',
      'terms.html',
    ];

    test('All 6 template files must exist in public/views/help/', () => {
      for (const tpl of templateNames) {
        const fullPath = path.join(helpViewsDir, tpl);
        assert.ok(fs.existsSync(fullPath), `Template missing: ${fullPath}`);
      }
    });

    test('Rule: Zero id attributes (regex \\bid\\s*= must have 0 matches across all HTML files)', () => {
      const idRegex = /\bid\s*=/i;
      const violations = [];

      for (const tpl of templateNames) {
        const fullPath = path.join(helpViewsDir, tpl);
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');

        lines.forEach((line, idx) => {
          if (idRegex.test(line)) {
            violations.push(`${tpl}:${idx + 1} -> ${line.trim()}`);
          }
        });
      }

      assert.strictEqual(
        violations.length,
        0,
        `Found ${violations.length} forbidden id="..." attribute(s):\n${violations.join('\n')}`
      );
    });

    test('Rule: Button attribute ordering (all <button> tags must have "type" as first attribute)', () => {
      const buttonRegex = /<button\b([^>]*?)>/gi;
      const violations = [];

      for (const tpl of templateNames) {
        const fullPath = path.join(helpViewsDir, tpl);
        const content = fs.readFileSync(fullPath, 'utf8');

        let match;
        while ((match = buttonRegex.exec(content)) !== null) {
          const rawAttrs = match[1].trim();
          // First attribute must be type="..."
          if (!/^type\s*=\s*["'][^"']+["']/i.test(rawAttrs)) {
            violations.push(`${tpl} -> <button ${rawAttrs.slice(0, 80)}>`);
          }
        }
      }

      assert.strictEqual(
        violations.length,
        0,
        `Found ${violations.length} <button> tag(s) without type as first attribute:\n${violations.join('\n')}`
      );
    });

    test('Rule: Non-button element attribute ordering (all non-button elements with classes must have "class" as first attribute)', () => {
      // Find all tags: <tag attr1="..." attr2="...">
      // Exclude: <button>, <!DOCTYPE>, <!-- -->, self-closing or attribute-less tags
      const tagRegex = /<([a-zA-Z0-9]+)\b([^>]*?)>/g;
      const violations = [];

      for (const tpl of templateNames) {
        const fullPath = path.join(helpViewsDir, tpl);
        const content = fs.readFileSync(fullPath, 'utf8');

        let match;
        while ((match = tagRegex.exec(content)) !== null) {
          const tagName = match[1].toLowerCase();
          const rawAttrs = match[2].trim();

          if (tagName === 'button') continue;
          if (!rawAttrs) continue;

          // Check if the tag contains a class attribute anywhere
          if (/\bclass\s*=/i.test(rawAttrs)) {
            // It MUST start with class=
            if (!/^class\s*=\s*["'][^"']*["']/i.test(rawAttrs)) {
              violations.push(`${tpl} -> <${tagName} ${rawAttrs.slice(0, 80)}>`);
            }
          }
        }
      }

      assert.strictEqual(
        violations.length,
        0,
        `Found ${violations.length} non-button tag(s) with class not as first attribute:\n${violations.join('\n')}`
      );
    });

    test('Rule: Zero placeholder text "Próximamente" across all templates and view controllers', () => {
      const placeholderRegex = /próximamente|proximamente/i;
      const violations = [];

      // Check templates
      for (const tpl of templateNames) {
        const fullPath = path.join(helpViewsDir, tpl);
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');

        lines.forEach((line, idx) => {
          if (placeholderRegex.test(line)) {
            violations.push(`${tpl}:${idx + 1} -> ${line.trim()}`);
          }
        });
      }

      // Check client view controllers
      const controllersDir = path.resolve(PDF_ROOT, 'client/views/help');
      const controllerFiles = fs.readdirSync(controllersDir).filter(f => f.endsWith('.ts'));

      for (const ctrl of controllerFiles) {
        const fullPath = path.join(controllersDir, ctrl);
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');

        lines.forEach((line, idx) => {
          if (placeholderRegex.test(line)) {
            violations.push(`${ctrl}:${idx + 1} -> ${line.trim()}`);
          }
        });
      }

      assert.strictEqual(
        violations.length,
        0,
        `Found ${violations.length} occurrences of placeholder text "Próximamente":\n${violations.join('\n')}`
      );
    });
  });

  describe('Suite 3: Translation Completeness & Locale Parity', () => {
    const translationsDir = path.resolve(PDF_ROOT, 'public/translations');

    test('Primary translation catalog es-419.json must exist in public/translations/', () => {
      const es419Path = path.join(translationsDir, 'es-419.json');
      assert.ok(fs.existsSync(es419Path), `Required translation catalog es-419.json missing in ${translationsDir}`);
    });

    test('Translation key coverage: all keys in templates and controllers must exist in catalogs', () => {
      // Collect all keys from templates
      const templateKeys = new Set();
      const helpViewsDir = path.resolve(PDF_ROOT, 'public/views/help');
      const templates = ['cookies.html', 'documentation.html', 'faq.html', 'privacy.html', 'security.html', 'terms.html'];

      const i18nAttrRegex = /data-i18n(?:-html|-placeholder|-tooltip|-aria)?\s*=\s*["']([^"']+)["']/g;

      for (const tpl of templates) {
        const fullPath = path.join(helpViewsDir, tpl);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          let match;
          while ((match = i18nAttrRegex.exec(content)) !== null) {
            templateKeys.add(match[1]);
          }
        }
      }

      // Collect all keys from controllers
      const controllerKeys = new Set();
      const controllersDir = path.resolve(PDF_ROOT, 'client/views/help');
      const controllers = fs.readdirSync(controllersDir).filter(f => f.endsWith('.ts'));
      const tCallRegex = /\bt\(\s*['"]([a-zA-Z0-9._-]+)['"]/g;

      for (const ctrl of controllers) {
        const fullPath = path.join(controllersDir, ctrl);
        const content = fs.readFileSync(fullPath, 'utf8');
        let match;
        while ((match = tCallRegex.exec(content)) !== null) {
          controllerKeys.add(match[1]);
        }
      }

      // Also collect hardcoded item keys from help-faq.view.ts (FAQ_ITEMS and FAQ_GROUPS)
      const faqViewContent = fs.readFileSync(path.join(controllersDir, 'help-faq.view.ts'), 'utf8');
      const keyPropRegex = /(?:titleKey|questionKey|answerKey)\s*:\s*['"]([^"']+)['"]/g;
      let faqKeyMatch;
      while ((faqKeyMatch = keyPropRegex.exec(faqViewContent)) !== null) {
        controllerKeys.add(faqKeyMatch[1]);
      }

      // Also collect category doc keys from help-documentation.view.ts
      const docViewContent = fs.readFileSync(path.join(controllersDir, 'help-documentation.view.ts'), 'utf8');
      let docKeyMatch;
      while ((docKeyMatch = keyPropRegex.exec(docViewContent)) !== null) {
        controllerKeys.add(docKeyMatch[1]);
      }
      const descPropRegex = /descKey\s*:\s*['"]([^"']+)['"]/g;
      while ((docKeyMatch = descPropRegex.exec(docViewContent)) !== null) {
        controllerKeys.add(docKeyMatch[1]);
      }

      const allExtractedKeys = new Set([...templateKeys, ...controllerKeys]);

      function getNested(obj, pathStr) {
        const parts = pathStr.split('.');
        let curr = obj;
        for (const p of parts) {
          if (!curr || typeof curr !== 'object' || !(p in curr)) return undefined;
          curr = curr[p];
        }
        return curr;
      }

      // Check against es-419.json
      const esCandidatePath = path.join(translationsDir, 'es-419.json');

      assert.ok(fs.existsSync(esCandidatePath), `No Spanish translation file found at ${esCandidatePath}`);
      const esJson = JSON.parse(fs.readFileSync(esCandidatePath, 'utf8'));

      const missingInEs = [];
      for (const key of allExtractedKeys) {
        if (getNested(esJson, key) === undefined) {
          missingInEs.push(key);
        }
      }

      const totalRequired = allExtractedKeys.size;
      assert.strictEqual(
        missingInEs.length,
        0,
        `Spanish catalog (${path.basename(esCandidatePath)}) is missing ${missingInEs.length} of ${totalRequired} required keys:\n${missingInEs.slice(0, 30).join('\n')}${missingInEs.length > 30 ? `\n...and ${missingInEs.length - 30} more` : ''}`
      );
    });
  });

});
