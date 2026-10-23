import { createEnterpriseInquiry } from '../services/enterprise.service.js';
import { logger } from '../services/logger.service.js';
import { Request, Response } from 'express';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createEnterpriseInquiryHandler(req: Request, res: Response): Promise<void> {
  try {
    const { company, email, firstName, lastName, message } = req.body || {};

    if (typeof firstName !== 'string' || firstName.trim().length < 2) {
      res.status(400).json({ error: 'Por favor ingresa un nombre válido.', success: false });
      return;
    }

    if (typeof lastName !== 'string' || lastName.trim().length < 2) {
      res.status(400).json({ error: 'Por favor ingresa tus apellidos.', success: false });
      return;
    }

    if (typeof company !== 'string' || company.trim().length < 2) {
      res.status(400).json({ error: 'Por favor ingresa el nombre de tu empresa.', success: false });
      return;
    }

    if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      res.status(400).json({ error: 'Por favor ingresa un correo electrónico corporativo válido.', success: false });
      return;
    }

    if (typeof message !== 'string' || message.trim().length < 10) {
      res.status(400).json({ error: 'Por favor escribe un mensaje de al menos 10 caracteres.', success: false });
      return;
    }

    await createEnterpriseInquiry({
      company,
      email,
      firstName,
      lastName,
      message,
    });

    res.status(201).json({
      message: 'Solicitud empresarial registrada correctamente.',
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al procesar solicitud empresarial', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}
