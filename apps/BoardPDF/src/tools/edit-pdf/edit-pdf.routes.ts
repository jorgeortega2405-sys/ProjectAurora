import { Router } from 'express';
import multer from 'multer';
import { optionalAuth } from '../../middlewares/auth.middleware.js';
import { downloadEditedPdfHandler, editPdfHandler } from './edit-pdf.controller.js';

const router = Router();
const upload = multer({
  limits: {
    fileSize: 500 * 1024 * 1024,
  },
  storage: multer.memoryStorage(),
});

router.post(
  '/tools/edit-pdf/process',
  optionalAuth,
  upload.fields([
    { maxCount: 1, name: 'file' },
    { maxCount: 20, name: 'images' },
  ]),
  editPdfHandler
);

router.get('/tools/edit-pdf/download/:fileId', downloadEditedPdfHandler);

export default router;
