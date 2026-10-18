import { Router } from 'express';
import { pdfSplitLimiter } from '../../middlewares/rate-limit.middleware.js';
import { handleDownloadSplitPdf, handleSplitPdf, handleSplitUploadMiddleware } from './split-pdf.controller.js';

const router = Router();

router.post('/tools/split-pdf/split', pdfSplitLimiter, handleSplitUploadMiddleware, handleSplitPdf);
router.get('/tools/split-pdf/download/:fileId', handleDownloadSplitPdf);

export default router;
