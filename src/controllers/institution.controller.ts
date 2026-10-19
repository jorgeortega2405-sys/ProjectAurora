import { createInstitutionInquiry } from '../services/institution.service.js';
import { logger } from '../services/logger.service.js';
import { Request, Response } from 'express';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitInstitutionInquiryHandler(req: Request, res: Response): Promise<void> {
  try {
    const { contactEmail, contactName, contactRole, countryCity, estimatedStudents, message, phone, schoolName, websiteDomain } = req.body || {};

    if (typeof schoolName !== 'string' || schoolName.trim().length < 2) {
      res.status(400).json({ error: 'Por favor ingresa el nombre de la institución educativa.', success: false });
      return;
    }

    if (typeof contactName !== 'string' || contactName.trim().length < 2) {
      res.status(400).json({ error: 'Por favor ingresa tu nombre completo.', success: false });
      return;
    }

    if (typeof contactRole !== 'string' || contactRole.trim().length < 2) {
      res.status(400).json({ error: 'Por favor indica tu cargo o rol en la institución.', success: false });
      return;
    }

    if (typeof contactEmail !== 'string' || !EMAIL_REGEX.test(contactEmail.trim())) {
      res.status(400).json({ error: 'Por favor ingresa un correo electrónico institucional válido.', success: false });
      return;
    }

    if (typeof estimatedStudents !== 'string' || estimatedStudents.trim().length === 0) {
      res.status(400).json({ error: 'Por favor selecciona el rango estimado de alumnos o docentes.', success: false });
      return;
    }

    if (typeof countryCity !== 'string' || countryCity.trim().length < 2) {
      res.status(400).json({ error: 'Por favor indica la ciudad y país de la institución.', success: false });
      return;
    }

    if (typeof message !== 'string' || message.trim().length < 10) {
      res.status(400).json({ error: 'Por favor escribe un mensaje de al menos 10 caracteres describiendo tus necesidades.', success: false });
      return;
    }

    await createInstitutionInquiry({
      contactEmail,
      contactName,
      contactRole,
      countryCity,
      estimatedStudents,
      message,
      phone: typeof phone === 'string' ? phone : undefined,
      schoolName,
      websiteDomain: typeof websiteDomain === 'string' ? websiteDomain : undefined,
    });

    res.status(201).json({
      message: 'Solicitud institucional registrada exitosamente. Nuestro equipo se pondrá en contacto a la brevedad.',
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al procesar solicitud institucional', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}
