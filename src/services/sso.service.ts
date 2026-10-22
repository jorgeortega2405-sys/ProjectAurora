import { SAML } from '@node-saml/node-saml';
import { randomUUID } from 'crypto';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.config.js';
import { ConfigureSsoDto, Organization, OrganizationSsoConfig, SsoLookupResult } from '../types/enterprise.types.js';
import { logger } from './logger.service.js';
import { addMemberToOrganization, getOrganizationById } from './organization.service.js';

interface SsoConfigDbRow extends RowDataPacket {
  client_id: string | null;
  client_secret: string | null;
  created_at: Date | string;
  enforce_sso: number | boolean;
  id: string;
  is_enabled: number | boolean;
  organization_id: string;
  provider: 'google' | 'azure' | 'saml';
  saml_cert: string | null;
  saml_entrypoint: string | null;
  saml_issuer: string | null;
  tenant_id: string | null;
  updated_at: Date | string;
}

interface SsoDomainJoinRow extends SsoConfigDbRow {
  org_name: string;
  org_owner_id: string;
  org_seat_limit: number;
  org_slug: string;
  org_subscription_status: 'active' | 'trial' | 'past_due' | 'suspended';
}

function mapRowToSsoConfig(r: SsoConfigDbRow): OrganizationSsoConfig {
  return {
    client_id: r.client_id,
    client_secret: r.client_secret,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    enforce_sso: Boolean(r.enforce_sso),
    id: r.id,
    is_enabled: Boolean(r.is_enabled),
    organization_id: r.organization_id,
    provider: r.provider,
    saml_cert: r.saml_cert,
    saml_entrypoint: r.saml_entrypoint,
    saml_issuer: r.saml_issuer,
    tenant_id: r.tenant_id,
    updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

export async function getSsoConfig(organizationId: string): Promise<OrganizationSsoConfig | null> {
  const [rows] = await pool.query<SsoConfigDbRow[]>(
    'SELECT id, organization_id, provider, is_enabled, enforce_sso, client_id, client_secret, tenant_id, saml_entrypoint, saml_issuer, saml_cert, created_at, updated_at FROM organization_sso_configs WHERE organization_id = ? LIMIT 1',
    [organizationId]
  );
  if (!rows.length) return null;
  return mapRowToSsoConfig(rows[0]);
}

export async function getSsoConfigByDomain(rawDomain: string): Promise<{ config: OrganizationSsoConfig; organization: Organization } | null> {
  const domain = rawDomain.trim().toLowerCase().replace(/^@+/, '');
  const [rows] = await pool.query<SsoDomainJoinRow[]>(
    `SELECT s.id, s.organization_id, s.provider, s.is_enabled, s.enforce_sso, s.client_id, s.client_secret,
            s.tenant_id, s.saml_entrypoint, s.saml_issuer, s.saml_cert, s.created_at, s.updated_at,
            o.name AS org_name, o.slug AS org_slug, o.owner_id AS org_owner_id,
            o.seat_limit AS org_seat_limit, o.subscription_status AS org_subscription_status
     FROM organization_domains d
     INNER JOIN organizations o ON d.organization_id = o.id
     INNER JOIN organization_sso_configs s ON o.id = s.organization_id
     WHERE d.domain = ? AND d.is_verified = 1 AND s.is_enabled = 1 AND o.subscription_status = 'active'
     LIMIT 1`,
    [domain]
  );

  if (!rows.length) return null;

  const r = rows[0];
  return {
    config: mapRowToSsoConfig(r),
    organization: {
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      id: r.organization_id,
      name: r.org_name,
      owner_id: r.org_owner_id,
      seat_limit: r.org_seat_limit,
      slug: r.org_slug,
      subscription_status: r.org_subscription_status,
      updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    },
  };
}

export async function lookupSsoByEmail(email: string): Promise<SsoLookupResult> {
  const cleanEmail = (email || '').trim().toLowerCase();
  const atIdx = cleanEmail.indexOf('@');
  if (atIdx === -1) {
    return {
      enforceSso: false,
      hasSso: false,
      organizationId: '',
      organizationName: '',
      provider: 'google',
    };
  }

  const domain = cleanEmail.substring(atIdx + 1);
  const found = await getSsoConfigByDomain(domain);

  if (!found) {
    return {
      enforceSso: false,
      hasSso: false,
      organizationId: '',
      organizationName: '',
      provider: 'google',
    };
  }

  return {
    enforceSso: found.config.enforce_sso,
    hasSso: true,
    organizationId: found.organization.id,
    organizationName: found.organization.name,
    provider: found.config.provider,
  };
}

export async function configureSso(dto: ConfigureSsoDto): Promise<OrganizationSsoConfig> {
  const org = await getOrganizationById(dto.organizationId);
  if (!org) {
    throw new Error('ORGANIZATION_NOT_FOUND');
  }

  const isEnabled = dto.isEnabled ?? true;
  const enforceSso = dto.enforceSso ?? false;
  const clientId = dto.clientId?.trim() || null;
  const clientSecret = dto.clientSecret?.trim() || null;
  const tenantId = dto.tenantId?.trim() || null;
  const samlEntrypoint = dto.samlEntrypoint?.trim() || null;
  const samlIssuer = dto.samlIssuer?.trim() || null;
  const samlCert = dto.samlCert?.trim() || null;

  const [existing] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM organization_sso_configs WHERE organization_id = ? LIMIT 1',
    [dto.organizationId]
  );

  if (existing.length > 0) {
    await pool.execute(
      `UPDATE organization_sso_configs
       SET provider = ?, is_enabled = ?, enforce_sso = ?, client_id = ?, client_secret = ?,
           tenant_id = ?, saml_entrypoint = ?, saml_issuer = ?, saml_cert = ?
       WHERE organization_id = ?`,
      [dto.provider, isEnabled ? 1 : 0, enforceSso ? 1 : 0, clientId, clientSecret, tenantId, samlEntrypoint, samlIssuer, samlCert, dto.organizationId]
    );
  } else {
    const id = randomUUID();
    await pool.execute(
      `INSERT INTO organization_sso_configs
       (id, organization_id, provider, is_enabled, enforce_sso, client_id, client_secret, tenant_id, saml_entrypoint, saml_issuer, saml_cert)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, dto.organizationId, dto.provider, isEnabled ? 1 : 0, enforceSso ? 1 : 0, clientId, clientSecret, tenantId, samlEntrypoint, samlIssuer, samlCert]
    );
  }

  logger.db.info('Configuración de SSO guardada para la organización', {
    enforceSso,
    isEnabled,
    organizationId: dto.organizationId,
    provider: dto.provider,
  });

  const updated = await getSsoConfig(dto.organizationId);
  if (!updated) {
    throw new Error('Error al recuperar configuración de SSO');
  }
  return updated;
}

export async function buildSsoAuthorizeUrl(params: {
  baseUrl: string;
  config: OrganizationSsoConfig;
  domain: string;
  host?: string;
  state: string;
}): Promise<string> {
  const { baseUrl, config, domain, state } = params;
  const callbackUrl = `${baseUrl.replace(/\/+$/, '')}/api/auth/sso/callback`;

  if (config.provider === 'azure') {
    const tenant = config.tenant_id || 'common';
    const clientId = config.client_id || '';
    const q = new URLSearchParams({
      client_id: clientId,
      prompt: 'select_account',
      redirect_uri: callbackUrl,
      response_mode: 'query',
      response_type: 'code',
      scope: 'openid profile email',
      state,
    });
    return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${q.toString()}`;
  }

  if (config.provider === 'google') {
    const clientId = config.client_id || '';
    const qParams: Record<string, string> = {
      access_type: 'online',
      client_id: clientId,
      prompt: 'select_account',
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid profile email',
      state,
    };
    if (domain && domain !== 'gmail.com' && domain !== 'googlemail.com') {
      qParams.hd = domain;
    }
    const q = new URLSearchParams(qParams);
    return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
  }

  if (config.provider === 'saml' && config.saml_entrypoint) {
    const cleanCert = (config.saml_cert || '').replace(/\\n/g, '\n').trim() || 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA';
    const saml = new SAML({
      callbackUrl: `${baseUrl.replace(/\/+$/, '')}/api/auth/sso/saml/callback`,
      entryPoint: config.saml_entrypoint,
      idpCert: cleanCert,
      issuer: config.saml_issuer || `${baseUrl.replace(/\/+$/, '')}/api/auth/sso/saml/metadata`,
    });
    return await saml.getAuthorizeUrlAsync(state, params.host || 'localhost', {});
  }

  throw new Error('Configuración de SSO incompleta o proveedor no soportado');
}

export async function processSsoLoginSuccess(params: {
  email: string;
  name?: string;
  organizationId: string;
}): Promise<{ id: string; role: string; username: string }> {
  const { email, name, organizationId } = params;
  const cleanEmail = email.trim().toLowerCase();

  const [existingUserRows] = await pool.query<RowDataPacket[]>(
    'SELECT id, username, email, role, subscription_tier FROM users WHERE email = ? LIMIT 1',
    [cleanEmail]
  );

  let userId: string;
  let username: string;
  let role: string;

  if (existingUserRows.length > 0) {
    const u = existingUserRows[0];
    userId = u.id;
    username = u.username;
    role = u.role;
  } else {
    userId = randomUUID();
    const baseName = (name || cleanEmail.split('@')[0]).replace(/[^\w]/g, '_').toLowerCase();
    username = `${baseName}_${Math.random().toString(36).substring(2, 6)}`;
    role = 'ORG_MEMBER';

    await pool.execute(
      'INSERT INTO users (id, username, email, role, subscription_tier) VALUES (?, ?, ?, ?, ?)',
      [userId, username, cleanEmail, role, 'enterprise']
    );

    await pool.execute(
      'INSERT INTO user_preferences (user_id) VALUES (?)',
      [userId]
    );
  }

  try {
    await addMemberToOrganization({
      email: cleanEmail,
      organizationId,
      role: 'ORG_MEMBER',
    });
  } catch (err: any) {
    if (err?.message !== 'ALREADY_MEMBER') {
      logger.app.warn('No se pudo asociar miembro a organización durante login SSO', {
        error: err?.message,
        organizationId,
        userId,
      });
    }
  }

  const [orgRows] = await pool.query<RowDataPacket[]>(
    'SELECT id, name, org_type FROM organizations WHERE id = ? LIMIT 1',
    [organizationId]
  );
  if (orgRows.length > 0 && orgRows[0].org_type === 'education') {
    await pool.execute(
      'UPDATE users SET subscription_tier = ?, subscription_origin = ?, is_student = TRUE, subscription_status = ?, subscription_period_end = DATE_ADD(NOW(), INTERVAL 1 YEAR) WHERE id = ?',
      ['pro', 'education', 'active', userId]
    );

    const verificationId = randomUUID();
    const docUrl = `campus_sso:${cleanEmail}`;
    await pool.execute(
      'INSERT IGNORE INTO student_verifications (id, user_id, full_name, school_name, document_url, status, admin_notes, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
      [verificationId, userId, cleanEmail, orgRows[0].name, docUrl, 'approved', 'Auto-aprobado mediante Campus SSO Institucional']
    );

    logger.security.info('Usuario activado con Pro Educativo mediante Campus SSO', {
      email: cleanEmail,
      schoolName: orgRows[0].name,
      userId,
    });
  }

  return { id: userId, role, username };
}
