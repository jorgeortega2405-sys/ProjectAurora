import { Router } from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import { handleAiChat, handleAiCredits, handleAiDownload } from '../controllers/ai.controller.js';
import { optionalAuth } from '../middlewares/auth.middleware.js';

const router = Router();

const AI_UPLOAD_DIR = path.join(os.tmpdir(), 'boardpdf_ai_uploads');
const upload = multer({
  dest: AI_UPLOAD_DIR,
  limits: {
    fileSize: 500 * 1024 * 1024,
    files: 10,
  },
});

router.post('/ai/chat', optionalAuth, upload.array('files', 10), handleAiChat);
router.get('/ai/credits', optionalAuth, handleAiCredits);
router.get('/ai/download/:token', handleAiDownload);

export default router;
