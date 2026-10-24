import { createLiveChatController, getLiveChatController, getLiveChatMessagesController, sendUserLiveMessageController } from '../controllers/live-support.controller.js';
import { Router } from 'express';

const router = Router();

router.post('/chats', createLiveChatController);
router.get('/chats/:id', getLiveChatController);
router.get('/chats/:id/messages', getLiveChatMessagesController);
router.post('/chats/:id/messages', sendUserLiveMessageController);

export default router;
