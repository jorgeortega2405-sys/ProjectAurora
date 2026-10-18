import { Router } from 'express';
import { handleConvertPdf, handleDownloadConvertedFile, uploadPdf } from './pdf-converter.controller.js';

const router = Router();

router.post('/tools/pdf-converter/convert', uploadPdf.single('file'), handleConvertPdf);
router.get('/tools/pdf-converter/download/:token', handleDownloadConvertedFile);

export default router;
