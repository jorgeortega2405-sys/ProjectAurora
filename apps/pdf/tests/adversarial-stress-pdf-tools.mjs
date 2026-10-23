import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const VIEWS_DIR = path.resolve(ROOT_DIR, 'public/views/tools');
const CSS_DIR = path.resolve(ROOT_DIR, 'public/css/tools');
const CLIENT_VIEWS_DIR = path.resolve(ROOT_DIR, 'client/views/tools');
const SRC_TOOLS_DIR = path.resolve(ROOT_DIR, 'src/tools');

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

const findings = [];

function check(title, fn) {
  try {
    const issues = fn();
    if (issues && issues.length > 0) {
      findings.push({ title, status: 'FAIL', issues });
    } else {
      findings.push({ title, status: 'PASS', issues: [] });
    }
  } catch (err) {
    findings.push({ title, status: 'ERROR', issues: [err.message] });
  }
}

// 1. Stress test zero ID in views
check('Check 1: Zero ID in public/views/tools/ (including comments & scripts)', () => {
  const issues = [];
  const htmlFiles = getAllFiles(VIEWS_DIR, ['.html']);
  for (const file of htmlFiles) {
    const rel = path.relative(VIEWS_DIR, file);
    const content = fs.readFileSync(file, 'utf8');
    const tags = parseHtmlTags(content, rel);
    for (const tag of tags) {
      const idAttr = tag.attrs.find(a => a.name.toLowerCase() === 'id');
      if (idAttr) {
        issues.push(`${rel}:${tag.line} found id="${idAttr.value}" in <${tag.tagName}>`);
      }
    }
    const rawMatches = [...content.matchAll(/\bid\s*=\s*["'][^"']+["']/gi)];
    for (const m of rawMatches) {
      const line = content.slice(0, m.index).split('\n').length;
      issues.push(`RAW MATCH in ${rel}:${line}: ${m[0]}`);
    }
  }
  return issues;
});

// 2. Button attribute ordering: type first, then class, then data-ref
check('Check 2: Strict Button Attribute Order (type 1st, class 2nd, data-ref 3rd)', () => {
  const issues = [];
  const htmlFiles = getAllFiles(VIEWS_DIR, ['.html']);
  for (const file of htmlFiles) {
    const rel = path.relative(VIEWS_DIR, file);
    const content = fs.readFileSync(file, 'utf8');
    const tags = parseHtmlTags(content, rel);
    for (const tag of tags) {
      if (tag.tagName !== 'button') continue;
      if (tag.attrs.length === 0) {
        issues.push(`${rel}:${tag.line} <button> has no attributes`);
        continue;
      }
      if (tag.attrs[0].name.toLowerCase() !== 'type') {
        issues.push(`${rel}:${tag.line} <button> 1st attr is "${tag.attrs[0].name}" (expected "type")`);
      }
      const classIdx = tag.attrs.findIndex(a => a.name.toLowerCase() === 'class');
      const dataRefIdx = tag.attrs.findIndex(a => a.name.toLowerCase() === 'data-ref');
      if (classIdx !== -1 && classIdx !== 1) {
        issues.push(`${rel}:${tag.line} <button> class is at index ${classIdx} (expected 1, immediately after type) in: ${tag.rawTag}`);
      }
      if (dataRefIdx !== -1 && classIdx !== -1 && dataRefIdx !== 2) {
        issues.push(`${rel}:${tag.line} <button> data-ref is at index ${dataRefIdx} (expected 2, immediately after class) in: ${tag.rawTag}`);
      }
    }
  }
  return issues;
});

// 3. Other elements: class first, followed by data-ref
check('Check 3: Non-Button Attribute Order (class 1st, data-ref 2nd)', () => {
  const issues = [];
  const ignoredTags = new Set(['!doctype', 'meta', 'link', 'svg', 'use', 'path', 'circle', 'rect', 'polygon', 'br', 'hr']);
  const htmlFiles = getAllFiles(VIEWS_DIR, ['.html']);
  for (const file of htmlFiles) {
    const rel = path.relative(VIEWS_DIR, file);
    const content = fs.readFileSync(file, 'utf8');
    const tags = parseHtmlTags(content, rel);
    for (const tag of tags) {
      if (tag.tagName === 'button' || ignoredTags.has(tag.tagName)) continue;
      const classIdx = tag.attrs.findIndex(a => a.name.toLowerCase() === 'class');
      const dataRefIdx = tag.attrs.findIndex(a => a.name.toLowerCase() === 'data-ref');
      if (classIdx !== -1 && classIdx !== 0) {
        issues.push(`${rel}:${tag.line} <${tag.tagName}> has class at index ${classIdx} instead of 0 in: ${tag.rawTag}`);
      }
      if (classIdx === 0 && dataRefIdx !== -1 && dataRefIdx !== 1) {
        issues.push(`${rel}:${tag.line} <${tag.tagName}> has data-ref at index ${dataRefIdx} instead of 1 (should immediately follow class) in: ${tag.rawTag}`);
      }
    }
  }
  return issues;
});

// 4. Style attribute check in HTML
check('Check 4: HTML Inline Styles (No hex, rgb, rgba, and style must not precede data-ref)', () => {
  const issues = [];
  const htmlFiles = getAllFiles(VIEWS_DIR, ['.html']);
  for (const file of htmlFiles) {
    const rel = path.relative(VIEWS_DIR, file);
    const content = fs.readFileSync(file, 'utf8');
    const tags = parseHtmlTags(content, rel);
    for (const tag of tags) {
      const styleAttr = tag.attrs.find(a => a.name.toLowerCase() === 'style');
      if (!styleAttr) continue;
      const val = styleAttr.value;
      if (/#([0-9a-fA-F]{3,8})\b/.test(val)) {
        issues.push(`${rel}:${tag.line} inline style contains hex color in <${tag.tagName}>: ${val}`);
      }
      if (/rgba?\s*\(/.test(val)) {
        issues.push(`${rel}:${tag.line} inline style contains rgb/rgba in <${tag.tagName}>: ${val}`);
      }
      const styleIdx = tag.attrs.indexOf(styleAttr);
      const dataRefIdx = tag.attrs.findIndex(a => a.name.toLowerCase() === 'data-ref');
      if (dataRefIdx !== -1 && styleIdx < dataRefIdx) {
        issues.push(`${rel}:${tag.line} style precedes data-ref in <${tag.tagName}>: ${tag.rawTag}`);
      }
    }
  }
  return issues;
});

// 5. CSS hardcoded hex, rgb, rgba, hsl, un-tokenized values
check('Check 5: CSS Design Tokens across public/css/tools/*.css (Grep for hex, rgb, rgba, hsl)', () => {
  const issues = [];
  const cssFiles = getAllFiles(CSS_DIR, ['.css']);
  const hexRegex = /#[0-9a-fA-F]{3,8}\b/g;
  const rgbaRegex = /rgba?\s*\([^)]*\)/gi;
  const hslaRegex = /hsla?\s*\([^)]*\)/gi;

  for (const file of cssFiles) {
    const rel = path.relative(CSS_DIR, file);
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('/*') && trimmed.endsWith('*/')) continue;

      const hexMatches = line.match(hexRegex);
      if (hexMatches) {
        for (const h of hexMatches) {
          issues.push(`${rel}:${i + 1} HEX color "${h}" in: ${trimmed}`);
        }
      }

      const rgbaMatches = line.match(rgbaRegex);
      if (rgbaMatches) {
        for (const r of rgbaMatches) {
          issues.push(`${rel}:${i + 1} RGBA/RGB color "${r}" in: ${trimmed}`);
        }
      }

      const hslaMatches = line.match(hslaRegex);
      if (hslaMatches) {
        for (const h of hslaMatches) {
          issues.push(`${rel}:${i + 1} HSL/HSLA color "${h}" in: ${trimmed}`);
        }
      }
    }
  }
  return issues;
});

// 6. Native select elements
check('Check 6: Zero native <select> elements in public/views/tools/', () => {
  const issues = [];
  const htmlFiles = getAllFiles(VIEWS_DIR, ['.html']);
  for (const file of htmlFiles) {
    const rel = path.relative(VIEWS_DIR, file);
    const content = fs.readFileSync(file, 'utf8');
    const tags = parseHtmlTags(content, rel);
    for (const tag of tags) {
      if (tag.tagName === 'select') {
        issues.push(`${rel}:${tag.line} found native <select>`);
      }
    }
  }
  return issues;
});

// 7. Error banner placement below action buttons
check('Check 7: Error Banner placement strictly below sidebar action button', () => {
  const issues = [];
  for (const slug of TOOL_SLUGS) {
    const filePath = path.join(VIEWS_DIR, slug, `${slug}.html`);
    if (!fs.existsSync(filePath)) {
      issues.push(`Missing template: ${slug}.html`);
      continue;
    }
    const html = fs.readFileSync(filePath, 'utf8');
    const tags = parseHtmlTags(html, `${slug}.html`);
    
    const banner = tags.find(t => t.attrs.some(a => a.name === 'class' && a.value.includes('banner--danger')));
    const actionBtn = tags.find(t => 
      t.tagName === 'button' &&
      t.attrs.some(a => a.name === 'class' && 
        (a.value.includes('tool-sidebar__action-btn') || a.value.includes('security-action-btn') || a.value.includes('btn-translate-action'))
      )
    );

    if (!banner) {
      issues.push(`${slug}.html: Missing .banner--danger in template`);
    }
    if (!actionBtn) {
      issues.push(`${slug}.html: Missing sidebar action button in template`);
    }
    if (banner && actionBtn) {
      if (banner.startIndex < actionBtn.startIndex) {
        issues.push(`${slug}.html: .banner--danger (line ${banner.line}) is ABOVE action button (line ${actionBtn.line})`);
      }
    }
  }
  return issues;
});

// 8. Console statements in client/views/tools/ and src/tools/
check('Check 8: Zero console.* in client/views/tools/ and src/tools/', () => {
  const issues = [];
  const dirs = [CLIENT_VIEWS_DIR, SRC_TOOLS_DIR];
  const consoleRegex = /\bconsole\s*\.\s*(log|warn|error|info|debug)\b/g;

  for (const dir of dirs) {
    const files = getAllFiles(dir, ['.ts', '.js']);
    for (const file of files) {
      const rel = path.relative(ROOT_DIR, file);
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (consoleRegex.test(line)) {
          issues.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      }
    }
  }
  return issues;
});

// 9. Floating label compliance in protect-pdf and unlock-pdf
check('Check 9: Form compliance in security tools (protect-pdf, unlock-pdf)', () => {
  const issues = [];
  const secTools = ['protect-pdf', 'unlock-pdf'];
  for (const slug of secTools) {
    const filePath = path.join(VIEWS_DIR, slug, `${slug}.html`);
    const html = fs.readFileSync(filePath, 'utf8');
    if (html.includes('security-input-group')) {
      issues.push(`${slug}.html uses deprecated .security-input-group`);
    }
    if (html.includes('security-eye-btn')) {
      issues.push(`${slug}.html uses deprecated .security-eye-btn`);
    }
    if (!html.includes('field__action')) {
      issues.push(`${slug}.html missing canonical .field__action`);
    }
    if (!html.includes('field__label')) {
      issues.push(`${slug}.html missing canonical .field__label`);
    }
  }
  return issues;
});

// 10. Check duplicate HTML attributes
check('Check 10: Zero duplicate attributes on any HTML element in public/views/tools/', () => {
  const issues = [];
  const htmlFiles = getAllFiles(VIEWS_DIR, ['.html']);
  for (const file of htmlFiles) {
    const rel = path.relative(VIEWS_DIR, file);
    const content = fs.readFileSync(file, 'utf8');
    const tags = parseHtmlTags(content, rel);
    for (const tag of tags) {
      const seen = new Set();
      for (const a of tag.attrs) {
        const name = a.name.toLowerCase();
        if (seen.has(name)) {
          issues.push(`${rel}:${tag.line} duplicate attribute "${name}" in <${tag.tagName}>: ${tag.rawTag}`);
        }
        seen.add(name);
      }
    }
  }
  return issues;
});

// 11. Check all inline styles in public/views/tools/
check('Check 11: Inventory of inline styles across all 17 tools', () => {
  const issues = [];
  const htmlFiles = getAllFiles(VIEWS_DIR, ['.html']);
  let totalInlineStyles = 0;
  for (const file of htmlFiles) {
    const rel = path.relative(VIEWS_DIR, file);
    const content = fs.readFileSync(file, 'utf8');
    const tags = parseHtmlTags(content, rel);
    for (const tag of tags) {
      const styleAttr = tag.attrs.find(a => a.name.toLowerCase() === 'style');
      if (styleAttr) {
        totalInlineStyles++;
        // Check if inline style contains anything suspicious
        if (styleAttr.value.includes('#') || styleAttr.value.includes('rgb')) {
          issues.push(`${rel}:${tag.line} suspicious color in inline style: ${styleAttr.value}`);
        }
      }
    }
  }
  // This check is clean if no suspicious styles found
  return issues;
});

// Print findings summary
console.log('\n========================================');
console.log('ADVERSARIAL STRESS TEST RESULTS');
console.log('========================================\n');

let totalFailures = 0;
for (const res of findings) {
  console.log(`[${res.status}] ${res.title}`);
  if (res.issues.length > 0) {
    totalFailures += res.issues.length;
    for (const issue of res.issues) {
      console.log(`  -> ${issue}`);
    }
  }
}

console.log('\n========================================');
console.log(`Total Failures/Violations Detected: ${totalFailures}`);
console.log('========================================\n');

process.exit(totalFailures > 0 ? 1 : 0);
