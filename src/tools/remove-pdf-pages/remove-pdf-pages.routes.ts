import { Router } from 'express';
import { optionalAuth } from '../../middlewares/auth.middleware.js';
import { pdfRemovePagesLimiter } from '../../middlewares/rate-limit.middleware.js';
import { handleDownloadRemovePagesPdf, handleRemovePages, handleRemovePagesUploadMiddleware } from './remove-pdf-pages.controller.js';

const router = Router();

router.post('/tools/remove-pdf-pages/remove', optionalAuth, pdfRemovePagesLimiter, handleRemovePagesUploadMiddleware, handleRemovePages);
router.get('/tools/remove-pdf-pages/download/:fileId', handleDownloadRemovePagesPdf);

export default router;
