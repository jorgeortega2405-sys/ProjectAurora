import { Router } from 'express';
import multer from 'multer';
import { optionalAuth } from '../../middlewares/auth.middleware.js';
import { addWatermarkHandler, downloadWatermarkPdfHandler } from './watermark-pdf.controller.js';

const router = Router();
const upload = multer({
  limits: {
    fileSize: 1000 * 1024 * 1024,
  },
  storage: multer.memoryStorage(),
});

router.post(
  '/tools/watermark-pdf/process',
  optionalAuth,
  upload.fields([
    { maxCount: 1, name: 'file' },
    { maxCount: 1, name: 'watermarkImage' },
  ]),
  addWatermarkHandler
);

router.get('/tools/watermark-pdf/download/:fileId', downloadWatermarkPdfHandler);

export default router;
