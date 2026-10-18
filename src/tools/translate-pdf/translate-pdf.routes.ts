import { downloadTranslatedPdfHandler, translatePdfHandler, uploadPdf } from './translate-pdf.controller.js';
import { Router } from 'express';
import { translatePdfLimiter } from '../../middlewares/rate-limit.middleware.js';

const router = Router();

router.post('/tools/translate-pdf/translate', translatePdfLimiter, uploadPdf.single('file'), translatePdfHandler);
router.get('/tools/translate-pdf/download/:fileId', downloadTranslatedPdfHandler);

export default router;
