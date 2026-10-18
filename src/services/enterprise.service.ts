import { pool } from '../config/database.config.js';
import { logger } from './logger.service.js';
import { randomUUID } from 'crypto';

export interface CreateEnterpriseInquiryDto {
  company: string;
  email: string;
  firstName: string;
  lastName: string;
  message: string;
}

export interface EnterpriseInquiryResult {
  id: string;
}

export async function createEnterpriseInquiry(dto: CreateEnterpriseInquiryDto): Promise<EnterpriseInquiryResult> {
  const id = randomUUID();
  const firstName = dto.firstName.trim();
  const lastName = dto.lastName.trim();
  const company = dto.company.trim();
  const email = dto.email.trim().toLowerCase();
  const message = dto.message.trim();

  try {
    await pool.execute(
      'INSERT INTO enterprise_inquiries (id, first_name, last_name, company, email, message) VALUES (?, ?, ?, ?, ?, ?)',
      [id, firstName, lastName, company, email, message]
    );

    logger.db.info('Solicitud de contacto empresarial registrada en base de datos', {
      company,
      email,
      id,
    });

    return { id };
  } catch (err) {
    logger.db.error('Error al insertar solicitud empresarial en MySQL', err);
    throw new Error('Database insert failed');
  }
}
