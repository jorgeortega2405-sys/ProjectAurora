import { handleDeleteDownloadFile, handleDownloadFile, handleDownloadInfo } from '../controllers/download.controller.js';
import { Router } from 'express';

const router = Router();

router.delete('/download/:token', handleDeleteDownloadFile);
router.delete('/download/:token/file', handleDeleteDownloadFile);
router.get('/download/:token/info', handleDownloadInfo);
router.get('/download/:token/file', handleDownloadFile);
router.get('/download/:token', handleDownloadFile);

export default router;
