import { Router } from 'express';
import { optionalAuth } from '../../middlewares/auth.middleware.js';
import { pdfSplitLimiter } from '../../middlewares/rate-limit.middleware.js';
import { handleDownloadSplitPdf, handleSplitPdf, handleSplitUploadMiddleware } from './split-pdf.controller.js';

const router = Router();

router.post('/tools/split-pdf/split', optionalAuth, pdfSplitLimiter, handleSplitUploadMiddleware, handleSplitPdf);
router.get('/tools/split-pdf/download/:fileId', handleDownloadSplitPdf);

export default router;
