import { Router } from 'express';
import multer from 'multer';
import { addPageNumbersHandler, downloadPageNumberHandler } from './page-numbers.controller.js';

const router = Router();
const upload = multer({
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  storage: multer.memoryStorage(),
});

router.post('/tools/page-numbers/process', upload.single('file'), addPageNumbersHandler);
router.get('/tools/page-numbers/download/:fileId', downloadPageNumberHandler);

export default router;
