import { Router } from 'express';
import { optionalAuth } from '../../middlewares/auth.middleware.js';
import { pdfRepairLimiter } from '../../middlewares/rate-limit.middleware.js';
import { handleDownloadRepairedPdf, handleRepairPdf, handleUploadMiddleware } from './repair-pdf.controller.js';

const router = Router();

router.post('/tools/repair-pdf/repair', optionalAuth, pdfRepairLimiter, handleUploadMiddleware, handleRepairPdf);
router.get('/tools/repair-pdf/download/:fileId', handleDownloadRepairedPdf);

export default router;
