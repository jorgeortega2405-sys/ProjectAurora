import { pool } from '../config/database.config.js';
import { AddMemberDto, CreateOrganizationDto, Organization, OrganizationDomain, OrganizationMember } from '../types/enterprise.types.js';
import { logger } from './logger.service.js';
import { randomUUID } from 'crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

interface OrgDbRow extends RowDataPacket {
  created_at: Date | string;
  id: string;
  name: string;
  org_type: 'business' | 'education';
  owner_id: string;
  seat_limit: number;
  slug: string;
  subscription_status: 'active' | 'trial' | 'past_due' | 'suspended';
  updated_at: Date | string;
}

interface MemberDbRow extends RowDataPacket {
  created_at: Date | string;
  email: string;
  id: string;
  organization_id: string;
  role: string;
  status: 'active' | 'invited' | 'suspended';
  updated_at: Date | string;
  user_id: string;
  username: string;
}

interface CountDbRow extends RowDataPacket {
  total: number;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function createOrganization(dto: CreateOrganizationDto): Promise<Organization> {
  const id = randomUUID();
  const name = dto.name.trim();
  const baseSlug = slugify(dto.slug || name) || `org-${Date.now()}`;
  let slug = baseSlug;
  const ownerId = dto.ownerId;
  const seatLimit = typeof dto.seatLimit === 'number' && dto.seatLimit > 0 ? dto.seatLimit : 5;
  const orgType = dto.orgType || 'business';

  const [existingSlugs] = await pool.query<OrgDbRow[]>(
    'SELECT id FROM organizations WHERE slug = ? LIMIT 1',
    [slug]
  );
  if (existingSlugs.length > 0) {
    slug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      'INSERT INTO organizations (id, name, slug, owner_id, seat_limit, org_type, subscription_status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, name, slug, ownerId, seatLimit, orgType, 'active']
    );

    const memberId = randomUUID();
    await conn.execute(
      'INSERT INTO organization_members (id, organization_id, user_id, role, status) VALUES (?, ?, ?, ?, ?)',
      [memberId, id, ownerId, 'ORG_OWNER', 'active']
    );

    await conn.execute(
      'UPDATE users SET role = ? WHERE id = ? AND role != ?',
      ['ORG_OWNER', ownerId, 'ADMIN']
    );

    if (dto.domain) {
      const cleanDomain = dto.domain.trim().toLowerCase().replace(/^@+/, '');
      if (cleanDomain.includes('.')) {
        const domainId = randomUUID();
        await conn.execute(
          'INSERT IGNORE INTO organization_domains (id, organization_id, domain, is_verified) VALUES (?, ?, ?, ?)',
          [domainId, id, cleanDomain, 1]
        );
      }
    }

    await conn.commit();

    logger.db.info('Organización creada exitosamente', {
      id,
      name,
      orgType,
      ownerId,
      seatLimit,
      slug,
    });

    const created = await getOrganizationById(id);
    if (!created) {
      throw new Error('Error al recuperar la organización creada');
    }
    return created;
  } catch (err) {
    await conn.rollback();
    logger.db.error('Error al crear organización en base de datos', err);
    throw err;
  } finally {
    conn.release();
  }
}

export async function getOrganizationById(id: string): Promise<Organization | null> {
  const [rows] = await pool.query<OrgDbRow[]>(
    'SELECT id, name, slug, owner_id, seat_limit, org_type, subscription_status, created_at, updated_at FROM organizations WHERE id = ? LIMIT 1',
    [id]
  );
  if (!rows.length) return null;

  const r = rows[0];
  return {
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    id: r.id,
    name: r.name,
    org_type: r.org_type || 'business',
    owner_id: r.owner_id,
    seat_limit: r.seat_limit,
    slug: r.slug,
    subscription_status: r.subscription_status,
    updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

export async function getOrganizationBySlug(slug: string): Promise<Organization | null> {
  const [rows] = await pool.query<OrgDbRow[]>(
    'SELECT id, name, slug, owner_id, seat_limit, org_type, subscription_status, created_at, updated_at FROM organizations WHERE slug = ? LIMIT 1',
    [slug]
  );
  if (!rows.length) return null;

  const r = rows[0];
  return {
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    id: r.id,
    name: r.name,
    org_type: r.org_type || 'business',
    owner_id: r.owner_id,
    seat_limit: r.seat_limit,
    slug: r.slug,
    subscription_status: r.subscription_status,
    updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

export async function getUserOrganization(userId: string): Promise<{ memberRole: string; organization: Organization } | null> {
  const [rows] = await pool.query<(OrgDbRow & { member_role: string })[]>(
    `SELECT o.id, o.name, o.slug, o.owner_id, o.seat_limit, o.org_type, o.subscription_status, o.created_at, o.updated_at, m.role AS member_role
     FROM organization_members m
     INNER JOIN organizations o ON m.organization_id = o.id
     WHERE m.user_id = ? AND m.status = 'active'
     LIMIT 1`,
    [userId]
  );
  if (!rows.length) return null;

  const r = rows[0];
  return {
    memberRole: r.member_role,
    organization: {
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      id: r.id,
      name: r.name,
      org_type: r.org_type || 'business',
      owner_id: r.owner_id,
      seat_limit: r.seat_limit,
      slug: r.slug,
      subscription_status: r.subscription_status,
      updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    },
  };
}

export async function isUserInBusinessOrganization(userId: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT o.id FROM organization_members m
     INNER JOIN organizations o ON m.organization_id = o.id
     WHERE m.user_id = ? AND m.status = 'active' AND o.org_type = 'business' AND o.subscription_status = 'active'
     LIMIT 1`,
    [userId]
  );
  return rows.length > 0;
}

export async function createCampusOrganizationFromInquiry(params: {
  inquiryId: string;
  ownerUserId: string;
  seatLimit?: number;
}): Promise<Organization> {
  const [inquiryRows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM institution_inquiries WHERE id = ? LIMIT 1',
    [params.inquiryId]
  );
  if (!inquiryRows.length) {
    throw new Error('Solicitud institucional no encontrada');
  }
  const inquiry = inquiryRows[0];
  const seatLimit = params.seatLimit || 1000;

  const org = await createOrganization({
    domain: inquiry.website_domain || undefined,
    name: inquiry.school_name,
    orgType: 'education',
    ownerId: params.ownerUserId,
    seatLimit,
  });

  if (inquiry.website_domain) {
    const domain = inquiry.website_domain.trim().toLowerCase().replace(/^@+/, '');
    await pool.execute(
      'INSERT IGNORE INTO educational_partner_domains (id, school_name, domain, is_active) VALUES (UUID(), ?, ?, 1)',
      [inquiry.school_name, domain]
    );
  }

  await pool.execute(
    'UPDATE institution_inquiries SET status = ? WHERE id = ?',
    ['partner_approved', params.inquiryId]
  );

  await pool.execute(
    'UPDATE users SET subscription_tier = ?, subscription_origin = ?, is_student = TRUE, subscription_status = ?, subscription_period_end = DATE_ADD(NOW(), INTERVAL 1 YEAR) WHERE id = ?',
    ['enterprise', 'education', 'active', params.ownerUserId]
  );

  logger.db.info('Campus educativo Enterprise creado a partir de solicitud', {
    inquiryId: params.inquiryId,
    orgId: org.id,
    seatLimit,
  });

  return org;
}


export async function countActiveMembers(organizationId: string): Promise<number> {
  const [rows] = await pool.query<CountDbRow[]>(
    "SELECT COUNT(*) AS total FROM organization_members WHERE organization_id = ? AND status = 'active'",
    [organizationId]
  );
  return rows[0]?.total ?? 0;
}

export async function listOrganizationMembers(organizationId: string): Promise<OrganizationMember[]> {
  const [rows] = await pool.query<MemberDbRow[]>(
    `SELECT m.id, m.organization_id, m.user_id, m.role, m.status, m.created_at, m.updated_at, u.email, u.username
     FROM organization_members m
     INNER JOIN users u ON m.user_id = u.id
     WHERE m.organization_id = ?
     ORDER BY m.created_at ASC`,
    [organizationId]
  );

  return rows.map((r) => ({
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    email: r.email,
    id: r.id,
    organization_id: r.organization_id,
    role: r.role,
    status: r.status,
    updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    user_id: r.user_id,
    username: r.username,
  }));
}

export async function addMemberToOrganization(dto: AddMemberDto): Promise<OrganizationMember> {
  const org = await getOrganizationById(dto.organizationId);
  if (!org) {
    throw new Error('ORGANIZATION_NOT_FOUND');
  }

  const activeCount = await countActiveMembers(dto.organizationId);
  if (activeCount >= org.seat_limit) {
    throw new Error('SEAT_LIMIT_REACHED');
  }

  const email = dto.email.trim().toLowerCase();
  const [userRows] = await pool.query<RowDataPacket[]>(
    'SELECT id, username, email FROM users WHERE email = ? LIMIT 1',
    [email]
  );

  let targetUserId: string;
  let targetUsername: string;

  if (userRows.length > 0) {
    targetUserId = userRows[0].id;
    targetUsername = userRows[0].username;
  } else {
    targetUserId = randomUUID();
    targetUsername = email.split('@')[0].replace(/[^\w]/g, '_') + '_' + Math.random().toString(36).substring(2, 6);
    await pool.execute(
      'INSERT INTO users (id, username, email, role, subscription_tier) VALUES (?, ?, ?, ?, ?)',
      [targetUserId, targetUsername, email, 'ORG_MEMBER', 'enterprise']
    );
  }

  const [existingMember] = await pool.query<RowDataPacket[]>(
    'SELECT id, status FROM organization_members WHERE organization_id = ? AND user_id = ? LIMIT 1',
    [dto.organizationId, targetUserId]
  );

  if (existingMember.length > 0) {
    if (existingMember[0].status === 'active') {
      throw new Error('ALREADY_MEMBER');
    }
    await pool.execute(
      "UPDATE organization_members SET status = 'active', role = ? WHERE id = ?",
      [dto.role || 'ORG_MEMBER', existingMember[0].id]
    );
    return {
      created_at: new Date().toISOString(),
      email,
      id: existingMember[0].id,
      organization_id: dto.organizationId,
      role: dto.role || 'ORG_MEMBER',
      status: 'active',
      updated_at: new Date().toISOString(),
      user_id: targetUserId,
      username: targetUsername,
    };
  }

  const memberId = randomUUID();
  const role = dto.role || 'ORG_MEMBER';
  await pool.execute(
    'INSERT INTO organization_members (id, organization_id, user_id, role, status) VALUES (?, ?, ?, ?, ?)',
    [memberId, dto.organizationId, targetUserId, role, 'active']
  );

  logger.db.info('Miembro añadido a la organización', {
    email,
    memberId,
    organizationId: dto.organizationId,
    role,
    userId: targetUserId,
  });

  return {
    created_at: new Date().toISOString(),
    email,
    id: memberId,
    organization_id: dto.organizationId,
    role,
    status: 'active',
    updated_at: new Date().toISOString(),
    user_id: targetUserId,
    username: targetUsername,
  };
}

export async function removeMemberFromOrganization(organizationId: string, memberId: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id, user_id, role FROM organization_members WHERE id = ? AND organization_id = ? LIMIT 1',
    [memberId, organizationId]
  );
  if (!rows.length) return false;

  const member = rows[0];
  if (member.role === 'ORG_OWNER') {
    throw new Error('CANNOT_REMOVE_OWNER');
  }

  await pool.execute(
    'DELETE FROM organization_members WHERE id = ?',
    [memberId]
  );

  logger.db.info('Miembro removido de la organización', {
    memberId,
    organizationId,
    userId: member.user_id,
  });

  return true;
}

export async function addOrganizationDomain(organizationId: string, rawDomain: string): Promise<string> {
  const domain = rawDomain.trim().toLowerCase().replace(/^@+/, '');
  if (!domain || !domain.includes('.')) {
    throw new Error('INVALID_DOMAIN');
  }

  const [existing] = await pool.query<RowDataPacket[]>(
    'SELECT id, organization_id FROM organization_domains WHERE domain = ? LIMIT 1',
    [domain]
  );
  if (existing.length > 0) {
    if (existing[0].organization_id === organizationId) return existing[0].id;
    throw new Error('DOMAIN_ALREADY_REGISTERED');
  }

  const id = randomUUID();
  await pool.execute(
    'INSERT INTO organization_domains (id, organization_id, domain, is_verified) VALUES (?, ?, ?, 1)',
    [id, organizationId, domain]
  );

  logger.db.info('Dominio corporativo vinculado a organización', {
    domain,
    id,
    organizationId,
  });

  return id;
}

export async function getOrganizationByDomain(rawDomain: string): Promise<Organization | null> {
  const domain = rawDomain.trim().toLowerCase().replace(/^@+/, '');
  const [rows] = await pool.query<OrgDbRow[]>(
    `SELECT o.id, o.name, o.slug, o.owner_id, o.seat_limit, o.subscription_status, o.created_at, o.updated_at
     FROM organization_domains d
     INNER JOIN organizations o ON d.organization_id = o.id
     WHERE d.domain = ? AND d.is_verified = 1 AND o.subscription_status = 'active'
     LIMIT 1`,
    [domain]
  );
  if (!rows.length) return null;

  const r = rows[0];
  return {
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    id: r.id,
    name: r.name,
    owner_id: r.owner_id,
    seat_limit: r.seat_limit,
    slug: r.slug,
    subscription_status: r.subscription_status,
    updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

export async function listOrganizationDomains(organizationId: string): Promise<OrganizationDomain[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id, organization_id, domain, is_verified, created_at FROM organization_domains WHERE organization_id = ? ORDER BY created_at ASC',
    [organizationId]
  );
  return rows.map((r) => ({
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    domain: r.domain,
    id: r.id,
    is_verified: Boolean(r.is_verified),
    organization_id: r.organization_id,
  }));
}

export async function removeOrganizationDomain(organizationId: string, domainId: string): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>(
    'DELETE FROM organization_domains WHERE id = ? AND organization_id = ?',
    [domainId, organizationId]
  );
  logger.db.info('Dominio corporativo eliminado', { domainId, organizationId });
  return result.affectedRows > 0;
}

