import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { ensureBucketExists, isS3Configured, S3_BUCKET_NAME, s3Client } from '../config/s3.config.js';
import { addAccountToSession, getCurrentUser } from '../services/auth.service.js';
import { activateInstantEducationalPro, checkEducationalDomain, createStudentVerification, getLatestStudentVerification, requestInstitutionalEmailOtp, verifyInstitutionalEmailOtp } from '../services/education.service.js';
import { logger } from '../services/logger.service.js';
import { isUserInBusinessOrganization } from '../services/organization.service.js';
import { getUserEffectivePermissions, hasPermission } from '../services/pbac.service.js';
import { findUserById, sanitizeUser } from '../services/user.service.js';

const VERIFICATIONS_DIR = path.resolve(process.cwd(), 'public/uploads/student_verifications');
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function isUserDisqualifiedFromEducation(user: { id: string; role?: string; subscription_status?: string; subscription_tier?: string }): Promise<boolean> {
  const permissions = await getUserEffectivePermissions(user);
  if (hasPermission(permissions, 'subscription:feature:enterprise')) {
    return true;
  }
  return isUserInBusinessOrganization(user.id);
}

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

    const isBusiness = await isUserDisqualifiedFromEducation(currentUser);
    if (isBusiness) {
      res.status(403).json({
        error: 'Las cuentas vinculadas a organizaciones empresariales o corporativas no son elegibles para bonificaciones educativas individuales.',
        success: false,
      });
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

    if (isS3Configured()) {
      try {
        await ensureBucketExists();
        await s3Client.send(
          new PutObjectCommand({
            Body: req.file.buffer,
            Bucket: S3_BUCKET_NAME,
            ContentType: req.file.mimetype,
            Key: `student_verifications/${fileName}`,
          })
        );
      } catch (s3Err) {
        logger.db.warn('Error al subir verificación estudiantil a S3/MinIO', s3Err);
      }
    }

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

    const isBusiness = await isUserDisqualifiedFromEducation(currentUser);
    if (isBusiness) {
      res.status(200).json({
        eligibleDomain: '',
        eligibleSchoolName: '',
        isBusinessAccount: true,
        isEligibleInstant: false,
        isStudent: false,
        subscriptionOrigin: currentUser.subscription_origin || 'business',
        subscriptionTier: currentUser.subscription_tier || 'enterprise',
        success: true,
        verification: null,
      });
      return;
    }

    const verification = await getLatestStudentVerification(currentUser.id);
    const domainCheck = await checkEducationalDomain(currentUser.email);
    const permissions = await getUserEffectivePermissions(currentUser);
    const isPro = hasPermission(permissions, 'subscription:feature:pro');
    const isEligibleInstant = !isPro && domainCheck.isPartner;

    res.status(200).json({
      eligibleDomain: domainCheck.domain,
      eligibleSchoolName: domainCheck.schoolName,
      isEligibleInstant,
      isStudent: Boolean(currentUser.is_student),
      subscriptionOrigin: currentUser.subscription_origin || 'payment',
      subscriptionTier: currentUser.subscription_tier || 'free',
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

export async function claimInstantStudentProHandler(req: Request, res: Response): Promise<void> {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Debes iniciar sesión para activar el beneficio educativo.', success: false });
      return;
    }

    const isBusiness = await isUserDisqualifiedFromEducation(currentUser);
    if (isBusiness) {
      res.status(403).json({
        error: 'Las cuentas asociadas a organizaciones empresariales no son elegibles para bonificaciones educativas individuales.',
        success: false,
      });
      return;
    }

    const permissions = await getUserEffectivePermissions(currentUser);
    if (hasPermission(permissions, 'subscription:feature:pro') && currentUser.subscription_status === 'active') {
      res.status(400).json({ error: 'Tu cuenta ya cuenta con una suscripción Pro activa.', success: false });
      return;
    }

    const domainCheck = await checkEducationalDomain(currentUser.email);
    if (!domainCheck.isPartner) {
      res.status(400).json({
        error: 'El correo principal de tu cuenta no pertenece a un dominio educativo o institución acreditada.',
        success: false,
      });
      return;
    }

    const latest = await getLatestStudentVerification(currentUser.id);
    if (latest && latest.status === 'approved') {
      const approvedDate = new Date(latest.created_at).getTime();
      const elevenMonthsAgo = Date.now() - (11 * 30 * 24 * 60 * 60 * 1000);
      if (approvedDate > elevenMonthsAgo) {
        res.status(400).json({
          error: 'Tu cuenta ya cuenta con una acreditación estudiantil vigente para este ciclo escolar.',
          success: false,
        });
        return;
      }
    }

    const result = await activateInstantEducationalPro(currentUser.id, currentUser.email, domainCheck.schoolName);

    const freshUser = await findUserById(currentUser.id);
    if (freshUser) {
      const sanitized = sanitizeUser(freshUser);
      sanitized.permissions = await getUserEffectivePermissions(freshUser);
      await addAccountToSession(res, req, sanitized);
    }

    res.status(200).json({
      message: `¡Felicidades! Se ha activado 1 año de Spriteboard Pro Estudiantil en tu cuenta (${result.schoolName}).`,
      schoolName: result.schoolName,
      subscriptionTier: 'pro',
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al activar Pro Estudiantil instantáneo', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al activar el plan estudiantil. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function checkEducationalEmailHandler(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body || {};

    if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      res.status(400).json({ error: 'Por favor ingresa un correo electrónico válido.', success: false });
      return;
    }

    const result = await checkEducationalDomain(email);

    res.status(200).json({
      domain: result.domain,
      isPartner: result.isPartner,
      schoolName: result.schoolName,
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al verificar dominio educativo', error);
    res.status(500).json({
      error: 'Ha ocurrido un error al consultar el dominio educativo.',
      success: false,
    });
  }
}

export async function requestEducationalOtpHandler(req: Request, res: Response): Promise<void> {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Debes iniciar sesión para solicitar la activación.', success: false });
      return;
    }

    const isBusiness = await isUserDisqualifiedFromEducation(currentUser);
    if (isBusiness) {
      res.status(403).json({
        error: 'Las cuentas vinculadas a empresas o planes corporativos no pueden activar licencias educativas individuales.',
        success: false,
      });
      return;
    }

    const { email } = req.body || {};

    if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      res.status(400).json({ error: 'Por favor ingresa un correo electrónico institucional válido.', success: false });
      return;
    }

    const result = await requestInstitutionalEmailOtp(currentUser.id, email);

    res.status(200).json({
      domain: result.domain,
      message: `Hemos enviado un código de 6 dígitos a ${email}. Por favor revisa tu bandeja de entrada o spam.`,
      schoolName: result.schoolName,
      success: true,
    });
  } catch (error: any) {
    logger.app.warn('Fallo al solicitar OTP educativo:', error?.message);
    const safeErrors = [
      'El correo ingresado no pertenece a un dominio educativo o institución en convenio.',
      'Usuario no encontrado.',
    ];
    let clientMsg = 'No se pudo enviar el código de verificación al correo indicado.';
    if (typeof error?.message === 'string') {
      if (safeErrors.includes(error.message) || error.message.startsWith('Por favor espera')) {
        clientMsg = error.message;
      }
    }
    res.status(400).json({
      error: clientMsg,
      success: false,
    });
  }
}

export async function verifyEducationalOtpHandler(req: Request, res: Response): Promise<void> {
  try {
    const currentUser = getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Debes iniciar sesión para completar la verificación.', success: false });
      return;
    }

    const isBusiness = await isUserDisqualifiedFromEducation(currentUser);
    if (isBusiness) {
      res.status(403).json({
        error: 'Las cuentas corporativas no son elegibles para bonificaciones educativas.',
        success: false,
      });
      return;
    }

    const { code } = req.body || {};

    if (typeof code !== 'string' || code.trim().length !== 6) {
      res.status(400).json({ error: 'Por favor ingresa el código de 6 dígitos enviado a tu correo institucional.', success: false });
      return;
    }

    const result = await verifyEducationalOtpAndActivate(currentUser.id, code);

    res.status(200).json({
      message: `¡Felicidades! Se ha activado 1 año de Aurora Pro Educativo en tu cuenta (${result.schoolName}).`,
      schoolName: result.schoolName,
      success: true,
    });
  } catch (error: any) {
    logger.app.warn('Fallo al verificar OTP educativo:', error?.message);
    const safeErrors = [
      'El código ha expirado o no se ha solicitado ninguna verificación.',
      'El código ha expirado. Por favor solicita uno nuevo.',
      'Has superado el número máximo de intentos. Solicita un nuevo código.',
      'El código de verificación es incorrecto.',
    ];
    const clientMsg = typeof error?.message === 'string' && safeErrors.includes(error.message)
      ? error.message
      : 'Código inválido o expirado. Por favor intenta de nuevo.';
    res.status(400).json({
      error: clientMsg,
      success: false,
    });
  }
}

async function verifyEducationalOtpAndActivate(userId: string, code: string) {
  return verifyInstitutionalEmailOtp(userId, code);
}
