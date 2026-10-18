import { Router } from 'express';
import { optionalAuth } from '../../middlewares/auth.middleware.js';
import { pdfToMarkdownLimiter } from '../../middlewares/rate-limit.middleware.js';
import { handleConvertPdfToMarkdown, handleDownloadMarkdown, handlePdfUploadMiddleware } from './pdf-to-markdown.controller.js';

const router = Router();

router.post('/tools/pdf-to-markdown/convert', optionalAuth, pdfToMarkdownLimiter, handlePdfUploadMiddleware, handleConvertPdfToMarkdown);
router.get('/tools/pdf-to-markdown/download/:fileId', handleDownloadMarkdown);

export default router;
