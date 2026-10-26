import { Router } from 'express';
import multer from 'multer';
import { optionalAuth } from '../../middlewares/auth.middleware.js';
import { downloadRotatePdfHandler, rotatePdfHandler } from './rotate-pdf.controller.js';

const router = Router();
const upload = multer({
  limits: {
    fileSize: 1000 * 1024 * 1024,
  },
  storage: multer.memoryStorage(),
});

router.post('/tools/rotate-pdf/process', optionalAuth, upload.single('file'), rotatePdfHandler);
router.get('/tools/rotate-pdf/download/:fileId', downloadRotatePdfHandler);

export default router;
