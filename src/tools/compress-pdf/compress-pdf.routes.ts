import { Router } from 'express';
import { pdfCompressLimiter } from '../../middlewares/rate-limit.middleware.js';
import { handleCompressPdf, handleDownloadCompressedPdf, handleUploadMiddleware } from './compress-pdf.controller.js';

const router = Router();

router.post('/tools/compress-pdf/compress', pdfCompressLimiter, handleUploadMiddleware, handleCompressPdf);
router.get('/tools/compress-pdf/download/:fileId', handleDownloadCompressedPdf);

export default router;
