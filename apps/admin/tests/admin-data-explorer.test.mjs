import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { adminDbPool } from '../dist/services/db.service.js';
import { DataExplorerService } from '../dist/services/data-explorer.service.js';
import { SecurityAuditService } from '../dist/services/security-audit.service.js';

const ROOT_DIR = process.cwd();
const ADMIN_DIR = fs.existsSync(path.resolve(ROOT_DIR, 'apps/admin'))
  ? path.resolve(ROOT_DIR, 'apps/admin')
  : ROOT_DIR;

const FILES_TO_AUDIT = [
  path.resolve(ADMIN_DIR, 'src/services/data-explorer.service.ts'),
  path.resolve(ADMIN_DIR, 'src/controllers/data-explorer.controller.ts'),
  path.resolve(ADMIN_DIR, 'src/types/data-explorer.types.ts'),
  path.resolve(ADMIN_DIR, 'client/views/data-explorer.view.ts'),
];

describe('Suite: Explorador de Datos y Métricas (Data Explorer Studio & Guardrails)', () => {
  it('Requirement AGENTS.md: Zero console.log/warn/error across data explorer files', () => {
    for (const f of FILES_TO_AUDIT) {
      if (!fs.existsSync(f)) continue;
      const content = fs.readFileSync(f, 'utf8');
      assert.ok(!content.includes('console.log'), `No console.log allowed in ${f}`);
      assert.ok(!content.includes('console.warn'), `No console.warn allowed in ${f}`);
      assert.ok(!content.includes('console.error'), `No console.error allowed in ${f}`);
    }
  });

  it('Requirement AGENTS.md: Single-line horizontal imports across data explorer files', () => {
    for (const f of FILES_TO_AUDIT) {
      if (!fs.existsSync(f)) continue;
      const content = fs.readFileSync(f, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('import ') && !line.includes(' from ') && !line.endsWith(';')) {
          assert.fail(`Multi-line import detected in ${f} at line ${i + 1}`);
        }
      }
    }
  });

  it('Requirement AGENTS.md: Zero id="..." attributes in data-explorer.html and buttons start with type', () => {
    const explorerHtml = path.resolve(ADMIN_DIR, 'public/views/data-explorer/data-explorer.html');
    assert.ok(fs.existsSync(explorerHtml), 'data-explorer.html must exist');
    const html = fs.readFileSync(explorerHtml, 'utf8');

    assert.ok(!html.includes('id="'), 'No id="..." attributes permitted in data-explorer.html');

    const buttonMatches = html.match(/<button[^>]*>/g) || [];
    assert.ok(buttonMatches.length > 0, 'Must contain buttons');
    for (const btn of buttonMatches) {
      assert.ok(btn.startsWith('<button type="'), `Button must start with type="...": ${btn}`);
    }
  });

  it('Discovery: Schema discovery returns both MySQL and Cassandra metadata', async () => {
    const schemas = await DataExplorerService.getSchemaDiscovery();

    assert.ok(schemas.mysql, 'MySQL schema must exist');
    assert.strictEqual(schemas.mysql.type, 'mysql');
    assert.ok(schemas.mysql.tables.length > 5, 'MySQL must discover multiple tables');

    const usersTable = schemas.mysql.tables.find((t) => t.name === 'users');
    assert.ok(usersTable, 'users table must be present in MySQL discovery');
    assert.ok(usersTable.columns.length > 0, 'users table must have columns');

    const passCol = usersTable.columns.find((c) => c.name === 'password_hash');
    assert.ok(passCol, 'password_hash column must exist');
    assert.strictEqual(passCol.isSensitive, true, 'password_hash must be flagged as sensitive');

    assert.ok(schemas.cassandra, 'Cassandra schema must exist');
    assert.strictEqual(schemas.cassandra.type, 'cassandra');
    assert.ok(schemas.cassandra.tables.length > 5, 'Cassandra must discover multiple tables');

    const auditTable = schemas.cassandra.tables.find((t) => t.name === 'admin_audit_logs');
    assert.ok(auditTable, 'admin_audit_logs table must exist in Cassandra discovery');
    assert.ok(auditTable.columns.length > 0, 'admin_audit_logs must have columns');
  });

  it('Guardrails: Rejects any mutation or DDL query (DROP, DELETE, UPDATE, INSERT, ALTER)', async () => {
    const actor = {
      email: 'analyst@aurorafiles.test',
      id: 'test-analyst-1',
      role: 'DATA_ANALYST',
      username: 'analyst_pro',
    };
    const ip = '127.0.0.1';

    const dangerousQueries = [
      'DROP TABLE users',
      'DELETE FROM users WHERE id = "1"',
      'UPDATE users SET role = "SUPER_ADMIN"',
      'INSERT INTO users (username) VALUES ("hacker")',
      'ALTER TABLE users ADD COLUMN compromised INT',
      'TRUNCATE TABLE users',
      'SELECT * FROM users; DROP TABLE users',
    ];

    for (const q of dangerousQueries) {
      await assert.rejects(
        async () => {
          await DataExplorerService.executeReadOnlyQuery('mysql', q, actor, ip);
        },
        (err) => {
          assert.ok(err instanceof Error);
          return true;
        },
        `Query "${q}" should have been rejected by guardrails`
      );
    }
  });

  it('Guardrails: Auto-injects LIMIT 200 when absent and clamps LIMIT > 1000', async () => {
    const actor = {
      email: 'analyst@aurorafiles.test',
      id: 'test-analyst-1',
      role: 'DATA_ANALYST',
      username: 'analyst_pro',
    };
    const ip = '127.0.0.1';

    const resNoLimit = await DataExplorerService.executeReadOnlyQuery(
      'mysql',
      'SELECT id, username FROM users',
      actor,
      ip
    );
    assert.strictEqual(resNoLimit.success, true);
    assert.ok(resNoLimit.query.includes('LIMIT 200'), 'Query must contain auto-injected LIMIT 200');

    const resHighLimit = await DataExplorerService.executeReadOnlyQuery(
      'mysql',
      'SELECT id, username FROM users LIMIT 5000',
      actor,
      ip
    );
    assert.strictEqual(resHighLimit.success, true);
    assert.ok(resHighLimit.query.includes('LIMIT 1000'), 'Query limit must be clamped to 1000');
  });

  it('Security: Automatically masks sensitive columns (password_hash, etc.)', async () => {
    const actor = {
      email: 'analyst@aurorafiles.test',
      id: 'test-analyst-1',
      role: 'DATA_ANALYST',
      username: 'analyst_pro',
    };
    const ip = '127.0.0.1';

    const res = await DataExplorerService.executeReadOnlyQuery(
      'mysql',
      'SELECT id, username, email, password_hash FROM users LIMIT 1',
      actor,
      ip
    );

    assert.strictEqual(res.success, true);
    assert.ok(res.columns.includes('password_hash'));
    if (res.rows.length > 0) {
      assert.strictEqual(
        res.rows[0].password_hash,
        '••••••••[ENMASCARADO]••••••••',
        'password_hash must be masked'
      );
    }
  });

  it('Execution: Can execute read queries on Apache Cassandra', async () => {
    const actor = {
      email: 'analyst@aurorafiles.test',
      id: 'test-analyst-1',
      role: 'DATA_ANALYST',
      username: 'analyst_pro',
    };
    const ip = '127.0.0.1';

    const res = await DataExplorerService.executeReadOnlyQuery(
      'cassandra',
      'SELECT event_date, created_at, action, actor_username FROM admin_audit_logs LIMIT 5',
      actor,
      ip
    );

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.database, 'cassandra');
    assert.ok(Array.isArray(res.columns));
    assert.ok(Array.isArray(res.rows));
    assert.ok(res.executionTimeMs >= 0);
  });

  it('Templates: Query templates are available for both MySQL and Cassandra', () => {
    const templates = DataExplorerService.getQueryTemplates();
    assert.ok(Array.isArray(templates));
    assert.ok(templates.length >= 8);

    const mysqlTemplates = templates.filter((t) => t.database === 'mysql');
    const cassandraTemplates = templates.filter((t) => t.database === 'cassandra');

    assert.ok(mysqlTemplates.length >= 4, 'Must have at least 4 MySQL templates');
    assert.ok(cassandraTemplates.length >= 4, 'Must have at least 4 Cassandra templates');

    for (const t of templates) {
      assert.ok(t.id, 'Template must have an id');
      assert.ok(t.title, 'Template must have a title');
      assert.ok(t.query, 'Template must have a query');
      assert.ok(t.category, 'Template must have a category');
    }
  });

  after(async () => {
    try {
      await adminDbPool.end();
    } catch {
      // ignore
    }
    setTimeout(() => process.exit(0), 100);
  });
});
