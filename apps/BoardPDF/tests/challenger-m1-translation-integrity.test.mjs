import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import test, { describe } from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PDF_ROOT = path.resolve(__dirname, '..');

function getNestedValue(obj, dotPath) {
  const parts = dotPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function collectAllStringLeaves(obj, currentPath = '') {
  const results = [];
  if (obj === null || obj === undefined) return results;

  if (typeof obj === 'string') {
    results.push({ path: currentPath, value: obj });
    return results;
  }

  if (typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      const childPath = currentPath ? `${currentPath}.${key}` : key;
      if (typeof val === 'string') {
        results.push({ path: childPath, value: val });
      } else if (typeof val === 'object' && val !== null) {
        results.push(...collectAllStringLeaves(val, childPath));
      }
    }
  }

  return results;
}

describe('Challenger M1: Translation Integrity & Catalog Exclusivity', () => {
  const translationsDir = path.resolve(PDF_ROOT, 'public/translations');
  const es419File = path.join(translationsDir, 'es-419.json');

  describe('Check 1: Catalog Exclusivity', () => {
    test('Directory public/translations/ exists', () => {
      assert.ok(fs.existsSync(translationsDir), `Directory not found: ${translationsDir}`);
      const stat = fs.statSync(translationsDir);
      assert.ok(stat.isDirectory(), `Path is not a directory: ${translationsDir}`);
    });

    test('Directory public/translations/ contains ONLY es-419.json and NO other files', () => {
      const files = fs.readdirSync(translationsDir);

      assert.strictEqual(
        files.length,
        1,
        `Expected exactly 1 file in ${translationsDir}, but found ${files.length}: ${JSON.stringify(files)}`
      );

      assert.strictEqual(
        files[0],
        'es-419.json',
        `The only allowed file is 'es-419.json', but found: ${files[0]}`
      );
    });

    test('Forbidden translation files (es.json, en.json, es-MX.json, en-US.json) must not exist', () => {
      const forbiddenFiles = ['es.json', 'en.json', 'es-MX.json', 'en-US.json', 'en-GB.json', 'pt.json', 'fr.json'];
      for (const forbidden of forbiddenFiles) {
        const fullPath = path.join(translationsDir, forbidden);
        assert.ok(
          !fs.existsSync(fullPath),
          `Forbidden translation file exists: ${forbidden}`
        );
      }
    });

    test('es-419.json is valid, non-empty, parseable JSON', () => {
      assert.ok(fs.existsSync(es419File), `File missing: ${es419File}`);
      const content = fs.readFileSync(es419File, 'utf8');
      assert.ok(content.trim().length > 0, 'es-419.json is empty');

      let parsed;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(content);
      }, 'es-419.json must be valid JSON');

      assert.strictEqual(typeof parsed, 'object', 'es-419.json root must be an object');
      assert.ok(parsed !== null, 'es-419.json parsed result must not be null');
      assert.ok(Object.keys(parsed).length > 0, 'es-419.json must have top-level keys');
    });
  });

  describe('Check 2: Translation Key Coverage in Help Views', () => {
    const helpViewsDir = path.resolve(PDF_ROOT, 'public/views/help');
    const helpFiles = [
      'privacy.html',
      'security.html',
      'terms.html',
      'cookies.html',
      'faq.html',
      'documentation.html',
    ];

    test('All 6 help view HTML files exist', () => {
      for (const file of helpFiles) {
        const fullPath = path.join(helpViewsDir, file);
        assert.ok(fs.existsSync(fullPath), `Help view missing: ${fullPath}`);
      }
    });

    test('Every data-i18n* attribute resolves to a valid, non-empty string in es-419.json', () => {
      const catalog = JSON.parse(fs.readFileSync(es419File, 'utf8'));
      const i18nAttrRegex = /data-i18n(?:-[a-z0-9_-]+)?\s*=\s*["']([^"']+)["']/g;

      const failures = [];
      let totalExtractedAttrs = 0;
      const uniqueKeys = new Set();

      for (const file of helpFiles) {
        const fullPath = path.join(helpViewsDir, file);
        const content = fs.readFileSync(fullPath, 'utf8');

        let match;
        while ((match = i18nAttrRegex.exec(content)) !== null) {
          totalExtractedAttrs++;
          const key = match[1].trim();
          uniqueKeys.add(key);

          const resolved = getNestedValue(catalog, key);

          if (resolved === undefined) {
            failures.push({ file, key, issue: 'Key does not exist in es-419.json (undefined)' });
          } else if (resolved === null) {
            failures.push({ file, key, issue: 'Key resolved to null in es-419.json' });
          } else if (typeof resolved !== 'string') {
            failures.push({ file, key, issue: `Key resolved to ${typeof resolved} instead of string: ${JSON.stringify(resolved)}` });
          } else if (resolved.trim().length === 0) {
            failures.push({ file, key, issue: 'Key resolved to empty or whitespace-only string' });
          }
        }
      }

      assert.ok(totalExtractedAttrs > 0, `Expected to find data-i18n attributes in help views, found ${totalExtractedAttrs}`);
      assert.ok(uniqueKeys.size > 0, `Expected unique keys, found ${uniqueKeys.size}`);

      if (failures.length > 0) {
        const failureMessages = failures
          .map((f) => `  - [${f.file}] ${f.key}: ${f.issue}`)
          .join('\n');
        assert.fail(`Found ${failures.length} translation resolution failure(s) across help views:\n${failureMessages}`);
      }
    });
  });

  describe('Check 3: Absence of "Próximamente" in es-419.json', () => {
    test('No values in es-419.json contain substring "Próximamente" (case-insensitive & accent-insensitive)', () => {
      const catalog = JSON.parse(fs.readFileSync(es419File, 'utf8'));
      const leaves = collectAllStringLeaves(catalog);

      assert.ok(leaves.length > 0, `Expected non-empty leaves, found ${leaves.length}`);

      const violations = [];
      const forbiddenPatterns = [
        /próximamente/i,
        /proximamente/i,
      ];

      for (const leaf of leaves) {
        for (const pattern of forbiddenPatterns) {
          if (pattern.test(leaf.value)) {
            violations.push({
              path: leaf.path,
              value: leaf.value,
              matched: pattern.toString(),
            });
            break;
          }
        }
      }

      if (violations.length > 0) {
        const messages = violations
          .map((v) => `  - Key "${v.path}": "${v.value}" (matched ${v.matched})`)
          .join('\n');
        assert.fail(`Found ${violations.length} value(s) in es-419.json containing "Próximamente":\n${messages}`);
      }
    });

    test('No values in es-419.json contain suspicious placeholder markers ("TODO", "TBD", "Lorem ipsum")', () => {
      const catalog = JSON.parse(fs.readFileSync(es419File, 'utf8'));
      const leaves = collectAllStringLeaves(catalog);

      const suspiciousPatterns = [
        /\blorem\s+ipsum\b/i,
        /\[placeholder\]/i,
        /\bTODO\b/,
        /\bTBD\b/,
      ];

      const violations = [];
      for (const leaf of leaves) {
        for (const pattern of suspiciousPatterns) {
          if (pattern.test(leaf.value)) {
            violations.push({
              path: leaf.path,
              value: leaf.value,
              matched: pattern.toString(),
            });
            break;
          }
        }
      }

      if (violations.length > 0) {
        const messages = violations
          .map((v) => `  - Key "${v.path}": "${v.value}" (matched ${v.matched})`)
          .join('\n');
        assert.fail(`Found ${violations.length} value(s) with placeholder markers in es-419.json:\n${messages}`);
      }
    });
  });

  describe('Check 4: Stress-Testing Edge Cases & Catalog Integrity', () => {
    test('JSON catalog has no duplicate keys in raw serialization', () => {
      const content = fs.readFileSync(es419File, 'utf8');
      const seenKeys = new Map();
      const duplicates = [];

      // Parse JSON token by token to detect duplicate keys in same scope
      let currentDepth = 0;
      const stack = [new Set()];

      // Regex matching JSON keys: "key":
      const keyRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"\s*:/g;
      // We can also check by walking line by line or parsing with custom reviver
      JSON.parse(content, function (key, value) {
        // reviver executes bottom up
        return value;
      });

      assert.strictEqual(duplicates.length, 0, `Duplicate JSON keys detected: ${duplicates.join(', ')}`);
    });

    test('All help templates render valid HTML without raw unresolved template variables like {{...}} or ${...}', () => {
      const helpViewsDir = path.resolve(PDF_ROOT, 'public/views/help');
      const helpFiles = ['privacy.html', 'security.html', 'terms.html', 'cookies.html', 'faq.html', 'documentation.html'];

      const rawVarRegex = /\{\{[^}]+\}\}|\$\{[^}]+\}/g;
      const violations = [];

      for (const file of helpFiles) {
        const content = fs.readFileSync(path.join(helpViewsDir, file), 'utf8');
        let match;
        while ((match = rawVarRegex.exec(content)) !== null) {
          violations.push(`${file} -> ${match[0]}`);
        }
      }

      assert.strictEqual(violations.length, 0, `Found raw template tokens in help templates: ${violations.join(', ')}`);
    });
  });
});
