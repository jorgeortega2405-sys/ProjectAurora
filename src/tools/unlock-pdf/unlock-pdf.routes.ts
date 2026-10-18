import { Router } from 'express';
import multer from 'multer';
import { downloadUnlockPdfHandler, unlockPdfHandler } from './unlock-pdf.controller.js';

const router = Router();
const upload = multer({
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  storage: multer.memoryStorage(),
});

router.post('/tools/unlock-pdf/process', upload.single('file'), unlockPdfHandler);
router.get('/tools/unlock-pdf/download/:fileId', downloadUnlockPdfHandler);

export default router;
