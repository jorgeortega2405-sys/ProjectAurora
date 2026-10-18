import { Router } from 'express';
import multer from 'multer';
import { comparePdfLimiter } from '../../middlewares/rate-limit.middleware.js';
import { handleComparePdf, handleDownloadComparisonReport } from './compare-pdf.controller.js';

const upload = multer({
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  storage: multer.memoryStorage(),
});

const router = Router();

router.post(
  '/compare',
  comparePdfLimiter,
  upload.fields([
    { maxCount: 1, name: 'file1' },
    { maxCount: 1, name: 'file2' },
  ]),
  handleComparePdf
);

router.get('/download/:fileId', handleDownloadComparisonReport);

export default router;
