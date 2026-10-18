import { Router } from 'express';
import multer from 'multer';
import { convertToPdfHandler, downloadConvertedPdfHandler } from './to-pdf-converter.controller.js';
import { UPLOADS_DIR } from './to-pdf-converter.service.js';

const router = Router();

const upload = multer({
  dest: UPLOADS_DIR,
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

router.post('/tools/to-pdf/convert', upload.single('file'), convertToPdfHandler);
router.get('/tools/to-pdf/download/:token', downloadConvertedPdfHandler);

export default router;
