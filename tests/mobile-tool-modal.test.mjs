import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT_DIR = process.cwd();
const MERGE_HTML_PATH = path.resolve(ROOT_DIR, 'public/views/tools/merge-pdf/merge-pdf.html');
const TOOL_CSS_PATH = path.resolve(ROOT_DIR, 'public/css/tools/tool-layout.css');
const DOM_UTIL_PATH = path.resolve(ROOT_DIR, 'client/utils/dom.util.ts');
const MERGE_VIEW_PATH = path.resolve(ROOT_DIR, 'client/views/tools/merge-pdf/merge-pdf.view.ts');

describe('Mobile Tool Sidebar Modal & Settings FAB Tests', () => {
  it('merge-pdf.html contains tool-fab-container with btn-tool-settings directly above tool-fab-more', () => {
    const html = fs.readFileSync(MERGE_HTML_PATH, 'utf8');
    assert.ok(html.includes('data-ref="tool-fab-container"'), 'Must have tool-fab-container');
    assert.ok(html.includes('data-ref="btn-tool-settings"'), 'Must have btn-tool-settings');
    assert.ok(html.includes('data-ref="tool-fab-more"'), 'Must have tool-fab-more');

    const settingsIndex = html.indexOf('data-ref="btn-tool-settings"');
    const fabMoreIndex = html.indexOf('data-ref="tool-fab-more"');
    assert.ok(settingsIndex < fabMoreIndex, 'btn-tool-settings must be positioned above tool-fab-more in DOM');
  });

  it('merge-pdf.html defines decoupled mobile bar and backdrop without id attributes', () => {
    const html = fs.readFileSync(MERGE_HTML_PATH, 'utf8');
    assert.ok(html.includes('data-ref="tool-sidebar-backdrop"'), 'Must have tool-sidebar-backdrop');
    assert.ok(html.includes('data-ref="tool-sidebar-mobile-bar"'), 'Must have tool-sidebar-mobile-bar');
    assert.ok(html.includes('data-ref="btn-sidebar-close"'), 'Must have btn-sidebar-close');
    assert.ok(html.includes('data-ref="modal-drag-zone"'), 'Must have modal-drag-zone');
    assert.ok(html.includes('class="modal-card__drag-handle"'), 'Must have drag handle');

    const idMatches = html.match(/\bid\s*=/gi);
    assert.strictEqual(idMatches, null, 'No id attributes allowed in merge-pdf.html');
  });

  it('tool-layout.css enforces desktop suppression and mobile sheet modal without hardcoded colors', () => {
    const css = fs.readFileSync(TOOL_CSS_PATH, 'utf8');
    assert.ok(css.includes('.tool-fab-settings'), 'Must have .tool-fab-settings');
    assert.ok(css.includes('.tool-sidebar__mobile-bar'), 'Must have .tool-sidebar__mobile-bar');
    assert.ok(css.includes('.tool-sidebar-backdrop'), 'Must have .tool-sidebar-backdrop');

    // Desktop suppression
    const desktopSlice = css.slice(0, css.indexOf('@media (max-width: 960px)'));
    assert.ok(desktopSlice.includes('.tool-fab-settings') && desktopSlice.includes('display: none !important'), 'Desktop must hide tool-fab-settings with !important');
    assert.ok(desktopSlice.includes('.tool-sidebar__mobile-bar') && desktopSlice.includes('display: none !important'), 'Desktop must hide tool-sidebar__mobile-bar with !important');
    assert.ok(desktopSlice.includes('.tool-sidebar-backdrop') && desktopSlice.includes('display: none !important'), 'Desktop must hide tool-sidebar-backdrop with !important');

    // Mobile activation
    const mqSlice = css.slice(css.indexOf('@media (max-width: 960px)'));
    assert.ok(mqSlice.includes('.tool-fab-settings.is-visible'), 'Mobile FAB must respond to is-visible');
    assert.ok(mqSlice.includes('.tool-sidebar-backdrop.is-visible'), 'Mobile backdrop must handle is-visible');
    assert.ok(mqSlice.includes('.tool-layout__sidebar.is-mobile-open'), 'Mobile sidebar must slide open with is-mobile-open');
    assert.ok(mqSlice.includes('transform: translateY(0)'), 'Mobile sidebar must translate into view');
  });

  it('dom.util.ts exports setupToolSidebarModal and ToolSidebarModalController with clean lifecycle', () => {
    const ts = fs.readFileSync(DOM_UTIL_PATH, 'utf8');
    assert.ok(ts.includes('export interface ToolSidebarModalController'), 'Must export ToolSidebarModalController');
    assert.ok(ts.includes('export function setupToolSidebarModal'), 'Must export setupToolSidebarModal');
    assert.ok(ts.includes('modal-open'), 'Must handle document.body modal-open class');
  });

  it('merge-pdf.view.ts wires up setupToolSidebarModal and cleans up in destroy()', () => {
    const ts = fs.readFileSync(MERGE_VIEW_PATH, 'utf8');
    assert.ok(ts.includes('setupToolSidebarModal'), 'Must use setupToolSidebarModal');
    assert.ok(ts.includes('this.sidebarModal.destroy()'), 'Must clean up in destroy()');
    assert.ok(ts.includes('btn-tool-settings'), 'Must reference btn-tool-settings');
  });
});
