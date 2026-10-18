import { Router } from 'express';
import multer from 'multer';
import { cropPdfHandler, downloadCropPdfHandler } from './crop-pdf.controller.js';

const router = Router();
const upload = multer({
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  storage: multer.memoryStorage(),
});

router.post('/tools/crop-pdf/process', upload.single('file'), cropPdfHandler);
router.get('/tools/crop-pdf/download/:fileId', downloadCropPdfHandler);

export default router;
