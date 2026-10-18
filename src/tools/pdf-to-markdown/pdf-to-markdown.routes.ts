import { pdfToMarkdownLimiter } from '../../middlewares/rate-limit.middleware.js';
import { handleConvertPdfToMarkdown, handleDownloadMarkdown, handlePdfUploadMiddleware } from './pdf-to-markdown.controller.js';
import { Router } from 'express';

const router = Router();

router.post('/tools/pdf-to-markdown/convert', pdfToMarkdownLimiter, handlePdfUploadMiddleware, handleConvertPdfToMarkdown);
router.get('/tools/pdf-to-markdown/download/:fileId', handleDownloadMarkdown);

export default router;
