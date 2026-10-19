import assert from 'node:assert';
import { describe, it } from 'node:test';
import { pool } from '../dist/config/database.config.js';
import { createMultiAccountToken, hashPassword, verifyMultiAccountToken, verifyPassword } from '../dist/services/auth.service.js';
import { syncSubscriptionCredits } from '../dist/services/credits.service.js';
import { approveStudentVerification, checkEducationalDomain, createStudentVerification, getLatestStudentVerification } from '../dist/services/education.service.js';
import { createOrganization, getOrganizationById, getUserOrganization } from '../dist/services/organization.service.js';
import { getUserEffectivePermissions, hasPermission } from '../dist/services/pbac.service.js';
import { getPurchasesByUserId, recordPurchase, updateUserSubscription } from '../dist/services/purchase.service.js';
import { processSsoLoginSuccess } from '../dist/services/sso.service.js';
import { createUser, findUserByEmail, findUserById, findUserByUsername, findUserDuplicates } from '../dist/services/user.service.js';

describe('Suite Integral: Cuentas, Ofertas Estudiante, Pro, Empresas y SSO', () => {
  const timestamp = Date.now();
  const testPassword = 'Password123!Secure';
  let createdUser = null;

  it('Flujo 1: Creacion de cuenta, hash de contrasena, verificacion y sesion', async () => {
    const rawEmail = `usuario_prueba_${timestamp}@auroratest.com`;
    const rawUsername = `aurora_user_${timestamp}`;

    const duplicatesBefore = await findUserDuplicates(rawEmail, rawUsername);
    assert.strictEqual(duplicatesBefore.emailExists, false);
    assert.strictEqual(duplicatesBefore.usernameExists, false);

    const passwordHash = await hashPassword(testPassword);
    assert.ok(passwordHash && passwordHash.length > 20);

    const isValidPassword = await verifyPassword(testPassword, passwordHash);
    assert.strictEqual(isValidPassword, true);

    const isInvalidPassword = await verifyPassword('WrongPassword!', passwordHash);
    assert.strictEqual(isInvalidPassword, false);

    createdUser = await createUser({
      avatarUrl: null,
      email: rawEmail,
      googleId: null,
      passwordHash,
      username: rawUsername,
    });

    assert.ok(createdUser.id);
    assert.strictEqual(createdUser.email, rawEmail.toLowerCase());
    assert.strictEqual(createdUser.username, rawUsername);
    assert.strictEqual(createdUser.subscription_tier, 'free');

    const byEmail = await findUserByEmail(rawEmail);
    assert.ok(byEmail);
    assert.strictEqual(byEmail.id, createdUser.id);

    const byUsername = await findUserByUsername(rawUsername);
    assert.ok(byUsername);
    assert.strictEqual(byUsername.id, createdUser.id);

    const duplicatesAfter = await findUserDuplicates(rawEmail, rawUsername);
    assert.strictEqual(duplicatesAfter.emailExists, true);
    assert.strictEqual(duplicatesAfter.usernameExists, true);

    const token = createMultiAccountToken({
      accounts: [
        {
          avatar_url: null,
          created_at: createdUser.created_at,
          email: createdUser.email,
          google_id: null,
          id: createdUser.id,
          last_accessed: Date.now(),
          role: createdUser.role,
          username: createdUser.username,
        },
      ],
      activeId: createdUser.id,
      exp: Date.now() + 3600 * 1000,
      iat: Date.now(),
    });

    assert.ok(token && token.includes('.'));

    const parsed = verifyMultiAccountToken(token);
    assert.ok(parsed);
    assert.strictEqual(parsed.activeId, createdUser.id);
    assert.strictEqual(parsed.accounts.length, 1);
  });

  it('Flujo 2: Ofertas de estudiante, verificacion y activacion Pro Educativo', async () => {
    assert.ok(createdUser);

    const unamCheck = await checkEducationalDomain('estudiante@comunidad.unam.mx');
    assert.strictEqual(unamCheck.isPartner, true);
    assert.ok(unamCheck.schoolName.includes('UNAM'));

    const itesmCheck = await checkEducationalDomain('alumno@itesm.mx');
    assert.strictEqual(itesmCheck.isPartner, true);

    const eduCheck = await checkEducationalDomain('scholar@harvard.edu');
    assert.strictEqual(eduCheck.isPartner, true);

    const nonEduCheck = await checkEducationalDomain('persona@gmail.com');
    assert.strictEqual(nonEduCheck.isPartner, false);

    const verification = await createStudentVerification({
      documentUrl: '/uploads/verifications/student_credential.png',
      fullName: 'Estudiante Universitario Aurora',
      schoolName: 'Universidad Nacional Autónoma de México',
      userId: createdUser.id,
    });

    assert.ok(verification.id);
    assert.strictEqual(verification.status, 'pending');

    const latest = await getLatestStudentVerification(createdUser.id);
    assert.ok(latest);
    assert.strictEqual(latest.id, verification.id);

    const approved = await approveStudentVerification({
      adminId: '50e0819a-7151-433c-8797-613f6cbf0b6a',
      notes: 'Aprobado via credencial oficial vigente UNAM',
      verificationId: verification.id,
    });
    assert.strictEqual(approved, true);

    const refreshedUser = await findUserById(createdUser.id);
    assert.ok(refreshedUser);
    assert.strictEqual(refreshedUser.subscription_tier, 'pro');
    assert.strictEqual(refreshedUser.subscription_origin, 'education');
    assert.strictEqual(refreshedUser.is_student, true);
    assert.strictEqual(refreshedUser.subscription_status, 'active');

    const studentPerms = await getUserEffectivePermissions(refreshedUser);
    assert.strictEqual(hasPermission(studentPerms, 'subscription:feature:pro'), true);
    assert.strictEqual(hasPermission(studentPerms, 'tools:ai:advanced'), true);
    assert.strictEqual(hasPermission(studentPerms, 'tools:high_size_limit'), true);
  });

  it('Flujo 3: Ofertas Pro estandar, cuotas y sincronizacion de creditos', async () => {
    assert.ok(createdUser);

    await updateUserSubscription(createdUser.id, {
      cancelAtPeriodEnd: false,
      periodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      status: 'active',
      stripeCustomerId: `cus_${timestamp}`,
      stripeSubscriptionId: `sub_${timestamp}`,
      tier: 'pro',
    });

    await syncSubscriptionCredits(createdUser.id, 'pro');

    const proUser = await findUserById(createdUser.id);
    assert.ok(proUser);
    assert.strictEqual(proUser.subscription_tier, 'pro');
    assert.strictEqual(proUser.subscription_status, 'active');
    assert.strictEqual(proUser.ai_credits_balance >= 50, true);

    await recordPurchase({
      amountTotal: 15.00,
      billingPeriod: 'monthly',
      currency: 'USD',
      planId: 'pro_monthly',
      status: 'paid',
      stripeCustomerId: `cus_${timestamp}`,
      stripePaymentIntentId: `pi_${timestamp}`,
      stripeSessionId: `cs_${timestamp}`,
      stripeSubscriptionId: `sub_${timestamp}`,
      userId: createdUser.id,
    });

    const purchases = await getPurchasesByUserId(createdUser.id);
    assert.strictEqual(purchases.length >= 1, true);
    assert.strictEqual(purchases[0].plan_id, 'pro_monthly');
    assert.strictEqual(purchases[0].amount_total, 15.00);

    const proPerms = await getUserEffectivePermissions(proUser);
    assert.strictEqual(hasPermission(proPerms, 'subscription:feature:pro'), true);
    assert.strictEqual(hasPermission(proPerms, 'tools:merge:batch_500'), true);
    assert.strictEqual(hasPermission(proPerms, 'tools:split:by_size'), true);
  });

  it('Flujo 4: Organizaciones de empresa, dominios verificados y permisos corporativos', async () => {
    assert.ok(createdUser);

    const companyOrg = await createOrganization({
      domain: `empresa-${timestamp}.com`,
      name: `Corporativo Aurora ${timestamp}`,
      orgType: 'business',
      ownerId: createdUser.id,
      seatLimit: 25,
      slug: `corp-aurora-${timestamp}`,
    });

    assert.ok(companyOrg.id);
    assert.strictEqual(companyOrg.org_type, 'business');
    assert.strictEqual(companyOrg.seat_limit, 25);
    assert.strictEqual(companyOrg.owner_id, createdUser.id);

    const fetchedOrg = await getOrganizationById(companyOrg.id);
    assert.ok(fetchedOrg);
    assert.strictEqual(fetchedOrg.name, companyOrg.name);

    const userOrg = await getUserOrganization(createdUser.id);
    assert.ok(userOrg);
    assert.strictEqual(userOrg.organization.id, companyOrg.id);
    assert.strictEqual(userOrg.memberRole, 'ORG_OWNER');

    const [domainRows] = await pool.query(
      'SELECT * FROM organization_domains WHERE organization_id = ?',
      [companyOrg.id]
    );
    assert.strictEqual(domainRows.length, 1);
    assert.strictEqual(domainRows[0].domain, `empresa-${timestamp}.com`);

    await pool.query(
      'INSERT INTO enterprise_inquiries (id, first_name, last_name, company, email, message, status) VALUES (UUID(), ?, ?, ?, ?, ?, ?)',
      ['Carlos', 'Ramirez', `Corporativo Aurora ${timestamp}`, `contacto@empresa-${timestamp}.com`, 'Requerimos 25 licencias con soporte dedicado.', 'pending']
    );

    const [inquiryRows] = await pool.query(
      'SELECT * FROM enterprise_inquiries WHERE email = ?',
      [`contacto@empresa-${timestamp}.com`]
    );
    assert.strictEqual(inquiryRows.length, 1);
    assert.strictEqual(inquiryRows[0].company, `Corporativo Aurora ${timestamp}`);

    const [ownerRows] = await pool.query('SELECT role FROM users WHERE id = ?', [createdUser.id]);
    assert.strictEqual(ownerRows[0].role, 'ORG_OWNER');

    const ownerEffectivePerms = await getUserEffectivePermissions({
      id: createdUser.id,
      role: 'ORG_OWNER',
      subscription_status: 'active',
      subscription_tier: 'enterprise',
    });

    assert.strictEqual(hasPermission(ownerEffectivePerms, 'org:manage'), true);
    assert.strictEqual(hasPermission(ownerEffectivePerms, 'subscription:feature:teams'), true);
    assert.strictEqual(hasPermission(ownerEffectivePerms, 'subscription:feature:enterprise'), true);
    assert.strictEqual(hasPermission(ownerEffectivePerms, 'subscription:feature:sso'), true);
  });

  it('Flujo 5: Integracion SSO corporativo y activacion automatica campus educativo', async () => {
    const campusOrg = await createOrganization({
      domain: `campus-${timestamp}.edu.mx`,
      name: `Instituto Tecnológico Superior ${timestamp}`,
      orgType: 'education',
      ownerId: createdUser.id,
      seatLimit: 500,
      slug: `its-${timestamp}`,
    });

    await pool.query(
      `INSERT INTO organization_sso_configs (id, organization_id, provider, is_enabled, enforce_sso, client_id, client_secret)
       VALUES (UUID(), ?, 'google', 1, 0, 'google-client-id-sample', 'google-client-secret-sample')`,
      [campusOrg.id]
    );

    const [ssoConfigRows] = await pool.query(
      'SELECT * FROM organization_sso_configs WHERE organization_id = ?',
      [campusOrg.id]
    );
    assert.strictEqual(ssoConfigRows.length, 1);
    assert.strictEqual(ssoConfigRows[0].provider, 'google');
    assert.strictEqual(ssoConfigRows[0].is_enabled, 1);

    const ssoStudentEmail = `estudiante_sso_${timestamp}@campus-${timestamp}.edu.mx`;
    const ssoUser = await processSsoLoginSuccess({
      email: ssoStudentEmail,
      name: 'Estudiante SSO Campus',
      organizationId: campusOrg.id,
    });

    assert.ok(ssoUser.id);
    assert.ok(ssoUser.username);

    const ssoDbUser = await findUserById(ssoUser.id);
    assert.ok(ssoDbUser);
    assert.strictEqual(ssoDbUser.email, ssoStudentEmail);
    assert.strictEqual(ssoDbUser.subscription_tier, 'pro');
    assert.strictEqual(ssoDbUser.subscription_origin, 'education');
    assert.strictEqual(ssoDbUser.is_student, true);
    assert.strictEqual(ssoDbUser.subscription_status, 'active');

    const ssoStudentPerms = await getUserEffectivePermissions(ssoDbUser);
    assert.strictEqual(hasPermission(ssoStudentPerms, 'subscription:feature:pro'), true);
    assert.strictEqual(hasPermission(ssoStudentPerms, 'tools:ai:advanced'), true);

    const [memberRows] = await pool.query(
      'SELECT * FROM organization_members WHERE organization_id = ? AND user_id = ?',
      [campusOrg.id, ssoUser.id]
    );
    assert.strictEqual(memberRows.length, 1);
    assert.strictEqual(memberRows[0].status, 'active');
  });

  it('Flujo 6: Verificacion de conectividad HTTP en vivo del servidor y proteccion CSRF', async () => {
    const healthRes = await fetch('http://localhost:3000/api/health');
    assert.strictEqual(healthRes.status, 200);

    const healthData = await healthRes.json();
    assert.strictEqual(healthData.name, 'ProjectAurora');
    assert.strictEqual(healthData.status, 'ok');

    const cookieHeader = healthRes.headers.get('set-cookie') || '';
    const match = cookieHeader.match(/aurora_csrf_token=([^;]+)/);
    assert.ok(match, 'Server must issue aurora_csrf_token cookie');
    const csrfToken = match[1];

    const stage1Res = await fetch('http://localhost:3000/api/register/stage1-validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `aurora_csrf_token=${csrfToken}`,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        email: `health_check_${timestamp}@example.com`,
        username: `health_check_${timestamp}`,
        password: 'Password123!Secure',
      }),
    });
    assert.strictEqual(stage1Res.status, 200);
    const stage1Data = await stage1Res.json();
    assert.strictEqual(stage1Data.success, true);
  });
});
