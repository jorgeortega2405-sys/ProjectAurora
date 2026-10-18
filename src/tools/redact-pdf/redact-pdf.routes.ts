import { redactPdfLimiter } from '../../middlewares/rate-limit.middleware.js';
import { handleDownloadRedactedPdf, handlePdfUploadMiddleware, handleRedactPdf } from './redact-pdf.controller.js';
import { Router } from 'express';

const router = Router();

router.post('/tools/redact-pdf/redact', redactPdfLimiter, handlePdfUploadMiddleware, handleRedactPdf);
router.get('/tools/redact-pdf/download/:fileId', handleDownloadRedactedPdf);

export default router;
