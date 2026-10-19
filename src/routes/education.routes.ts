import { checkEducationalEmailHandler, getStudentVerificationStatusHandler, requestEducationalOtpHandler, submitStudentVerificationHandler, verifyEducationalOtpHandler } from '../controllers/education.controller.js';
import { submitInstitutionInquiryHandler } from '../controllers/institution.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';

const router = Router();

const storage = multer.memoryStorage();
const upload = multer({
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato de archivo no compatible. Por favor sube una imagen (PNG, JPG, WEBP) o un documento PDF.'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  storage,
});

function uploadDocumentMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload.single('document')(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'El archivo supera el límite permitido de 10 MB.', success: false });
        return;
      }
      res.status(400).json({ error: 'Error al procesar el archivo adjunto.', success: false });
      return;
    } else if (err) {
      res.status(400).json({ error: err.message || 'El archivo seleccionado no es válido.', success: false });
      return;
    }
    next();
  });
}

router.post('/education/verify', requireAuth, uploadDocumentMiddleware, submitStudentVerificationHandler);
router.get('/education/status', requireAuth, getStudentVerificationStatusHandler);
router.post('/education/check-email', requireAuth, checkEducationalEmailHandler);
router.post('/education/request-otp', requireAuth, requestEducationalOtpHandler);
router.post('/education/verify-otp', requireAuth, verifyEducationalOtpHandler);
router.post('/education/institution-inquiry', submitInstitutionInquiryHandler);

export default router;
