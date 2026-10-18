import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { pool } from '../dist/config/database.config.js';
import {
  approveStudentVerification,
  createStudentVerification,
  getLatestStudentVerification,
  rejectStudentVerification,
} from '../dist/services/education.service.js';

describe('Education & Verification Compliance Suite', () => {
  it('public/views/education/education.html adheres to strict DOM and attribute rules', () => {
    const htmlPath = path.resolve(process.cwd(), 'public/views/education/education.html');
    assert.ok(fs.existsSync(htmlPath), 'education.html must exist');
    const content = fs.readFileSync(htmlPath, 'utf8');

    assert.ok(!content.includes('id='), 'education.html must not contain any id attributes');
    assert.ok(content.includes('data-ref="btn-verify-student"'), 'education.html must contain btn-verify-student');

    const buttonMatches = content.match(/<button\b[^>]*>/g) || [];
    for (const btn of buttonMatches) {
      assert.ok(
        btn.startsWith('<button type="button"') || btn.startsWith('<button type="submit"'),
        `Button must have type as first attribute: ${btn}`
      );
    }
  });

  it('public/views/education/verify.html adheres to strict DOM, floating labels, and banner placement', () => {
    const htmlPath = path.resolve(process.cwd(), 'public/views/education/verify.html');
    assert.ok(fs.existsSync(htmlPath), 'verify.html must exist');
    const content = fs.readFileSync(htmlPath, 'utf8');

    assert.ok(!content.includes('id='), 'verify.html must not contain any id attributes');
    assert.ok(content.includes('data-ref="form-verify"'), 'verify.html must contain form-verify');
    assert.ok(content.includes('data-ref="input-full-name"'), 'verify.html must contain input-full-name');
    assert.ok(content.includes('data-ref="input-school-name"'), 'verify.html must contain input-school-name');
    assert.ok(content.includes('data-ref="input-file"'), 'verify.html must contain input-file');

    const buttonMatches = content.match(/<button\b[^>]*>/g) || [];
    for (const btn of buttonMatches) {
      assert.ok(
        btn.startsWith('<button type="button"') || btn.startsWith('<button type="submit"'),
        `Button must have type as first attribute: ${btn}`
      );
    }

    const submitBtnIdx = content.indexOf('data-ref="btn-submit-verify"');
    const errorBannerIdx = content.indexOf('data-ref="banner-error"');
    assert.ok(submitBtnIdx > 0 && errorBannerIdx > 0, 'Submit button and error banner must exist');
    assert.ok(errorBannerIdx > submitBtnIdx, 'Error banner must be positioned below the submit button');
  });

  it('TypeScript view controllers adhere to lifecycle, signals, and no-comment rules', () => {
    const files = [
      'client/views/education.view.ts',
      'client/views/education-verify.view.ts',
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

  it('Education service database operations: create, query, approve, and reject', async () => {
    const testUserId = '50e0819a-7151-433c-8797-613f6cbf0b6a';

    const created = await createStudentVerification({
      documentUrl: '/uploads/student_verifications/test_doc.png',
      fullName: 'Estudiante Prueba Aurora',
      schoolName: 'Universidad Nacional Tecnológica',
      userId: testUserId,
    });

    assert.ok(created.id, 'Created verification must have an id');
    assert.strictEqual(created.status, 'pending');
    assert.strictEqual(created.full_name, 'Estudiante Prueba Aurora');
    assert.strictEqual(created.school_name, 'Universidad Nacional Tecnológica');

    const fetched = await getLatestStudentVerification(testUserId);
    assert.ok(fetched, 'Must fetch latest verification');
    assert.strictEqual(fetched.id, created.id);

    const approved = await approveStudentVerification({
      adminId: testUserId,
      notes: 'Documentación válida y sellada.',
      verificationId: created.id,
    });
    assert.strictEqual(approved, true, 'Approval must succeed');

    const [userRows] = await pool.query(
      'SELECT subscription_tier, subscription_origin, is_student, subscription_status, subscription_period_end FROM users WHERE id = ?',
      [testUserId]
    );
    const user = userRows[0];
    assert.strictEqual(user.subscription_tier, 'pro', 'Tier must be pro');
    assert.strictEqual(user.subscription_origin, 'education', 'Origin must be education');
    assert.strictEqual(Boolean(user.is_student), true, 'is_student must be true');
    assert.strictEqual(user.subscription_status, 'active');
    assert.ok(user.subscription_period_end, 'Must have period end set');

    const rejected = await rejectStudentVerification({
      adminId: testUserId,
      notes: 'Reversión de prueba.',
      verificationId: created.id,
    });
    assert.strictEqual(rejected, true, 'Rejection must succeed');

    await pool.query('DELETE FROM student_verifications WHERE id = ?', [created.id]);
    await pool.query(
      "UPDATE users SET subscription_tier = 'free', subscription_origin = 'payment', is_student = FALSE, subscription_period_end = NULL WHERE id = ?",
      [testUserId]
    );
  });
});
