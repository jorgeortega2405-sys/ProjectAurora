import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test, { describe } from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PDF_ROOT = path.resolve(__dirname, '..');
const TRANSLATIONS_DIR = path.resolve(PDF_ROOT, 'public/translations');
const HELP_VIEWS_DIR = path.resolve(PDF_ROOT, 'public/views/help');
const HELP_CONTROLLERS_DIR = path.resolve(PDF_ROOT, 'client/views/help');

// Import routing logic directly
import { APP_ROUTES, findRoute, parseRoutePath } from '../client/config/routes.config.ts';
import { SEO_ROUTES, resolveRouteFromSlug } from '../client/config/seo.config.ts';

function getNestedValue(obj, keyPath) {
  const parts = keyPath.split('.');
  let curr = obj;
  for (const part of parts) {
    if (!curr || typeof curr !== 'object' || !(part in curr)) return undefined;
    curr = curr[part];
  }
  return curr;
}

function countLeafKeys(obj, prefix = '') {
  let count = 0;
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      count += countLeafKeys(v, fullKey);
    } else {
      count += 1;
    }
  }
  return count;
}

function getAllLeafKeys(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...getAllLeafKeys(v, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

describe('Challenger It2-1: Comprehensive Adversarial Verification Suite', () => {

  // =========================================================================
  // SUITE 1: Route Resolution Across All Permutations & Fallthrough Blindage
  // =========================================================================
  describe('Suite 1: Route Resolution Across All Permutations & Fallthrough Blindage', () => {
    const mandatoryPermutations = [
      // Terms permutations
      { path: '/help/terms', expected: 'help-terms' },
      { path: '/help-terms', expected: 'help-terms' },
      { path: '/es/terminos', expected: 'help-terms' },
      { path: '/en/terms', expected: 'help-terms' },

      // Privacy permutations
      { path: '/help/privacy', expected: 'help-privacy' },
      { path: '/help-privacy', expected: 'help-privacy' },
      { path: '/es/privacidad', expected: 'help-privacy' },
      { path: '/en/privacy', expected: 'help-privacy' },

      // Security permutations
      { path: '/help/security', expected: 'help-security' },
      { path: '/help-security', expected: 'help-security' },
      { path: '/es/seguridad', expected: 'help-security' },
      { path: '/en/security', expected: 'help-security' },

      // Cookies permutations
      { path: '/help/cookies', expected: 'help-cookies' },
      { path: '/help-cookies', expected: 'help-cookies' },
      { path: '/es/cookies', expected: 'help-cookies' },
      { path: '/en/cookies', expected: 'help-cookies' },

      // FAQ permutations
      { path: '/help/faq', expected: 'help-faq' },
      { path: '/help-faq', expected: 'help-faq' },
      { path: '/es/preguntas-frecuentes', expected: 'help-faq' },
      { path: '/en/faq', expected: 'help-faq' },

      // Documentation permutations
      { path: '/help/documentation', expected: 'help-documentation' },
      { path: '/help-documentation', expected: 'help-documentation' },
      { path: '/es/herramientas', expected: 'help-documentation' },
      { path: '/en/documentation', expected: 'help-documentation' },
    ];

    for (const { path: routePath, expected } of mandatoryPermutations) {
      test(`Mandatory permutation "${routePath}" -> maps to "${expected}" (NO fallthrough)`, () => {
        const match = findRoute(routePath);
        assert.ok(match, `findRoute returned null for path: ${routePath}`);
        assert.strictEqual(
          match.routeId,
          expected,
          `Path ${routePath} resolved to routeId ${match.routeId}, expected ${expected}`
        );

        // Explicitly assert that NONE fall through to default/fallback routes
        assert.notStrictEqual(match.route.id, 'help', `Path ${routePath} fell through to fallback route 'help'`);
        assert.notStrictEqual(match.route.id, 'not-found', `Path ${routePath} fell through to 'not-found'`);
        assert.notStrictEqual(match.route.id, 'home', `Path ${routePath} fell through to 'home'`);
        assert.strictEqual(match.route.id, expected, `Route handler id mismatch for ${routePath}`);
      });
    }

    test('Adversarial Route Stress: Trailing slashes, queries, hashes, and mixed case', () => {
      const adversarialCases = [
        { path: '/help/terms/', expected: 'help-terms' },
        { path: '/help-terms/', expected: 'help-terms' },
        { path: '/es/terminos/', expected: 'help-terms' },
        { path: '/en/terms/', expected: 'help-terms' },
        { path: '/help/privacy?source=footer&track=1', expected: 'help-privacy' },
        { path: '/es/privacidad?lang=es', expected: 'help-privacy' },
        { path: '/en/security#encryption-standards', expected: 'help-security' },
        { path: '/help/cookies?consent=all', expected: 'help-cookies' },
        { path: '/es/preguntas-frecuentes?cat=security', expected: 'help-faq' },
        { path: '/help/documentation?tool=merge', expected: 'help-documentation' },
      ];

      for (const { path: routePath, expected } of adversarialCases) {
        // Strip hash fragment if present (browser does not send hash to router path)
        const cleanForRouter = routePath.split('#')[0];
        const match = findRoute(cleanForRouter);
        assert.ok(match, `Adversarial path failed to match: ${routePath}`);
        assert.strictEqual(
          match.routeId,
          expected,
          `Adversarial path ${routePath} resolved to ${match.routeId}, expected ${expected}`
        );
      }
    });

    test('Static switch statement in routes.config.ts covers all direct help routes', () => {
      const routesContent = fs.readFileSync(path.resolve(PDF_ROOT, 'client/config/routes.config.ts'), 'utf8');
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
        assert.ok(routesContent.includes(expectedCase), `Missing explicit switch case: ${expectedCase}`);
      }
    });
  });

  // =========================================================================
  // SUITE 2: DOM Stress Test across all 6 Help Templates
  // =========================================================================
  describe('Suite 2: DOM Stress Test across all 6 Help Templates', () => {
    const templateFiles = [
      'cookies.html',
      'documentation.html',
      'faq.html',
      'privacy.html',
      'security.html',
      'terms.html',
    ];

    test('All 6 template files must exist in apps/pdf/public/views/help/', () => {
      for (const tpl of templateFiles) {
        const fullPath = path.join(HELP_VIEWS_DIR, tpl);
        assert.ok(fs.existsSync(fullPath), `Template missing: ${fullPath}`);
        const stat = fs.statSync(fullPath);
        assert.ok(stat.size > 500, `Template file ${tpl} is unusually small (${stat.size} bytes)`);
      }
    });

    test('DOM Rule: Strictly zero id="..." attributes across all HTML files', () => {
      const idRegex = /\bid\s*=/i;
      const violations = [];

      for (const tpl of templateFiles) {
        const fullPath = path.join(HELP_VIEWS_DIR, tpl);
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
        `Found ${violations.length} forbidden id="..." attribute(s) in help templates:\n${violations.join('\n')}`
      );
    });

    test('DOM Rule: Attribute ordering on <button> tags (must have type as first attribute)', () => {
      const buttonRegex = /<button\b([^>]*?)>/gi;
      const violations = [];

      for (const tpl of templateFiles) {
        const fullPath = path.join(HELP_VIEWS_DIR, tpl);
        const content = fs.readFileSync(fullPath, 'utf8');

        let match;
        while ((match = buttonRegex.exec(content)) !== null) {
          const rawAttrs = match[1].trim();
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

    test('DOM Rule: Attribute ordering on non-button elements with classes (must have class as first attribute)', () => {
      const tagRegex = /<([a-zA-Z0-9]+)\b([^>]*?)>/g;
      const violations = [];

      for (const tpl of templateFiles) {
        const fullPath = path.join(HELP_VIEWS_DIR, tpl);
        const content = fs.readFileSync(fullPath, 'utf8');

        let match;
        while ((match = tagRegex.exec(content)) !== null) {
          const tagName = match[1].toLowerCase();
          const rawAttrs = match[2].trim();

          if (tagName === 'button' || !rawAttrs) continue;

          // If the tag has class= anywhere in its attributes, it must be first
          if (/\bclass\s*=/i.test(rawAttrs)) {
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

    test('DOM Rule: Strictly zero placeholder text "Próximamente" across all templates and controllers', () => {
      const placeholderRegex = /próximamente|proximamente/i;
      const violations = [];

      // Check all 6 HTML templates
      for (const tpl of templateFiles) {
        const fullPath = path.join(HELP_VIEWS_DIR, tpl);
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');

        lines.forEach((line, idx) => {
          if (placeholderRegex.test(line)) {
            violations.push(`Template ${tpl}:${idx + 1} -> ${line.trim()}`);
          }
        });
      }

      // Check all 6 view controllers
      const controllerFiles = fs.readdirSync(HELP_CONTROLLERS_DIR).filter((f) => f.endsWith('.ts'));
      for (const ctrl of controllerFiles) {
        const fullPath = path.join(HELP_CONTROLLERS_DIR, ctrl);
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');

        lines.forEach((line, idx) => {
          if (placeholderRegex.test(line)) {
            violations.push(`Controller ${ctrl}:${idx + 1} -> ${line.trim()}`);
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

  // =========================================================================
  // SUITE 3: Translation Completeness, File Existence & Parity
  // =========================================================================
  describe('Suite 3: Translation Completeness, File Existence & Parity', () => {
    const requiredCatalogs = [
      { name: 'es.json', minSize: 50000 },
      { name: 'es-419.json', minSize: 50000 },
      { name: 'es-MX.json', minSize: 50000 },
      { name: 'en.json', minSize: 50000 },
      { name: 'en-US.json', minSize: 50000 },
    ];

    test('All 5 translation catalogs exist and exceed 50 KB', () => {
      for (const cat of requiredCatalogs) {
        const fullPath = path.join(TRANSLATIONS_DIR, cat.name);
        assert.ok(fs.existsSync(fullPath), `Translation catalog missing: ${cat.name}`);
        const stat = fs.statSync(fullPath);
        assert.ok(
          stat.size >= cat.minSize,
          `Catalog ${cat.name} size is ${stat.size} bytes, expected at least ${cat.minSize}`
        );
      }
    });

    test('All 5 translation catalogs parse cleanly as valid JSON', () => {
      for (const cat of requiredCatalogs) {
        const fullPath = path.join(TRANSLATIONS_DIR, cat.name);
        const raw = fs.readFileSync(fullPath, 'utf8');
        assert.doesNotThrow(() => JSON.parse(raw), `Failed to parse JSON in ${cat.name}`);
      }
    });

    test('Parity: 100% byte-for-byte exact equality between es.json, es-419.json, and es-MX.json', () => {
      const bufEs = fs.readFileSync(path.join(TRANSLATIONS_DIR, 'es.json'));
      const bufEs419 = fs.readFileSync(path.join(TRANSLATIONS_DIR, 'es-419.json'));
      const bufEsMx = fs.readFileSync(path.join(TRANSLATIONS_DIR, 'es-MX.json'));

      assert.strictEqual(
        Buffer.compare(bufEs, bufEs419),
        0,
        'es.json and es-419.json are NOT byte-for-byte identical'
      );
      assert.strictEqual(
        Buffer.compare(bufEs, bufEsMx),
        0,
        'es.json and es-MX.json are NOT byte-for-byte identical'
      );

      const hashEs = crypto.createHash('sha256').update(bufEs).digest('hex');
      const hashEs419 = crypto.createHash('sha256').update(bufEs419).digest('hex');
      const hashEsMx = crypto.createHash('sha256').update(bufEsMx).digest('hex');

      assert.strictEqual(hashEs, hashEs419, 'SHA-256 mismatch between es.json and es-419.json');
      assert.strictEqual(hashEs, hashEsMx, 'SHA-256 mismatch between es.json and es-MX.json');
    });

    test('Parity: 100% byte-for-byte exact equality between en.json and en-US.json', () => {
      const bufEn = fs.readFileSync(path.join(TRANSLATIONS_DIR, 'en.json'));
      const bufEnUs = fs.readFileSync(path.join(TRANSLATIONS_DIR, 'en-US.json'));

      assert.strictEqual(
        Buffer.compare(bufEn, bufEnUs),
        0,
        'en.json and en-US.json are NOT byte-for-byte identical'
      );

      const hashEn = crypto.createHash('sha256').update(bufEn).digest('hex');
      const hashEnUs = crypto.createHash('sha256').update(bufEnUs).digest('hex');

      assert.strictEqual(hashEn, hashEnUs, 'SHA-256 mismatch between en.json and en-US.json');
    });

    test('Key Parity: Spanish and English catalogs have identical leaf key counts and zero asymmetrical keys', () => {
      const esJson = JSON.parse(fs.readFileSync(path.join(TRANSLATIONS_DIR, 'es-419.json'), 'utf8'));
      const enJson = JSON.parse(fs.readFileSync(path.join(TRANSLATIONS_DIR, 'en.json'), 'utf8'));

      const esLeafKeys = getAllLeafKeys(esJson);
      const enLeafKeys = getAllLeafKeys(enJson);

      assert.strictEqual(
        esLeafKeys.length,
        1000,
        `Expected exactly 1000 leaf keys in Spanish catalog, found ${esLeafKeys.length}`
      );
      assert.strictEqual(
        enLeafKeys.length,
        1000,
        `Expected exactly 1000 leaf keys in English catalog, found ${enLeafKeys.length}`
      );

      const esSet = new Set(esLeafKeys);
      const enSet = new Set(enLeafKeys);

      const missingInEn = esLeafKeys.filter((k) => !enSet.has(k));
      const missingInEs = enLeafKeys.filter((k) => !esSet.has(k));

      assert.strictEqual(
        missingInEn.length,
        0,
        `Found ${missingInEn.length} key(s) in Spanish missing from English: ${missingInEn.join(', ')}`
      );
      assert.strictEqual(
        missingInEs.length,
        0,
        `Found ${missingInEs.length} key(s) in English missing from Spanish: ${missingInEs.join(', ')}`
      );
    });

    test('Rule: Total absence of "placeholder" keys across all help sections in catalogs', () => {
      const catalogsToCheck = ['es.json', 'es-419.json', 'es-MX.json', 'en.json', 'en-US.json'];
      const helpSections = ['terms', 'privacy', 'security', 'cookies', 'faq', 'docs'];

      for (const catName of catalogsToCheck) {
        const catJson = JSON.parse(fs.readFileSync(path.join(TRANSLATIONS_DIR, catName), 'utf8'));
        const helpObj = catJson.help || {};

        for (const sec of helpSections) {
          const secObj = helpObj[sec];
          if (secObj) {
            assert.strictEqual(
              'placeholder' in secObj,
              false,
              `Catalog ${catName} contains forbidden "placeholder" key in help.${sec}`
            );
          }
        }
      }
    });

    test('DOM translateElement Simulation: 0 raw dotted keys rendered in both Spanish and English', () => {
      // Collect all required keys across all 6 Help templates
      const templateKeys = new Set();
      const templates = ['cookies.html', 'documentation.html', 'faq.html', 'privacy.html', 'security.html', 'terms.html'];
      const i18nAttrRegex = /data-i18n(?:-html|-placeholder|-tooltip|-aria)?\s*=\s*["']([^"']+)["']/g;

      for (const tpl of templates) {
        const fullPath = path.join(HELP_VIEWS_DIR, tpl);
        const content = fs.readFileSync(fullPath, 'utf8');
        let match;
        while ((match = i18nAttrRegex.exec(content)) !== null) {
          templateKeys.add(match[1]);
        }
      }

      // Collect all dynamic keys from controllers & components
      const dynamicKeys = new Set();
      const controllers = fs.readdirSync(HELP_CONTROLLERS_DIR).filter((f) => f.endsWith('.ts'));

      for (const ctrl of controllers) {
        const content = fs.readFileSync(path.join(HELP_CONTROLLERS_DIR, ctrl), 'utf8');
        // Extract t('key') calls
        const tCallRegex = /\bt\(\s*['"]([a-zA-Z0-9._-]+)['"]/g;
        let match;
        while ((match = tCallRegex.exec(content)) !== null) {
          dynamicKeys.add(match[1]);
        }
        // Extract FAQ / Docs key properties
        const keyPropRegex = /(?:titleKey|questionKey|answerKey|descKey)\s*:\s*['"]([^"']+)['"]/g;
        while ((match = keyPropRegex.exec(content)) !== null) {
          dynamicKeys.add(match[1]);
        }
      }

      // Extract footer keys
      const footerContent = fs.readFileSync(path.resolve(PDF_ROOT, 'client/components/footer.component.ts'), 'utf8');
      const footerKeyRegex = /\bt\(\s*['"]([a-zA-Z0-9._-]+)['"]/g;
      let footerMatch;
      while ((footerMatch = footerKeyRegex.exec(footerContent)) !== null) {
        dynamicKeys.add(footerMatch[1]);
      }

      // All keys to test
      const allKeys = Array.from(new Set([...templateKeys, ...dynamicKeys]));
      assert.ok(allKeys.length >= 100, `Expected at least 100 distinct keys, found ${allKeys.length}`);

      const esJson = JSON.parse(fs.readFileSync(path.join(TRANSLATIONS_DIR, 'es-419.json'), 'utf8'));
      const enJson = JSON.parse(fs.readFileSync(path.join(TRANSLATIONS_DIR, 'en.json'), 'utf8'));

      // Spanish simulation
      const rawInSpanish = [];
      for (const key of allKeys) {
        const val = getNestedValue(esJson, key);
        if (val === undefined || val === null || val === key || typeof val !== 'string' || val.trim() === '') {
          rawInSpanish.push(key);
        }
      }

      assert.strictEqual(
        rawInSpanish.length,
        0,
        `DOM translateElement() Spanish simulation produced ${rawInSpanish.length} raw dotted keys:\n${rawInSpanish.join('\n')}`
      );

      // English simulation
      const rawInEnglish = [];
      for (const key of allKeys) {
        const val = getNestedValue(enJson, key);
        if (val === undefined || val === null || val === key || typeof val !== 'string' || val.trim() === '') {
          rawInEnglish.push(key);
        }
      }

      assert.strictEqual(
        rawInEnglish.length,
        0,
        `DOM translateElement() English simulation produced ${rawInEnglish.length} raw dotted keys:\n${rawInEnglish.join('\n')}`
      );
    });

    test('Verbatim Legal Clause Safeguards Verification in Spanish and English', () => {
      const esJson = JSON.parse(fs.readFileSync(path.join(TRANSLATIONS_DIR, 'es-419.json'), 'utf8'));
      const enJson = JSON.parse(fs.readFileSync(path.join(TRANSLATIONS_DIR, 'en.json'), 'utf8'));

      const legalChecks = [
        // Terms
        {
          desc: 'Terms: Class Action Waiver',
          key: 'help.terms.section3_text',
          esRegex: /demanda(?:s)? colectiva(?:s)?|acción de clase/i,
          enRegex: /class action/i,
        },
        {
          desc: 'Terms: AAA Binding Arbitration',
          key: 'help.terms.section4_text',
          esRegex: /AAA|American Arbitration Association/i,
          enRegex: /AAA|American Arbitration Association/i,
        },
        {
          desc: 'Terms: AS-IS Warranty Disclaimer',
          key: 'help.terms.section5_text',
          esRegex: /"TAL CUAL"|"AS IS"/i,
          enRegex: /"AS IS"|"AS AVAILABLE"/i,
        },
        {
          desc: 'Terms: Liability Cap ($50 USD / 3 months)',
          key: 'help.terms.section6_text',
          esRegex: /50(?:\.00)?\s*(?:USD|\$)/i,
          enRegex: /50(?:\.00)?\s*(?:USD|\$)/i,
        },
        {
          desc: 'Terms: AI PDF Intelligence Disclaimer',
          key: 'help.terms.section7_text',
          esRegex: /inteligencia artificial|alucinaciones|orientativo/i,
          enRegex: /artificial intelligence|hallucination|advisory/i,
        },
        {
          desc: 'Terms: User IP & Indemnification',
          key: 'help.terms.section8_text',
          esRegex: /indemnizar|mantener indemne/i,
          enRegex: /indemnify|hold harmless/i,
        },
        {
          desc: 'Terms: DMCA Takedown Notice',
          key: 'help.terms.section9_text',
          esRegex: /DMCA|Digital Millennium Copyright Act/i,
          enRegex: /DMCA|Digital Millennium Copyright Act/i,
        },
        {
          desc: 'Terms: Stripe Billing & No Retroactive Refund',
          key: 'help.terms.section10_text',
          esRegex: /Stripe/i,
          enRegex: /Stripe/i,
        },
        // Privacy
        {
          desc: 'Privacy: Zero AI Model Training Guarantee',
          key: 'help.privacy.section3_text',
          esRegex: /cero entrenamiento|ningún documento.*entrenar/i,
          enRegex: /zero.*training|never.*train.*ai/i,
        },
        {
          desc: 'Privacy: Ephemeral Retention < 2 Hours TTL',
          key: 'help.privacy.section4_text',
          esRegex: /2 horas/i,
          enRegex: /2 hours/i,
        },
        {
          desc: 'Privacy: GDPR Legal Bases (Art 6)',
          key: 'help.privacy.section5_text',
          esRegex: /art(?:ículo)?\.?\s*6|bases legales|bases jurídicas|ejecución contractual/i,
          enRegex: /article 6|legal bases|contractual/i,
        },
        {
          desc: 'Privacy: CCPA Do Not Sell or Share My Info',
          key: 'help.privacy.section10_text',
          esRegex: /no vendemos ni compartimos|do not sell or share/i,
          enRegex: /do not sell or share/i,
        },
        // Security
        {
          desc: 'Security: Zero-Knowledge & Isolated Sandboxing',
          key: 'help.security.section1_text',
          esRegex: /zero-knowledge/i,
          enRegex: /zero-knowledge/i,
        },
        {
          desc: 'Security: TLS 1.3 PFS & AES-GCM-256',
          key: 'help.security.section2_text',
          esRegex: /aes-gcm/i,
          enRegex: /aes-gcm/i,
        },
        // Cookies
        {
          desc: 'Cookies: Technical Cookie Matrix',
          key: 'help.cookies.table_row1_name',
          esRegex: /aurora_session/i,
          enRegex: /aurora_session/i,
        },
      ];

      for (const check of legalChecks) {
        const esVal = getNestedValue(esJson, check.key) || '';
        const enVal = getNestedValue(enJson, check.key) || '';

        assert.ok(
          check.esRegex.test(esVal),
          `[FAIL] ${check.desc} missing expected pattern in Spanish: ${check.esRegex}`
        );
        assert.ok(
          check.enRegex.test(enVal),
          `[FAIL] ${check.desc} missing expected pattern in English: ${check.enRegex}`
        );
      }
    });
  });

});
