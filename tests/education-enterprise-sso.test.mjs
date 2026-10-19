import assert from 'node:assert';
import { describe, it } from 'node:test';
import { pool } from '../dist/config/database.config.js';
import { createInstitutionInquiry } from '../dist/services/institution.service.js';
import { createCampusOrganizationFromInquiry, createOrganization, getOrganizationById } from '../dist/services/organization.service.js';
import { processSsoLoginSuccess } from '../dist/services/sso.service.js';

describe('Education Enterprise Campus & SSO Automation Suite', () => {
  const testAdminId = '50e0819a-7151-433c-8797-613f6cbf0b6a';

  it('createOrganization supports orgType: education', async () => {
    const org = await createOrganization({
      name: 'Universidad Tecnológica de Puebla Campus Central',
      orgType: 'education',
      ownerId: testAdminId,
      seatLimit: 500,
      slug: `utp-campus-${Date.now()}`,
    });

    assert.ok(org.id, 'Organization must have an id');
    assert.strictEqual(org.org_type, 'education', 'Organization org_type must be education');

    const fetched = await getOrganizationById(org.id);
    assert.ok(fetched, 'Fetched organization must exist');
    assert.strictEqual(fetched.org_type, 'education');
  });

  it('createCampusOrganizationFromInquiry promotes inquiry to full campus workspace', async () => {
    const inquiry = await createInstitutionInquiry({
      contactEmail: 'rectoria@udlap.mx',
      contactName: 'Dra. Cecilia Anaya',
      contactRole: 'Rectora',
      countryCity: 'Cholula, Puebla, México',
      estimatedStudents: '2000-5000',
      message: 'Implementación de plataforma documental para todas las licenciaturas y posgrados.',
      schoolName: 'Universidad de las Américas Puebla (UDLAP)',
      websiteDomain: 'udlap.mx',
    });

    assert.ok(inquiry.id, 'Inquiry must be created');

    const campusOrg = await createCampusOrganizationFromInquiry({
      inquiryId: inquiry.id,
      ownerUserId: testAdminId,
      seatLimit: 3500,
    });

    assert.ok(campusOrg.id, 'Campus organization must be created');
    assert.strictEqual(campusOrg.org_type, 'education');
    assert.strictEqual(campusOrg.seat_limit, 3500);

    const [domainRows] = await pool.query(
      'SELECT domain, is_active FROM educational_partner_domains WHERE domain = ? LIMIT 1',
      ['udlap.mx']
    );
    assert.strictEqual(domainRows.length, 1, 'Domain must be automatically added to partner whitelist');
    assert.strictEqual(domainRows[0].is_active, 1);

    const [inquiryUpdated] = await pool.query(
      'SELECT status FROM institution_inquiries WHERE id = ? LIMIT 1',
      [inquiry.id]
    );
    assert.strictEqual(inquiryUpdated[0].status, 'partner_approved');
  });

  it('processSsoLoginSuccess automatically activates Pro Educativo for educational campus logins', async () => {
    const org = await createOrganization({
      name: 'Facultad de Ciencias UNAM',
      orgType: 'education',
      ownerId: testAdminId,
      seatLimit: 1200,
      slug: `fciencias-campus-${Date.now()}`,
    });

    const studentEmail = `alumno_ciencias_${Date.now()}@ciencias.unam.mx`;
    const ssoResult = await processSsoLoginSuccess({
      email: studentEmail,
      name: 'Estudiante Ciencias UNAM',
      organizationId: org.id,
    });

    assert.ok(ssoResult.id, 'Student user must have an id');

    const [userRows] = await pool.query(
      'SELECT id, subscription_tier, subscription_origin, is_student FROM users WHERE id = ? LIMIT 1',
      [ssoResult.id]
    );
    const u = userRows[0];
    assert.strictEqual(u.subscription_tier, 'pro', 'Tier must be pro');
    assert.strictEqual(u.subscription_origin, 'education', 'Origin must be education');
    assert.strictEqual(Boolean(u.is_student), true, 'Must be marked as student');

    const [verifRows] = await pool.query(
      'SELECT * FROM student_verifications WHERE user_id = ? LIMIT 1',
      [ssoResult.id]
    );
    assert.strictEqual(verifRows.length, 1, 'Verification record must exist');
    assert.strictEqual(verifRows[0].status, 'approved', 'Must be approved automatically');
  });
});
