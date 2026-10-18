import { Router } from 'express';
import multer from 'multer';
import { downloadProtectPdfHandler, protectPdfHandler } from './protect-pdf.controller.js';

const router = Router();
const upload = multer({
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  storage: multer.memoryStorage(),
});

router.post('/tools/protect-pdf/process', upload.single('file'), protectPdfHandler);
router.get('/tools/protect-pdf/download/:fileId', downloadProtectPdfHandler);

export default router;
