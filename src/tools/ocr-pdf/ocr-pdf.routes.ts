import { Router } from 'express';
import { pdfOcrLimiter } from '../../middlewares/rate-limit.middleware.js';
import { handleDownloadOcrPdf, handleProcessOcrPdf, handleUploadMiddleware } from './ocr-pdf.controller.js';

const router = Router();

router.post('/tools/ocr-pdf/process', pdfOcrLimiter, handleUploadMiddleware, handleProcessOcrPdf);
router.get('/tools/ocr-pdf/download/:fileId', handleDownloadOcrPdf);

export default router;
