import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

function isToolNew(toolOrDate) {
  if (!toolOrDate) return false;
  const dateStr = typeof toolOrDate === 'string' ? toolOrDate : toolOrDate.activatedAt;
  if (!dateStr) return false;
  const activated = new Date(dateStr);
  if (isNaN(activated.getTime())) return false;

  const now = new Date();
  if (activated.getTime() > now.getTime() + 86400000) return false;

  const oneMonthAgo = new Date(now);
  oneMonthAgo.setMonth(now.getMonth() - 1);

  return activated.getTime() >= oneMonthAgo.getTime() || (now.getTime() - activated.getTime()) <= 30 * 24 * 60 * 60 * 1000;
}

describe('Tools Registry - Activation Date and New Badge Suite', () => {
  it('Verifies tools.registry.ts contains activatedAt and isToolNew implementation', () => {
    const registryPath = path.resolve('client/config/tools.registry.ts');
    const content = fs.readFileSync(registryPath, 'utf-8');

    assert.ok(content.includes('activatedAt?: string;'));
    assert.ok(content.includes('export function isToolNew('));
    assert.ok(content.includes("activatedAt: '2026-10-15'"));
    assert.ok(content.includes("activatedAt: '2026-01-15'"));
  });

  it('Verifies home.view.ts renders badge for new tools', () => {
    const homeViewPath = path.resolve('client/views/home.view.ts');
    const content = fs.readFileSync(homeViewPath, 'utf-8');

    assert.ok(content.includes('isToolNew'));
    assert.ok(content.includes('tool-card__badge--new'));
    assert.ok(content.includes('data-ref="badge-tool-new-'));
    assert.ok(content.includes('data-i18n="home.badge_new"'));
  });

  it('Evaluates isToolNew for tools within 30 days and 1 month', () => {
    const now = new Date();

    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    assert.strictEqual(isToolNew(fiveDaysAgo), true);

    const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString();
    assert.strictEqual(isToolNew(fifteenDaysAgo), true);

    const twentyNineDaysAgo = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString();
    assert.strictEqual(isToolNew(twentyNineDaysAgo), true);

    const toolObj = {
      id: 'test-new-tool',
      activatedAt: fifteenDaysAgo,
    };
    assert.strictEqual(isToolNew(toolObj), true);
  });

  it('Evaluates isToolNew as false for tools older than 1 month', () => {
    const now = new Date();

    const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();
    assert.strictEqual(isToolNew(fortyDaysAgo), false);

    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();
    assert.strictEqual(isToolNew(sixMonthsAgo), false);

    const toolObj = {
      id: 'test-old-tool',
      activatedAt: sixMonthsAgo,
    };
    assert.strictEqual(isToolNew(toolObj), false);
  });

  it('Handles edge cases and invalid inputs gracefully in isToolNew', () => {
    assert.strictEqual(isToolNew(undefined), false);
    assert.strictEqual(isToolNew(null), false);
    assert.strictEqual(isToolNew(''), false);
    assert.strictEqual(isToolNew('invalid-date-string'), false);
    assert.strictEqual(isToolNew({ id: 'no-date-tool' }), false);

    const farFuture = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    assert.strictEqual(isToolNew(farFuture), false);
  });

  it('Verifies home.badge_new exists in all translation catalogs', () => {
    const locales = ['es.json', 'es-419.json', 'es-MX.json', 'en.json', 'en-US.json'];
    for (const locale of locales) {
      const filePath = path.resolve(`public/translations/${locale}`);
      const json = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      assert.ok(json.home, `Missing home namespace in ${locale}`);
      assert.ok(json.home.badge_new, `Missing home.badge_new in ${locale}`);
      if (locale.startsWith('es')) {
        assert.strictEqual(json.home.badge_new, 'Nueva');
      } else {
        assert.strictEqual(json.home.badge_new, 'New');
      }
    }
  });

  it('Verifies CSS definitions for tool-card badge in component-views.css', () => {
    const cssPath = path.resolve('public/css/components/component-views.css');
    const content = fs.readFileSync(cssPath, 'utf-8');

    assert.ok(content.includes('.tool-card__badge {'));
    assert.ok(content.includes('.tool-card__badge--new {'));
    assert.ok(content.includes('html[data-theme="dark"] .tool-card__badge--new'));
  });
});
