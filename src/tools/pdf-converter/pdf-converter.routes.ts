import { Router } from 'express';
import { optionalAuth } from '../../middlewares/auth.middleware.js';
import { handleConvertPdf, handleDownloadConvertedFile, uploadPdf } from './pdf-converter.controller.js';

const router = Router();

router.post('/tools/pdf-converter/convert', optionalAuth, uploadPdf.single('file'), handleConvertPdf);
router.get('/tools/pdf-converter/download/:token', handleDownloadConvertedFile);

export default router;
