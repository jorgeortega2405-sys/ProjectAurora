import assert from 'node:assert';
import { describe, it } from 'node:test';
import { pool } from '../dist/config/database.config.js';
import { createOrganization, getOrganizationById, getUserOrganization } from '../dist/services/organization.service.js';
import { getUserEffectivePermissions, hasPermission } from '../dist/services/pbac.service.js';
import { buildSsoAuthorizeUrl, configureSso, getSsoConfig, getSsoConfigByDomain, lookupSsoByEmail, processSsoLoginSuccess } from '../dist/services/sso.service.js';
import { createUser, findUserByEmail, findUserById } from '../dist/services/user.service.js';

describe('Extensive SSO Test Suite: Enterprise, Campus, Security & Providers', () => {
  const ts = Date.now();
  let ownerUser = null;
  let businessOrg = null;
  let campusOrg = null;
  const businessDomain = `techcorp-${ts}.com`;
  const campusDomain = `campus-${ts}.edu.mx`;

  it('Setup: Crear propietario y organizaciones para pruebas de SSO', async () => {
    ownerUser = await createUser({
      avatarUrl: null,
      email: `sso_owner_${ts}@auroratest.com`,
      googleId: null,
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz123456',
      username: `sso_owner_${ts}`,
    });
    assert.ok(ownerUser.id);

    businessOrg = await createOrganization({
      domain: businessDomain,
      name: `TechCorp Enterprise ${ts}`,
      orgType: 'business',
      ownerId: ownerUser.id,
      seatLimit: 10,
      slug: `techcorp-${ts}`,
    });
    assert.ok(businessOrg.id);
    assert.strictEqual(businessOrg.org_type, 'business');

    campusOrg = await createOrganization({
      domain: campusDomain,
      name: `Universidad Metropolitana ${ts}`,
      orgType: 'education',
      ownerId: ownerUser.id,
      seatLimit: 500,
      slug: `unimet-${ts}`,
    });
    assert.ok(campusOrg.id);
    assert.strictEqual(campusOrg.org_type, 'education');
  });

  it('Caso 1: Configuracion y recuperacion de SSO con proveedor Google', async () => {
    const config = await configureSso({
      clientId: `google-client-${ts}.apps.googleusercontent.com`,
      clientSecret: `google-secret-${ts}`,
      enforceSso: false,
      isEnabled: true,
      organizationId: businessOrg.id,
      provider: 'google',
    });

    assert.ok(config.id);
    assert.strictEqual(config.provider, 'google');
    assert.strictEqual(config.is_enabled, true);
    assert.strictEqual(config.enforce_sso, false);
    assert.strictEqual(config.client_id, `google-client-${ts}.apps.googleusercontent.com`);
    assert.strictEqual(config.client_secret, `google-secret-${ts}`);

    const retrieved = await getSsoConfig(businessOrg.id);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.id, config.id);
    assert.strictEqual(retrieved.provider, 'google');
  });

  it('Caso 2: Actualizacion idempotente de configuracion SSO a Microsoft Azure AD', async () => {
    const updated = await configureSso({
      clientId: `azure-app-id-${ts}`,
      clientSecret: `azure-client-secret-${ts}`,
      enforceSso: true,
      isEnabled: true,
      organizationId: businessOrg.id,
      provider: 'azure',
      tenantId: `tenant-${ts}`,
    });

    assert.strictEqual(updated.provider, 'azure');
    assert.strictEqual(updated.enforce_sso, true);
    assert.strictEqual(updated.tenant_id, `tenant-${ts}`);

    const [rows] = await pool.query(
      'SELECT COUNT(*) as total FROM organization_sso_configs WHERE organization_id = ?',
      [businessOrg.id]
    );
    assert.strictEqual(rows[0].total, 1);
  });

  it('Caso 3: Configuracion de SSO con protocolo SAML 2.0 para campus educativo', async () => {
    const samlConfig = await configureSso({
      enforceSso: false,
      isEnabled: true,
      organizationId: campusOrg.id,
      provider: 'saml',
      samlCert: '-----BEGIN CERTIFICATE-----\nMIIC...TESTCERT...\n-----END CERTIFICATE-----',
      samlEntrypoint: 'https://idp.campus.edu.mx/simplesaml/saml2/idp/SSOService.php',
      samlIssuer: `https://aurora.app/sso/saml/${campusOrg.id}`,
    });

    assert.ok(samlConfig.id);
    assert.strictEqual(samlConfig.provider, 'saml');
    assert.strictEqual(samlConfig.saml_entrypoint, 'https://idp.campus.edu.mx/simplesaml/saml2/idp/SSOService.php');
    assert.strictEqual(samlConfig.saml_issuer, `https://aurora.app/sso/saml/${campusOrg.id}`);
  });

  it('Caso 4: Resolucion de dominio y lookup de SSO por correo electronico', async () => {
    const lookupBusiness = await lookupSsoByEmail(`empleado@${businessDomain}`);
    assert.strictEqual(lookupBusiness.hasSso, true);
    assert.strictEqual(lookupBusiness.provider, 'azure');
    assert.strictEqual(lookupBusiness.organizationId, businessOrg.id);
    assert.strictEqual(lookupBusiness.enforceSso, true);

    const lookupUpper = await lookupSsoByEmail(`GERENTE@${businessDomain.toUpperCase()}`);
    assert.strictEqual(lookupUpper.hasSso, true);
    assert.strictEqual(lookupUpper.organizationId, businessOrg.id);

    const lookupCampus = await lookupSsoByEmail(`profesor@${campusDomain}`);
    assert.strictEqual(lookupCampus.hasSso, true);
    assert.strictEqual(lookupCampus.provider, 'saml');
    assert.strictEqual(lookupCampus.organizationId, campusOrg.id);
    assert.strictEqual(lookupCampus.enforceSso, false);

    const lookupNormal = await lookupSsoByEmail('usuario@gmail.com');
    assert.strictEqual(lookupNormal.hasSso, false);

    const lookupInvalid = await lookupSsoByEmail('correo-sin-arroba');
    assert.strictEqual(lookupInvalid.hasSso, false);

    const lookupEmpty = await lookupSsoByEmail('');
    assert.strictEqual(lookupEmpty.hasSso, false);
  });

  it('Caso 5: Desactivacion de SSO oculta la resolucion de dominio', async () => {
    await configureSso({
      clientId: `azure-app-id-${ts}`,
      clientSecret: `azure-client-secret-${ts}`,
      enforceSso: false,
      isEnabled: false,
      organizationId: businessOrg.id,
      provider: 'azure',
      tenantId: `tenant-${ts}`,
    });

    const lookupDisabled = await lookupSsoByEmail(`alguien@${businessDomain}`);
    assert.strictEqual(lookupDisabled.hasSso, false);

    const byDomainDisabled = await getSsoConfigByDomain(businessDomain);
    assert.strictEqual(byDomainDisabled, null);

    await configureSso({
      clientId: `azure-app-id-${ts}`,
      clientSecret: `azure-client-secret-${ts}`,
      enforceSso: true,
      isEnabled: true,
      organizationId: businessOrg.id,
      provider: 'azure',
      tenantId: `tenant-${ts}`,
    });

    const lookupReenabled = await lookupSsoByEmail(`alguien@${businessDomain}`);
    assert.strictEqual(lookupReenabled.hasSso, true);
  });

  it('Caso 6: Construccion de URL de autorizacion para Google, Azure y SAML', async () => {
    const googleConfig = {
      client_id: 'client-12345.apps.googleusercontent.com',
      client_secret: 'secret-123',
      created_at: new Date().toISOString(),
      enforce_sso: false,
      id: 'cfg-1',
      is_enabled: true,
      organization_id: businessOrg.id,
      provider: 'google',
      saml_cert: null,
      saml_entrypoint: null,
      saml_issuer: null,
      tenant_id: null,
      updated_at: new Date().toISOString(),
    };

    const googleUrl = buildSsoAuthorizeUrl({
      baseUrl: 'http://localhost:3000',
      config: googleConfig,
      domain: businessDomain,
      state: 'state_google_test',
    });
    assert.ok(googleUrl.includes('accounts.google.com/o/oauth2/v2/auth'));
    assert.ok(googleUrl.includes('client_id=client-12345.apps.googleusercontent.com'));
    assert.ok(googleUrl.includes('state=state_google_test'));
    assert.ok(googleUrl.includes(`hd=${businessDomain}`));

    const azureConfig = {
      client_id: 'azure-client-uuid',
      client_secret: 'secret-azure',
      created_at: new Date().toISOString(),
      enforce_sso: true,
      id: 'cfg-2',
      is_enabled: true,
      organization_id: businessOrg.id,
      provider: 'azure',
      saml_cert: null,
      saml_entrypoint: null,
      saml_issuer: null,
      tenant_id: 'tenant-guid-1234',
      updated_at: new Date().toISOString(),
    };

    const azureUrl = buildSsoAuthorizeUrl({
      baseUrl: 'http://localhost:3000',
      config: azureConfig,
      domain: businessDomain,
      state: 'state_azure_test',
    });
    assert.ok(azureUrl.includes('login.microsoftonline.com/tenant-guid-1234/oauth2/v2.0/authorize'));
    assert.ok(azureUrl.includes('client_id=azure-client-uuid'));
    assert.ok(azureUrl.includes('state=state_azure_test'));

    const samlConfig = {
      client_id: null,
      client_secret: null,
      created_at: new Date().toISOString(),
      enforce_sso: false,
      id: 'cfg-3',
      is_enabled: true,
      organization_id: campusOrg.id,
      provider: 'saml',
      saml_cert: 'cert',
      saml_entrypoint: 'https://idp.campus.edu.mx/sso/login',
      saml_issuer: 'issuer',
      tenant_id: null,
      updated_at: new Date().toISOString(),
    };

    const samlUrl = buildSsoAuthorizeUrl({
      baseUrl: 'http://localhost:3000',
      config: samlConfig,
      domain: campusDomain,
      state: 'state_saml_test',
    });
    assert.ok(samlUrl.includes('https://idp.campus.edu.mx/sso/login'));
    assert.ok(samlUrl.includes('RelayState=state_saml_test'));
  });

  it('Caso 7: Proceso de login SSO exitoso para nuevo usuario corporativo', async () => {
    const employeeEmail = `dev_${ts}@${businessDomain}`;
    const ssoUser = await processSsoLoginSuccess({
      email: employeeEmail,
      name: 'Ingeniero de Software Senior',
      organizationId: businessOrg.id,
    });

    assert.ok(ssoUser.id);
    assert.strictEqual(ssoUser.role, 'ORG_MEMBER');

    const dbUser = await findUserById(ssoUser.id);
    assert.ok(dbUser);
    assert.strictEqual(dbUser.email, employeeEmail);
    assert.strictEqual(dbUser.subscription_tier, 'enterprise');

    const [memberRows] = await pool.query(
      'SELECT * FROM organization_members WHERE organization_id = ? AND user_id = ?',
      [businessOrg.id, ssoUser.id]
    );
    assert.strictEqual(memberRows.length, 1);
    assert.strictEqual(memberRows[0].status, 'active');
    assert.strictEqual(memberRows[0].role, 'ORG_MEMBER');

    const userOrg = await getUserOrganization(ssoUser.id);
    assert.ok(userOrg);
    assert.strictEqual(userOrg.organization.id, businessOrg.id);
    assert.strictEqual(userOrg.memberRole, 'ORG_MEMBER');

    const perms = await getUserEffectivePermissions(dbUser);
    assert.strictEqual(hasPermission(perms, 'subscription:feature:teams'), true);
    assert.strictEqual(hasPermission(perms, 'subscription:feature:enterprise'), true);
    assert.strictEqual(hasPermission(perms, 'account:view_profile'), true);
    assert.strictEqual(hasPermission(perms, 'workflows:manage'), true);
  });

  it('Caso 8: Proceso de login SSO con usuario existente conserva rol y vincula a organizacion', async () => {
    const existingEmail = `existente_${ts}@${businessDomain}`;
    const existing = await createUser({
      avatarUrl: null,
      email: existingEmail,
      googleId: null,
      passwordHash: '$2b$10$xyz',
      username: `existente_${ts}`,
    });
    assert.ok(existing.id);

    const ssoResult = await processSsoLoginSuccess({
      email: existingEmail,
      name: 'Usuario Existente Aurora',
      organizationId: businessOrg.id,
    });

    assert.strictEqual(ssoResult.id, existing.id);
    assert.strictEqual(ssoResult.username, existing.username);

    const [memberRows] = await pool.query(
      'SELECT * FROM organization_members WHERE organization_id = ? AND user_id = ?',
      [businessOrg.id, existing.id]
    );
    assert.strictEqual(memberRows.length, 1);
    assert.strictEqual(memberRows[0].status, 'active');

    const secondLogin = await processSsoLoginSuccess({
      email: existingEmail,
      name: 'Usuario Existente Aurora',
      organizationId: businessOrg.id,
    });
    assert.strictEqual(secondLogin.id, existing.id);
  });

  it('Caso 9: Login SSO en campus educativo activa automaticamente Pro Educativo y verificacion', async () => {
    const studentEmail = `alumno_campus_${ts}@${campusDomain}`;
    const ssoStudent = await processSsoLoginSuccess({
      email: studentEmail,
      name: 'Estudiante Campus Metropolitano',
      organizationId: campusOrg.id,
    });

    assert.ok(ssoStudent.id);

    const studentDb = await findUserById(ssoStudent.id);
    assert.ok(studentDb);
    assert.strictEqual(studentDb.email, studentEmail);
    assert.strictEqual(studentDb.subscription_tier, 'pro');
    assert.strictEqual(studentDb.subscription_origin, 'education');
    assert.strictEqual(studentDb.is_student, true);
    assert.strictEqual(studentDb.subscription_status, 'active');
    assert.ok(studentDb.subscription_period_end);

    const [verifRows] = await pool.query(
      'SELECT * FROM student_verifications WHERE user_id = ? LIMIT 1',
      [ssoStudent.id]
    );
    assert.strictEqual(verifRows.length, 1);
    assert.strictEqual(verifRows[0].status, 'approved');
    assert.strictEqual(verifRows[0].school_name, campusOrg.name);
    assert.strictEqual(verifRows[0].document_url, `campus_sso:${studentEmail}`);

    const studentPerms = await getUserEffectivePermissions(studentDb);
    assert.strictEqual(hasPermission(studentPerms, 'subscription:feature:pro'), true);
    assert.strictEqual(hasPermission(studentPerms, 'tools:ai:advanced'), true);
    assert.strictEqual(hasPermission(studentPerms, 'tools:high_size_limit'), true);
  });

  it('Caso 10: Endpoint HTTP en vivo GET /api/auth/sso/lookup', async () => {
    const resFound = await fetch(`http://localhost:3000/api/auth/sso/lookup?email=admin@${businessDomain}`);
    assert.strictEqual(resFound.status, 200);
    const dataFound = await resFound.json();
    assert.strictEqual(dataFound.success, true);
    assert.strictEqual(dataFound.result.hasSso, true);
    assert.strictEqual(dataFound.result.provider, 'azure');
    assert.strictEqual(dataFound.result.organizationId, businessOrg.id);

    const resNone = await fetch('http://localhost:3000/api/auth/sso/lookup?email=externo@dominio-desconocido.com');
    assert.strictEqual(resNone.status, 200);
    const dataNone = await resNone.json();
    assert.strictEqual(dataNone.success, true);
    assert.strictEqual(dataNone.result.hasSso, false);

    const resInvalid = await fetch('http://localhost:3000/api/auth/sso/lookup?email=invalido');
    assert.strictEqual(resInvalid.status, 400);
    const dataInvalid = await resInvalid.json();
    assert.strictEqual(dataInvalid.success, false);
  });

  it('Caso 11: Endpoint HTTP en vivo GET /api/auth/sso/initiate', async () => {
    const resInitiate = await fetch(`http://localhost:3000/api/auth/sso/initiate?domain=${businessDomain}`);
    assert.strictEqual(resInitiate.status, 200);
    const dataInitiate = await resInitiate.json();
    assert.strictEqual(dataInitiate.success, true);
    assert.strictEqual(dataInitiate.provider, 'azure');
    assert.ok(dataInitiate.authorizeUrl.includes('login.microsoftonline.com'));

    const cookieHeader = resInitiate.headers.get('set-cookie') || '';
    assert.ok(cookieHeader.includes('aurora_sso_state='));
    assert.ok(cookieHeader.includes('aurora_sso_domain='));

    const resNotFound = await fetch('http://localhost:3000/api/auth/sso/initiate?domain=inexistente.com');
    assert.strictEqual(resNotFound.status, 404);
    const dataNotFound = await resNotFound.json();
    assert.strictEqual(dataNotFound.success, false);

    const resBadDomain = await fetch('http://localhost:3000/api/auth/sso/initiate?domain=sindominio');
    assert.strictEqual(resBadDomain.status, 400);
  });

  it('Caso 12: Endpoint HTTP en vivo GET /api/auth/sso/callback validaciones de seguridad', async () => {
    const errorRes = await fetch('http://localhost:3000/api/auth/sso/callback?error=access_denied', {
      redirect: 'manual',
    });
    assert.strictEqual(errorRes.status, 302);
    const errorLocation = errorRes.headers.get('location');
    assert.ok(errorLocation.includes('/login?error='));

    const missingParamsRes = await fetch('http://localhost:3000/api/auth/sso/callback', {
      redirect: 'manual',
    });
    assert.strictEqual(missingParamsRes.status, 302);
    const missingLocation = missingParamsRes.headers.get('location');
    assert.ok(missingLocation.includes('/login?error='));

    const csrfMismatchRes = await fetch('http://localhost:3000/api/auth/sso/callback?code=mock_code&state=fake_state', {
      headers: {
        'Cookie': 'aurora_sso_state=real_state; aurora_sso_domain=test.com',
      },
      redirect: 'manual',
    });
    assert.strictEqual(csrfMismatchRes.status, 302);
    const csrfLocation = csrfMismatchRes.headers.get('location');
    assert.ok(csrfLocation.includes('/login?error='));
  });

  it('Caso 13: Endpoint HTTP en vivo GET /api/auth/sso/config requiere autenticacion y permisos', async () => {
    const unauthRes = await fetch('http://localhost:3000/api/auth/sso/config');
    assert.strictEqual(unauthRes.status, 401);
    const unauthData = await unauthRes.json();
    assert.strictEqual(unauthData.success, false);
  });
});
