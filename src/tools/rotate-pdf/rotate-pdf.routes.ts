import { Router } from 'express';
import multer from 'multer';
import { downloadRotatePdfHandler, rotatePdfHandler } from './rotate-pdf.controller.js';

const router = Router();
const upload = multer({
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  storage: multer.memoryStorage(),
});

router.post('/tools/rotate-pdf/process', upload.single('file'), rotatePdfHandler);
router.get('/tools/rotate-pdf/download/:fileId', downloadRotatePdfHandler);

export default router;
