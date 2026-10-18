import { Router } from 'express';
import multer from 'multer';
import { optionalAuth } from '../../middlewares/auth.middleware.js';
import { downloadUnlockPdfHandler, unlockPdfHandler } from './unlock-pdf.controller.js';

const router = Router();
const upload = multer({
  limits: {
    fileSize: 1000 * 1024 * 1024,
  },
  storage: multer.memoryStorage(),
});

router.post('/tools/unlock-pdf/process', optionalAuth, upload.single('file'), unlockPdfHandler);
router.get('/tools/unlock-pdf/download/:fileId', downloadUnlockPdfHandler);

export default router;
