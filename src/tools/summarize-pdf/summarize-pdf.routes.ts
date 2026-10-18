import { summarizePdfLimiter } from '../../middlewares/rate-limit.middleware.js';
import { handlePdfUploadMiddleware, handleSummarizePdf } from './summarize-pdf.controller.js';
import { Router } from 'express';

const router = Router();

router.post('/tools/summarize-pdf/summarize', summarizePdfLimiter, handlePdfUploadMiddleware, handleSummarizePdf);

export default router;
