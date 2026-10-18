import { Router } from 'express';
import { pdfRepairLimiter } from '../../middlewares/rate-limit.middleware.js';
import { handleDownloadRepairedPdf, handleRepairPdf, handleUploadMiddleware } from './repair-pdf.controller.js';

const router = Router();

router.post('/tools/repair-pdf/repair', pdfRepairLimiter, handleUploadMiddleware, handleRepairPdf);
router.get('/tools/repair-pdf/download/:fileId', handleDownloadRepairedPdf);

export default router;
