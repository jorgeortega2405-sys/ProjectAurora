import { Router } from 'express';
import multer from 'multer';
import { addWatermarkHandler, downloadWatermarkPdfHandler } from './watermark-pdf.controller.js';

const router = Router();
const upload = multer({
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  storage: multer.memoryStorage(),
});

router.post(
  '/tools/watermark-pdf/process',
  upload.fields([
    { maxCount: 1, name: 'file' },
    { maxCount: 1, name: 'watermarkImage' },
  ]),
  addWatermarkHandler
);

router.get('/tools/watermark-pdf/download/:fileId', downloadWatermarkPdfHandler);

export default router;
