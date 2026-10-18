import { Router } from 'express';
import { optionalAuth } from '../../middlewares/auth.middleware.js';
import { pdfOrganizeLimiter } from '../../middlewares/rate-limit.middleware.js';
import { handleDownloadOrganizePdf, handleOrganizePdf, handleOrganizePdfUploadMiddleware } from './organize-pdf.controller.js';

const router = Router();

router.post('/tools/organize-pdf/organize', optionalAuth, pdfOrganizeLimiter, handleOrganizePdfUploadMiddleware, handleOrganizePdf);
router.get('/tools/organize-pdf/download/:fileId', handleDownloadOrganizePdf);

export default router;
