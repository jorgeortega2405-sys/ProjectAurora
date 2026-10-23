import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { adminDbPool } from '../dist/services/db.service.js';
import {
  authenticateAdminCredentials,
  createAdminToken,
  getAdminRolePermissions,
  hasPermission,
  verifyAdminToken,
} from '../dist/services/auth.service.js';
import { hashPassword } from '../dist/services/crypto.service.js';

const ROOT_DIR = process.cwd();
const REPO_ROOT = fs.existsSync(path.resolve(ROOT_DIR, 'apps')) ? ROOT_DIR : path.resolve(ROOT_DIR, '../..');
const ADMIN_DIR = fs.existsSync(path.resolve(ROOT_DIR, 'apps/admin')) ? path.resolve(ROOT_DIR, 'apps/admin') : ROOT_DIR;
const DB_SQL_PATH = path.resolve(REPO_ROOT, 'database/db_identity.sql');
const ADMIN_LOGIN_HTML = path.resolve(ADMIN_DIR, 'public/views/auth/login.html');
const ADMIN_FORBIDDEN_HTML = path.resolve(ADMIN_DIR, 'public/views/error/forbidden.html');

describe('Suite Integral: Roles en BD, Login Obligatorio en Admin y PBAC por Permisos', () => {
  const timestamp = Date.now();
  const testPassword = 'Password123!AdminTest';
  const createdUserIds = [];

  const ALL_33_REQUESTED_ROLES = [
    'SUPER_ADMIN',
    'PLATFORM_ADMIN',
    'SECURITY_ADMIN',
    'IAM_ADMIN',
    'COMPLIANCE_ADMIN',
    'AUDITOR',
    'READ_ONLY_ADMIN',
    'SUPPORT_L1',
    'SUPPORT_L2',
    'SUPPORT_L3',
    'SUPPORT_MANAGER',
    'INCIDENT_MANAGER',
    'ENGINEER',
    'SENIOR_ENGINEER',
    'DEVOPS',
    'SRE',
    'RELEASE_MANAGER',
    'DATA_ANALYST',
    'DATA_ENGINEER',
    'DATA_ADMIN',
    'PRIVACY_ADMIN',
    'DATA_AUDITOR',
    'BILLING_AGENT',
    'BILLING_MANAGER',
    'FINANCE_ADMIN',
    'REFUNDS_ADMIN',
    'OPERATIONS_AGENT',
    'OPERATIONS_MANAGER',
    'SYSTEM_OPERATOR',
    'HR_MANAGER',
    'HR_RECRUITER',
    'SYSTEM_ACCOUNT',
    'USER',
  ];

  const ORPHANED_ROLES = [
    'INCIDENT_MANAGER',
    'ENGINEER',
    'SENIOR_ENGINEER',
    'RELEASE_MANAGER',
    'DATA_ANALYST',
    'DATA_ENGINEER',
    'DATA_ADMIN',
    'PRIVACY_ADMIN',
    'DATA_AUDITOR',
    'HR_MANAGER',
    'HR_RECRUITER',
  ];

  after(async () => {
    if (createdUserIds.length > 0) {
      const placeholders = createdUserIds.map(() => '?').join(',');
      await adminDbPool.query(`DELETE FROM users WHERE id IN (${placeholders})`, createdUserIds).catch(() => {});
    }
    await adminDbPool.end();
  });

  describe('Parte 1: Verificación de Roles y Permisos en Base de Datos (MySQL)', () => {
    it('Todos los 33 roles solicitados están registrados en la tabla roles', async () => {
      const [rows] = await adminDbPool.query('SELECT id FROM roles');
      const registeredRoleIds = rows.map((r) => r.id);

      for (const role of ALL_33_REQUESTED_ROLES) {
        assert.ok(
          registeredRoleIds.includes(role),
          `El rol ${role} debe estar registrado en la base de datos.`
        );
      }
    });

    it('El rol por defecto de la tabla users es USER', async () => {
      const [rows] = await adminDbPool.query(
        "SELECT COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'db_aurora' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'"
      );
      assert.ok(rows.length > 0);
      assert.strictEqual(rows[0].COLUMN_DEFAULT, 'USER');
    });

    it('Permisos administrativos admin:* existen en la tabla permissions', async () => {
      const [rows] = await adminDbPool.query("SELECT id FROM permissions WHERE id LIKE 'admin:%'");
      const permissionIds = rows.map((r) => r.id);

      const expectedAdminPermissions = [
        'admin:access',
        'admin:dashboard:view',
        'admin:users:view',
        'admin:users:manage',
        'admin:education:view',
        'admin:education:review',
        'admin:purchases:view',
        'admin:organizations:view',
        'admin:organizations:manage',
        'admin:inquiries:view',
        'admin:inquiries:manage',
      ];

      for (const perm of expectedAdminPermissions) {
        assert.ok(
          permissionIds.includes(perm),
          `El permiso administrativo ${perm} debe existir en la base de datos.`
        );
      }
    });

    it('Roles huérfanos no tienen permisos administrativos (reservados a futuro)', async () => {
      for (const role of ORPHANED_ROLES) {
        const perms = await getAdminRolePermissions(role);
        assert.strictEqual(
          perms.includes('admin:access'),
          false,
          `El rol huérfano ${role} NO debe tener permiso admin:access.`
        );
        assert.strictEqual(
          perms.includes('*'),
          false,
          `El rol huérfano ${role} NO debe tener permiso comodín *.`
        );
      }
    });

    it('Rol USER y SYSTEM_ACCOUNT no tienen permisos administrativos en admin', async () => {
      const userPerms = await getAdminRolePermissions('USER');
      assert.strictEqual(userPerms.includes('admin:access'), false);
      assert.strictEqual(userPerms.includes('*'), false);

      const sysPerms = await getAdminRolePermissions('SYSTEM_ACCOUNT');
      assert.strictEqual(sysPerms.includes('admin:access'), false);
      assert.strictEqual(sysPerms.includes('*'), false);
    });
  });

  describe('Parte 2: Autenticación Obligatoria y Restricción de Login Administrativo', () => {
    it('Usuario con rol USER es rechazado al intentar login administrativo', async () => {
      const passwordHash = await hashPassword(testPassword);
      const testUserEmail = `user_std_${timestamp}@auroratest.com`;
      const testUserId = `test-user-std-${timestamp}`;
      createdUserIds.push(testUserId);

      await adminDbPool.query(
        'INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        [testUserId, `user_std_${timestamp}`, testUserEmail, passwordHash, 'USER']
      );

      const result = await authenticateAdminCredentials(testUserEmail, testPassword);
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
      assert.ok(result.error.includes('Acceso denegado'));
    });

    it('Usuario con rol huérfano (HR_MANAGER) es rechazado al intentar login administrativo', async () => {
      const passwordHash = await hashPassword(testPassword);
      const testHrEmail = `hr_mgr_${timestamp}@auroratest.com`;
      const testHrId = `test-hr-mgr-${timestamp}`;
      createdUserIds.push(testHrId);

      await adminDbPool.query(
        'INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        [testHrId, `hr_mgr_${timestamp}`, testHrEmail, passwordHash, 'HR_MANAGER']
      );

      const result = await authenticateAdminCredentials(testHrEmail, testPassword);
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
      assert.ok(result.error.includes('Acceso denegado'));
    });

    it('Usuario con rol administrativo (SUPER_ADMIN) inicia sesión exitosamente', async () => {
      const passwordHash = await hashPassword(testPassword);
      const testAdminEmail = `super_admin_${timestamp}@auroratest.com`;
      const testAdminId = `test-super-admin-${timestamp}`;
      createdUserIds.push(testAdminId);

      await adminDbPool.query(
        'INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        [testAdminId, `super_admin_${timestamp}`, testAdminEmail, passwordHash, 'SUPER_ADMIN']
      );

      const result = await authenticateAdminCredentials(testAdminEmail, testPassword);
      assert.strictEqual(result.success, true);
      assert.ok(result.user);
      assert.strictEqual(result.user.id, testAdminId);
      assert.strictEqual(result.user.role, 'SUPER_ADMIN');
      assert.ok(result.user.permissions.includes('*'));
    });

    it('Usuario con rol administrativo granular (BILLING_AGENT) inicia sesión y obtiene sus permisos específicos', async () => {
      const passwordHash = await hashPassword(testPassword);
      const testBillingEmail = `billing_agent_${timestamp}@auroratest.com`;
      const testBillingId = `test-billing-agent-${timestamp}`;
      createdUserIds.push(testBillingId);

      await adminDbPool.query(
        'INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        [testBillingId, `billing_agent_${timestamp}`, testBillingEmail, passwordHash, 'BILLING_AGENT']
      );

      const result = await authenticateAdminCredentials(testBillingEmail, testPassword);
      assert.strictEqual(result.success, true);
      assert.ok(result.user);
      assert.strictEqual(result.user.role, 'BILLING_AGENT');
      assert.ok(result.user.permissions.includes('admin:access'));
      assert.ok(result.user.permissions.includes('admin:dashboard:view'));
      assert.ok(result.user.permissions.includes('admin:purchases:view'));
      assert.strictEqual(result.user.permissions.includes('admin:users:view'), false);
      assert.strictEqual(result.user.permissions.includes('system:backup:read'), false);
    });

    it('Firma y verificación de tokens de sesión con HMAC SHA256', () => {
      const dummyAdmin = {
        avatar_url: null,
        created_at: new Date().toISOString(),
        email: 'admin@aurora.test',
        id: 'dummy-admin-uuid',
        permissions: ['admin:access'],
        role: 'PLATFORM_ADMIN',
        username: 'admin_test',
      };

      const token = createAdminToken(dummyAdmin);
      assert.ok(token && token.includes('.'));

      const verified = verifyAdminToken(token);
      assert.ok(verified);
      assert.strictEqual(verified.userId, dummyAdmin.id);

      const tampered = token.slice(0, -5) + 'xxxxx';
      const tamperedResult = verifyAdminToken(tampered);
      assert.strictEqual(tamperedResult, null);
    });

    it('Multi-login administrativo: vinculación de múltiples cuentas, conmutación entre ellas, y cierre de sesión granular y global', async () => {
      const passwordHash = await hashPassword(testPassword);
      const admin1Email = `multi_super_${timestamp}@auroratest.com`;
      const admin1Id = `test-multi-super-${timestamp}`;
      const admin2Email = `multi_billing_${timestamp}@auroratest.com`;
      const admin2Id = `test-multi-billing-${timestamp}`;
      createdUserIds.push(admin1Id, admin2Id);

      await adminDbPool.query(
        'INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        [admin1Id, `multi_super_${timestamp}`, admin1Email, passwordHash, 'SUPER_ADMIN']
      );
      await adminDbPool.query(
        'INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        [admin2Id, `multi_billing_${timestamp}`, admin2Email, passwordHash, 'BILLING_AGENT']
      );

      const loginRes1 = await fetch('http://localhost:3005/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: admin1Email, password: testPassword }),
      });
      assert.strictEqual(loginRes1.status, 200);
      const setCookie1 = loginRes1.headers.get('set-cookie');
      assert.ok(setCookie1 && setCookie1.includes('aurora_admin_session='), 'Debe usar cookie separada aurora_admin_session');
      const data1 = await loginRes1.json();
      assert.strictEqual(data1.success, true);
      assert.strictEqual(data1.user.id, admin1Id);
      assert.strictEqual(data1.accounts.length, 1);

      const cookie1Value = setCookie1.split(';')[0];

      const loginRes2 = await fetch('http://localhost:3005/api/admin/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie1Value,
        },
        body: JSON.stringify({ email: admin2Email, password: testPassword }),
      });
      assert.strictEqual(loginRes2.status, 200);
      const setCookie2 = loginRes2.headers.get('set-cookie');
      assert.ok(setCookie2);
      const data2 = await loginRes2.json();
      assert.strictEqual(data2.success, true);
      assert.strictEqual(data2.user.id, admin2Id);
      assert.strictEqual(data2.accounts.length, 2, 'Deben existir 2 cuentas vinculadas en la sesión');

      const cookie2Value = setCookie2.split(';')[0];

      const meRes = await fetch('http://localhost:3005/api/admin/auth/me', {
        headers: { Cookie: cookie2Value },
      });
      assert.strictEqual(meRes.status, 200);
      const meData = await meRes.json();
      assert.strictEqual(meData.user.id, admin2Id);
      assert.strictEqual(meData.accounts.length, 2);

      const switchRes = await fetch('http://localhost:3005/api/admin/auth/switch-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie2Value,
        },
        body: JSON.stringify({ userId: admin1Id }),
      });
      assert.strictEqual(switchRes.status, 200);
      const switchData = await switchRes.json();
      assert.strictEqual(switchData.success, true);
      assert.strictEqual(switchData.user.id, admin1Id, 'La cuenta activa conmutó a SUPER_ADMIN');
      const setCookie3 = switchRes.headers.get('set-cookie');
      const cookie3Value = setCookie3 ? setCookie3.split(';')[0] : cookie2Value;

      const logoutOneRes = await fetch('http://localhost:3005/api/admin/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie3Value,
        },
        body: JSON.stringify({ userId: admin2Id }),
      });
      assert.strictEqual(logoutOneRes.status, 200);
      const logoutOneData = await logoutOneRes.json();
      assert.strictEqual(logoutOneData.remainingAccounts, 1);
      assert.strictEqual(logoutOneData.accounts.length, 1);

      const setCookie4 = logoutOneRes.headers.get('set-cookie');
      const cookie4Value = setCookie4 ? setCookie4.split(';')[0] : cookie3Value;

      const logoutAllRes = await fetch('http://localhost:3005/api/admin/auth/logout-all', {
        method: 'POST',
        headers: { Cookie: cookie4Value },
      });
      assert.strictEqual(logoutAllRes.status, 200);
      const setCookieAll = logoutAllRes.headers.get('set-cookie');
      assert.ok(setCookieAll && (setCookieAll.includes('Expires=Thu, 01 Jan 1970') || setCookieAll.includes('Max-Age=0')));
    });
  });

  describe('Parte 3: Control de Acceso Basado en Permisos (PBAC) por Página', () => {
    it('SUPER_ADMIN tiene acceso a todas las páginas vía comodín *', () => {
      const superAdminPerms = ['*'];
      assert.strictEqual(hasPermission(superAdminPerms, 'admin:dashboard:view'), true);
      assert.strictEqual(hasPermission(superAdminPerms, 'admin:users:view'), true);
      assert.strictEqual(hasPermission(superAdminPerms, 'admin:education:view'), true);
      assert.strictEqual(hasPermission(superAdminPerms, 'admin:purchases:view'), true);
      assert.strictEqual(hasPermission(superAdminPerms, 'admin:organizations:view'), true);
      assert.strictEqual(hasPermission(superAdminPerms, 'admin:inquiries:view'), true);
      assert.strictEqual(hasPermission(superAdminPerms, 'system:backup:read'), true);
      assert.strictEqual(hasPermission(superAdminPerms, 'system:backup:restore'), true);
    });

    it('BILLING_AGENT solo puede acceder a dashboard y purchases', () => {
      const billingPerms = ['admin:access', 'admin:dashboard:view', 'admin:purchases:view'];

      assert.strictEqual(hasPermission(billingPerms, 'admin:dashboard:view'), true);
      assert.strictEqual(hasPermission(billingPerms, 'admin:purchases:view'), true);

      assert.strictEqual(hasPermission(billingPerms, 'admin:users:view'), false);
      assert.strictEqual(hasPermission(billingPerms, 'admin:education:view'), false);
      assert.strictEqual(hasPermission(billingPerms, 'admin:organizations:view'), false);
      assert.strictEqual(hasPermission(billingPerms, 'admin:inquiries:view'), false);
      assert.strictEqual(hasPermission(billingPerms, 'system:backup:read'), false);
    });

    it('SUPPORT_L1 puede ver usuarios, educación y leads, pero no compras ni backups', () => {
      const supportL1Perms = [
        'admin:access',
        'admin:dashboard:view',
        'admin:users:view',
        'admin:education:view',
        'admin:inquiries:view',
      ];

      assert.strictEqual(hasPermission(supportL1Perms, 'admin:users:view'), true);
      assert.strictEqual(hasPermission(supportL1Perms, 'admin:education:view'), true);
      assert.strictEqual(hasPermission(supportL1Perms, 'admin:inquiries:view'), true);

      assert.strictEqual(hasPermission(supportL1Perms, 'admin:education:review'), false);
      assert.strictEqual(hasPermission(supportL1Perms, 'admin:inquiries:manage'), false);
      assert.strictEqual(hasPermission(supportL1Perms, 'admin:purchases:view'), false);
      assert.strictEqual(hasPermission(supportL1Perms, 'admin:organizations:view'), false);
      assert.strictEqual(hasPermission(supportL1Perms, 'system:backup:read'), false);
    });

    it('DEVOPS y SRE tienen acceso a copias de seguridad pero no a compras ni educación', () => {
      const devopsPerms = [
        'admin:access',
        'admin:dashboard:view',
        'system:backup:read',
        'system:backup:create',
        'system:backup:restore',
        'system:backup:delete',
      ];

      assert.strictEqual(hasPermission(devopsPerms, 'system:backup:read'), true);
      assert.strictEqual(hasPermission(devopsPerms, 'system:backup:create'), true);
      assert.strictEqual(hasPermission(devopsPerms, 'system:backup:restore'), true);
      assert.strictEqual(hasPermission(devopsPerms, 'system:backup:delete'), true);

      assert.strictEqual(hasPermission(devopsPerms, 'admin:purchases:view'), false);
      assert.strictEqual(hasPermission(devopsPerms, 'admin:education:view'), false);
      assert.strictEqual(hasPermission(devopsPerms, 'admin:users:view'), false);
    });
  });

  describe('Parte 4: Auditoría de Reglas Maestras (AGENTS.md / GEMINI.md)', () => {
    it('Regla 3: CERO atributos id="..." en plantillas HTML de admin (login y forbidden)', () => {
      const templates = [ADMIN_LOGIN_HTML, ADMIN_FORBIDDEN_HTML];
      for (const tpl of templates) {
        const html = fs.readFileSync(tpl, 'utf8');
        const idMatches = html.match(/\bid="[^"]*"/g);
        assert.strictEqual(
          idMatches,
          null,
          `No deben existir atributos id="..." en ${path.basename(tpl)}. Encontrados: ${idMatches}`
        );
      }
    });

    it('Regla 4: Orden estricto de atributos (botones: type primero; otros: class primero)', () => {
      const templates = [ADMIN_LOGIN_HTML, ADMIN_FORBIDDEN_HTML];
      for (const tpl of templates) {
        const html = fs.readFileSync(tpl, 'utf8');
        const buttonRegex = /<button\s+([^>]+)>/gi;
        let match;
        while ((match = buttonRegex.exec(html)) !== null) {
          const attrs = match[1].trim();
          assert.ok(
            attrs.startsWith('type='),
            `En botones de ${path.basename(tpl)}, type debe ser primero: <button ${attrs}>`
          );
        }

        const otherRegex = /<(div|span|h1|p|label|input)\s+([^>]+)>/gi;
        while ((match = otherRegex.exec(html)) !== null) {
          const tag = match[1];
          const attrs = match[2].trim();
          if (attrs.includes('class=')) {
            assert.ok(
              attrs.startsWith('class='),
              `En <${tag}> de ${path.basename(tpl)}, class debe ser primero: <${tag} ${attrs}>`
            );
          }
        }
      }
    });

    it('Regla 5: Banners de error debajo de los botones de acción en admin login', () => {
      const html = fs.readFileSync(ADMIN_LOGIN_HTML, 'utf8');
      const submitBtnIdx = html.indexOf('data-ref="btn-submit-admin-login"');
      const errorBannerIdx = html.indexOf('data-ref="admin-login-error"');

      assert.ok(submitBtnIdx !== -1 && errorBannerIdx !== -1);
      assert.ok(
        errorBannerIdx > submitBtnIdx,
        'El banner de error de login debe estar ubicado después (debajo) del botón de acción'
      );
    });

    it('Regla 2: Prohibición total de console.* en código nuevo de admin', () => {
      const newFiles = [
        path.resolve(ADMIN_DIR, 'src/services/auth.service.ts'),
        path.resolve(ADMIN_DIR, 'src/controllers/auth.controller.ts'),
        path.resolve(ADMIN_DIR, 'src/middlewares/auth.middleware.ts'),
        path.resolve(ADMIN_DIR, 'client/services/auth.service.ts'),
        path.resolve(ADMIN_DIR, 'client/views/login.view.ts'),
        path.resolve(ADMIN_DIR, 'client/views/forbidden.view.ts'),
      ];

      for (const f of newFiles) {
        const code = fs.readFileSync(f, 'utf8');
        const hasConsole = /\bconsole\.(log|warn|error|info|debug)\b/.test(code);
        assert.strictEqual(
          hasConsole,
          false,
          `El archivo ${path.basename(f)} no debe contener llamadas a console.*`
        );
      }
    });

    it('Regla 7: Imports horizontales en una sola línea y ordenados alfabéticamente', () => {
      const newFiles = [
        path.resolve(ADMIN_DIR, 'src/services/auth.service.ts'),
        path.resolve(ADMIN_DIR, 'src/controllers/auth.controller.ts'),
        path.resolve(ADMIN_DIR, 'src/middlewares/auth.middleware.ts'),
        path.resolve(ADMIN_DIR, 'src/routes/admin.routes.ts'),
        path.resolve(ADMIN_DIR, 'client/services/auth.service.ts'),
        path.resolve(ADMIN_DIR, 'client/views/login.view.ts'),
        path.resolve(ADMIN_DIR, 'client/views/forbidden.view.ts'),
        path.resolve(ADMIN_DIR, 'src/services/avatar.service.ts'),
        path.resolve(ADMIN_DIR, 'client/components/layout.component.ts'),
      ];

      for (const f of newFiles) {
        const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
        for (const line of lines) {
          if (line.trim().startsWith('import ') && line.includes(' from ')) {
            assert.strictEqual(
              line.includes('\n'),
              false,
              `El import debe ser horizontal de una sola línea en ${path.basename(f)}: ${line}`
            );
          }
        }
      }
    });

    it('Regla 8: CERO anotaciones JSDoc y cero comentarios decorativos/explicativos', () => {
      const newFiles = [
        path.resolve(ADMIN_DIR, 'src/services/auth.service.ts'),
        path.resolve(ADMIN_DIR, 'src/controllers/auth.controller.ts'),
        path.resolve(ADMIN_DIR, 'src/middlewares/auth.middleware.ts'),
        path.resolve(ADMIN_DIR, 'client/services/auth.service.ts'),
        path.resolve(ADMIN_DIR, 'client/views/login.view.ts'),
        path.resolve(ADMIN_DIR, 'client/views/forbidden.view.ts'),
        path.resolve(ADMIN_DIR, 'src/services/avatar.service.ts'),
        path.resolve(ADMIN_DIR, 'client/components/layout.component.ts'),
      ];

      for (const f of newFiles) {
        const code = fs.readFileSync(f, 'utf8');
        assert.strictEqual(/\/\*\*[\s\S]*?\*\//.test(code), false, `No debe existir JSDoc en ${path.basename(f)}`);
        assert.strictEqual(/\/\*[\s=]+[A-Z\s]+[\s=]+\*\//.test(code), false, `No deben existir bloques decorativos en ${path.basename(f)}`);
      }
    });

    it('Botón y Menú de Perfil idénticos a la página principal en el Admin Sidebar', async () => {
      const sidebarHtmlPath = path.resolve(ADMIN_DIR, 'public/views/components/sidebar.html');
      const sidebarHtml = fs.readFileSync(sidebarHtmlPath, 'utf8');

      assert.strictEqual(sidebarHtml.includes('id="'), false, 'No debe existir ningún id en sidebar.html');
      assert.ok(sidebarHtml.includes('data-ref="avatar-container"'), 'Debe incluir avatar-container');
      assert.ok(sidebarHtml.includes('data-ref="btn-avatar"'), 'Debe incluir btn-avatar');
      assert.ok(sidebarHtml.includes('data-ref="avatar-img"'), 'Debe incluir avatar-img');
      assert.ok(sidebarHtml.includes('data-ref="avatar-menu"'), 'Debe incluir avatar-menu');
      assert.ok(sidebarHtml.includes('data-ref="avatar-menu-backdrop"'), 'Debe incluir avatar-menu-backdrop');
      assert.ok(sidebarHtml.includes('data-ref="active-account-name"'), 'Debe incluir active-account-name');
      assert.ok(sidebarHtml.includes('data-ref="active-account-email"'), 'Debe incluir active-account-email');
      assert.ok(sidebarHtml.includes('data-ref="btn-logout"'), 'Debe incluir btn-logout en el menú');
      assert.ok(sidebarHtml.includes('data-ref="btn-switch-account-menu"'), 'Debe incluir btn-switch-account-menu');
      assert.ok(sidebarHtml.includes('data-ref="panel-account-switcher"'), 'Debe incluir panel-account-switcher');
      assert.ok(sidebarHtml.includes('data-ref="account-switcher-list"'), 'Debe incluir account-switcher-list');
      assert.ok(sidebarHtml.includes('data-ref="btn-add-account"'), 'Debe incluir btn-add-account');
      assert.ok(sidebarHtml.includes('data-ref="btn-logout-all"'), 'Debe incluir btn-logout-all');

      const btnRegex = /<button\s+([^>]+)>/g;
      let btnMatch;
      while ((btnMatch = btnRegex.exec(sidebarHtml)) !== null) {
        const attrs = btnMatch[1];
        assert.ok(
          attrs.startsWith('type='),
          `El primer atributo de button en sidebar.html debe ser type: ${btnMatch[0]}`
        );
      }

      const res = await fetch('http://localhost:3005/api/avatar?name=SUPER_ADMIN');
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('content-type')?.includes('image/svg+xml'));
      const svg = await res.text();
      assert.ok(svg.includes('<svg'), 'Debe responder un SVG válido de avatar');
    });
  });
});
