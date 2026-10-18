import { Router } from 'express';
import multer from 'multer';
import { optionalAuth } from '../../middlewares/auth.middleware.js';
import { addPageNumbersHandler, downloadPageNumberHandler } from './page-numbers.controller.js';

const router = Router();
const upload = multer({
  limits: {
    fileSize: 1000 * 1024 * 1024,
  },
  storage: multer.memoryStorage(),
});

router.post('/tools/page-numbers/process', optionalAuth, upload.single('file'), addPageNumbersHandler);
router.get('/tools/page-numbers/download/:fileId', downloadPageNumberHandler);

export default router;
