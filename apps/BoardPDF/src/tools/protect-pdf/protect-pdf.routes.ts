import { Router } from 'express';
import multer from 'multer';
import { optionalAuth } from '../../middlewares/auth.middleware.js';
import { downloadProtectPdfHandler, protectPdfHandler } from './protect-pdf.controller.js';

const router = Router();
const upload = multer({
  limits: {
    fileSize: 1000 * 1024 * 1024,
  },
  storage: multer.memoryStorage(),
});

router.post('/tools/protect-pdf/process', optionalAuth, upload.single('file'), protectPdfHandler);
router.get('/tools/protect-pdf/download/:fileId', downloadProtectPdfHandler);

export default router;
