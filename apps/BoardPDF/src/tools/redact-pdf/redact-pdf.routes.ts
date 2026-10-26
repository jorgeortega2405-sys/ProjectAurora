import { Router } from 'express';
import { optionalAuth } from '../../middlewares/auth.middleware.js';
import { redactPdfLimiter } from '../../middlewares/rate-limit.middleware.js';
import { handleDownloadRedactedPdf, handlePdfUploadMiddleware, handleRedactPdf } from './redact-pdf.controller.js';

const router = Router();

router.post('/tools/redact-pdf/redact', optionalAuth, redactPdfLimiter, handlePdfUploadMiddleware, handleRedactPdf);
router.get('/tools/redact-pdf/download/:fileId', handleDownloadRedactedPdf);

export default router;
