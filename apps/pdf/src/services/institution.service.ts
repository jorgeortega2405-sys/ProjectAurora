import { pool } from '../config/database.config.js';
import { logger } from './logger.service.js';
import { randomUUID } from 'crypto';
import type { RowDataPacket } from 'mysql2';

export interface CreateInstitutionInquiryDto {
  contactEmail: string;
  contactName: string;
  contactRole: string;
  countryCity: string;
  estimatedStudents: string;
  message: string;
  phone?: string;
  schoolName: string;
  websiteDomain?: string;
}

export interface InstitutionInquiryRecord {
  admin_notes: string | null;
  contact_email: string;
  contact_name: string;
  contact_role: string;
  country_city: string;
  created_at: string;
  estimated_students: string;
  id: string;
  message: string;
  phone: string | null;
  school_name: string;
  status: 'pending' | 'contacted' | 'partner_approved' | 'rejected';
  updated_at: string;
  website_domain: string | null;
}

interface InquiryDbRow extends RowDataPacket {
  admin_notes: string | null;
  contact_email: string;
  contact_name: string;
  contact_role: string;
  country_city: string;
  created_at: Date | string;
  estimated_students: string;
  id: string;
  message: string;
  phone: string | null;
  school_name: string;
  status: 'pending' | 'contacted' | 'partner_approved' | 'rejected';
  updated_at: Date | string;
  website_domain: string | null;
}

function mapRowToInquiry(row: InquiryDbRow): InstitutionInquiryRecord {
  return {
    admin_notes: row.admin_notes,
    contact_email: row.contact_email,
    contact_name: row.contact_name,
    contact_role: row.contact_role,
    country_city: row.country_city,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    estimated_students: row.estimated_students,
    id: row.id,
    message: row.message,
    phone: row.phone,
    school_name: row.school_name,
    status: row.status,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    website_domain: row.website_domain,
  };
}

export async function createInstitutionInquiry(dto: CreateInstitutionInquiryDto): Promise<{ id: string }> {
  const id = randomUUID();
  const schoolName = dto.schoolName.trim();
  const websiteDomain = dto.websiteDomain ? dto.websiteDomain.trim().toLowerCase() : null;
  const contactName = dto.contactName.trim();
  const contactRole = dto.contactRole.trim();
  const contactEmail = dto.contactEmail.trim().toLowerCase();
  const phone = dto.phone ? dto.phone.trim() : null;
  const estimatedStudents = dto.estimatedStudents.trim();
  const countryCity = dto.countryCity.trim();
  const message = dto.message.trim();

  try {
    await pool.execute(
      'INSERT INTO institution_inquiries (id, school_name, website_domain, contact_name, contact_role, contact_email, phone, estimated_students, country_city, message, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, schoolName, websiteDomain, contactName, contactRole, contactEmail, phone, estimatedStudents, countryCity, message, 'pending']
    );

    logger.db.info('Solicitud de convenio institucional registrada en MySQL', {
      contactEmail,
      id,
      schoolName,
    });

    return { id };
  } catch (err) {
    logger.db.error('Error al insertar solicitud institucional en base de datos', err);
    throw new Error('Database insert failed');
  }
}

export async function getPendingInstitutionInquiries(): Promise<InstitutionInquiryRecord[]> {
  const [rows] = await pool.query<InquiryDbRow[]>(
    'SELECT * FROM institution_inquiries WHERE status = ? ORDER BY created_at ASC',
    ['pending']
  );
  return rows.map(mapRowToInquiry);
}

export async function updateInstitutionInquiryStatus(
  id: string,
  status: 'contacted' | 'partner_approved' | 'rejected',
  notes?: string
): Promise<boolean> {
  const [result] = await pool.execute(
    'UPDATE institution_inquiries SET status = ?, admin_notes = ? WHERE id = ?',
    [status, notes || null, id]
  );
  const affected = (result as any).affectedRows;
  logger.db.info('Estado de solicitud institucional actualizado', { affected, id, status });
  return affected > 0;
}
