import { Router } from 'express';
import { pdfMergeLimiter } from '../../middlewares/rate-limit.middleware.js';
import { handleDownloadMergedPdf, handleMergePdf, handleUploadMiddleware } from './merge-pdf.controller.js';

const router = Router();

router.post('/tools/merge-pdf/merge', pdfMergeLimiter, handleUploadMiddleware, handleMergePdf);
router.get('/tools/merge-pdf/download/:fileId', handleDownloadMergedPdf);

export default router;
