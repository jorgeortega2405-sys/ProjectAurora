import { Router } from 'express';
import { closeLiveChatController, createLiveChatController, getActiveLiveChatController, getLiveChatController, getLiveChatMessagesController, rateLiveChatController, sendUserLiveMessageController } from '../controllers/live-support.controller.js';

const router = Router();

router.get('/active-chat', getActiveLiveChatController);
router.post('/chats', createLiveChatController);
router.get('/chats/:id', getLiveChatController);
router.post('/chats/:id/close', closeLiveChatController);
router.get('/chats/:id/messages', getLiveChatMessagesController);
router.post('/chats/:id/messages', sendUserLiveMessageController);
router.post('/chats/:id/rate', rateLiveChatController);

export default router;
