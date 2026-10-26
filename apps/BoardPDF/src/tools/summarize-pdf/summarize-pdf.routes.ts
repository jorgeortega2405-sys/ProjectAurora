import { Router } from 'express';
import { optionalAuth } from '../../middlewares/auth.middleware.js';
import { summarizePdfLimiter } from '../../middlewares/rate-limit.middleware.js';
import { handlePdfUploadMiddleware, handleSummarizePdf } from './summarize-pdf.controller.js';

const router = Router();

router.post('/tools/summarize-pdf/summarize', optionalAuth, summarizePdfLimiter, handlePdfUploadMiddleware, handleSummarizePdf);

export default router;
