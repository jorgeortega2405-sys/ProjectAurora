import { getCurrentUser } from '../services/auth.service.js';
import { createStudentVerification, getLatestStudentVerification } from '../services/education.service.js';
import { logger } from '../services/logger.service.js';
import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const VERIFICATIONS_DIR = path.resolve(process.cwd(), 'public/uploads/student_verifications');

function ensureVerificationsDir(): void {
  if (!fs.existsSync(VERIFICATIONS_DIR)) {
    fs.mkdirSync(VERIFICATIONS_DIR, { recursive: true });
  }
}

export async function submitStudentVerificationHandler(req: Request, res: Response): Promise<void> {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Debes iniciar sesión para verificar tu estado de estudiante.', success: false });
      return;
    }

    const { fullName, schoolName } = req.body || {};

    if (typeof fullName !== 'string' || fullName.trim().length < 3) {
      res.status(400).json({ error: 'Por favor ingresa tu nombre completo válido (mínimo 3 caracteres).', success: false });
      return;
    }

    if (typeof schoolName !== 'string' || schoolName.trim().length < 3) {
      res.status(400).json({ error: 'Por favor ingresa el nombre de tu escuela o universidad (mínimo 3 caracteres).', success: false });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'Por favor adjunta una foto o documento de tu credencial o constancia de estudios.', success: false });
      return;
    }

    const latest = await getLatestStudentVerification(currentUser.id);
    if (latest && latest.status === 'pending') {
      res.status(409).json({ error: 'Ya tienes una solicitud de verificación en revisión. Nuestro equipo la revisará pronto.', success: false });
      return;
    }

    if (latest && latest.status === 'approved') {
      res.status(400).json({ error: 'Tu condición de estudiante ya ha sido verificada y tu cuenta cuenta con los beneficios activos.', success: false });
      return;
    }

    ensureVerificationsDir();

    let ext = 'png';
    if (req.file.mimetype === 'application/pdf') {
      ext = 'pdf';
    } else if (req.file.mimetype === 'image/jpeg' || req.file.mimetype === 'image/jpg') {
      ext = 'jpg';
    } else if (req.file.mimetype === 'image/webp') {
      ext = 'webp';
    }

    const fileName = `student_${currentUser.id}_${Date.now()}.${ext}`;
    const filePath = path.join(VERIFICATIONS_DIR, fileName);
    fs.writeFileSync(filePath, req.file.buffer);

    const documentUrl = `/uploads/student_verifications/${fileName}`;

    const verification = await createStudentVerification({
      documentUrl,
      fullName,
      schoolName,
      userId: currentUser.id,
    });

    res.status(201).json({
      message: 'Tu solicitud de verificación de estudiante ha sido enviada con éxito y se encuentra en revisión.',
      success: true,
      verification,
    });
  } catch (error) {
    logger.app.error('Error al procesar solicitud de verificación estudiantil', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function getStudentVerificationStatusHandler(req: Request, res: Response): Promise<void> {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Sesión no válida o expirada.', success: false });
      return;
    }

    const verification = await getLatestStudentVerification(currentUser.id);

    res.status(200).json({
      has_request: Boolean(verification),
      is_student: Boolean((currentUser as any).is_student),
      status: verification?.status || null,
      success: true,
      verification,
    });
  } catch (error) {
    logger.app.error('Error al consultar estado de verificación estudiantil', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al consultar el estado de verificación.',
      success: false,
    });
  }
}
