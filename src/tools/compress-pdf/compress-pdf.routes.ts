import { Router } from 'express';
import { optionalAuth } from '../../middlewares/auth.middleware.js';
import { pdfCompressLimiter } from '../../middlewares/rate-limit.middleware.js';
import { handleCompressPdf, handleDownloadCompressedPdf, handleUploadMiddleware } from './compress-pdf.controller.js';

const router = Router();

router.post('/tools/compress-pdf/compress', optionalAuth, pdfCompressLimiter, handleUploadMiddleware, handleCompressPdf);
router.get('/tools/compress-pdf/download/:fileId', handleDownloadCompressedPdf);

export default router;
