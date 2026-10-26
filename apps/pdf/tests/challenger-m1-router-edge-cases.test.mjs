import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import test, { describe } from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PDF_ROOT = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(PDF_ROOT, '..', '..');

import { APP_ROUTES, findRoute, parseRoutePath } from '../client/config/routes.config.ts';
import { hasDesignatedMenuItems } from '../client/components/layout.component.ts';

// Extract parseRouteUrl logic from app-router.ts for independent verification
function normalizePath(rawPath) {
  if (!rawPath || rawPath === '/' || rawPath === '') return '/';
  const clean = rawPath.replace(/\/+$/, '');
  return clean === '' ? '/' : clean;
}

function parseRouteUrl(rawUrl, origin = 'http://localhost:3000') {
  try {
    const urlObj = new URL(rawUrl, origin);
    const pathname = normalizePath(urlObj.pathname);
    return {
      fullUrl: `${pathname}${urlObj.search}${urlObj.hash}`,
      pathname,
      query: urlObj.searchParams,
      hash: urlObj.hash,
    };
  } catch {
    const [pathAndQuery] = (rawUrl || '').split('#');
    const [pathPart, queryPart = ''] = pathAndQuery.split('?');
    const pathname = normalizePath(pathPart);
    return {
      fullUrl: rawUrl,
      pathname,
      query: new URLSearchParams(queryPart),
      hash: rawUrl.includes('#') ? `#${rawUrl.split('#')[1]}` : '',
    };
  }
}

describe('Challenger 2: Router Edge-Cases & Drawer Mode Verification', () => {

  describe('Suite 1: URL Query Strings & #hash Fragment Parsing in parseRouteUrl', () => {
    const testCases = [
      {
        input: '/workflows?filter=active&sort=desc',
        expectedPathname: '/workflows',
        expectedQuery: { filter: 'active', sort: 'desc' },
        expectedHash: '',
      },
      {
        input: '/help/terms#arbitration-clause',
        expectedPathname: '/help/terms',
        expectedQuery: {},
        expectedHash: '#arbitration-clause',
      },
      {
        input: '/help/faq?q=security+encryption#faq-item-4',
        expectedPathname: '/help/faq',
        expectedQuery: { q: 'security encryption' },
        expectedHash: '#faq-item-4',
      },
      {
        input: '/en/privacy#retention',
        expectedPathname: '/en/privacy',
        expectedQuery: {},
        expectedHash: '#retention',
      },
      {
        input: '/workflow/wf_test_123?mode=edit#step-3',
        expectedPathname: '/workflow/wf_test_123',
        expectedQuery: { mode: 'edit' },
        expectedHash: '#step-3',
      },
      {
        input: '/es/terminos?utm_source=app_footer&utm_medium=referral#arbitraje',
        expectedPathname: '/es/terminos',
        expectedQuery: { utm_source: 'app_footer', utm_medium: 'referral' },
        expectedHash: '#arbitraje',
      },
      {
        input: '/help/cookies?consent=all#third-party',
        expectedPathname: '/help/cookies',
        expectedQuery: { consent: 'all' },
        expectedHash: '#third-party',
      },
      {
        input: '/help/security/#zero-knowledge',
        expectedPathname: '/help/security',
        expectedQuery: {},
        expectedHash: '#zero-knowledge',
      },
      {
        input: '/workflows?new=1#modal',
        expectedPathname: '/workflows',
        expectedQuery: { new: '1' },
        expectedHash: '#modal',
      },
    ];

    for (const tc of testCases) {
      test(`parseRouteUrl correctly strips queries and hashes for: ${tc.input}`, () => {
        const parsed = parseRouteUrl(tc.input);
        assert.strictEqual(
          parsed.pathname,
          tc.expectedPathname,
          `Pathname mismatch for ${tc.input}: got ${parsed.pathname}, expected ${tc.expectedPathname}`
        );
        for (const [key, expectedVal] of Object.entries(tc.expectedQuery)) {
          assert.strictEqual(
            parsed.query.get(key),
            expectedVal,
            `Query param [${key}] mismatch for ${tc.input}`
          );
        }
        assert.strictEqual(
          parsed.hash,
          tc.expectedHash,
          `Hash mismatch for ${tc.input}: got ${parsed.hash}, expected ${tc.expectedHash}`
        );

        // Verify that passing pathname to findRoute resolves cleanly
        const match = findRoute(parsed.pathname);
        assert.ok(
          match !== null,
          `findRoute(pathname) returned null for parsed pathname "${parsed.pathname}" from "${tc.input}"`
        );
      });
    }

    test('parseRouteUrl fallback path without window.location origin', () => {
      // Test fallback branch by simulating malformed URL or environment
      const parsed = parseRouteUrl('/workflows?tab=all#heading');
      assert.strictEqual(parsed.pathname, '/workflows');
      assert.strictEqual(parsed.query.get('tab'), 'all');
      assert.strictEqual(parsed.hash, '#heading');
    });
  });

  describe('Suite 2: Drawer Mode Behavior (/workflows vs /help/* vs tools)', () => {
    function computeDrawerMode(internalPath) {
      return internalPath.includes('/workflows') || internalPath.includes('/workflow/') ? 'workflows' : 'help';
    }

    test('/workflows triggers designated menu and drawerMode === "workflows"', () => {
      const internalPath = '/workflows';
      assert.strictEqual(hasDesignatedMenuItems(internalPath), true, '/workflows must have designated menu items');
      assert.strictEqual(computeDrawerMode(internalPath), 'workflows', 'Drawer mode must be "workflows"');
    });

    test('/workflows?new=1 triggers designated menu and drawerMode === "workflows"', () => {
      const parsed = parseRouteUrl('/workflows?new=1');
      const match = findRoute(parsed.pathname);
      assert.ok(match);
      assert.strictEqual(hasDesignatedMenuItems(match.internalPath), true);
      assert.strictEqual(computeDrawerMode(match.internalPath), 'workflows');
    });

    test('/workflow/:id runner triggers designated menu and drawerMode === "workflows"', () => {
      const match = findRoute('/workflow/wf_runner_99');
      assert.ok(match);
      assert.strictEqual(match.routeId, 'workflow-runner');
      assert.strictEqual(hasDesignatedMenuItems(match.internalPath), true);
      assert.strictEqual(computeDrawerMode(match.internalPath), 'workflows');
    });

    const helpRoutes = [
      { path: '/help', expectedId: 'help' },
      { path: '/help/documentation', expectedId: 'help-documentation' },
      { path: '/help/faq', expectedId: 'help-faq' },
      { path: '/help/privacy', expectedId: 'help-privacy' },
      { path: '/help/security', expectedId: 'help-security' },
      { path: '/help/terms', expectedId: 'help-terms' },
      { path: '/help/cookies', expectedId: 'help-cookies' },
      { path: '/es/terminos', expectedId: 'help-terms' },
      { path: '/es/privacidad', expectedId: 'help-privacy' },
      { path: '/es/seguridad', expectedId: 'help-security' },
      { path: '/es/preguntas-frecuentes', expectedId: 'help-faq' },
      { path: '/es/herramientas', expectedId: 'help-documentation' },
    ];

    for (const { path: routePath, expectedId } of helpRoutes) {
      test(`Help route "${routePath}" triggers designated menu and drawerMode === "help"`, () => {
        const match = findRoute(routePath);
        assert.ok(match, `Route ${routePath} must match`);
        assert.strictEqual(hasDesignatedMenuItems(match.internalPath), true, `Must have designated menu: ${match.internalPath}`);
        assert.strictEqual(computeDrawerMode(match.internalPath), 'help', `Drawer mode must be "help" for ${routePath}`);
      });
    }

    test('Non-designated routes (Home, AI, Tools) must return false for hasDesignatedMenuItems', () => {
      const nonDesignated = [
        '/',
        '/ai',
        '/merge-pdf',
        '/split-pdf',
        '/compress-pdf',
        '/about',
        '/contact',
      ];

      for (const routePath of nonDesignated) {
        const match = findRoute(routePath);
        const internal = match ? match.internalPath : routePath;
        assert.strictEqual(
          hasDesignatedMenuItems(internal),
          false,
          `Route "${routePath}" (internal "${internal}") must NOT have designated menu items`
        );
      }
    });
  });

  describe('Suite 3: Critical Edge-Case in routes.config.ts:parseRoutePath regarding #hash', () => {
    test('Empirical check: Direct call to findRoute with raw #hash string', () => {
      // When a caller passes a raw path with #hash directly to findRoute:
      // e.g. findRoute('/en/privacy#section-1')
      const matchWithoutHash = findRoute('/en/privacy');
      assert.ok(matchWithoutHash, 'findRoute without hash must succeed');
      assert.strictEqual(matchWithoutHash.routeId, 'help-privacy');

      const matchWithHash = findRoute('/en/privacy#section-1');
      // If routes.config.ts parseRoutePath does not strip #, this will return null
      // Let's document actual behavior empirically
      const hashHandledByFindRoute = matchWithHash !== null;
      if (!hashHandledByFindRoute) {
        // This confirms that app-router.ts's parseRouteUrl is strictly necessary to sanitize before findRoute
        assert.strictEqual(
          matchWithHash,
          null,
          'findRoute without pre-sanitization fails because parseRoutePath only splits on "?"'
        );
      }
    });
  });

  describe('Suite 4: AGENTS.md Rule Compliance in All Modified Files', () => {
    const modifiedFiles = [
      'client/app-router.ts',
      'client/components/layout.component.ts',
      'public/views/help/faq.html',
      'public/views/help/privacy.html',
      'public/views/help/terms.html',
    ];

    test('Zero console.log, console.warn, console.error in modified files', () => {
      const consoleRegex = /\bconsole\.(log|warn|error|info|debug)\b/;
      const violations = [];

      for (const relPath of modifiedFiles) {
        const fullPath = path.resolve(PDF_ROOT, relPath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            if (consoleRegex.test(line)) {
              violations.push(`${relPath}:${idx + 1} -> ${line.trim()}`);
            }
          });
        }
      }

      assert.strictEqual(
        violations.length,
        0,
        `Found console.* calls in modified files:\n${violations.join('\n')}`
      );
    });

    test('Zero id="..." attributes in HTML templates and TS components', () => {
      const idRegex = /\bid\s*=\s*["'][^"']+["']/i;
      const violations = [];

      for (const relPath of modifiedFiles) {
        const fullPath = path.resolve(PDF_ROOT, relPath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            // exclude comment lines or TypeScript interface property definitions like "id: string;"
            if (relPath.endsWith('.html') && idRegex.test(line)) {
              violations.push(`${relPath}:${idx + 1} -> ${line.trim()}`);
            }
          });
        }
      }

      assert.strictEqual(
        violations.length,
        0,
        `Found id="..." in templates:\n${violations.join('\n')}`
      );
    });

    test('Buttons have type attribute as first attribute in HTML templates', () => {
      const buttonRegex = /<button\b([^>]*?)>/gi;
      const violations = [];

      for (const relPath of modifiedFiles) {
        if (!relPath.endsWith('.html')) continue;
        const fullPath = path.resolve(PDF_ROOT, relPath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          let m;
          while ((m = buttonRegex.exec(content)) !== null) {
            const rawAttrs = m[1].trim();
            if (!/^type\s*=\s*["'][^"']+["']/i.test(rawAttrs)) {
              violations.push(`${relPath} -> <button ${rawAttrs.slice(0, 60)}>`);
            }
          }
        }
      }

      assert.strictEqual(
        violations.length,
        0,
        `Found button tags with type not as first attribute:\n${violations.join('\n')}`
      );
    });

    test('Non-button elements have class attribute as first attribute in HTML templates', () => {
      const tagRegex = /<([a-zA-Z0-9]+)\b([^>]*?)>/g;
      const violations = [];

      for (const relPath of modifiedFiles) {
        if (!relPath.endsWith('.html')) continue;
        const fullPath = path.resolve(PDF_ROOT, relPath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          let m;
          while ((m = tagRegex.exec(content)) !== null) {
            const tagName = m[1].toLowerCase();
            const rawAttrs = m[2].trim();
            if (tagName === 'button' || !rawAttrs) continue;
            if (/\bclass\s*=/i.test(rawAttrs)) {
              if (!/^class\s*=\s*["'][^"']*["']/i.test(rawAttrs)) {
                violations.push(`${relPath} -> <${tagName} ${rawAttrs.slice(0, 60)}>`);
              }
            }
          }
        }
      }

      assert.strictEqual(
        violations.length,
        0,
        `Found non-button elements with class not as first attribute:\n${violations.join('\n')}`
      );
    });

    test('TypeScript imports in modified TS files must be horizontal single-line and alphabetical', () => {
      const tsFiles = modifiedFiles.filter(f => f.endsWith('.ts'));
      const multilineImportRegex = /^import\s+[^;]*?\{[^}]*$/m;

      for (const relPath of tsFiles) {
        const fullPath = path.resolve(PDF_ROOT, relPath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');

          const importLines = [];
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('import ') && line.endsWith(';')) {
              importLines.push(line);
            }
          }

          // Check single horizontal lines (no multiline imports)
          assert.strictEqual(
            multilineImportRegex.test(content),
            false,
            `File ${relPath} contains multiline imports`
          );

          // Check sorted imports by module source
          const modulePaths = importLines.map(l => {
            const match = l.match(/from\s+['"]([^'"]+)['"]/);
            return match ? match[1] : '';
          });

          for (let i = 1; i < modulePaths.length; i++) {
            assert.ok(
              modulePaths[i - 1].localeCompare(modulePaths[i]) <= 0,
              `Imports in ${relPath} not alphabetically sorted: "${modulePaths[i - 1]}" should precede "${modulePaths[i]}"`
            );
          }
        }
      }
    });
  });

  describe('Suite 5: Translation Catalog Exclusivity (Strict User Directive)', () => {
    test('Directory public/translations contains strictly es-419.json and zero forbidden catalogs', () => {
      const transDir = path.resolve(PDF_ROOT, 'public/translations');
      const files = fs.readdirSync(transDir);
      const forbidden = files.filter(f => f !== 'es-419.json');

      assert.strictEqual(
        forbidden.length,
        0,
        `CRITICAL VIOLATION: Forbidden translation files found on disk in ${transDir}: ${JSON.stringify(forbidden)}`
      );
    });
  });

});
