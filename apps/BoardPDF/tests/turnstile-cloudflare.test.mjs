import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { config } from '../dist/config/env.config.js';
import { getClientIp } from '../dist/middlewares/rate-limit.middleware.js';
import { originProtection, securityHeaders } from '../dist/middlewares/security-headers.middleware.js';
import { requireTurnstile } from '../dist/middlewares/turnstile.middleware.js';
import { verifyTurnstileToken } from '../dist/services/turnstile.service.js';

describe('Suite de Verificación Cloudflare Turnstile & Proxy DDoS', () => {
  it('1. Extracción de IP real del cliente respeta cabecera cf-connecting-ip de Cloudflare', () => {
    const mockReqWithCf = {
      headers: {
        'cf-connecting-ip': '203.0.113.195',
      },
      ip: '108.162.219.50',
    };

    const detectedIp = getClientIp(mockReqWithCf);
    assert.strictEqual(detectedIp, '203.0.113.195');
  });

  it('2. Extracción de IP recurre a req.ip estándar si no proviene de proxy Cloudflare', () => {
    const mockReqStandard = {
      headers: {},
      ip: '198.51.100.24',
    };

    const detectedIp = getClientIp(mockReqStandard);
    assert.strictEqual(detectedIp, '198.51.100.24');
  });

  it('3. verifyTurnstileToken rechaza de forma segura tokens vacíos o no válidos sin excepciones', async () => {
    const emptyResult = await verifyTurnstileToken('');
    assert.strictEqual(emptyResult.success, false);
    assert.ok(emptyResult.error);

    const whitespaceResult = await verifyTurnstileToken('   ');
    assert.strictEqual(whitespaceResult.success, false);
    assert.ok(whitespaceResult.error);
  });

  it('4. requireTurnstile middleware bloquea peticiones sin token devolviendo código 400 y mensaje seguro', async () => {
    const middleware = requireTurnstile();
    let statusSet = 0;
    let responseBody = null;
    let nextCalled = false;

    const reqMock = {
      body: {},
      headers: {},
      ip: '127.0.0.1',
      method: 'POST',
      path: '/api/login',
    };

    const resMock = {
      json(payload) {
        responseBody = payload;
        return this;
      },
      status(code) {
        statusSet = code;
        return this;
      },
    };

    const nextMock = () => {
      nextCalled = true;
    };

    await middleware(reqMock, resMock, nextMock);

    assert.strictEqual(statusSet, 400);
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(responseBody?.success, false);
    assert.ok(responseBody?.error);
    assert.strictEqual(typeof responseBody.error, 'string');
    assert.ok(!responseBody.error.includes('stack'));
    assert.ok(!responseBody.error.includes('SQL'));
  });

  it('5. requireTurnstile middleware acepta token válido desde cabecera x-turnstile-token', async () => {
    const middleware = requireTurnstile();
    let nextCalled = false;
    let statusSet = 0;

    const reqMock = {
      body: {},
      headers: {
        'x-turnstile-token': 'XXXX.DUMMY.TOKEN.XXXX',
      },
      ip: '127.0.0.1',
      method: 'POST',
      path: '/api/login',
    };

    const resMock = {
      json() {
        return this;
      },
      status(code) {
        statusSet = code;
        return this;
      },
    };

    const nextMock = () => {
      nextCalled = true;
    };

    await middleware(reqMock, resMock, nextMock);

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(statusSet, 0);
  });

  it('6. requireTurnstile middleware acepta token válido desde req.body.turnstileToken', async () => {
    const middleware = requireTurnstile();
    let nextCalled = false;
    let statusSet = 0;

    const reqMock = {
      body: {
        turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
      },
      headers: {},
      ip: '127.0.0.1',
      method: 'POST',
      path: '/api/register/stage1-validate',
    };

    const resMock = {
      json() {
        return this;
      },
      status(code) {
        statusSet = code;
        return this;
      },
    };

    const nextMock = () => {
      nextCalled = true;
    };

    await middleware(reqMock, resMock, nextMock);

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(statusSet, 0);
  });

  it('7. Auditoría de reglas de oro: CERO console.* en archivos Turnstile y CERO atributos id', () => {
    const filesToCheck = [
      'apps/BoardPDF/src/services/turnstile.service.ts',
      'apps/BoardPDF/src/middlewares/turnstile.middleware.ts',
      'apps/BoardPDF/client/services/turnstile.service.ts',
    ];

    for (const relPath of filesToCheck) {
      const fullPath = path.resolve(process.cwd(), relPath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        assert.ok(!content.includes('console.log'), `Prohibido console.log en ${relPath}`);
        assert.ok(!content.includes('console.warn'), `Prohibido console.warn en ${relPath}`);
        assert.ok(!content.includes('console.error'), `Prohibido console.error en ${relPath}`);
        if (relPath.endsWith('.html')) {
          assert.ok(!content.includes('id="'), `Prohibido atributo id="..." en plantilla HTML ${relPath}`);
        }
      }
    }
  });

  it('8. Cabeceras HTTP de seguridad: CSP, HSTS, X-Frame-Options, X-Content-Type-Options y Referrer-Policy', () => {
    const middleware = securityHeaders();
    const headersEmitted = {};

    const reqMock = {
      headers: {
        'x-forwarded-proto': 'https',
      },
      secure: true,
    };

    const resMock = {
      setHeader(name, value) {
        headersEmitted[name.toLowerCase()] = value;
      },
    };

    let nextCalled = false;
    middleware(reqMock, resMock, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(headersEmitted['x-frame-options'], 'DENY');
    assert.strictEqual(headersEmitted['x-content-type-options'], 'nosniff');
    assert.strictEqual(headersEmitted['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.strictEqual(headersEmitted['strict-transport-security'], 'max-age=31536000; includeSubDomains; preload');

    const csp = headersEmitted['content-security-policy'];
    assert.ok(csp, 'Content-Security-Policy debe existir');
    assert.ok(csp.includes('https://challenges.cloudflare.com'), 'CSP debe autorizar Cloudflare Turnstile');
    assert.ok(csp.includes('frame-ancestors \'none\''), 'CSP debe impedir embebido en frames externos');
  });

  it('9. Blindaje de servidor de origen: Bloqueo de accesos directos que omiten Cloudflare cuando está activo', () => {
    config.originProtection.enforceCloudflare = true;
    const middleware = originProtection();

    let statusSet = 0;
    let responseBody = null;
    let nextCalled = false;

    const directReqMock = {
      headers: {},
      ip: '198.51.100.99',
      path: '/api/login',
    };

    const resMock = {
      json(payload) {
        responseBody = payload;
        return this;
      },
      status(code) {
        statusSet = code;
        return this;
      },
    };

    middleware(directReqMock, resMock, () => {
      nextCalled = true;
    });

    assert.strictEqual(statusSet, 403);
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(responseBody?.success, false);

    statusSet = 0;
    nextCalled = false;
    const cfReqMock = {
      headers: {
        'cf-connecting-ip': '203.0.113.195',
        'cf-ray': '8db7f891bca1001-MIA',
      },
      ip: '108.162.219.50',
      path: '/api/login',
    };

    middleware(cfReqMock, resMock, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(statusSet, 0);

    config.originProtection.enforceCloudflare = false;
  });
});
