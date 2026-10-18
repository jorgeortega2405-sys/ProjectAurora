import { Router } from 'express';
import { optionalAuth } from '../../middlewares/auth.middleware.js';
import { translatePdfLimiter } from '../../middlewares/rate-limit.middleware.js';
import { downloadTranslatedPdfHandler, translatePdfHandler, uploadPdf } from './translate-pdf.controller.js';

const router = Router();

router.post('/tools/translate-pdf/translate', optionalAuth, translatePdfLimiter, uploadPdf.single('file'), translatePdfHandler);
router.get('/tools/translate-pdf/download/:fileId', downloadTranslatedPdfHandler);

export default router;
