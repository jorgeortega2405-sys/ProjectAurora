import { Router } from 'express';
import multer from 'multer';
import { optionalAuth } from '../../middlewares/auth.middleware.js';
import { cropPdfHandler, downloadCropPdfHandler } from './crop-pdf.controller.js';

const router = Router();
const upload = multer({
  limits: {
    fileSize: 1000 * 1024 * 1024,
  },
  storage: multer.memoryStorage(),
});

router.post('/tools/crop-pdf/process', optionalAuth, upload.single('file'), cropPdfHandler);
router.get('/tools/crop-pdf/download/:fileId', downloadCropPdfHandler);

export default router;
