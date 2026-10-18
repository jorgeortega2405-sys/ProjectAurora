import { Router } from 'express';
import multer from 'multer';
import { downloadSignedPdfHandler, signPdfHandler } from './sign-pdf.controller.js';

const router = Router();
const upload = multer({
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  storage: multer.memoryStorage(),
});

router.post(
  '/tools/sign-pdf/sign',
  upload.fields([
    { maxCount: 1, name: 'file' },
    { maxCount: 30, name: 'signatures' },
  ]),
  signPdfHandler
);

router.get('/tools/sign-pdf/download/:fileId', downloadSignedPdfHandler);

export default router;
