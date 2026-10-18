import { Router } from 'express';
import { pdfRemovePagesLimiter } from '../../middlewares/rate-limit.middleware.js';
import { handleDownloadRemovePagesPdf, handleRemovePages, handleRemovePagesUploadMiddleware } from './remove-pdf-pages.controller.js';

const router = Router();

router.post('/tools/remove-pdf-pages/remove', pdfRemovePagesLimiter, handleRemovePagesUploadMiddleware, handleRemovePages);
router.get('/tools/remove-pdf-pages/download/:fileId', handleDownloadRemovePagesPdf);

export default router;
