import { SAML } from '@node-saml/node-saml';
import { createHmac, randomBytes } from 'crypto';
import { Request, Response } from 'express';
import { config } from '../config/env.config.js';
import { addAccountToSession } from '../services/auth.service.js';
import { logger } from '../services/logger.service.js';
import { getUserOrganization } from '../services/organization.service.js';
import { buildSsoAuthorizeUrl, configureSso, getSsoConfig, getSsoConfigByDomain, lookupSsoByEmail, processSsoLoginSuccess } from '../services/sso.service.js';
import { findUserById } from '../services/user.service.js';

export async function ssoLookupHandler(req: Request, res: Response): Promise<void> {
  try {
    const email = String(req.query.email || '').trim();
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Correo electrónico inválido.', success: false });
      return;
    }

    const result = await lookupSsoByEmail(email);
    res.json({
      result,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error en búsqueda de SSO por correo', err);
    res.status(500).json({
      error: 'No se pudo verificar la configuración de SSO para el dominio.',
      success: false,
    });
  }
}

export async function ssoInitiateHandler(req: Request, res: Response): Promise<void> {
  try {
    const domain = String(req.query.domain || req.query.email || '').trim().toLowerCase().replace(/^@+/, '');
    const cleanDomain = domain.includes('@') ? domain.split('@')[1] : domain;

    if (!cleanDomain || !cleanDomain.includes('.')) {
      res.status(400).json({ error: 'Dominio empresarial no especificado o inválido.', success: false });
      return;
    }

    const ssoInfo = await getSsoConfigByDomain(cleanDomain);
    if (!ssoInfo) {
      res.status(404).json({ error: 'No se encontró una configuración activa de SSO para este dominio.', success: false });
      return;
    }

    let state = randomBytes(24).toString('hex');
    if (ssoInfo.config.provider === 'saml') {
      const nonce = randomBytes(16).toString('hex');
      const ts = Date.now();
      const payload = `${cleanDomain}:${ts}:${nonce}`;
      const sig = createHmac('sha256', config.sessionSecret).update(payload).digest('hex');
      state = `${payload}:${sig}`;
    }

    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
    const baseUrl = config.baseUrl && !config.baseUrl.includes('localhost') ? config.baseUrl : `${proto}://${host}`;

    const authorizeUrl = await buildSsoAuthorizeUrl({
      baseUrl,
      config: ssoInfo.config,
      domain: cleanDomain,
      host,
      state,
    });

    res.cookie('aurora_sso_state', state, {
      httpOnly: true,
      maxAge: 10 * 60 * 1000,
      path: '/',
      sameSite: 'lax',
      secure: config.nodeEnv === 'production',
    });

    res.cookie('aurora_sso_domain', cleanDomain, {
      httpOnly: true,
      maxAge: 10 * 60 * 1000,
      path: '/',
      sameSite: 'lax',
      secure: config.nodeEnv === 'production',
    });

    res.json({
      authorizeUrl,
      provider: ssoInfo.config.provider,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al iniciar flujo de SSO', err);
    res.status(500).json({
      error: 'No se pudo generar la URL de autenticación SSO.',
      success: false,
    });
  }
}

export async function ssoCallbackHandler(req: Request, res: Response): Promise<void> {
  try {
    const { code, error: oauthError, state } = req.query;

    if (oauthError) {
      logger.security.warn('Error devuelto por proveedor SSO', { error: oauthError });
      res.redirect('/login?error=' + encodeURIComponent('Inicio de sesión cancelado o denegado por el proveedor.'));
      return;
    }

    if (!code || !state) {
      res.redirect('/login?error=' + encodeURIComponent('Parámetros de autorización SSO incompletos.'));
      return;
    }

    const savedState = req.cookies?.aurora_sso_state;
    if (!savedState || savedState !== state) {
      logger.security.warn('Discrepancia de estado CSRF en SSO callback', { received: state, saved: savedState });
      res.redirect('/login?error=' + encodeURIComponent('La sesión de inicio de sesión SSO ha expirado o no es válida.'));
      return;
    }

    const domain = req.cookies?.aurora_sso_domain;
    if (!domain) {
      res.redirect('/login?error=' + encodeURIComponent('Dominio corporativo no encontrado en la sesión.'));
      return;
    }

    res.clearCookie('aurora_sso_state', { path: '/' });
    res.clearCookie('aurora_sso_domain', { path: '/' });

    const ssoInfo = await getSsoConfigByDomain(domain);
    if (!ssoInfo || !ssoInfo.config.is_enabled) {
      res.redirect('/login?error=' + encodeURIComponent('La configuración de SSO no está activa para este dominio.'));
      return;
    }

    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
    const baseUrl = config.baseUrl && !config.baseUrl.includes('localhost') ? config.baseUrl : `${proto}://${host}`;
    const callbackUrl = `${baseUrl.replace(/\/+$/, '')}/api/auth/sso/callback`;

    let email = '';
    let name = '';

    if (ssoInfo.config.provider === 'google') {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        body: new URLSearchParams({
          client_id: ssoInfo.config.client_id || '',
          client_secret: ssoInfo.config.client_secret || '',
          code: String(code),
          grant_type: 'authorization_code',
          redirect_uri: callbackUrl,
        }),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
      });

      if (!tokenRes.ok) {
        logger.app.error('Error al intercambiar código con Google SSO', await tokenRes.text());
        res.redirect('/login?error=' + encodeURIComponent('Error al intercambiar autorización con Google.'));
        return;
      }

      const tokenData = (await tokenRes.json()) as any;
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userRes.ok) {
        res.redirect('/login?error=' + encodeURIComponent('Error al obtener perfil desde Google SSO.'));
        return;
      }

      const userData = (await userRes.json()) as any;
      email = userData.email;
      name = userData.name || userData.given_name;
    } else if (ssoInfo.config.provider === 'azure') {
      const tenant = ssoInfo.config.tenant_id || 'common';
      const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
        body: new URLSearchParams({
          client_id: ssoInfo.config.client_id || '',
          client_secret: ssoInfo.config.client_secret || '',
          code: String(code),
          grant_type: 'authorization_code',
          redirect_uri: callbackUrl,
        }),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
      });

      if (!tokenRes.ok) {
        logger.app.error('Error al intercambiar código con Azure SSO', await tokenRes.text());
        res.redirect('/login?error=' + encodeURIComponent('Error al intercambiar autorización con Microsoft Azure.'));
        return;
      }

      const tokenData = (await tokenRes.json()) as any;
      const userRes = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userRes.ok) {
        res.redirect('/login?error=' + encodeURIComponent('Error al obtener perfil desde Azure SSO.'));
        return;
      }

      const userData = (await userRes.json()) as any;
      email = userData.mail || userData.userPrincipalName;
      name = userData.displayName;
    }

    if (!email) {
      res.redirect('/login?error=' + encodeURIComponent('El proveedor no devolvió un correo electrónico válido.'));
      return;
    }

    const user = await processSsoLoginSuccess({
      email,
      name,
      organizationId: ssoInfo.organization.id,
    });

    const fullUser = await findUserById(user.id);
    if (!fullUser) {
      res.redirect('/login?error=' + encodeURIComponent('Error al cargar datos del usuario corporativo.'));
      return;
    }

    await addAccountToSession(res, req, fullUser);
    logger.security.info('Inicio de sesión corporativo SSO exitoso', { email: fullUser.email, userId: fullUser.id });
    res.redirect('/');
  } catch (err) {
    logger.app.error('Error no controlado en SSO callback', err);
    res.redirect('/login?error=' + encodeURIComponent('Ocurrió un error inesperado al procesar el inicio de sesión SSO.'));
  }
}

export async function ssoSamlCallbackHandler(req: Request, res: Response): Promise<void> {
  try {
    const { RelayState, SAMLResponse } = req.body || {};
    if (!SAMLResponse) {
      logger.security.warn('SAML callback recibido sin SAMLResponse');
      res.redirect('/login?error=' + encodeURIComponent('Respuesta de autenticación SAML no proporcionada por el proveedor.'));
      return;
    }

    let domain = req.cookies?.aurora_sso_domain;
    const relayState = String(RelayState || '');
    if (relayState.includes(':')) {
      const parts = relayState.split(':');
      if (parts.length === 4) {
        const [relayDomain, relayTsStr, relayNonce, relaySig] = parts;
        const payloadToVerify = `${relayDomain}:${relayTsStr}:${relayNonce}`;
        const expectedSig = createHmac('sha256', config.sessionSecret).update(payloadToVerify).digest('hex');
        const relayTs = Number(relayTsStr);
        if (expectedSig === relaySig && Date.now() - relayTs < 15 * 60 * 1000) {
          domain = relayDomain;
        }
      }
    }

    if (!domain) {
      logger.security.warn('SAML callback sin dominio corporativo identificable');
      res.redirect('/login?error=' + encodeURIComponent('Dominio corporativo no identificado en la sesión.'));
      return;
    }

    res.clearCookie('aurora_sso_state', { path: '/' });
    res.clearCookie('aurora_sso_domain', { path: '/' });

    const ssoInfo = await getSsoConfigByDomain(domain);
    if (!ssoInfo || !ssoInfo.config.is_enabled || ssoInfo.config.provider !== 'saml') {
      res.redirect('/login?error=' + encodeURIComponent('La configuración de SAML no está activa para este dominio.'));
      return;
    }

    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
    const baseUrl = config.baseUrl && !config.baseUrl.includes('localhost') ? config.baseUrl : `${proto}://${host}`;
    const callbackUrl = `${baseUrl.replace(/\/+$/, '')}/api/auth/sso/saml/callback`;
    const issuer = ssoInfo.config.saml_issuer || `${baseUrl.replace(/\/+$/, '')}/api/auth/sso/saml/metadata`;

    const rawCert = ssoInfo.config.saml_cert || '';
    const cleanCert = rawCert.replace(/\\n/g, '\n').trim();

    const saml = new SAML({
      acceptedClockSkewMs: 120000,
      audience: false,
      callbackUrl,
      entryPoint: ssoInfo.config.saml_entrypoint || '',
      idpCert: cleanCert,
      issuer,
      wantAssertionsSigned: false,
      wantAuthnResponseSigned: false,
    });

    let profile: any = null;
    try {
      const result = await saml.validatePostResponseAsync(req.body);
      profile = result.profile;
    } catch (valErr: any) {
      logger.security.error('Fallo en la validación de aserción SAML', {
        domain,
        error: valErr?.message || String(valErr),
        orgId: ssoInfo.organization.id,
      });
      res.redirect('/login?error=' + encodeURIComponent('Fallo en la validación de seguridad de la aserción SAML.'));
      return;
    }

    const rawEmail = (
      profile?.email ||
      profile?.nameID ||
      profile?.['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ||
      profile?.['http://schemas.xmlsoap.org/claims/EmailAddress'] ||
      profile?.['urn:oid:0.9.2342.19200300.100.1.3'] ||
      profile?.mail ||
      ''
    );
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

    if (!email || !email.includes('@')) {
      logger.security.warn('Aserción SAML procesada sin email válido');
      res.redirect('/login?error=' + encodeURIComponent('El proveedor SAML no devolvió un correo electrónico corporativo válido.'));
      return;
    }

    const name = (
      profile?.displayName ||
      profile?.['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ||
      profile?.['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'] ||
      profile?.cn ||
      email.split('@')[0]
    );

    const user = await processSsoLoginSuccess({
      email,
      name,
      organizationId: ssoInfo.organization.id,
    });

    const fullUser = await findUserById(user.id);
    if (!fullUser) {
      res.redirect('/login?error=' + encodeURIComponent('Error al cargar datos del usuario corporativo.'));
      return;
    }

    await addAccountToSession(res, req, fullUser);
    logger.security.info('Inicio de sesión corporativo SAML 2.0 exitoso', { email: fullUser.email, userId: fullUser.id });
    res.redirect('/');
  } catch (err) {
    logger.app.error('Error no controlado en SAML callback', err);
    res.redirect('/login?error=' + encodeURIComponent('Ocurrió un error inesperado al procesar el inicio de sesión SAML.'));
  }
}

export async function ssoSamlMetadataHandler(req: Request, res: Response): Promise<void> {
  try {
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
    const baseUrl = config.baseUrl && !config.baseUrl.includes('localhost') ? config.baseUrl : `${proto}://${host}`;
    const callbackUrl = `${baseUrl.replace(/\/+$/, '')}/api/auth/sso/saml/callback`;
    const issuer = `${baseUrl.replace(/\/+$/, '')}/api/auth/sso/saml/metadata`;

    const saml = new SAML({
      callbackUrl,
      entryPoint: 'https://example.com/idp',
      idpCert: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA',
      issuer,
    });

    const metadataXml = saml.generateServiceProviderMetadata(null, null);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.status(200).send(metadataXml);
  } catch (err) {
    logger.app.error('Error al generar metadatos SAML SP', err);
    res.status(500).send('Error al generar metadatos SAML.');
  }
}

export async function getSsoConfigHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    const userOrg = await getUserOrganization(user.id);
    if (!userOrg) {
      res.status(404).json({ error: 'Organización no encontrada.', success: false });
      return;
    }

    const ssoConfig = await getSsoConfig(userOrg.organization.id);
    res.json({
      config: ssoConfig
        ? {
            client_id: ssoConfig.client_id,
            enforce_sso: ssoConfig.enforce_sso,
            id: ssoConfig.id,
            is_enabled: ssoConfig.is_enabled,
            organization_id: ssoConfig.organization_id,
            provider: ssoConfig.provider,
            saml_cert: ssoConfig.saml_cert,
            saml_entrypoint: ssoConfig.saml_entrypoint,
            saml_issuer: ssoConfig.saml_issuer,
            tenant_id: ssoConfig.tenant_id,
          }
        : null,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al obtener configuración de SSO', err);
    res.status(500).json({
      error: 'No se pudo obtener la configuración de SSO.',
      success: false,
    });
  }
}

export async function ssoConfigHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as any).user;
    const userOrg = await getUserOrganization(user.id);
    if (!userOrg) {
      res.status(404).json({ error: 'Organización no encontrada.', success: false });
      return;
    }

    const { clientId, clientSecret, enforceSso, isEnabled, provider, samlCert, samlEntrypoint, samlIssuer, tenantId } = req.body || {};
    if (!provider || !['google', 'azure', 'saml'].includes(provider)) {
      res.status(400).json({ error: 'Proveedor de SSO no válido (debe ser google, azure o saml).', success: false });
      return;
    }

    const sanitizedSamlCert = typeof samlCert === 'string' ? samlCert.replace(/\\n/g, '\n').trim() : samlCert;

    const savedConfig = await configureSso({
      clientId,
      clientSecret,
      enforceSso,
      isEnabled,
      organizationId: userOrg.organization.id,
      provider,
      samlCert: sanitizedSamlCert,
      samlEntrypoint,
      samlIssuer,
      tenantId,
    });

    res.json({
      message: 'Configuración de SSO actualizada correctamente.',
      ssoConfig: {
        client_id: savedConfig.client_id,
        enforce_sso: savedConfig.enforce_sso,
        id: savedConfig.id,
        is_enabled: savedConfig.is_enabled,
        organization_id: savedConfig.organization_id,
        provider: savedConfig.provider,
        saml_cert: savedConfig.saml_cert,
        saml_entrypoint: savedConfig.saml_entrypoint,
        saml_issuer: savedConfig.saml_issuer,
        tenant_id: savedConfig.tenant_id,
      },
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al guardar configuración de SSO', err);
    res.status(500).json({
      error: 'No se pudo guardar la configuración de SSO.',
      success: false,
    });
  }
}
