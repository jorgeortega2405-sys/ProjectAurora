import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { checkEducationalDomain, getLatestStudentVerification, requestInstitutionalEmailOtp, verifyInstitutionalEmailOtp } from '../dist/services/education.service.js';
import { createInstitutionInquiry, getPendingInstitutionInquiries, updateInstitutionInquiryStatus } from '../dist/services/institution.service.js';

describe('Education Phase 1 & Phase 2 Compliance and Functionality Suite', () => {
  it('institutions.html strictly adheres to DOM, attribute ordering, and banner placement rules', () => {
    const filePath = path.resolve(process.cwd(), 'public/views/education/institutions.html');
    assert.ok(fs.existsSync(filePath), 'institutions.html must exist');
    const content = fs.readFileSync(filePath, 'utf8');

    const idMatches = content.match(/\bid\s*=\s*["'][^"']+["']/gi) || [];
    assert.strictEqual(idMatches.length, 0, `institutions.html contains prohibited id attributes: ${idMatches.join(', ')}`);

    const buttonMatches = content.match(/<button\b[^>]*>/gi) || [];
    for (const btn of buttonMatches) {
      assert.ok(/^<button\s+type=["'][^"']+["']/i.test(btn), `Button must have type as its first attribute: ${btn}`);
    }

    const nonButtonMatches = content.match(/<(div|a|label|input|span|section|h1|h2|h3|h4|p|form|textarea)\b[^>]*>/gi) || [];
    for (const tag of nonButtonMatches) {
      if (tag.includes('class=')) {
        assert.ok(/^<\w+\s+class=["'][^"']+["']/i.test(tag), `Element with class must have class as its first attribute: ${tag}`);
      }
    }

    const submitBtnIdx = content.indexOf('data-ref="btn-submit-institution"');
    const errorBannerIdx = content.indexOf('data-ref="banner-error"');
    assert.ok(submitBtnIdx > 0 && errorBannerIdx > 0, 'Submit button and error banner must exist');
    assert.ok(errorBannerIdx > submitBtnIdx, 'Error banner must be positioned below the submit button');
  });

  it('verify.html strictly adheres to DOM rules and has both instant and manual tabs', () => {
    const filePath = path.resolve(process.cwd(), 'public/views/education/verify.html');
    assert.ok(fs.existsSync(filePath), 'verify.html must exist');
    const content = fs.readFileSync(filePath, 'utf8');

    const idMatches = content.match(/\bid\s*=\s*["'][^"']+["']/gi) || [];
    assert.strictEqual(idMatches.length, 0, `verify.html contains prohibited id attributes: ${idMatches.join(', ')}`);

    assert.ok(content.includes('data-ref="tab-btn-instant"'), 'Must have instant tab');
    assert.ok(content.includes('data-ref="tab-btn-manual"'), 'Must have manual tab');
    assert.ok(content.includes('data-ref="box-mode-instant"'), 'Must have instant mode container');
    assert.ok(content.includes('data-ref="box-mode-manual"'), 'Must have manual mode container');
    assert.ok(content.includes('data-ref="input-otp-code"'), 'Must have OTP code input');
  });

  it('TypeScript view controllers adhere to zero-comment, lifecycle, and zero-console rules', () => {
    const files = [
      'client/views/education-institutions.view.ts',
      'client/views/education-verify.view.ts',
      'client/views/education.view.ts',
    ];

    for (const relPath of files) {
      const fullPath = path.resolve(process.cwd(), relPath);
      assert.ok(fs.existsSync(fullPath), `${relPath} must exist`);
      const code = fs.readFileSync(fullPath, 'utf8');

      assert.ok(!code.includes('console.log'), `${relPath} must not contain console.log`);
      assert.ok(!code.includes('console.warn'), `${relPath} must not contain console.warn`);
      assert.ok(!code.includes('console.error'), `${relPath} must not contain console.error`);

      const commentMatch = code.match(/^\s*(\/\/|\/\*|\*)/m);
      assert.ok(!commentMatch, `${relPath} must not contain comments`);

      const addListenerCount = (code.match(/addEventListener/g) || []).length;
      const signalCount = (code.match(/signal:\s*this\.abortController\?\.signal/g) || []).length;
      assert.strictEqual(addListenerCount, signalCount, `${relPath} all addEventListener calls must specify AbortSignal`);

      assert.ok(code.includes('this.abortController.abort()'), `${relPath} must abort controller in destroy`);
    }
  });

  it('Institution service handles inquiry creation, query, and status updates', async () => {
    const created = await createInstitutionInquiry({
      contactEmail: 'director@itesm.mx',
      contactName: 'Ing. Roberto Garza',
      contactRole: 'Director de Innovación Educativa',
      countryCity: 'Monterrey, México',
      estimatedStudents: '5000-10000',
      message: 'Solicitamos información sobre convenio de campus para el Tecnológico de Monterrey.',
      schoolName: 'Instituto Tecnológico y de Estudios Superiores de Monterrey',
      websiteDomain: 'itesm.mx',
    });

    assert.ok(created.id, 'Created inquiry must have an id');

    const pending = await getPendingInstitutionInquiries();
    const found = pending.find((i) => i.id === created.id);
    assert.ok(found, 'Created inquiry must be found in pending list');
    assert.strictEqual(found.school_name, 'Instituto Tecnológico y de Estudios Superiores de Monterrey');
    assert.strictEqual(found.contact_email, 'director@itesm.mx');

    const updated = await updateInstitutionInquiryStatus(created.id, 'contacted', 'Contacto telefónico realizado con éxito.');
    assert.strictEqual(updated, true, 'Status update must succeed');
  });

  it('Educational domain detection recognizes partner universities, subdomains, and .edu domains', async () => {
    const unam = await checkEducationalDomain('alumno@unam.mx');
    assert.strictEqual(unam.isPartner, true);
    assert.ok(unam.schoolName.includes('UNAM'));

    const ipnSub = await checkEducationalDomain('estudiante@escom.ipn.mx');
    assert.strictEqual(ipnSub.isPartner, true);
    assert.ok(ipnSub.schoolName.includes('IPN'));

    const stanford = await checkEducationalDomain('researcher@cs.stanford.edu');
    assert.strictEqual(stanford.isPartner, true);

    const gmail = await checkEducationalDomain('usuario@gmail.com');
    assert.strictEqual(gmail.isPartner, false);
  });
});
