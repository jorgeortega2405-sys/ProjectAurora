import { Router } from 'express';
import { handleSupportChat } from '../controllers/support.controller.js';

const router = Router();

router.post('/support/chat', handleSupportChat);

export default router;
